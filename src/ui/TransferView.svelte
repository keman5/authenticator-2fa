<script lang="ts">
  import {
    activeRecords,
    InputError,
    type Credential,
    type Workspace,
  } from "../domain/records";
  import { MAX_TRANSFER_BYTES, parseTransfer, toUri } from "../domain/transfer";
  import {
    encryptedBackup,
    isProtectedBackup,
    openBackup,
  } from "../domain/sealing";
  import { openFileWindow, requiresFileWindow } from "../platform/browser";
  import type { MessageKey } from "../lib/i18n/messages";
  let {
    space,
    t,
    importItems,
    scan,
  }: {
    space: Workspace;
    t: (k: MessageKey) => string;
    importItems: (items: Credential[]) => Promise<string>;
    scan: () => Promise<void>;
  } = $props();
  let text = $state(""),
    password = $state(""),
    confirmation = $state(""),
    notice = $state(""),
    busy = $state(false),
    format = $state("encrypted");
  function message(error: unknown) {
    return t(
      error instanceof InputError ? `error_${error.code}` : "error_generic",
    );
  }
  async function parse(text: string) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      /* URI input */
    }
    return parseTransfer(
      isProtectedBackup(data)
        ? JSON.stringify(await openBackup(data, password))
        : text,
    );
  }
  async function run(work: () => Promise<void>) {
    busy = true;
    notice = "";
    try {
      await work();
    } catch (error) {
      notice = message(error);
    } finally {
      busy = false;
    }
  }
  async function files(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    await run(async () => {
      if (files.length > 20) throw new InputError("invalid");
      const items: Credential[] = [];
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          const { scanImage } = await import("../domain/qr");
          const found = await scanImage(file);
          if (!found.length) throw new InputError("invalid");
          for (const value of found) items.push(...(await parse(value)));
        } else {
          if (file.size > MAX_TRANSFER_BYTES) throw new InputError("invalid");
          items.push(...(await parse(await file.text())));
        }
      }
      if (!items.length || items.length > 1000) throw new InputError("invalid");
      notice = await importItems(items);
      input.value = "";
    });
  }
  async function download() {
    await run(async () => {
      const entries = activeRecords(space);
      const data = { format: "authenticator.records", version: 2, entries };
      if (format === "encrypted" && password !== confirmation) {
        notice = t("mismatch");
        return;
      }
      const contents =
        format === "encrypted"
          ? await encryptedBackup(data, password)
          : format === "uri"
            ? entries.map(toUri).join("\n")
            : JSON.stringify(data, null, 2);
      const url = URL.createObjectURL(
        new Blob([contents], {
          type: format === "uri" ? "text/plain" : "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `authenticator-${new Date().toISOString().slice(0, 10)}.${format === "uri" ? "txt" : "json"}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
</script>

<div class="stack">
  <h2>{t("import")}</h2>
  <label class="field"
    >{t("pasteText")}<textarea
      class="textarea w-full h-28 font-mono"
      bind:value={text}
      spellcheck="false"
      maxlength={MAX_TRANSFER_BYTES}></textarea></label
  >
  <label class="field"
    >{t("backupPassword")}<input
      class="input w-full"
      type="password"
      bind:value={password}
      autocomplete="off"
    /></label
  >
  <div class="flex flex-wrap gap-2">
    <button
      class="btn btn-primary"
      disabled={busy || !text.trim()}
      onclick={() =>
        run(async () => {
          notice = await importItems(await parse(text));
          text = "";
        })}>{t("import")}</button
    >
    <label class="btn" class:btn-disabled={busy}
      >{t("chooseFiles")}<input
        class="sr-only"
        type="file"
        multiple
        accept="image/*,.json,.txt"
        disabled={busy}
        onclick={(event) => {
          if (
            typeof chrome !== "undefined" &&
            requiresFileWindow(
              chrome.extension?.getViews?.({ type: "popup" }).includes(window) ?? false,
            )
          ) {
            event.preventDefault();
            void run(openFileWindow);
          }
        }}
        onchange={files}
      /></label
    >
    <button class="btn btn-ghost" disabled={busy} onclick={() => run(scan)}
      >{t("scanPage")}</button
    >
  </div>
  {#if notice}<p role="status" class="notice">{notice}</p>{/if}
  <hr />
  <h2>{t("export")}</h2>
  <select class="select w-full" aria-label={t("export")} bind:value={format}
    ><option value="encrypted">{t("encryptedBackup")}</option><option
      value="plain">{t("plainBackup")}</option
    ><option value="uri">otpauth URI</option></select
  >
  {#if format === "encrypted"}<label class="field"
      >{t("confirmPassword")}<input
        class="input w-full"
        type="password"
        bind:value={confirmation}
        autocomplete="off"
      /></label
    >{:else}<p class="hint">{t("plainWarning")}</p>{/if}
  <button class="btn" disabled={busy} onclick={download}>{t("download")}</button
  >
</div>
