// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/app/App';
import { AuthenticatorVault } from '../../src/lib/state/authenticator';
import { installStructuredCloneChromeStorage } from '../helpers/storage';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  installStructuredCloneChromeStorage();
  Object.defineProperty(chrome.storage, 'sync', {
    value: chrome.storage.local
  });
  localStorage.clear();
  sessionStorage.clear();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) }
  });
});
async function openApp() {
  const vault = new AuthenticatorVault();
  render(<App vault={vault} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'All0' })).toBeTruthy()
  );
  return vault;
}
test('manual create, favorite, copy and reopening use the same persisted real vault', async () => {
  const user = userEvent.setup();
  const vault = await openApp();
  await user.click(screen.getByRole('button', { name: 'Add account' }));
  await user.click(screen.getByRole('button', { name: 'Manual entry' }));
  await user.type(screen.getByLabelText('Name (site or service)'), 'Example');
  await user.type(screen.getByLabelText('Account'), 'alice@example.com');
  await user.type(screen.getByLabelText('Secret (Base32)'), 'JBSWY3DPEHPK3PXP');
  await user.click(screen.getByRole('button', { name: 'Save account' }));
  await screen.findByRole('button', {
    name: 'Copy: Example alice@example.com'
  });
  expect(vault.accounts).toHaveLength(1);
  await user.click(
    screen.getByRole('button', { name: 'Copy: Example alice@example.com' })
  );
  expect(await navigator.clipboard.readText()).toBe(
    vault.codes[vault.accounts[0].id].value
  );
  await user.click(
    screen.getByRole('button', { name: 'Settings: Example alice@example.com' })
  );
  await user.click(screen.getByRole('button', { name: 'Favorite' }));
  await waitFor(() => expect(vault.accounts[0].favorite).toBe(true));
  const reopened = new AuthenticatorVault();
  await reopened.initialize();
  expect(reopened.accounts[0]).toMatchObject({
    label: 'alice@example.com',
    favorite: true
  });
});
test('password protection locks away UI secrets, rejects wrong passwords and decrypts before reopening', async () => {
  const user = userEvent.setup();
  const vault = await openApp();
  await act(() =>
    vault.importText(
      'otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&issuer=Example'
    )
  );
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  await user.click(screen.getByRole('button', { name: /UI password/ }));
  await user.type(
    screen.getByLabelText('New password'),
    'correct horse battery'
  );
  await user.type(
    screen.getByLabelText('Confirm password'),
    'correct horse battery'
  );
  await user.click(screen.getByRole('button', { name: 'Save password' }));
  await waitFor(() => expect(vault.passwordProtected).toBe(true));
  await user.click(screen.getByRole('button', { name: 'Lock' }));
  await screen.findByRole('heading', { name: 'Locked' });
  expect(screen.queryByText('alice')).toBeNull();
  await user.type(screen.getByLabelText('Password'), 'wrong-password');
  await user.click(screen.getByRole('button', { name: 'Unlock' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toMatch(/Unlock failed/)
  );
  expect(vault.locked).toBe(true);
  await user.type(screen.getByLabelText('Password'), 'correct horse battery');
  await user.click(screen.getByRole('button', { name: 'Unlock' }));
  await screen.findByRole('button', { name: 'Copy: Example alice' });
  expect(vault.locked).toBe(false);
});
test('Escape cancels deletion while keeping the account and current screen', async () => {
  const user = userEvent.setup();
  const vault = await openApp();
  await act(() =>
    vault.importText(
      'otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&issuer=Example'
    )
  );
  await user.click(
    screen.getByRole('button', { name: 'Settings: Example alice' })
  );
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(vault.accounts).toHaveLength(1);
  expect(
    screen.getByRole('button', { name: 'Copy: Example alice' })
  ).toBeTruthy();
});
test('sync setup requires encryption before it can connect', async () => {
  const user = userEvent.setup();
  const vault = await openApp();
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  await user.click(screen.getByRole('button', { name: /Browser sync/ }));
  expect(
    screen.getByText(
      'Your vault password protects the recovery key on this device. Set one to continue.'
    )
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Turn on sync' })).toBeNull();
  expect(vault.syncEnabled).toBe(false);
});

test('wiping a vault requires the explicit confirmation text and Escape preserves its accounts', async () => {
  const user = userEvent.setup();
  const vault = await openApp();
  await act(() =>
    vault.importText(
      'otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&issuer=Example'
    )
  );
  await user.click(screen.getByRole('button', { name: 'Data' }));
  await user.click(screen.getByRole('button', { name: /Delete all data/ }));
  const dialog = screen.getByRole('dialog');
  expect(
    (
      within(dialog).getByRole('button', {
        name: 'Delete'
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(vault.accounts).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: /Delete all data/ }));
  await user.type(
    screen.getByLabelText('Type DELETE to remove all saved accounts.'),
    'DELETE'
  );
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' })
  );
  await waitFor(() => expect(vault.accounts).toHaveLength(0));
});

test.each(['delete confirmation', 'drag preview'] as const)(
  'locking unmounts the sensitive account subtree during %s',
  async (state) => {
    const user = userEvent.setup();
    const vault = await openApp();
    await act(async () => {
      await vault.importText(
        'otpauth://totp/PrivateService:private-user?secret=JBSWY3DPEHPK3PXP&issuer=PrivateService'
      );
      await vault.changePassword('', 'correct horse battery');
      await vault.updateSettings({ accountSortMode: 'manual' });
    });
    if (state === 'delete confirmation') {
      await user.click(
        screen.getByRole('button', {
          name: 'Settings: PrivateService private-user'
        })
      );
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      expect(screen.getByRole('dialog')).toBeTruthy();
    } else {
      vi.stubGlobal('PointerEvent', MouseEvent);
      const handle = screen.getByRole('button', {
        name: 'Drag to reorder: PrivateService'
      });
      handle.setPointerCapture = vi.fn();
      fireEvent.pointerDown(handle, { button: 0, pointerId: 1 });
      expect(document.querySelector('.card.dragging')).not.toBeNull();
    }
    await act(() => vault.lock());
    expect(screen.getByRole('heading', { name: 'Locked' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[data-account-id]')).toBeNull();
    expect(document.body.textContent).not.toContain('PrivateService');
    expect(document.body.textContent).not.toContain('private-user');
    await act(() => vault.unlock('correct horse battery'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('.card.dragging')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Copy: PrivateService private-user' })
    ).toBeTruthy();
  }
);

test('header logo counts down only while time-based accounts exist', async () => {
  const clock = vi
    .spyOn(Date, 'now')
    .mockReturnValue(new Date('2026-11-07T00:00:10Z').getTime());
  try {
    const vault = await openApp();
    const ring = () =>
      Array.from(
        document.querySelectorAll('.brand-logo circle[stroke-dasharray]')
      ).map((circle) => circle.getAttribute('stroke-dasharray'));
    const complete = Array(4).fill('31.17 135.09');
    expect(ring()).toEqual(complete);
    await act(() =>
      vault.importText(
        'otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&issuer=Example'
      )
    );
    await waitFor(() => expect(ring()).not.toEqual(complete));
    await act(() => vault.deleteAccount(vault.accounts[0]));
    expect(ring()).toEqual(complete);
    await act(() =>
      vault.importText(
        'otpauth://hotp/Example:bob?secret=JBSWY3DPEHPK3PXP&issuer=Example&counter=0'
      )
    );
    expect(vault.accounts).toHaveLength(1);
    expect(ring()).toEqual(complete);
  } finally {
    clock.mockRestore();
  }
});

test('default add uses screenshot and a single-character UI password survives locking', async () => {
  const user = userEvent.setup();
  const vault = await openApp();
  await user.click(screen.getByRole('button', { name: 'Add account' }));
  expect(
    screen
      .getByRole('button', { name: 'Screenshot' })
      .getAttribute('aria-pressed')
  ).toBe('true');
  await user.click(screen.getByRole('button', { name: 'Manual entry' }));
  expect(
    screen.getByLabelText('Name (site or service)').getAttribute('type')
  ).toBe('text');
  expect(screen.getByRole('group', { name: 'Type' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  await user.click(screen.getByRole('button', { name: /UI password/ }));
  await user.type(screen.getByLabelText('New password'), '1');
  await user.type(screen.getByLabelText('Confirm password'), '1');
  await user.click(screen.getByRole('button', { name: 'Save password' }));
  await waitFor(() => expect(vault.passwordProtected).toBe(true));
  await act(() => vault.lock());
  await user.type(screen.getByLabelText('Password'), '1');
  await user.click(screen.getByRole('button', { name: 'Unlock' }));
  await waitFor(() => expect(vault.locked).toBe(false));
});
