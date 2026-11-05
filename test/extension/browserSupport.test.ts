import { afterEach, expect, test, vi } from 'vitest';
import { getShortcutSettingsUrl } from '../../src/lib/extension/browserSupport';
import { browserSyncAvailable } from '../../src/lib/auth/browserSyncStorage';

afterEach(() => vi.unstubAllGlobals());

test.each([
  ['chrome-extension://id/', 'Chrome/140', 'chrome://extensions/shortcuts'],
  ['chrome-extension://id/', 'Chrome/140 Edg/140', 'edge://extensions/shortcuts'],
  ['moz-extension://id/', 'Firefox/140', 'about:addons'],
  ['safari-web-extension://id/', 'Safari/26', null]
])('shortcut settings match %s %s', (url, agent, expected) => {
  expect(getShortcutSettingsUrl(url, agent)).toBe(expected);
});

test.each(['chrome-extension:', 'moz-extension:', 'safari-web-extension:'])(
  'does not advertise Safari local-only sync as cross-device sync: %s', (scheme) => {
    vi.stubGlobal('chrome', { runtime: { getURL: () => `${scheme}//id/` }, storage: { sync: {} } });
    expect(browserSyncAvailable()).toBe(scheme !== 'safari-web-extension:');
  }
);
