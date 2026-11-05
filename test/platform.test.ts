import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  emptyWorkspace,
  identify,
  insertRecords,
  validateCredential,
  nextChange,
} from "../src/domain/records";
import {
  DOCUMENT_KEY,
  readWorkspace,
  transaction,
  validateWorkspace,
} from "../src/platform/repository";
import {
  connect,
  recoveryKey,
  synchronize,
  syncNamespace,
} from "../src/platform/sync";
import { shortcutsPage, takeQuickEntry } from "../src/platform/browser";
import { languages, messages, translate } from "../src/lib/i18n/messages";
let local: Record<string, unknown>,
  cloud: Record<string, unknown>,
  failure: boolean;
beforeEach(() => {
  local = {};
  cloud = {};
  failure = false;
  const area = (data: () => Record<string, unknown>) => ({
    get: (key: string | null, reply: (x: Record<string, unknown>) => void) =>
      queueMicrotask(() =>
        reply(structuredClone(key ? { [key]: data()[key] } : data())),
      ),
    set: (items: Record<string, unknown>, reply: () => void) => {
      const cloned = structuredClone(items);
      queueMicrotask(() => {
        if (failure) {
          Object.defineProperty(chrome.runtime, "lastError", {
            value: { message: "write failed" },
            writable: true,
            configurable: true,
          });
          reply();
          Object.defineProperty(chrome.runtime, "lastError", {
            value: undefined,
          });
        } else {
          Object.assign(data(), cloned);
          reply();
        }
      });
    },
    QUOTA_BYTES: 102400,
    QUOTA_BYTES_PER_ITEM: 8192,
    MAX_ITEMS: 512,
  });
  vi.stubGlobal("chrome", {
    runtime: {
      id: "test",
      getURL: () => "chrome-extension://test/",
      lastError: undefined,
    },
    storage: { local: area(() => local), sync: area(() => cloud) },
  });
});
afterEach(() => vi.unstubAllGlobals());
const item = async (login = "alice") =>
  identify(
    validateCredential({
      login,
      secret: "JBSWY3DPEHPK3PXP",
      provider: "Example",
    }),
  );
it("stores plain cloneable documents and serializes overlapping changes", async () => {
  await Promise.all([
    transaction(async (s) => {
      insertRecords(s, [await item()]);
    }),
    transaction(async (s) => {
      insertRecords(s, [await item("bob")]);
    }),
  ]);
  const saved = await readWorkspace();
  expect(Object.keys(saved.records)).toHaveLength(2);
  expect(structuredClone(saved)).toEqual(saved);
  expect(local[DOCUMENT_KEY]).toEqual(saved);
});
it("never replaces corrupt storage or failed writes", async () => {
  local[DOCUMENT_KEY] = { schema: 200, records: {} };
  await expect(
    transaction((s) => {
      s.records = {};
    }),
  ).rejects.toThrow("corrupt");
  expect(local[DOCUMENT_KEY]).toEqual({ schema: 200, records: {} });
  local = {};
  failure = true;
  await expect(
    transaction((s) => {
      s.preferences.conceal = true;
    }),
  ).rejects.toThrow("write failed");
  expect(local).toEqual({});
  local[DOCUMENT_KEY] = null;
  await expect(readWorkspace()).rejects.toThrow("corrupt");
});
it("rejects malformed keys and secret documents", () => {
  const s = emptyWorkspace();
  s.gate = { salt: "garbage", proof: "garbage", quick: true };
  expect(() => validateWorkspace(s)).toThrow("corrupt");
});
it("syncs encrypted records between devices, preserves local prefs and propagates deletion", async () => {
  const a = emptyWorkspace();
  insertRecords(a, [await item()]);
  const key = recoveryKey();
  await connect(a, key, false);
  expect(JSON.stringify(cloud)).not.toContain("JBSWY");
  expect(JSON.stringify(cloud)).not.toContain("alice");
  const b = emptyWorkspace();
  b.preferences.conceal = true;
  await connect(b, key, true);
  expect(b.records).toEqual(a.records);
  expect(b.preferences.conceal).toBe(true);
  const id = Object.keys(a.records)[0]!;
  a.records[id] = {
    ...a.records[id]!,
    removed: true,
    changed: nextChange(a.records[id]!.changed),
  };
  insertRecords(b, [await item("bob")]);
  await synchronize(a);
  await synchronize(b);
  await synchronize(a);
  expect(a.records).toEqual(b.records);
  expect(a.records[id]?.removed).toBe(true);
  expect(Object.values(a.records).filter((x) => !x.removed)).toHaveLength(1);
});
it("rejects unknown groups, tampering and quota before cloud writes", async () => {
  await expect(connect(emptyWorkspace(), recoveryKey(), true)).rejects.toThrow(
    "missingGroup",
  );
  const a = emptyWorkspace();
  insertRecords(a, [await item()]);
  await connect(a, recoveryKey(), false);
  const b = emptyWorkspace();
  const prefix = syncNamespace(a.connection!.group);
  const saved = structuredClone(cloud);
  cloud[prefix + Object.keys(a.records)[0]] = { iv: "!", payload: "!" };
  await expect(connect(b, a.connection!.key, true)).rejects.toThrow();
  expect(b.records).toEqual({});
  cloud = saved;
  const c = emptyWorkspace();
  insertRecords(c, [await item("x".repeat(512))]);
  Object.defineProperty(chrome.storage.sync, "QUOTA_BYTES", { value: 1 });
  const prior = structuredClone(cloud);
  await expect(connect(c, recoveryKey(), false)).rejects.toThrow("quota");
  expect(cloud).toEqual(prior);
});
it("consumes direct-entry only once and chooses browser shortcut pages", () => {
  let url = "https://test/index.html?entry=quick&source=4";
  vi.stubGlobal("location", {
    get href() {
      return url;
    },
  });
  vi.stubGlobal("history", {
    replaceState: (_: unknown, __: string, value: string) => {
      url = value;
    },
  });
  expect(takeQuickEntry()).toBe(true);
  expect(takeQuickEntry()).toBe(false);
  expect(url).toContain("source=4");
  expect(shortcutsPage("safari-web-extension://id/", "")).toBeNull();
  expect(shortcutsPage("moz-extension://id/", "")).toBe("about:addons");
  expect(shortcutsPage("chrome-extension://id/", "Edg/")).toBe(
    "edge://extensions/shortcuts",
  );
});
it("provides every runtime translation and stable product name", () => {
  for (const [locale] of languages)
    for (const [key, variants] of Object.entries(messages)) {
      expect(variants[locale], `${locale}/${key}`).toBeTruthy();
      expect(translate(locale, "appName")).toBe("Authenticator - 2FA");
    }
});
