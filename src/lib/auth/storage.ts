import type { StoredVault } from './types';

const VAULT_KEY = 'vastblast.2fa-authenticator.vault';
const VAULT_SESSION_KEY = 'vastblast.2fa-authenticator.session-key';
const VAULT_ACTIVITY_KEY = 'vastblast.2fa-authenticator.session-activity';

export interface VaultSessionKey {
  fingerprint: string;
  key: JsonWebKey;
  savedAt: string;
  sessionId?: string;
  autoLockMinutes?: number;
}

interface VaultActivity {
  sessionId: string;
  lastActivity: number;
  autoLockMinutes: number;
}

function sessionIdentity(session: VaultSessionKey): string {
  return session.sessionId ?? `${session.fingerprint}:${session.savedAt}`;
}

export async function loadStoredVault(): Promise<StoredVault | null> {
  const stored =
    await readStorage<Record<string, StoredVault | undefined>>(VAULT_KEY);
  return stored[VAULT_KEY] ?? null;
}

export async function saveStoredVault(vault: StoredVault): Promise<void> {
  await writeStorage(getChromeStorage(), { [VAULT_KEY]: vault });
}

export async function clearStoredVault(): Promise<void> {
  await removeStorageValue('local', VAULT_KEY);
}

export async function loadVaultSessionKey(
  fingerprint: string,
  autoLockMinutes?: number
): Promise<JsonWebKey | null> {
  const stored =
    await readSessionStorage<Record<string, VaultSessionKey | undefined>>(
      VAULT_SESSION_KEY
    );
  const session = stored[VAULT_SESSION_KEY];
  if (session?.fingerprint !== fingerprint) return null;
  const activity = await loadSessionActivity(session);
  const minutes =
    autoLockMinutes ?? activity?.autoLockMinutes ?? session.autoLockMinutes;
  const lastActivity = activity?.lastActivity ?? Date.parse(session.savedAt);
  if (
    minutes !== undefined &&
    minutes > 0 &&
    (!Number.isFinite(lastActivity) ||
      Date.now() - lastActivity >= minutes * 60000)
  ) {
    await clearVaultSessionKey();
    return null;
  }
  return session.key;
}

export async function saveVaultSessionKey(
  fingerprint: string,
  key: JsonWebKey,
  autoLockMinutes = 5
): Promise<void> {
  await writeSessionStorage({
    [VAULT_SESSION_KEY]: {
      fingerprint,
      key,
      savedAt: new Date().toISOString(),
      sessionId: crypto.randomUUID(),
      autoLockMinutes
    } satisfies VaultSessionKey
  });
}

async function loadSessionActivity(
  session: VaultSessionKey
): Promise<VaultActivity | null> {
  const stored =
    await readSessionStorage<Record<string, VaultActivity | undefined>>(
      VAULT_ACTIVITY_KEY
    );
  const activity = stored[VAULT_ACTIVITY_KEY];
  return activity?.sessionId === sessionIdentity(session) ? activity : null;
}

/** Call under the shared vault lock. A heartbeat never writes key material. */
export async function touchVaultSession(
  fingerprint: string,
  autoLockMinutes: number
): Promise<void> {
  const stored =
    await readSessionStorage<Record<string, VaultSessionKey | undefined>>(
      VAULT_SESSION_KEY
    );
  const session = stored[VAULT_SESSION_KEY];
  if (session?.fingerprint !== fingerprint) return;
  const previous = await loadSessionActivity(session);
  await writeSessionStorage({
    [VAULT_ACTIVITY_KEY]: {
      sessionId: sessionIdentity(session),
      lastActivity: Math.max(Date.now(), previous?.lastActivity ?? 0),
      autoLockMinutes
    } satisfies VaultActivity
  });
}

export async function clearVaultSessionKey(): Promise<void> {
  await removeStorageValue('session', VAULT_SESSION_KEY);
}

async function readStorage<T extends Record<string, unknown>>(
  key: string
): Promise<T> {
  const storage = getChromeStorage();
  if (storage) {
    return new Promise<T>((resolve, reject) => {
      storage.get(key, (items) =>
        settleChromeCallback(() => resolve(items as T), reject)
      );
    });
  }

  const raw = localStorage.getItem(key);
  return { [key]: raw ? JSON.parse(raw) : undefined } as T;
}

async function readSessionStorage<T extends Record<string, unknown>>(
  key: string
): Promise<T> {
  const storage = getSessionStorage();
  if (storage) {
    return new Promise<T>((resolve, reject) => {
      storage.get(key, (items) =>
        settleChromeCallback(() => resolve(items as T), reject)
      );
    });
  }

  const raw = sessionStorage.getItem(key);
  return { [key]: raw ? JSON.parse(raw) : undefined } as T;
}

async function writeSessionStorage(
  items: Record<string, unknown>
): Promise<void> {
  const storage = getSessionStorage();
  if (storage) {
    await new Promise<void>((resolve, reject) => {
      storage.set(items, () => settleChromeCallback(resolve, reject));
    });
    return;
  }

  for (const [key, value] of Object.entries(items)) {
    sessionStorage.setItem(key, JSON.stringify(value));
  }
}

async function writeStorage(
  storage:
    chrome.storage.StorageArea | chrome.storage.SessionStorageArea | null,
  items: Record<string, unknown>
): Promise<void> {
  if (storage) {
    await new Promise<void>((resolve, reject) => {
      storage.set(items, () => settleChromeCallback(resolve, reject));
    });
    return;
  }

  for (const [key, value] of Object.entries(items)) {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

async function removeStorageValue(
  area: 'local' | 'session',
  key: string
): Promise<void> {
  const storage = area === 'local' ? getChromeStorage() : getSessionStorage();
  if (storage) {
    await new Promise<void>((resolve, reject) => {
      storage.remove(key, () => settleChromeCallback(resolve, reject));
    });
    return;
  }

  (area === 'local' ? localStorage : sessionStorage).removeItem(key);
}

function getChromeStorage(): chrome.storage.LocalStorageArea | null {
  return typeof chrome !== 'undefined' && chrome.storage?.local
    ? chrome.storage.local
    : null;
}

function getSessionStorage(): chrome.storage.SessionStorageArea | null {
  return typeof chrome !== 'undefined' && chrome.storage?.session
    ? chrome.storage.session
    : null;
}

function settleChromeCallback(
  resolve: () => void,
  reject: (error: Error) => void
): void {
  const message = chrome.runtime.lastError?.message;
  if (message) {
    reject(new Error(message));
  } else {
    resolve();
  }
}
