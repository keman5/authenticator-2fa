<script lang="ts">
  import { LOCK_DURATIONS, lockDuration } from "../domain/locking";
  import {
    isMac,
    touchID,
    touchIDWindow,
    TouchIDError,
  } from "../platform/touchID";
  import { checkGate, newGate } from "../domain/sealing";
  import { InputError, type Workspace } from "../domain/records";
  import {
    connect,
    recoveryKey,
    synchronize,
    syncSupported,
  } from "../platform/sync";
  import { shortcutsPage } from "../platform/browser";
  import { languages, type MessageKey } from "../lib/i18n/messages";
  let {
    space,
    t,
    change,
  }: {
    space: Workspace;
    t: (k: MessageKey) => string;
    change: (work: (space: Workspace) => void | Promise<void>) => Promise<void>;
  } = $props();
  let current = $state(""),
    password = $state(""),
    confirm = $state(""),
    key = $state(""),
    notice = $state(""),
    busy = $state(false),
    command = $state("");
  const shortcut =
    typeof chrome === "undefined"
      ? null
      : shortcutsPage(chrome.runtime.getURL(""), navigator.userAgent);
  if (typeof chrome !== "undefined" && chrome.commands)
    chrome.commands.getAll((items) => {
      command = items.find((x) => x.name === "open-direct")?.shortcut ?? "";
    });
  async function run(work: () => Promise<void>) {
    busy = true;
    notice = "";
    try {
      await work();
    } catch (error) {
      notice = t(
        error instanceof TouchIDError
          ? `error_touchID_${error.code}`
          : error instanceof InputError
            ? `error_${error.code}`
            : "error_generic",
      );
    } finally {
      busy = false;
    }
  }
  async function gate(disable = false) {
    await run(async () => {
      if (!disable && password !== confirm) {
        notice = t("mismatch");
        return;
      }
      await change(async (latest) => {
        if (latest.gate && !(await checkGate(latest.gate, current)))
          throw new InputError("password");
        if (disable) delete latest.gate;
        else
          latest.gate = {
            ...(await newGate(password, latest.gate?.quick)),
            lockAfter: latest.gate?.lockAfter ?? 0,
          };
      });
      current = "";
      password = "";
      confirm = "";
    });
  }
  async function configureTouchID() {
    await run(async () => {
      if (space.gate?.touchID) {
        await change((s) => {
          if (s.gate) s.gate.touchID = false;
        });
        return;
      }
      if (await touchIDWindow(true)) return;
      const proof = space.gate?.proof;
      await touchID("authenticate", t("touchIDReason"));
      await change((s) => {
        if (!s.gate || s.gate.proof !== proof) throw new InputError("stale");
        s.gate.touchID = true;
      });
    });
  }
</script>

