const injectedScope = globalThis as typeof globalThis & {
  __independentAuthenticator?: boolean;
};
if (!injectedScope.__independentAuthenticator) {
  injectedScope.__independentAuthenticator = true;
  chrome.runtime.onMessage.addListener((value: unknown, _sender, reply) => {
    if (!value || typeof value !== "object") return;
    const request = value as { kind?: string; code?: unknown };
    if (request.kind === "fill") {
      reply(fill(request.code));
      return;
    }
    if (request.kind === "scan") {
      selectRegion();
      reply(true);
    }
  });
}
function writable(input: HTMLInputElement): boolean {
  const rect = input.getBoundingClientRect();
  const style = getComputedStyle(input);
  return (
    !input.disabled &&
    !input.readOnly &&
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    ["text", "tel", "number", "password"].includes(input.type) &&
    input.autocomplete !== "current-password" &&
    input.autocomplete !== "new-password"
  );
}
function fill(value: unknown): boolean {
  if (
    typeof value !== "string" ||
    !/^(?:[0-9]{6,8}|[23456789BCDFGHJKMNPQRTVWXY]{5})$/.test(value)
  )
    return false;
  const eligible = Array.from(document.querySelectorAll("input")).filter(
    writable,
  );
  const score = (input: HTMLInputElement) => {
    const hints = [
      input.name,
      input.id,
      input.placeholder,
      input.getAttribute("aria-label") ?? "",
    ]
      .join(" ")
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .toLowerCase();
    if (input.autocomplete === "one-time-code") return 100;
    if (
      /(?:^|[^a-z])[th]?otp(?:[^a-z]|$)|one.?time|(?:verification|verify|auth|authentication|security)[-_ ]?code|2fa|验证码|認証コード/.test(
        hints,
      )
    )
      return 60;
    return 0;
  };
  const ordered = eligible
    .map((input) => ({ input, score: score(input) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const winner = ordered[0];
  if (!winner) return false;
  if (ordered[1]?.score === winner.score && winner.input.maxLength !== 1)
    return false;
  const write = (input: HTMLInputElement, text: string) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, text);
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text,
      }),
    );
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  if (winner.input.maxLength === 1) {
    const scope = winner.input.form ?? winner.input.parentElement;
    if (!scope) return false;
    const cells = Array.from(scope.querySelectorAll("input")).filter(
      (item) => writable(item) && item.maxLength === 1,
    );
    if (cells.length !== value.length) return false;
    cells.forEach((cell, i) => write(cell, value[i]!));
    return true;
  }
  if (winner.input.maxLength > 0 && winner.input.maxLength < value.length)
    return false;
  write(winner.input, value);
  return true;
}
function selectRegion(): void {
  if (document.getElementById("independent-auth-selection")) return;
  const cover = document.createElement("div");
  cover.id = "independent-auth-selection";
  Object.assign(cover.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    cursor: "crosshair",
    background: "rgba(0,0,0,.25)",
    touchAction: "none",
  });
  const box = document.createElement("div");
  Object.assign(box.style, {
    position: "absolute",
    border: "2px solid white",
    background: "transparent",
    pointerEvents: "none",
  });
  cover.append(box);
  let start: { x: number; y: number } | undefined;
  const close = () => {
    cover.remove();
    document.removeEventListener("keydown", escape);
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("keydown", escape);
  cover.onpointerdown = (event) => {
    start = { x: event.clientX, y: event.clientY };
    cover.setPointerCapture(event.pointerId);
  };
  cover.onpointermove = (event) => {
    if (!start) return;
    Object.assign(box.style, {
      left: Math.min(start.x, event.clientX) + "px",
      top: Math.min(start.y, event.clientY) + "px",
      width: Math.abs(event.clientX - start.x) + "px",
      height: Math.abs(event.clientY - start.y) + "px",
    });
  };
  cover.onpointerup = (event) => {
    if (!start) {
      close();
      return;
    }
    const x = Math.min(start.x, event.clientX),
      y = Math.min(start.y, event.clientY),
      width = Math.abs(start.x - event.clientX),
      height = Math.abs(start.y - event.clientY);
    close();
    if (width < 4 || height < 4) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        chrome.runtime.sendMessage(
          { kind: "capture", x, y, width, height, viewport: innerWidth },
          (result: {
            ok: boolean;
            value?: { added: number };
            error?: string;
          }) => {
            const error = chrome.runtime.lastError;
            alert(
              error?.message ??
                (result?.ok
                  ? `${result.value?.added ?? 0} accounts imported.`
                  : (result?.error ?? "Could not read QR code.")),
            );
          },
        ),
      ),
    );
  };
  document.documentElement.append(cover);
}
