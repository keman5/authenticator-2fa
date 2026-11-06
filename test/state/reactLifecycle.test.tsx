// @vitest-environment jsdom
import { useSyncExternalStore } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor
} from '@testing-library/react';
import { AuthenticatorVault } from '../../src/lib/state/authenticator';
import { useAutoLock } from '../../src/app/useAutoLock';
import { VaultProvider } from '../../src/app/vault';
import { Scanner } from '../../src/features/import-export/Scanner';
import { installStructuredCloneChromeStorage } from '../helpers/storage';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function vaultWithProtection(minutes: number) {
  installStructuredCloneChromeStorage();
  localStorage.clear();
  const vault = new AuthenticatorVault();
  await vault.initialize();
  await vault.importText(
    'otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&issuer=Example'
  );
  await vault.changePassword('', 'password-protected');
  await vault.updateSettings({ autoLockMinutes: minutes });
  return vault;
}
function useObservedAutoLock(vault: AuthenticatorVault) {
  useSyncExternalStore(vault.subscribe, vault.getSnapshot);
  useAutoLock(vault);
}
test('inactivity locks the real encrypted vault and clears visible accounts and codes', async () => {
  const vault = await vaultWithProtection(1);
  vi.useFakeTimers();
  renderHook(() => useObservedAutoLock(vault));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(59000);
  });
  expect(vault.locked).toBe(false);
  fireEvent.pointerDown(document);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(59000);
  });
  expect(vault.locked).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1001);
  });
  expect(vault.locked).toBe(true);
  expect(vault.accounts).toEqual([]);
  expect(vault.codes).toEqual({});
});
test('never disables automatic locking, while immediate locks on pagehide', async () => {
  const vault = await vaultWithProtection(-1);
  vi.useFakeTimers();
  const hook = renderHook(() => useObservedAutoLock(vault));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120000);
  });
  expect(vault.locked).toBe(false);
  hook.unmount();
  await vault.updateSettings({ autoLockMinutes: 0 });
  renderHook(() => useObservedAutoLock(vault));
  await act(async () => {
    fireEvent(window, new Event('pagehide'));
  });
  expect(vault.locked).toBe(true);
});
test('a camera permission result arriving after navigation releases every acquired track', async () => {
  installStructuredCloneChromeStorage();
  const vault = new AuthenticatorVault();
  await vault.initialize();
  let resolve!: (stream: MediaStream) => void;
  const pending = new Promise<MediaStream>((done) => {
    resolve = done;
  });
  const stop = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: () => pending }
  });
  const view = render(
    <VaultProvider vault={vault}>
      <Scanner onImported={() => {}} onPageScan={async () => {}} />
    </VaultProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Turn on camera' }));
  view.unmount();
  await act(async () => {
    resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await pending;
  });
  expect(stop).toHaveBeenCalledOnce();
});

test('closing every page does not reset the persisted inactivity deadline on reopen', async () => {
  const vault = await vaultWithProtection(1);
  vi.useFakeTimers();
  const hook = renderHook(() => useObservedAutoLock(vault));
  hook.unmount();
  await vi.advanceTimersByTimeAsync(120000);
  const reopened = new AuthenticatorVault();
  await reopened.initialize();
  expect(reopened.locked).toBe(true);
  expect(reopened.accounts).toEqual([]);
});

test('never retains an unlocked session after all pages close and reopen', async () => {
  const vault = await vaultWithProtection(-1);
  vi.useFakeTimers();
  const hook = renderHook(() => useObservedAutoLock(vault));
  hook.unmount();
  await vi.advanceTimersByTimeAsync(3600000);
  const reopened = new AuthenticatorVault();
  await reopened.initialize();
  expect(reopened.locked).toBe(false);
  expect(reopened.accounts).toHaveLength(1);
});

