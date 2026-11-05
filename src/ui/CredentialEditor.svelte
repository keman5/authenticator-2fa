<script lang="ts">
  import { untrack } from "svelte";
  import {
    InputError,
    validateCredential,
    type Credential,
  } from "../domain/records";
  import { decodeBase32 } from "../domain/otp";
  import type { MessageKey } from "../lib/i18n/messages";
  let {
    original,
    t,
    save,
    cancel,
  }: {
    original?: Credential;
    t: (key: MessageKey) => string;
    save: (item: Credential) => Promise<void>;
    cancel: () => void;
  } = $props();
  let draft = $state(
    untrack(() => ({
      ...original,
      provider: original?.provider ?? "",
      login: original?.login ?? "",
      secret: original?.secret ?? "",
      mode: original?.mode ?? "totp",
      hash: original?.hash ?? "SHA-1",
      digits: original?.digits ?? 6,
      interval: original?.interval ?? 30,
      counter: original?.counter ?? 0,
      site: original?.site ?? "",
    })),
  );
  let busy = $state(false);
  let error = $state("");
  async function submit() {
    busy = true;
    error = "";
    try {
      const item = validateCredential(draft);
      decodeBase32(item.secret);
      await save(item);
    } catch (err) {
      error = t(
        err instanceof InputError ? `error_${err.code}` : "error_generic",
      );
    } finally {
      busy = false;
    }
  }
</script>

<form
  onsubmit={(event) => {
    event.preventDefault();
    void submit();
  }}
  class="stack"
>
  <div class="section-title">
    <h2>{t(original ? "edit" : "add")}</h2>
    <button type="button" class="btn btn-ghost btn-sm" onclick={cancel}
      >{t("cancel")}</button
    >
  </div>
  <label class="field"
    >{t("provider")}<input
      class="input w-full"
      bind:value={draft.provider}
      maxlength="512"
    /></label
  >
  <label class="field"
    >{t("login")}<input
      class="input w-full"
      bind:value={draft.login}
      required
      maxlength="512"
    /></label
  >
  <label class="field"
    >{t("secret")}<input
      class="input w-full font-mono"
      bind:value={draft.secret}
      required
      autocomplete="off"
      spellcheck="false"
    /></label
  >
  <div class="grid grid-cols-2 gap-3">
    <label class="field"
      >{t("mode")}<select class="select w-full" bind:value={draft.mode}
        ><option value="totp">TOTP</option><option value="hotp">HOTP</option
        ><option value="steam">Steam</option></select
      ></label
    >
    {#if draft.mode !== "steam"}<label class="field"
        >{t("algorithm")}<select class="select w-full" bind:value={draft.hash}
          ><option>SHA-1</option><option>SHA-256</option><option>SHA-512</option
          ></select
        ></label
      >
      <label class="field"
        >{t("digits")}<select class="select w-full" bind:value={draft.digits}
          ><option value={6}>6</option><option value={7}>7</option><option
            value={8}>8</option
          ></select
        ></label
      >{/if}
    {#if draft.mode === "hotp"}<label class="field"
        >{t("counter")}<input
          class="input w-full"
          type="number"
          min="0"
          max={Number.MAX_SAFE_INTEGER}
          bind:value={draft.counter}
          required
        /></label
      >
    {:else if draft.mode !== "steam"}<label class="field"
        >{t("period")}<input
          class="input w-full"
          type="number"
          min="1"
          max="86400"
          bind:value={draft.interval}
          required
        /></label
      >{/if}
  </div>
  <label class="field"
    >{t("website")}<input
      class="input w-full"
      bind:value={draft.site}
      placeholder="example.com"
      maxlength="253"
    /></label
  >
  {#if error}<p role="alert" class="text-error">{error}</p>{/if}
  <button class="btn btn-primary" disabled={busy}>{t("save")}</button>
</form>
