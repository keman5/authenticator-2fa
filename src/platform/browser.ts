export function shortcutsPage(url: string, agent: string): string | null {
  if (url.startsWith("safari-web-extension:")) return null;
  if (url.startsWith("moz-extension:")) return "about:addons";
  return agent.includes("Edg/")
    ? "edge://extensions/shortcuts"
    : "chrome://extensions/shortcuts";
}
export function takeQuickEntry(): boolean {
  const url = new URL(location.href);
  const quick = url.searchParams.get("entry") === "quick";
  if (url.searchParams.has("entry")) {
    url.searchParams.delete("entry");
    history.replaceState(history.state, "", url.href);
  }
  return quick;
}
export function sourceWindow(): number | undefined {
  const value = new URL(location.href).searchParams.get("source");
  if (!value) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}
export async function request<T>(
  kind: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage)
    throw new Error("Extension API unavailable");
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage(
      { kind, ...payload },
      (reply: { ok: boolean; value?: T; error?: string } | undefined) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else if (!reply?.ok)
          reject(new Error(reply?.error ?? "Request failed"));
        else resolve(reply.value as T);
      },
    ),
  );
}
export async function openFileWindow(): Promise<void> {
  if (
    typeof chrome === "undefined" ||
    !chrome.extension?.getViews?.({ type: "popup" }).includes(window)
  )
    return;
  const current = await chrome.windows.getCurrent();
  const url = new URL(chrome.runtime.getURL("index.html"));
  url.searchParams.set("view", "data");
  if (current.id !== undefined)
    url.searchParams.set("source", String(current.id));
  const created = await chrome.windows.create({
    url: url.href,
    type: "popup",
    width: 440,
    height: 720,
  });
  if (created?.id !== undefined) window.close();
}
