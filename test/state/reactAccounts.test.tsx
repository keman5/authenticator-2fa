// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import { AccountList } from '../../src/features/accounts/AccountList';
import { VaultProvider } from '../../src/app/vault';
import { AuthenticatorVault } from '../../src/lib/state/authenticator';
import { installStructuredCloneChromeStorage } from '../helpers/storage';
afterEach(cleanup);
test('folded All keeps favorites visible alongside site matches and reveals the remaining accounts on demand', async () => {
  installStructuredCloneChromeStorage();
  const vault = new AuthenticatorVault();
  await vault.initialize();
  await vault.addAccount({
    issuer: 'Favorite',
    label: 'favorite-user',
    secret: 'JBSWY3DPEHPK3PXP',
    favorite: true
  });
  await vault.addAccount({
    issuer: 'Example',
    label: 'site-user',
    secret: 'KRSXG5DSMFWHK3DM',
    site: 'example.com'
  });
  await vault.addAccount({
    issuer: 'Other',
    label: 'other-user',
    secret: 'MZXW6YTBOI======'
  });
  render(
    <VaultProvider vault={vault}>
      <AccountList
        query=""
        context={{ hostname: 'example.com' }}
        onEdit={() => {}}
        onQr={() => {}}
        onCopy={() => {}}
      />
    </VaultProvider>
  );
  expect(
    screen.getByRole('button', { name: 'Copy: Favorite favorite-user' })
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Copy: Example site-user' })
  ).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Copy: Other other-user' })
  ).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Show all accounts (1)' })
  );
  expect(
    screen.getByRole('button', { name: 'Copy: Other other-user' })
  ).toBeTruthy();
});
test('keyboard manual ordering persists without consuming or modifying OTP secrets', async () => {
  installStructuredCloneChromeStorage();
  const vault = new AuthenticatorVault();
  await vault.initialize();
  await vault.importText(
    'otpauth://totp/Example:one?secret=JBSWY3DPEHPK3PXP\notpauth://totp/Example:two?secret=KRSXG5DSMFWHK3DM'
  );
  await vault.updateSettings({ accountSortMode: 'manual' });
  const secret = vault.sortedAccounts[1].secret;
  render(
    <VaultProvider vault={vault}>
      <AccountList
        query=""
        context={null}
        onEdit={() => {}}
        onQr={() => {}}
        onCopy={() => {}}
      />
    </VaultProvider>
  );
  const handles = screen.getAllByRole('button', {
    name: 'Drag to reorder: Example'
  });
  await act(async () => {
    fireEvent.keyDown(handles[1], { key: 'ArrowUp' });
  });
  expect(vault.sortedAccounts.map((account) => account.label)).toEqual([
    'two',
    'one'
  ]);
  expect(vault.sortedAccounts[0].secret).toBe(secret);
  const reopened = new AuthenticatorVault();
  await reopened.initialize();
  expect(reopened.sortedAccounts.map((account) => account.label)).toEqual([
    'two',
    'one'
  ]);
});

test('keyboard ordering follows the displayed favorite groups and stops at their boundaries', async () => {
  installStructuredCloneChromeStorage();
  const vault = new AuthenticatorVault();
  await vault.initialize();
  for (const issuer of ['A', 'B', 'C']) {
    await vault.addAccount({
      issuer,
      label: `${issuer}-user`,
      secret: 'JBSWY3DPEHPK3PXP',
      favorite: issuer === 'B'
    });
  }
  await vault.updateSettings({
    accountSortMode: 'manual',
    alwaysShowAllCodes: true
  });
  render(
    <VaultProvider vault={vault}>
      <AccountList
        query=""
        context={null}
        onEdit={() => {}}
        onQr={() => {}}
        onCopy={() => {}}
      />
    </VaultProvider>
  );
  const visibleOrder = () =>
    screen
      .getAllByRole('button', { name: /^Copy:/ })
      .map((node) => node.getAttribute('aria-label'));
  expect(visibleOrder()).toEqual([
    'Copy: B B-user',
    'Copy: A A-user',
    'Copy: C C-user'
  ]);
  await act(async () => {
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Drag to reorder: A' }),
      { key: 'ArrowDown' }
    );
  });
  expect(visibleOrder()).toEqual([
    'Copy: B B-user',
    'Copy: C C-user',
    'Copy: A A-user'
  ]);
  await act(async () => {
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Drag to reorder: C' }),
      { key: 'ArrowUp' }
    );
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Drag to reorder: B' }),
      { key: 'ArrowDown' }
    );
  });
  expect(visibleOrder()).toEqual([
    'Copy: B B-user',
    'Copy: C C-user',
    'Copy: A A-user'
  ]);
  const reopened = new AuthenticatorVault();
  await reopened.initialize();
  expect(reopened.sortedAccounts.map((account) => account.issuer)).toEqual([
    'B',
    'C',
    'A'
  ]);
});
