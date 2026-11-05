export type Mode = "totp" | "hotp" | "steam";
export type Hash = "SHA-1" | "SHA-256" | "SHA-512";
export interface Credential {
  id: string;
  provider: string;
  login: string;
  secret: string;
  mode: Mode;
  hash: Hash;
  digits: number;
  interval: number;
  counter: number;
  site: string;
  position: number;
  changed: number;
  removed: boolean;
}
export interface Preferences {
  locale: string;
  theme: "system" | "light" | "dark";
  conceal: boolean;
  seconds: boolean;
  paste: boolean;
  matchSite: boolean;
}
export interface Gate {
  salt: string;
  proof: string;
  quick: boolean;
  touchID?: boolean;
  lockAfter?: number;
  unlockedAt?: number;
}
export interface Workspace {
  schema: 2;
  records: Record<string, Credential>;
  preferences: Preferences;
  gate?: Gate;
  connection?: { key: string; group: string };
}
export class InputError extends Error {
  constructor(
    readonly code:
      | "invalid"
      | "password"
      | "emptyPassword"
      | "corrupt"
      | "quota"
      | "unavailable"
      | "stale"
      | "missingGroup",
  ) {
    super(code);
  }
}
export function emptyWorkspace(): Workspace {
  return {
    schema: 2,
    records: {},
    preferences: {
      locale: navigatorLanguage(),
      theme: "system",
      conceal: false,
      seconds: true,
      paste: false,
      matchSite: false,
    },
  };
}
function navigatorLanguage(): string {
  return typeof navigator === "undefined"
    ? "en"
    : navigator.language.split("-")[0] || "en";
}
export function activeRecords(space: Workspace): Credential[] {
  return Object.values(space.records)
    .filter((item) => !item.removed)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}
export function normalizeSecret(value: string): string {
  const cleaned = value.replace(/[\s=-]/g, "").toUpperCase();
  if (!cleaned || cleaned.length > 4096 || !/^[A-Z2-7]+$/.test(cleaned))
    throw new InputError("invalid");
  if (![0, 2, 4, 5, 7].includes(cleaned.length % 8))
    throw new InputError("invalid");
  const unused = (cleaned.length * 5) % 8;
  if (
    unused &&
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(cleaned.at(-1)!) &
      ((1 << unused) - 1)
  )
    throw new InputError("invalid");
  return cleaned;
}
export function validateCredential(input: unknown): Credential {
  if (!input || typeof input !== "object") throw new InputError("invalid");
  const x = input as Record<string, unknown>;
  const text = (key: string, max = 512) => {
    const v = x[key];
    if (v !== undefined && typeof v !== "string")
      throw new InputError("invalid");
    if (typeof v === "string" && v.length > max)
      throw new InputError("invalid");
    return typeof v === "string" ? v.trim() : "";
  };
  const mode = x.mode ?? "totp";
  const hash = x.hash ?? "SHA-1";
  const number = (key: string, fallback: number, min: number, max: number) => {
    const v = x[key] ?? fallback;
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max)
      throw new InputError("invalid");
    return v;
  };
  if (
    typeof mode !== "string" ||
    typeof hash !== "string" ||
    !["totp", "hotp", "steam"].includes(mode) ||
    !["SHA-1", "SHA-256", "SHA-512"].includes(hash)
  )
    throw new InputError("invalid");
  const login = text("login");
  if (!login) throw new InputError("invalid");
  const digits = number("digits", 6, mode === "steam" ? 5 : 6, 8);
  if (mode !== "steam" && ![6, 7, 8].includes(digits))
    throw new InputError("invalid");
  const site = text("site", 253).toLowerCase();
  if (
    site &&
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(
      site,
    )
  )
    throw new InputError("invalid");
  return {
    id: text("id", 128),
    provider: text("provider"),
    login,
    secret: normalizeSecret(text("secret", 8192)),
    mode: mode as Mode,
    hash: mode === "steam" ? "SHA-1" : (hash as Hash),
    digits: mode === "steam" ? 5 : digits,
    interval: mode === "steam" ? 30 : number("interval", 30, 1, 86400),
    counter: number("counter", 0, 0, Number.MAX_SAFE_INTEGER),
    site,
    position: number("position", 0, 0, Number.MAX_SAFE_INTEGER),
    changed: number("changed", 0, 0, Number.MAX_SAFE_INTEGER),
    removed: x.removed === true,
  };
}
export function identity(item: Credential): string {
  return JSON.stringify([
    item.provider.toLowerCase(),
    item.login.toLowerCase(),
    item.secret,
    item.mode,
    item.hash,
    item.digits,
    item.interval,
  ]);
}
export async function identify(item: Credential): Promise<Credential> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity(item)),
  );
  return {
    ...item,
    id: Array.from(new Uint8Array(bytes), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
  };
}
export function nextChange(old = 0): number {
  return Math.max(Date.now(), old + 1);
}
export function mergeRecords(
  left: Record<string, Credential>,
  right: Record<string, Credential>,
): Record<string, Credential> {
  const merged = { ...left };
  for (const [id, value] of Object.entries(right)) {
    const old = merged[id];
    if (
      !old ||
      value.changed > old.changed ||
      (value.changed === old.changed &&
        JSON.stringify(value) > JSON.stringify(old))
    )
      merged[id] = value;
  }
  return merged;
}
export function insertRecords(
  space: Workspace,
  incoming: Credential[],
): { added: number; skipped: number } {
  let added = 0,
    skipped = 0;
  let position =
    Math.max(0, ...activeRecords(space).map((x) => x.position)) + 1;
  const known = new Set(activeRecords(space).map(identity));
  for (const item of incoming) {
    if (known.has(identity(item))) {
      skipped++;
      continue;
    }
    const existing = space.records[item.id];
    space.records[item.id] = {
      ...item,
      position: position++,
      removed: false,
      changed: nextChange(existing?.changed),
    };
    known.add(identity(item));
    added++;
  }
  return { added, skipped };
}
export function reviseRecord(
  space: Workspace,
  original: Credential,
  replacement: Credential,
): void {
  const current = space.records[original.id];
  if (!current || current.removed || current.changed !== original.changed)
    throw new InputError("stale");
  space.records[original.id] = {
    ...replacement,
    id: original.id,
    position: current.position,
    changed: nextChange(current.changed),
    removed: false,
  };
}
export function moveRecord(
  space: Workspace,
  id: string,
  targetId: string,
): void {
  const ordered = activeRecords(space);
  const from = ordered.findIndex((x) => x.id === id);
  const to = ordered.findIndex((x) => x.id === targetId);
  if (from < 0 || to < 0 || from === to) return;
  ordered.splice(to, 0, ordered.splice(from, 1)[0]!);
  ordered.forEach((item, index) => {
    if (item.position !== index)
      space.records[item.id] = {
        ...item,
        position: index,
        changed: nextChange(item.changed),
      };
  });
}
export function matchesSite(item: Credential, hostname: string): boolean {
  if (!hostname) return false;
  if (item.site)
    return hostname === item.site || hostname.endsWith("." + item.site);
  const brand = item.provider.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    brand.length >= 3 && hostname.split(".").some((part) => part === brand)
  );
}
