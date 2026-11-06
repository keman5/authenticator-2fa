import { afterEach, expect, test, vi } from 'vitest';
import {
  clearVaultSessionKey,
  loadVaultSessionKey,
  saveVaultSessionKey,
  touchVaultSession
} from '../../src/lib/auth/storage';
import { installStructuredCloneChromeStorage } from '../helpers/storage';

const activityKey = 'vastblast.2fa-authenticator.session-activity';
const key: JsonWebKey = { kty: 'oct', k: 'test-key' };
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function delayActivityWrite() {
  const set = chrome.storage.session.set.bind(chrome.storage.session);
  let release!: () => void;
  let signal!: () => void;
  const waiting = new Promise<void>((resolve) => {
    signal = resolve;
  });
  vi.spyOn(chrome.storage.session, 'set').mockImplementation(
    (items, callback) => {
      if (activityKey in items) {
        release = () => {
          void set(items, callback!);
        };
        signal();
      } else {
        void set(items, callback!);
      }
    }
  );
  return { waiting, release: () => release() };
}

test('an in-flight heartbeat cannot recreate a key removed by a concurrent page close', async () => {
  installStructuredCloneChromeStorage();
  await saveVaultSessionKey('vault', key, 1);
  const delayed = await delayActivityWrite();
  const heartbeat = touchVaultSession('vault', 1);
  await delayed.waiting;
  await clearVaultSessionKey();
  delayed.release();
  await heartbeat;
  expect(await loadVaultSessionKey('vault')).toBeNull();
});

test('an old session heartbeat cannot alter a newly unlocked session deadline', async () => {
  installStructuredCloneChromeStorage();
  vi.useFakeTimers();
  await saveVaultSessionKey('vault', key, 1);
  const delayed = await delayActivityWrite();
  const heartbeat = touchVaultSession('vault', 1);
  await delayed.waiting;
  await clearVaultSessionKey();
  await saveVaultSessionKey('vault', key, -1);
  delayed.release();
  await heartbeat;
  await vi.advanceTimersByTimeAsync(3600000);
  expect(await loadVaultSessionKey('vault')).toEqual(key);
});
