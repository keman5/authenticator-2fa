import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  getPageWindowId,
  needsFilePickerWindow,
  needsCameraWindow,
  openAppWindow,
  readAppRoute
} from '../../src/lib/extension/appWindow';

const PAGE_URL = 'chrome-extension://abcdefghijklmnop/index.html';

interface FakeWindow {
  location: { href: string };
  close: ReturnType<typeof vi.fn>;
  screen?: {
    availLeft: number;
    availTop: number;
    availWidth: number;
    availHeight: number;
  };
}

function installWindow(href = PAGE_URL): FakeWindow {
  const fakeWindow: FakeWindow = { location: { href }, close: vi.fn() };
  vi.stubGlobal('window', fakeWindow);
  return fakeWindow;
}

function installChrome(api: Record<string, unknown>): void {
  vi.stubGlobal('chrome', { runtime: { lastError: undefined }, ...api });
}

function installBrowser(platform?: string): void {
  // Only Chromium-based browsers expose client hints.
  const userAgentData = platform
    ? { platform, brands: [{ brand: 'Chromium' }, { brand: 'Google Chrome' }] }
    : undefined;
  vi.stubGlobal('navigator', { userAgentData });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('readAppRoute ignores missing and unrecognized routes', () => {
  expect(readAppRoute(PAGE_URL)).toBeNull();
  expect(readAppRoute(`${PAGE_URL}?open=settings`)).toBeNull();
});

describe('needsFilePickerWindow', () => {
  test('hands off from the toolbar popup wherever the picker would close it', () => {
    const popup = installWindow();
    installChrome({ extension: { getViews: () => [popup] } });

    for (const platform of [undefined, 'macOS', 'Linux']) {
      installBrowser(platform);
      expect(needsFilePickerWindow(), platform ?? 'Firefox').toBe(true);
    }

    // Chromium keeps its popup open behind the picker on Windows.
    installBrowser('Windows');
    expect(needsFilePickerWindow()).toBe(false);
  });

  test('never hands off from side panels, tabs, or app windows', () => {
    installWindow();
    installBrowser();
    // Another browser window may be showing its own popup meanwhile.
    installChrome({
      extension: { getViews: () => [{ location: { href: PAGE_URL } }] }
    });

    expect(needsFilePickerWindow()).toBe(false);
  });
});

test('camera permission requests leave toolbar popups but stay in independent pages', () => {
  const popup = installWindow();
  installChrome({ extension: { getViews: () => [popup] } });
  expect(needsCameraWindow()).toBe(true);
  installChrome({ extension: { getViews: () => [] } });
  expect(needsCameraWindow()).toBe(false);
});

describe('openAppWindow', () => {
  test('camera handoff uses a normal browser window and preserves the source window active tab', async () => {
    const popup = installWindow();
    let currentWindowId = 7;
    const activeTabs = new Map([[7, 42]]);
    const create = vi.fn(
      (data: chrome.windows.CreateData, callback: () => void) => {
        currentWindowId = 99;
        activeTabs.set(99, 100);
        callback();
      }
    );
    const createTab = vi.fn();
    installChrome({
      tabs: { create: createTab },
      windows: {
        create,
        getCurrent: (callback: (data: { id: number }) => void) =>
          callback({ id: currentWindowId })
      }
    });
    await openAppWindow('add-qr', 'browser-window');
    const data = create.mock.calls[0]![0];
    expect(data.type).toBe('normal');
    const url = data.url as string;
    expect(readAppRoute(url)).toBe('add-qr');
    expect(new URL(url).searchParams.get('window')).toBe('7');
    expect(createTab).not.toHaveBeenCalled();
    expect(popup.close).toHaveBeenCalledOnce();
    installWindow(url);
    const sourceWindowId = await getPageWindowId();
    expect(sourceWindowId).toBe(7);
    expect(activeTabs.get(sourceWindowId!)).toBe(42);
  });
  test('opens the route in a window that acts for the original browser window', async () => {
    const popup = installWindow();
    let currentWindowId = 7;
    const create = vi.fn(
      (_data: chrome.windows.CreateData, callback: () => void) => {
        expect(popup.close).not.toHaveBeenCalled();
        callback();
      }
    );
    installChrome({
      windows: {
        create,
        getCurrent: (callback: (current: { id: number }) => void) =>
          callback({ id: currentWindowId })
      }
    });

    await openAppWindow('add-qr');

    const [data] = create.mock.calls[0]!;
    expect(data.type).toBe('popup');
    expect(data.width).toBe(370);
    expect(data.height).toBeGreaterThanOrEqual(600);
    expect(popup.close).toHaveBeenCalledOnce();

    // Inside the new window, page context, page scans, and auto-paste must
    // still target the tab the user came from, not the extension window.
    installWindow(data.url as string);
    currentWindowId = 99;
    expect(readAppRoute(window.location.href)).toBe('add-qr');
    await expect(getPageWindowId()).resolves.toBe(7);
  });

  test('keeps the popup available when opening the camera tab fails', async () => {
    const popup = installWindow();
    const runtime: { lastError?: { message: string } } = {};
    installChrome({
      runtime,
      tabs: {
        create: (_data: unknown, callback: () => void) => {
          runtime.lastError = { message: 'Could not create tab.' };
          callback();
          runtime.lastError = undefined;
        }
      }
    });
    await expect(openAppWindow('add-qr', 'browser-window')).rejects.toThrow(
      'Could not create tab.'
    );
    expect(popup.close).not.toHaveBeenCalled();
  });

  test('falls back to a tab where windows cannot be created', async () => {
    const popup = installWindow();
    const create = vi.fn(
      (_data: chrome.tabs.CreateProperties, callback: () => void) => callback()
    );
    installChrome({ tabs: { create } });

    await openAppWindow('import');

    expect(readAppRoute(create.mock.calls[0]![0].url as string)).toBe('import');
    expect(popup.close).toHaveBeenCalledOnce();
  });

  test('keeps the popup open and reports why the window failed', async () => {
    const popup = installWindow();
    const runtime: { lastError?: { message?: string } } = {};
    const create = vi.fn(
      (_data: chrome.windows.CreateData, callback: () => void) => {
        runtime.lastError = { message: 'Window limit reached.' };
        callback();
        runtime.lastError = undefined;
      }
    );
    installChrome({ runtime, windows: { create } });

    await expect(openAppWindow('import')).rejects.toThrow(
      'Window limit reached.'
    );
    expect(popup.close).not.toHaveBeenCalled();
  });
});

test('camera handoff positions a taller normal window beside its source within the work area', async () => {
  const popup = installWindow();
  popup.screen = {
    availLeft: 0,
    availTop: 25,
    availWidth: 1920,
    availHeight: 1055
  };
  const create = vi.fn(
    (_data: chrome.windows.CreateData, callback: () => void) => callback()
  );
  const get = vi.fn((_id: number, callback: (data: unknown) => void) =>
    callback({ id: 7, left: 100, top: 80, width: 1000 })
  );
  installChrome({
    windows: {
      create,
      get,
      getCurrent: (callback: (data: { id: number }) => void) =>
        callback({ id: 7 })
    }
  });
  await openAppWindow('add-qr', 'browser-window');
  expect(get.mock.calls[0]![0]).toBe(7);
  expect(create.mock.calls[0]![0]).toMatchObject({
    left: 730,
    top: 165,
    width: 370,
    height: 800,
    type: 'normal'
  });
  expect(
    new URL(create.mock.calls[0]![0].url as string).searchParams.get('camera')
  ).toBe('1');
});

test('Firefox camera window aligns right with an 85px vertical offset and 370px width', async () => {
  const popup = installWindow('moz-extension://abcdefghijklmnop/index.html');
  popup.screen = {
    availLeft: 0,
    availTop: 25,
    availWidth: 1920,
    availHeight: 1055
  };
  const create = vi.fn(
    (_data: chrome.windows.CreateData, callback: () => void) => callback()
  );
  installChrome({
    windows: {
      create,
      get: (_id: number, callback: (data: unknown) => void) =>
        callback({ left: 500, top: 80, width: 1300 }),
      getCurrent: (callback: (data: { id: number }) => void) =>
        callback({ id: 7 })
    }
  });
  await openAppWindow('add-qr', 'browser-window');
  expect(create.mock.calls[0]![0]).toMatchObject({
    left: 1430,
    top: 165,
    width: 370,
    height: 800
  });
});

test.each(['import', 'add-qr'] as const)(
  'file handoff for %s uses the browser right edge plus 85px',
  async (route) => {
    const popup = installWindow();
    popup.screen = {
      availLeft: 0,
      availTop: 0,
      availWidth: 1920,
      availHeight: 1080
    };
    const create = vi.fn(
      (_data: chrome.windows.CreateData, callback: () => void) => callback()
    );
    installChrome({
      windows: {
        create,
        getCurrent: (callback: (data: unknown) => void) => callback({ id: 7 }),
        get: (_id: number, callback: (data: unknown) => void) =>
          callback({ left: 100, top: 80, width: 1000 })
      }
    });
    await openAppWindow(route);
    expect(create.mock.calls[0]![0]).toMatchObject({
      left: 730,
      top: 165,
      width: 370,
      height: 680,
      type: 'popup'
    });
  }
);
