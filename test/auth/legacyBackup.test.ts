import { describe, expect, test } from 'vitest';
import { importAnyText } from '../../src/lib/auth/importText';
import { readImportFiles } from '../../src/lib/auth/importFiles';
import {
  importEncryptedBackup,
  readPortableBackup
} from '../../src/lib/auth/backup';
import { createAccount } from '../../src/lib/auth/otp';

const oldAccount = {
  name: 'Example',
  acct: 'alice',
  secret: 'JBSWY3DPEHPK3PXP',
  digits: 6,
  step: 30,
  algo: 'SHA-1',
  fav: true
};
const currentAccount = createAccount({
  issuer: 'Example',
  label: 'alice',
  secret: oldAccount.secret,
  favorite: true,
  site: 'example.com'
});
const oldEncryptedText = JSON.stringify({
  format: '2fa-backup',
  version: 1,
  encrypted: true,
  salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
  iv: 'AAAAAAAAAAAAAAAA',
  data: 'AAAA'
});

describe('obsolete prototype backups', () => {
  test.each([oldAccount, currentAccount])(
    'rejects the old marked JSON wrapper regardless of its account schema (%j)',
    (account) => {
      expect(() =>
        importAnyText(
          JSON.stringify({
            format: '2fa-backup',
            version: 1,
            accounts: [account]
          })
        )
      ).toThrow('Backup file format is not supported.');
    }
  );

  test('does not map unmarked prototype account fields into current records', () => {
    expect(() =>
      importAnyText(JSON.stringify({ accounts: [oldAccount] }))
    ).toThrow('Imported account is not valid.');
  });

  test('rejects an old encrypted envelope before asking for a password', async () => {
    expect(readPortableBackup(oldEncryptedText)).toBeNull();
    expect(() => importAnyText(oldEncryptedText)).toThrow(
      'Backup file format is not supported.'
    );
    await expect(
      importEncryptedBackup(oldEncryptedText, 'password')
    ).rejects.toThrow(
      'Backup file is not a supported encrypted authenticator backup.'
    );
  });

  test('routes an obsolete encrypted file to the existing import error flow', async () => {
    const selection = await readImportFiles([
      new File([oldEncryptedText], 'obsolete.2fa')
    ]);
    expect(selection.encrypted).toEqual([]);
    expect(selection.texts).toEqual([oldEncryptedText]);
    expect(() => importAnyText(selection.texts[0])).toThrow(
      'Backup file format is not supported.'
    );
  });

  test('does not accept an obsolete marker added to a current encrypted wrapper', () => {
    expect(
      readPortableBackup(
        JSON.stringify({
          format: '2fa-backup',
          app: '2fa-authenticator',
          version: 1,
          vault: {}
        })
      )
    ).toBeNull();
  });
});

describe('current JSON account backups', () => {
  test.each([false, true])(
    'round-trips current records (export wrapper: %s)',
    (wrapped) => {
      const accounts = [currentAccount];
      const backup = wrapped
        ? {
            app: '2fa-authenticator',
            version: 1,
            exportedAt: new Date().toISOString(),
            accounts
          }
        : { accounts };
      expect(importAnyText(JSON.stringify(backup))).toEqual({
        accounts,
        imported: 1,
        skipped: 0,
        errors: []
      });
    }
  );

  test.each([
    { app: '2fa-authenticator', version: 2 },
    { app: 'other-authenticator', version: 1 }
  ])('rejects unsupported marked JSON wrappers: %j', (marker) => {
    expect(() =>
      importAnyText(JSON.stringify({ ...marker, accounts: [currentAccount] }))
    ).toThrow('Backup file format is not supported.');
  });
});
