import { afterEach, expect, test, vi } from 'vitest';
import {
  enrollPasskey,
  readPasskeyKey,
  loadPasskeyRecord
} from '../../src/lib/auth/passkey';
import { installMemoryStorage } from '../helpers/storage';
afterEach(() => vi.unstubAllGlobals());
function installCredential(prf: Uint8Array | undefined) {
  vi.stubGlobal('navigator', {
    credentials: {
      create: async () => ({
        rawId: new Uint8Array([1, 2, 3]).buffer,
        getClientExtensionResults: () => ({
          prf: {
            enabled: Boolean(prf),
            results: prf ? { first: prf.buffer } : undefined
          }
        })
      }),
      get: async () => ({
        rawId: new Uint8Array([1, 2, 3]).buffer,
        getClientExtensionResults: () => ({
          prf: { results: prf ? { first: prf.buffer } : undefined }
        })
      })
    }
  });
}
test('passkeys wrap a vault key with PRF and bind it to the existing encrypted vault', async () => {
  installMemoryStorage();
  installCredential(new Uint8Array(32).fill(7));
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  await enrollPasskey(rawKey.buffer, 'vault-one');
  expect(JSON.stringify(loadPasskeyRecord())).not.toContain(
    btoa(String.fromCharCode(...rawKey))
  );
  expect(new Uint8Array(await readPasskeyKey('vault-one'))).toEqual(rawKey);
  await expect(readPasskeyKey('vault-two')).rejects.toThrow();
  installCredential(new Uint8Array(32).fill(8));
  await expect(readPasskeyKey('vault-one')).rejects.toThrow();
});
test('authenticators without PRF cannot enable a cosmetic vault unlock', async () => {
  installMemoryStorage();
  installCredential(undefined);
  await expect(
    enrollPasskey(new Uint8Array(32).buffer, 'vault-one')
  ).rejects.toThrow('PRF');
  expect(loadPasskeyRecord()).toBeNull();
});