<div class="stack">
  <h2>{t("settings")}</h2>
  <label class="field"
    >{t("language")}<select
      class="select w-full"
      value={space.preferences.locale}
      onchange={(e) => {
        const value = e.currentTarget.value;
        void run(() =>
          change((s) => {
            s.preferences.locale = value;
          }),
        );
      }}
      >{#each languages as [value, label] (value)}<option {value}
          >{label}</option
        >{/each}</select
    ></label
  >
  <label class="field"
    >{t("theme")}<select
      class="select w-full"
      value={space.preferences.theme}
      onchange={(e) => {
        const value = e.currentTarget.value as "system" | "light" | "dark";
        void run(() =>
          change((s) => {
            s.preferences.theme = value;
          }),
        );
      }}
      >{#each ["system", "light", "dark"] as value (value)}<option {value}
          >{t(value as MessageKey)}</option
        >{/each}</select
    ></label
  >
  {#each [["conceal", "hideCodes"], ["seconds", "seconds"], ["paste", "autoPaste"], ["matchSite", "matchSite"]] as [pref, label] (pref)}
    <label class="setting-row"
      >{t(label as MessageKey)}<input
        class="toggle toggle-primary"
        type="checkbox"
        checked={space.preferences[
          pref as "conceal" | "seconds" | "paste" | "matchSite"
        ]}
        onchange={(e) => {
          const checked = e.currentTarget.checked;
          void run(() =>
            change((s) => {
              s.preferences[
                pref as "conceal" | "seconds" | "paste" | "matchSite"
              ] = checked;
            }),
          );
        }}
      /></label
    >
  {/each}
  <hr />
  <h2>{t("protection")}</h2>
  <p class="hint">{t("protectionHint")}</p>
  {#if space.gate}<label class="field"
      >{t("currentPassword")}<input
        class="input w-full"
        type="password"
        bind:value={current}
        autocomplete="off"
      /></label
    >{/if}
  <label class="field"
    >{t("newPassword")}<input
      class="input w-full"
      type="password"
      bind:value={password}
      minlength="1"
      autocomplete="new-password"
    /></label
  >
  <label class="field"
    >{t("confirmPassword")}<input
      class="input w-full"
      type="password"
      bind:value={confirm}
      minlength="1"
      autocomplete="new-password"
    /></label
  >
  <div class="flex gap-2">
    <button class="btn btn-primary" disabled={busy} onclick={() => gate()}
      >{t("save")}</button
    >{#if space.gate}<button
        class="btn"
        disabled={busy}
        onclick={() => gate(true)}>{t("turnOff")}</button
      >{/if}
  </div>
  {#if space.gate}
    <label class="field"
      >{t("autoLock")}<select
        class="select w-full"
        value={lockDuration(space.gate)}
        onchange={(event) => {
          const value = Number(event.currentTarget.value);
          void run(() =>
            change((s) => {
              if (s.gate) s.gate.lockAfter = value;
            }),
          );
        }}
      >
        {#each LOCK_DURATIONS as seconds (seconds)}<option value={seconds}
            >{seconds === 0
              ? t("lockOnClose")
              : seconds === -1
                ? t("forever")
                : `${seconds < 60 ? seconds : seconds < 3600 ? seconds / 60 : seconds <= 86400 ? seconds / 3600 : seconds / 86400} ${t(seconds < 60 ? "unitSeconds" : seconds < 3600 ? "unitMinutes" : seconds <= 86400 ? "unitHours" : "unitDays")}`}</option
          >{/each}
      </select></label
    >
    <p class="hint">{t("autoLockHint")}</p>
  {/if}
  {#if space.gate}<label class="setting-row"
      >{t("quickOpen")}<input
        class="toggle toggle-primary"
        type="checkbox"
        checked={space.gate.quick}
        onchange={(e) => {
          const checked = e.currentTarget.checked;
          void run(() =>
            change((s) => {
              if (s.gate) s.gate.quick = checked;
            }),
          );
        }}
      /></label
    >{/if}
  {#if space.gate && isMac()}
    <div class="stack">
      <h3>{t("touchID")}</h3>
      <p class="hint">{t("touchIDHint")}</p>
      <button class="btn" disabled={busy} onclick={configureTouchID}
        >{t(space.gate.touchID ? "touchIDDisable" : "touchIDEnable")}</button
      >
      <label class="field"
        >{t("touchIDExtension")}<input
          class="input w-full font-mono"
          readonly
          value={chrome.runtime.id}
          onclick={(event) => event.currentTarget.select()}
        /></label
      >
    </div>
  {/if}
  <p class="hint">{t("shortcutHint")} {command}</p>
  {#if shortcut}<button
      class="btn btn-sm"
      onclick={() =>
        run(async () => {
          await chrome.tabs.create({ url: shortcut });
        })}>{t("shortcutSettings")}</button
    >{/if}
  <hr />
  <h2>{t("sync")}</h2>
  <p class="hint">{t("syncHint")}</p>
  {#if syncSupported()}
    {#if space.connection}<span class="badge badge-outline"
        >{t("connected")}</span
      ><label class="field"
        >{t("recoveryKey")}<input
          class="input w-full font-mono"
          type="password"
          readonly
          value={space.connection.key}
          onclick={(e) => e.currentTarget.select()}
        /></label
      >
      <button
        class="btn btn-sm"
        onclick={() =>
          run(async () => {
            await navigator.clipboard.writeText(space.connection!.key);
            notice = t("copied");
          })}>{t("copy")}</button
      >
      <div class="flex gap-2">
        <button
          class="btn"
          disabled={busy}
          onclick={() => run(() => change(synchronize))}>{t("syncNow")}</button
        ><button
          class="btn btn-ghost"
          disabled={busy}
          onclick={() =>
            run(() =>
              change((s) => {
                delete s.connection;
              }),
            )}>{t("disconnect")}</button
        >
      </div>
    {:else}<button
        class="btn"
        disabled={busy}
        onclick={() =>
          run(() => change((s) => connect(s, recoveryKey(), false)))}
        >{t("createSync")}</button
      >
      <label class="field"
        >{t("recoveryKey")}<input
          class="input w-full font-mono"
          bind:value={key}
          autocomplete="off"
          spellcheck="false"
        /></label
      >
      <button
        class="btn"
        disabled={busy || !key.trim()}
        onclick={() => run(() => change((s) => connect(s, key, true)))}
        >{t("joinSync")}</button
      >
    {/if}
  {:else}<p class="hint">{t("error_unavailable")}</p>{/if}
  {#if notice}<p role="alert" class="notice">{notice}</p>{/if}
</div>