test('activity in another page extends the shared deadline without mount extending it', async () => {
  const idle = await vaultWithProtection(1);
  vi.useFakeTimers();
  renderHook(() => useObservedAutoLock(idle));
  await act(() => vi.advanceTimersByTimeAsync(59000));
  const active = new AuthenticatorVault();
  await active.initialize();
  const stop = active.watchStorage();
  try {
    await active.recordActivity();
    await act(() => vi.advanceTimersByTimeAsync(59000));
    expect(idle.locked).toBe(false);
    const reopened = new AuthenticatorVault();
    await reopened.initialize();
    expect(reopened.locked).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(1001));
    expect(idle.locked).toBe(true);
    expect(active.locked).toBe(true);
    expect(active.accounts).toEqual([]);
    // A late page event cannot restore a key removed by another page.
    await active.recordActivity();
    const afterLock = new AuthenticatorVault();
    await afterLock.initialize();
    expect(afterLock.locked).toBe(true);
  } finally {
    stop();
  }
});

test('legacy sessions without activity metadata validate the decrypted inactivity policy before showing accounts', async () => {
  await vaultWithProtection(1);
  const sessionKey = 'vastblast.2fa-authenticator.session-key';
  const session = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.session.get(sessionKey, (items) =>
      resolve(items[sessionKey] as Record<string, unknown>)
    );
  });
  delete session.sessionId;
  delete session.autoLockMinutes;
  await new Promise<void>((resolve) => {
    chrome.storage.session.set({ [sessionKey]: session }, resolve);
  });
  vi.useFakeTimers();
  await vi.advanceTimersByTimeAsync(120000);
  const reopened = new AuthenticatorVault();
  await reopened.initialize();
  expect(reopened.locked).toBe(true);
  expect(reopened.accounts).toEqual([]);
});

test('an initially valid legacy session expires while mounted without renewing savedAt', async () => {
  await vaultWithProtection(1);
  const sessionKey = 'vastblast.2fa-authenticator.session-key';
  const session = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.session.get(sessionKey, (items) =>
      resolve(items[sessionKey] as Record<string, unknown>)
    );
  });
  delete session.sessionId;
  delete session.autoLockMinutes;
  await new Promise<void>((resolve) => {
    chrome.storage.session.set({ [sessionKey]: session }, resolve);
  });
  vi.useFakeTimers();
  // Start close to the original deadline to catch renewing it during initialization.
  await vi.advanceTimersByTimeAsync(59000);
  const reopened = new AuthenticatorVault();
  await reopened.initialize();
  expect(reopened.locked).toBe(false);
  await vi.advanceTimersByTimeAsync(1001);
  await reopened.checkAutoLock();
  expect(reopened.locked).toBe(true);
  expect(reopened.accounts).toEqual([]);
});

test.each([-1, 1])(
  'a stale page checks the latest shared auto-lock policy %s before expiring its session',
  async (minutes) => {
    const idle = await vaultWithProtection(minutes === -1 ? 1 : -1);
    const active = new AuthenticatorVault();
    await active.initialize();
    await active.updateSettings({ autoLockMinutes: minutes });
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(61000);
    await idle.checkAutoLock();
    expect(idle.locked).toBe(minutes === 1);
  }
);

test('camera startup in a toolbar popup opens a normal browser window without requesting media in the closing popup', async () => {
  installStructuredCloneChromeStorage();
  const vault = new AuthenticatorVault();
  await vault.initialize();
  const getUserMedia = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia }
  });
  const create = vi.fn(
    (_data: chrome.windows.CreateData, callback: () => void) => callback()
  );
  const close = vi.spyOn(window, 'close').mockImplementation(() => {});
  Object.assign(chrome, {
    extension: { getViews: () => [window] },
    windows: {
      create,
      getCurrent: (callback: (data: { id: number }) => void) =>
        callback({ id: 8 })
    }
  });
  render(
    <VaultProvider vault={vault}>
      <Scanner onImported={() => {}} onPageScan={async () => {}} />
    </VaultProvider>
  );
  expect(
    screen.getByText('Camera access continues in a new browser window.')
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Turn on camera' }));
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(create.mock.calls[0]![0].type).toBe('normal');
  expect(
    new URL(create.mock.calls[0]![0].url as string).searchParams.get('open')
  ).toBe('add-qr');
  expect(close).toHaveBeenCalledOnce();
  close.mockRestore();
});

