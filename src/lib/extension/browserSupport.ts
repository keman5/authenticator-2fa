export function isSafariExtension(): boolean {
  return typeof chrome !== 'undefined' &&
    chrome.runtime?.getURL?.('').startsWith('safari-web-extension:') === true;
}

export function getShortcutSettingsUrl(extensionUrl: string, userAgent: string): string | null {
  if (extensionUrl.startsWith('safari-web-extension:')) return null;
  if (extensionUrl.startsWith('moz-extension:')) return 'about:addons';
  return /Edg\//.test(userAgent) ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts';
}
