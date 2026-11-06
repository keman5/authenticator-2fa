import { beforeEach, expect, test, vi } from 'vitest';
import { AuthenticatorVault } from '../../src/lib/state/authenticator';
import { installStructuredCloneChromeStorage } from '../helpers/storage';

beforeEach(() => installStructuredCloneChromeStorage());

test('publishes initialization, persisted imports, codes and direct feedback changes to subscribers', async () => {
  const vault = new AuthenticatorVault();
  const listener = vi.fn();
  const initial = vault.getSnapshot();
  const stop = vault.subscribe(listener);
  await vault.initialize();
  expect(vault.getSnapshot()).not.toBe(initial);
  expect(listener).toHaveBeenCalled();
  await vault.importText(
    'otpauth://totp/Test:alice?secret=JBSWY3DPEHPK3PXP&issuer=Test'
  );
  expect(vault.accounts).toHaveLength(1);
  expect(vault.codes[vault.accounts[0].id].value).toHaveLength(6);
  listener.mockClear();
  vault.error = 'feedback';
  expect(listener).toHaveBeenCalledOnce();
  const current = vault.getSnapshot();
  expect(vault.getSnapshot()).toBe(current);
  stop();
  vault.error = '';
  expect(listener).toHaveBeenCalledOnce();
});

test('derived ordering stays current and vault data remains structured-clone safe', async () => {
  const vault = new AuthenticatorVault();
  await vault.initialize();
  await vault.importText(
    'otpauth://totp/Test:alice?secret=JBSWY3DPEHPK3PXP&issuer=Test'
  );
  const first = vault.sortedAccounts;
  expect(vault.sortedAccounts).toBe(first);
  await vault.importText(
    'otpauth://totp/Test:bob?secret=KRSXG5DSNFXGOIDB&issuer=Test'
  );
  expect(vault.sortedAccounts).not.toBe(first);
  expect(structuredClone(vault.accounts)).toEqual(vault.accounts);
});