test('camera rejection gives localized recovery guidance without claiming the user denied it', async () => {
  installStructuredCloneChromeStorage();
  const vault = new AuthenticatorVault();
  await vault.initialize();
  await vault.updateSettings({ language: 'zh', languageMode: 'manual' });
  const getUserMedia = vi
    .fn()
    .mockRejectedValue(
      new DOMException(
        'The request is not allowed by the user agent or the platform in the current context.',
        'NotAllowedError'
      )
    );
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia }
  });
  render(
    <VaultProvider vault={vault}>
      <Scanner onImported={() => {}} onPageScan={async () => {}} />
    </VaultProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: '开启摄像头' }));
  const error = await screen.findByRole('alert');
  expect(error.textContent).toContain('摄像头权限');
  expect(error.textContent).toContain('上传');
  expect(error.querySelector('p')?.textContent).not.toContain('The request');
});

test('camera hardware startup failure retains the access stage and browser diagnostic', async () => {
  installStructuredCloneChromeStorage();
  const vault = new AuthenticatorVault();
  await vault.initialize();
  const getUserMedia = vi
    .fn()
    .mockRejectedValue(new DOMException('Starting video failed', 'AbortError'));
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia }
  });
  render(
    <VaultProvider vault={vault}>
      <Scanner onImported={() => {}} onPageScan={async () => {}} />
    </VaultProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Turn on camera' }));
  const error = await screen.findByRole('alert');
  expect(error.textContent).toContain('Close other camera apps');
  expect(error.textContent).toContain('getUserMedia');
  expect(error.textContent).toContain('AbortError');
  expect(error.textContent).toContain('Starting video failed');
  expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: false });
});

test('video playback rejection reports playback rather than camera permissions and releases acquired tracks', async () => {
  installStructuredCloneChromeStorage();
  const vault = new AuthenticatorVault();
  await vault.initialize();
  const stop = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] })
    }
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(
    new DOMException('Playback was interrupted', 'AbortError')
  );
  render(
    <VaultProvider vault={vault}>
      <Scanner onImported={() => {}} onPageScan={async () => {}} />
    </VaultProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Turn on camera' }));
  const error = await screen.findByRole('alert');
  expect(error.textContent).toContain('Camera connected');
  expect(error.textContent).toContain('video.play');
  expect(error.textContent).toContain('Playback was interrupted');
  expect(stop).toHaveBeenCalledOnce();
});

test('playback resolving after a scan-mode change cannot reactivate the stopped camera', async () => {
  installStructuredCloneChromeStorage();
  const vault = new AuthenticatorVault();
  await vault.initialize();
  const stop = vi.fn();
  let resolvePlay!: () => void;
  const playback = new Promise<void>((resolve) => {
    resolvePlay = resolve;
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] })
    }
  });
  const play = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockReturnValue(playback);
  render(
    <VaultProvider vault={vault}>
      <Scanner onImported={() => {}} onPageScan={async () => {}} />
    </VaultProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Turn on camera' }));
  await waitFor(() => expect(play).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Screenshot' }));
  await act(async () => {
    resolvePlay();
    await playback;
  });
  fireEvent.click(screen.getByRole('button', { name: 'Camera scan' }));
  expect(screen.queryByRole('button', { name: 'Turn off camera' })).toBeNull();
  expect(stop).toHaveBeenCalledOnce();
});

test('a frame read failure reports the QR decode stage and stops the camera', async () => {
  installStructuredCloneChromeStorage();
  const vault = new AuthenticatorVault();
  await vault.initialize();
  const stop = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] })
    }
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(
    640
  );
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(
    480
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: () => {},
    getImageData: () => {
      throw new DOMException('Canvas readback failed', 'SecurityError');
    }
  } as unknown as CanvasRenderingContext2D);
  render(
    <VaultProvider vault={vault}>
      <Scanner onImported={() => {}} onPageScan={async () => {}} />
    </VaultProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Turn on camera' }));
  const error = await screen.findByRole('alert');
  expect(error.textContent).toContain('QR scanning failed');
  expect(error.textContent).toContain('QR decode');
  expect(error.textContent).toContain('Canvas readback failed');
  expect(stop).toHaveBeenCalledOnce();
});
