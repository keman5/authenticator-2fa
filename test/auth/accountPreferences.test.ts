import { expect, test } from 'vitest';
import {
  createAccount,
  normalizeImportedAccounts,
  updateAccount
} from '../../src/lib/auth/otp';
import { normalizeAppSettings } from '../../src/lib/auth/types';

test('account favorites and explicit sites survive editing and backup normalization', () => {
  const account = createAccount({
    label: 'alice',
    secret: 'JBSWY3DPEHPK3PXP',
    favorite: true,
    site: 'login.example.com'
  });
  expect(account.favorite).toBe(true);
  expect(account.site).toBe('login.example.com');
  const updated = updateAccount(account, { label: 'bob' });
  expect(normalizeImportedAccounts([updated])[0]).toMatchObject({
    favorite: true,
    site: 'login.example.com'
  });
  expect(updateAccount(updated, { favorite: false, site: '' })).toMatchObject({
    favorite: false,
    site: ''
  });
});

test('new behavior preferences normalize older vaults and reject invalid automatic lock values', () => {
  expect(normalizeAppSettings(undefined)).toMatchObject({
    autoLockMinutes: 5,
    enhancedInputMenu: false
  });
  expect(normalizeAppSettings({ autoLockMinutes: -99 })).toMatchObject({
    autoLockMinutes: 5
  });
  expect(
    normalizeAppSettings({ autoLockMinutes: -1, enhancedInputMenu: false })
  ).toMatchObject({ autoLockMinutes: -1, enhancedInputMenu: false });
});

test('explicit account sites match exact hosts and their children without matching lookalikes', async () => {
  const { getAccountPageRanking } =
    await import('../../src/lib/auth/accountRanking');
  const account = createAccount({
    label: 'alice',
    issuer: 'Unrelated',
    secret: 'JBSWY3DPEHPK3PXP',
    site: 'example.com'
  });
  expect(
    getAccountPageRanking([account], {
      hostname: 'login.example.com'
    }).suggestedAccountIds.has(account.id)
  ).toBe(true);
  expect(
    getAccountPageRanking([account], {
      hostname: 'evil-example.com'
    }).suggestedAccountIds.has(account.id)
  ).toBe(false);
});

test('automatic language follows the browser while legacy and explicit preferences stay selected', () => {
  const original = globalThis.chrome;
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: { i18n: { getUILanguage: () => 'ja-JP' } }
  });
  try {
    expect(
      normalizeAppSettings({ language: 'en', languageMode: 'system' })
    ).toMatchObject({ language: 'ja', languageMode: 'system' });
    expect(normalizeAppSettings({ language: 'de' })).toMatchObject({
      language: 'de',
      languageMode: 'manual'
    });
  } finally {
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: original
    });
  }
});
