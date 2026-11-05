import { nativeTouchID, TouchIDError } from "./platform/touchID";
import { parseTransfer } from "./domain/transfer";
import { insertRecords, InputError } from "./domain/records";
import { scanImage } from "./domain/qr";
import { transaction } from "./platform/repository";

chrome.commands.onCommand.addListener((command) => {
  if (command !== "open-direct") return;
  void chrome.windows
    .getLastFocused()
    .then((current) => {
      const url = new URL(chrome.runtime.getURL("index.html"));
      url.searchParams.set("entry", "quick");
      if (current.id !== undefined)
        url.searchParams.set("source", String(current.id));
      return chrome.windows.create({
        url: url.href,
        type: "popup",
        width: 440,
        height: 680,
      });
    })
    .catch(console.error);
});
chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (!message || typeof message !== "object") return;
  const request = message as Record<string, unknown>;
  if (
    !["context", "fill", "scan", "capture", "touch-id"].includes(
      String(request.kind),
    )
  )
    return;
  void handle(request, sender)
    .then((value) => reply({ ok: true, value }))
    .catch((error: unknown) =>
      reply({
        ok: false,
        error: error instanceof Error ? error.message : "Request failed",
      }),
    );
  return true;
});
async function handle(
  request: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  if (sender.id !== chrome.runtime.id) throw new InputError("invalid");
  if (request.kind === "capture") return capture(request, sender);
  if (
    sender.tab &&
    sender.url?.split(/[?#]/)[0] !== chrome.runtime.getURL("index.html")
  )
    throw new InputError("invalid");
  if (request.kind === "touch-id") {
    if (
      !["status", "authenticate"].includes(String(request.action)) ||
      (request.action === "authenticate" &&
        (typeof request.reason !== "string" ||
          request.reason.length < 1 ||
          request.reason.length > 256))
    )
      throw new TouchIDError("failed");
    await nativeTouchID(
      request.action as "status" | "authenticate",
      typeof request.reason === "string" ? request.reason : undefined,
    );
    return true;
  }
  const source =
    typeof request.source === "number" &&
    Number.isSafeInteger(request.source) &&
    request.source >= 0
      ? request.source
      : undefined;
  const [tab] = await chrome.tabs.query(
    source === undefined
      ? { active: true, lastFocusedWindow: true }
      : { active: true, windowId: source },
  );
  if (request.kind === "context") {
    if (!tab?.url) return { hostname: "" };
    try {
      const url = new URL(tab.url);
      return { hostname: /^https?:$/.test(url.protocol) ? url.hostname : "" };
    } catch {
      return { hostname: "" };
    }
  }
  if (!tab?.id || !/^https?:/.test(tab.url ?? ""))
    throw new InputError("unavailable");
  if (
    request.kind === "fill" &&
    (typeof request.code !== "string" ||
      !/^([0-9]{6,8}|[23456789BCDFGHJKMNPQRTVWXY]{5})$/.test(request.code))
  )
    throw new InputError("invalid");
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["assets/injected.js"],
  });
  return chrome.tabs.sendMessage(tab.id, {
    kind: request.kind,
    code: request.code,
  });
}
async function capture(
  request: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  if (sender.tab?.windowId === undefined) throw new InputError("invalid");
  const x = request.x,
    y = request.y,
    width = request.width,
    height = request.height,
    viewport = request.viewport;
  if (
    ![x, y, width, height, viewport].every(
      (v) => typeof v === "number" && Number.isFinite(v),
    ) ||
    Number(x) < 0 ||
    Number(y) < 0 ||
    Number(width) < 4 ||
    Number(height) < 4 ||
    Number(viewport) < 1
  )
    throw new InputError("invalid");
  const [active] = await chrome.tabs.query({
    active: true,
    windowId: sender.tab.windowId,
  });
  if (active?.id !== sender.tab.id) throw new InputError("stale");
  const shot = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
    format: "png",
  });
  const blob = await (await fetch(shot)).blob();
  const bitmap = await createImageBitmap(blob);
  let image: Blob;
  try {
    const scale = bitmap.width / Number(viewport);
    const w = Math.round(Number(width) * scale),
      h = Math.round(Number(height) * scale);
    if (
      w * h > 16_000_000 ||
      Number(x) * scale + w > bitmap.width + 1 ||
      Number(y) * scale + h > bitmap.height + 1
    )
      throw new InputError("invalid");
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new InputError("unavailable");
    ctx.drawImage(
      bitmap,
      Number(x) * scale,
      Number(y) * scale,
      w,
      h,
      0,
      0,
      w,
      h,
    );
    image = await canvas.convertToBlob({ type: "image/png" });
  } finally {
    bitmap.close();
  }
  const texts = await scanImage(image);
  const incoming = (await Promise.all(texts.map(parseTransfer))).flat();
  const { result } = await transaction((space) =>
    insertRecords(space, incoming),
  );
  return result;
}
