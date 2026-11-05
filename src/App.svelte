<script lang="ts">
  import { cacheIsOpen, panelExpired } from "./domain/locking";
  import {
    touchID,
    touchIDWindow,
    TouchIDError,
    isMac,
  } from "./platform/touchID";
  import { onMount } from "svelte";
  import {
    activeRecords,
    emptyWorkspace,
    identify,
    InputError,
    insertRecords,
    matchesSite,
    moveRecord,
    nextChange,
    reviseRecord,
    type Credential,
    type Workspace,
  } from "./domain/records";
  import { codeFor } from "./domain/otp";
  import { checkGate } from "./domain/sealing";
  import {
    readWorkspace,
    subscribeWorkspace,
    transaction,
  } from "./platform/repository";
  import { synchronize } from "./platform/sync";
  import { request, sourceWindow, takeQuickEntry } from "./platform/browser";
  import { translate, type MessageKey } from "./lib/i18n/messages";
  import CredentialEditor from "./ui/CredentialEditor.svelte";
  import TransferView from "./ui/TransferView.svelte";
  import PreferencesView from "./ui/PreferencesView.svelte";
  let space = $state.raw(emptyWorkspace());
  let ready = $state(false),
    locked = $state(true),
    password = $state(""),
    error = $state(""),
    notice = $state("");
  let view = $state("codes"),
    search = $state(""),
    editing = $state<Credential | null | undefined>(undefined),
    remove = $state<Credential>(),
    qr = $state<{ image: string; name: string }>();
  let codes = $state<Record<string, string>>({}),
    now = $state(Date.now()),
    hostname = $state(""),
    busy = $state(false);
  let generation = 0;
  let lockEpoch = 0;
  let bypassed = false;
  let bypassOpenedAt: number | undefined;
  let syncing = false;
  const t = (key: MessageKey) => translate(space.preferences.locale, key);
  const records = $derived(activeRecords(space));
  const visible = $derived(
    records
      .filter((item) =>
        `${item.provider} ${item.login}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
      .sort((a, b) =>
        space.preferences.matchSite
          ? Number(matchesSite(b, hostname)) - Number(matchesSite(a, hostname))
          : 0,
      ),
  );
  function explain(err: unknown) {
    return t(
      err instanceof TouchIDError
        ? `error_touchID_${err.code}`
        : err instanceof InputError
          ? `error_${err.code}`
          : "error_generic",
    );
  }
  function accept(latest: Workspace) {
    if (latest.gate?.proof !== space.gate?.proof) {
      lock();
      locked = Boolean(latest.gate);
    } else if (latest.gate) {
      if (
        space.gate?.unlockedAt !== undefined &&
        latest.gate.unlockedAt === undefined
      )
        lock();
      if (!document.hidden && !bypassed && cacheIsOpen(latest.gate))
        locked = false;
      else if (
        !locked &&
        !bypassed &&
        panelExpired(latest.gate, latest.gate.unlockedAt)
      )
        lock();
    }
    space = latest;
  }
  async function change(work: (space: Workspace) => void | Promise<void>) {
    const result = await transaction(work);
    accept(result.workspace);
  }
  async function attempt(work: () => Promise<void>) {
    error = "";
    try {
      await work();
    } catch (err) {
      error = explain(err);
    }
  }
  function lock() {
    if (space.gate) locked = true;
    password = "";
    editing = undefined;
    remove = undefined;
    qr = undefined;
    codes = {};
    generation++;
    lockEpoch++;
    bypassed = false;
    bypassOpenedAt = undefined;
  }
  async function completeUnlock(
    proof: string,
    epoch: number,
    biometric = false,
  ) {
    if (epoch !== lockEpoch || document.hidden) return;
    const result = await transaction((s) => {
      if (!s.gate || s.gate.proof !== proof || (biometric && !s.gate.touchID))
        throw new InputError("stale");
      if (epoch !== lockEpoch || document.hidden) throw new InputError("stale");
      s.gate.unlockedAt = Date.now();
    });
    if (epoch !== lockEpoch || document.hidden) return;
    space = result.workspace;
    locked = false;
    bypassed = false;
    password = "";
  }
  async function lockNow() {
    lock();
    await attempt(() =>
      change((s) => {
        if (s.gate) delete s.gate.unlockedAt;
      }),
    );
  }
  async function unlock() {
    busy = true;
    await attempt(async () => {
      const epoch = lockEpoch;
      const latest = await readWorkspace();
      space = latest;
      if (!latest.gate) {
        locked = false;
        return;
      }
      if (!(await checkGate(latest.gate, password)))
        throw new InputError("password");
      await completeUnlock(latest.gate.proof, epoch);
    });
    busy = false;
  }
  async function unlockTouchID() {
    busy = true;
    await attempt(async () => {
      if (await touchIDWindow()) return;
      const stamp = lockEpoch;
      const proof = space.gate?.proof;
      if (!space.gate?.touchID) throw new TouchIDError("unavailable");
      await touchID("authenticate", t("touchIDReason"));
      const latest = await readWorkspace();
      if (!latest.gate?.touchID || latest.gate.proof !== proof)
        throw new InputError("stale");
      await completeUnlock(proof!, stamp, true);
    });
    busy = false;
  }
  async function save(item: Credential) {
    if (editing) await change((s) => reviseRecord(s, editing!, item));
    else {
      const identified = await identify(item);
      await change((s) => {
        insertRecords(s, [identified]);
      });
    }
    editing = undefined;
  }
  async function importItems(items: Credential[]) {
    const result = await transaction((s) => insertRecords(s, items));
    accept(result.workspace);
    return `${t("imported")}: ${result.result.added} · ${t("skipped")}: ${result.result.skipped}`;
  }
  async function copy(item: Credential) {
    await attempt(async () => {
      let code: string;
      if (item.mode === "hotp") {
        const result = await transaction(async (s) => {
          const current = s.records[item.id];
          if (!current || current.removed || current.changed !== item.changed)
            throw new InputError("stale");
          if (current.counter === Number.MAX_SAFE_INTEGER)
            throw new InputError("invalid");
          const value = await codeFor(current, Date.now());
          await navigator.clipboard.writeText(value);
          s.records[item.id] = {
            ...current,
            counter: current.counter + 1,
            changed: nextChange(current.changed),
          };
          return value;
        });
        accept(result.workspace);
        code = result.result;
      } else {
        const latest = await readWorkspace();
        const current = latest.records[item.id];
        if (!current || current.removed || current.changed !== item.changed)
          throw new InputError("stale");
        code = await codeFor(current, Date.now());
        await navigator.clipboard.writeText(code);
      }
      notice = t("copied");
      if (space.preferences.paste) {
        const filled = await request<boolean>("fill", {
          code,
          source: sourceWindow(),
        });
        if (!filled) throw new InputError("unavailable");
      }
    });
  }
  async function showQr(item: Credential) {
    await attempt(async () => {
      const [{ qrImage }, { toUri }] = await Promise.all([
        import("./domain/qr"),
        import("./domain/transfer"),
      ]);
      const image = await qrImage(toUri(item));
      if (!locked) qr = { image, name: item.provider || item.login };
    });
  }
  async function refreshCodes() {
    if (locked || !ready || document.hidden) return;
    const stamp = ++generation;
    const pairs = await Promise.all(
      records.map(async (item) => [item.id, await codeFor(item, now)] as const),
    );
    if (stamp === generation && !locked) codes = Object.fromEntries(pairs);
  }
  async function sync() {
    if (syncing || locked || !space.connection) return;
    syncing = true;
    try {
      await change(synchronize);
    } catch (err) {
      error = explain(err);
    } finally {
      syncing = false;
    }
  }
  $effect(() => {
    const theme = space.preferences.theme;
    document.documentElement.dataset.theme =
      theme === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    document.documentElement.lang = space.preferences.locale;
    document.documentElement.dir =
      space.preferences.locale === "ar" ? "rtl" : "ltr";
  });
  $effect(() => {
    void now;
    void space;
    void locked;
    void ready;
    void refreshCodes().catch((err) => {
      error = explain(err);
    });
  });
  onMount(() => {
    const biometricEntry =
      new URL(location.href).searchParams.get("entry") === "touchID";
    const quick = takeQuickEntry();
    const initialView = new URL(location.href).searchParams.get("view");
    if (initialView === "data" || initialView === "settings")
      view = initialView;
    void readWorkspace()
      .then((latest) => {
        space = latest;
        bypassed = Boolean(quick && latest.gate?.quick && !document.hidden);
        if (bypassed) bypassOpenedAt = Date.now();
        locked =
          Boolean(latest.gate) &&
          (!cacheIsOpen(latest.gate) || document.hidden) &&
          !bypassed;
        ready = true;
        if (!locked) void sync();
        else if (biometricEntry && latest.gate?.touchID) void unlockTouchID();
      })
      .catch((err) => {
        error = explain(err);
      });
    void request<{ hostname: string }>("context", { source: sourceWindow() })
      .then((value) => {
        hostname = value.hostname;
      })
      .catch(() => {});
    const unsubscribe = subscribeWorkspace(() => {
      void readWorkspace()
        .then(accept)
        .catch((err) => {
          error = explain(err);
        });
    });
    const tick = setInterval(() => {
      now = Date.now();
      if (
        !locked &&
        panelExpired(
          space.gate,
          bypassed ? bypassOpenedAt : space.gate?.unlockedAt,
          now,
        )
      )
        lock();
    }, 1000);
    const interval = setInterval(() => {
      void sync();
    }, 15000);
    const visibility = () => {
      if (document.hidden) lock();
      else
        void readWorkspace()
          .then(accept)
          .catch((err) => {
            error = explain(err);
          });
    };
    document.addEventListener("visibilitychange", visibility);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const theme = () => {
      if (space.preferences.theme === "system")
        document.documentElement.dataset.theme = media.matches
          ? "dark"
          : "light";
    };
    media.addEventListener("change", theme);
    return () => {
      unsubscribe();
      clearInterval(tick);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visibility);
      media.removeEventListener("change", theme);
    };
  });
  function escape(event: KeyboardEvent) {
    if (event.key === "Tab" && (qr || remove)) {
      const dialog = document.querySelector('[aria-modal="true"]');
      const buttons = Array.from(
        dialog?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ??
          [],
      );
      const first = buttons[0],
        last = buttons.at(-1);
      if (
        !dialog?.contains(document.activeElement) ||
        (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    }
    if (event.key !== "Escape") return;
    if (qr) qr = undefined;
    else if (remove) remove = undefined;
    else if (editing !== undefined) editing = undefined;
    else void lockNow();
  }
</script>

<svelte:window onkeydown={escape} />
<div class="shell">
  <header class="masthead">
    <div class="brand-mark" aria-hidden="true">▥</div>
    <div class="min-w-0">
      <p class="eyebrow">AUTHENTICATOR</p>
      <h1>2FA</h1>
    </div>
    {#if ready && !locked && space.gate}<button
        class="btn btn-ghost btn-sm ms-auto"
        onclick={lockNow}>{t("lock")}</button
      >{/if}
  </header>
  {#if error}<div class="notice text-error" role="alert">
      {error}<button
        class="btn btn-ghost btn-xs"
        aria-label={t("cancel")}
        onclick={() => (error = "")}>×</button
      >
    </div>{/if}
  {#if !ready}<main><p role="status">{t("loading")}</p></main>
  {:else if locked}<main class="gate">
      <div class="gate-symbol" aria-hidden="true">⌑</div>
      <h2>{t("unlock")}</h2>
      <form
        class="stack"
        onsubmit={(e) => {
          e.preventDefault();
          void unlock();
        }}
      >
        <label class="field"
          >{t("password")}<input
            class="input w-full"
            type="password"
            minlength="1"
            required
            bind:value={password}
            autocomplete="current-password"
          /></label
        ><button class="btn btn-primary" disabled={busy}>{t("unlock")}</button>
      </form>
      {#if space.gate?.touchID && isMac()}<button
          class="btn btn-outline w-full mt-4"
          disabled={busy}
          onclick={unlockTouchID}>{t("touchIDUnlock")}</button
        >{/if}
    </main>
  {:else}
    <main>
      {#if editing !== undefined}<CredentialEditor
          original={editing ?? undefined}
          {t}
          {save}
          cancel={() => (editing = undefined)}
        />
      {:else if view === "codes"}
        <div class="section-title">
          <h2>{t("codes")} <span class="count">{records.length}</span></h2>
          <button
            class="btn btn-primary btn-sm"
            onclick={() => (editing = null)}>＋ {t("add")}</button
          >
        </div>
        {#if records.length}<label class="search"
            ><input
              class="input w-full"
              aria-label={t("search")}
              placeholder={t("search")}
              bind:value={search}
            /></label
          >{/if}
        {#if !records.length}<div class="empty">
            <p class="empty-glyph" aria-hidden="true">＋</p>
            <h3>{t("empty")}</h3>
            <p class="hint">{t("emptyHint")}</p>
            <button
              class="btn btn-outline mt-5"
              onclick={() => (editing = null)}>{t("add")}</button
            >
          </div>{/if}
        <ol class="accounts">
          {#each visible as item (item.id)}<li class="account">
              <div class="account-top">
                <span class="monogram" aria-hidden="true"
                  >{(item.provider || item.login)
                    .slice(0, 1)
                    .toUpperCase()}</span
                >
                <div class="account-label">
                  <h3>{item.provider || item.login}</h3>
                  {#if item.provider}<p>
                      {item.login}
                    </p>{/if}{#if space.preferences.matchSite && matchesSite(item, hostname)}<span
                      class="badge badge-xs badge-outline">{t("match")}</span
                    >{/if}
                </div>
                <details class="dropdown dropdown-end">
                  <summary
                    class="btn btn-ghost btn-sm"
                    aria-label={`${t("edit")} ${item.login}`}>•••</summary
                  >
                  <ul
                    class="dropdown-content menu bg-base-200 rounded-box z-10 w-40 shadow-lg"
                  >
                    <li>
                      <button onclick={() => (editing = item)}
                        >{t("edit")}</button
                      >
                    </li>
                    <li>
                      <button onclick={() => showQr(item)}>{t("showQr")}</button
                      >
                    </li>
                    <li>
                      <button
                        disabled={records[0]?.id === item.id}
                        onclick={() =>
                          attempt(() =>
                            change((s) => {
                              const i = activeRecords(s).findIndex(
                                (x) => x.id === item.id,
                              );
                              if (i > 0)
                                moveRecord(
                                  s,
                                  item.id,
                                  activeRecords(s)[i - 1]!.id,
                                );
                            }),
                          )}>{t("moveUp")}</button
                      >
                    </li>
                    <li>
                      <button
                        disabled={records.at(-1)?.id === item.id}
                        onclick={() =>
                          attempt(() =>
                            change((s) => {
                              const list = activeRecords(s),
                                i = list.findIndex((x) => x.id === item.id);
                              if (i >= 0 && i < list.length - 1)
                                moveRecord(s, item.id, list[i + 1]!.id);
                            }),
                          )}>{t("moveDown")}</button
                      >
                    </li>
                    <li>
                      <button class="text-error" onclick={() => (remove = item)}
                        >{t("remove")}</button
                      >
                    </li>
                  </ul>
                </details>
              </div>
              <div class="code-line">
                <button
                  class="code-button"
                  aria-label={`${t("copy")} ${item.provider} ${item.login}`}
                  onclick={() => copy(item)}
                  >{space.preferences.conceal
                    ? "••• •••"
                    : (codes[item.id] ?? "—")}</button
                >{#if item.mode !== "hotp" && space.preferences.seconds}<span
                    class="timer"
                    aria-label={t("seconds")}
                    >{item.interval -
                      (Math.floor(now / 1000) % item.interval)}<span>s</span
                    ></span
                  >{:else if item.mode === "hotp"}<span class="hint"
                    >#{item.counter}</span
                  >{/if}
              </div>
              {#if item.mode !== "hotp"}<progress
                  class="progress progress-primary h-0.5"
                  aria-label={t("seconds")}
                  value={item.interval -
                    (Math.floor(now / 1000) % item.interval)}
                  max={item.interval}
                ></progress>{/if}
            </li>{/each}
        </ol>
      {:else if view === "data"}<TransferView
          {space}
          {t}
          {importItems}
          scan={async () => {
            await request("scan", { source: sourceWindow() });
            window.close();
          }}
        />
      {:else}<PreferencesView {space} {t} {change} />{/if}
    </main>
    {#if notice}<div
        role="status"
        class="toast toast-bottom toast-center pointer-events-none"
      >
        <div class="alert bg-neutral text-neutral-content">
          {notice}<button
            class="btn btn-ghost btn-xs pointer-events-auto"
            aria-label={t("cancel")}
            onclick={() => (notice = "")}>×</button
          >
        </div>
      </div>{/if}
    <nav class="bottom-nav" aria-label={t("appName")}>
      {#each [["codes", "codes"], ["data", "data"], ["settings", "settings"]] as [tab, label] (tab)}<button
          class:active={view === tab}
          aria-current={view === tab ? "page" : undefined}
          onclick={() => {
            view = tab!;
            editing = undefined;
            notice = "";
          }}>{t(label as MessageKey)}</button
        >{/each}
    </nav>
  {/if}
</div>
{#if remove}<div class="modal modal-open" role="presentation">
    <div
      class="modal-box"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="remove-title"
      tabindex="-1"
    >
      <h2 id="remove-title">{t("removeConfirm")}</h2>
      <p class="break-all my-4">{remove.provider} · {remove.login}</p>
      <div class="modal-action">
        <button class="btn" onclick={() => (remove = undefined)}
          >{t("cancel")}</button
        ><button
          class="btn btn-error"
          onclick={() =>
            attempt(async () => {
              const item = remove!;
              await change((s) => {
                const current = s.records[item.id];
                if (!current || current.changed !== item.changed)
                  throw new InputError("stale");
                s.records[item.id] = {
                  ...current,
                  removed: true,
                  changed: nextChange(current.changed),
                };
              });
              remove = undefined;
            })}>{t("remove")}</button
        >
      </div>
    </div>
  </div>{/if}
{#if qr}<div class="modal modal-open" role="presentation">
    <div
      class="modal-box text-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-title"
      tabindex="-1"
    >
      <h2 id="qr-title">{qr.name}</h2>
      <img src={qr.image} alt={t("showQr")} class="mx-auto my-4 max-w-full" />
      <p class="hint">{t("plainWarning")}</p>
      <button class="btn mt-4" onclick={() => (qr = undefined)}
        >{t("back")}</button
      >
    </div>
  </div>{/if}
