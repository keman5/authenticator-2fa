import { cameraWindowBounds, type WorkArea } from './windowPlacement';

/** Screens the app can open on directly, for tasks handed over from the popup. */
const APP_ROUTES = ['add-qr', 'import'] as const;

export type AppRoute = (typeof APP_ROUTES)[number];

const ROUTE_PARAM = 'open';
const PAGE_WINDOW_PARAM = 'window';
const CAMERA_WINDOW_PARAM = 'camera';
// Outer size, so the 400×532 popup layout fits alongside the window frame.
const APP_WINDOW_SIZE = { width: 440, height: 680 } as const;
const OPEN_WINDOW_FAILED = 'Could not open a new window.';

/** User-Agent Client Hints, which only Chromium-based browsers provide. */
interface UserAgentData {
  brands: { brand: string }[];
  platform: string;
}

/**
 * Whether choosing files here has to continue in a separate window. The
 * toolbar popup closes when a native file picker takes focus, destroying the
 * page before the picker can report back, except in Chromium on Windows.
 */
export function needsFilePickerWindow(): boolean {
  return isToolbarPopup() && !isChromiumOnWindows();
}

/** Camera prompts need browser chrome; a normal window also preserves the source tab. */
export function needsCameraWindow(): boolean {
  return isToolbarPopup();
}

export function isCameraWindow(pageUrl: string): boolean {
  return new URL(pageUrl).searchParams.get(CAMERA_WINDOW_PARAM) === '1';
}

/** Route a page URL asks to open on, ignoring anything unrecognized. */
export function readAppRoute(pageUrl: string): AppRoute | null {
  const value = new URL(pageUrl).searchParams.get(ROUTE_PARAM);
  return APP_ROUTES.find((route) => route === value) ?? null;
}

/**
 * Browser window whose active tab this page reads and acts on. Popups and side
 * panels belong to the window they are shown in; a window opened through
 * `openAppWindow` acts for the window it was opened from.
 */
export function getPageWindowId(): Promise<number | undefined> {
  const linked = readWindowId(
    new URL(window.location.href).searchParams.get(PAGE_WINDOW_PARAM)
  );
  if (
    linked !== undefined ||
    typeof chrome === 'undefined' ||
    !chrome.windows?.getCurrent
  ) {
    return Promise.resolve(linked);
  }

  return new Promise((resolve) => {
    chrome.windows.getCurrent((current) => {
      resolve(chrome.runtime.lastError ? undefined : current.id);
    });
  });
}

/**
 * Continues on `route` in an independent extension window or tab, which stays
 * open while native dialogs have focus. It retains the original browser window
 * context and closes this popup only after the new surface opens.
 */
export async function openAppWindow(
  route: AppRoute,
  surface: 'window' | 'browser-window' = 'window'
): Promise<void> {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ [ROUTE_PARAM]: route }).toString();
  url.hash = '';
  if (surface === 'browser-window')
    url.searchParams.set(CAMERA_WINDOW_PARAM, '1');
  const pageWindowId = await getPageWindowId();
  if (pageWindowId !== undefined) {
    url.searchParams.set(PAGE_WINDOW_PARAM, String(pageWindowId));
  }

  const bounds =
    surface === 'browser-window'
      ? await cameraWindowOptions(pageWindowId)
      : APP_WINDOW_SIZE;

  await new Promise<void>((resolve, reject) => {
    const settle = () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message || OPEN_WINDOW_FAILED));
      } else {
        resolve();
      }
    };

    if (typeof chrome.windows?.create === 'function') {
      chrome.windows.create(
        {
          url: url.href,
          type: surface === 'browser-window' ? 'normal' : 'popup',
          ...bounds
        },
        settle
      );
    } else {
      // Browsers without window management, such as on mobile, still have tabs.
      chrome.tabs.create({ url: url.href }, settle);
    }
  });
  window.close();
}

async function cameraWindowOptions(
  windowId: number | undefined
): Promise<Partial<chrome.windows.CreateData>> {
  // Firefox enforces this minimum for normal windows; use it when placing too.
  const width =
    new URL(window.location.href).protocol === 'moz-extension:' ? 500 : 440;
  const available = window.screen as
    (Screen & { availLeft?: number; availTop?: number }) | undefined;
  if (!available || available.availWidth <= 0 || available.availHeight <= 0)
    return { width, height: 800 };
  const area: WorkArea = {
    left: available.availLeft ?? 0,
    top: available.availTop ?? 0,
    width: available.availWidth,
    height: available.availHeight
  };
  const source = await new Promise<chrome.windows.Window | undefined>(
    (resolve) => {
      const settle = (current: chrome.windows.Window) =>
        resolve(chrome.runtime.lastError ? undefined : current);
      if (windowId !== undefined && typeof chrome.windows?.get === 'function')
        chrome.windows.get(windowId, settle);
      else if (typeof chrome.windows?.getCurrent === 'function')
        chrome.windows.getCurrent(settle);
      else resolve(undefined);
    }
  );
  return cameraWindowBounds(source, area, width);
}

function isToolbarPopup(): boolean {
  if (typeof window === 'undefined' || typeof chrome === 'undefined') {
    return false;
  }
  return (
    chrome.extension?.getViews?.({ type: 'popup' }).includes(window) ?? false
  );
}

function isChromiumOnWindows(): boolean {
  const userAgentData = (
    navigator as Navigator & { userAgentData?: UserAgentData }
  ).userAgentData;
  return (
    userAgentData?.platform === 'Windows' &&
    userAgentData.brands.some(({ brand }) => brand === 'Chromium')
  );
}

function readWindowId(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) && id >= 0 ? id : undefined;
}
