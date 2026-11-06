/** Request a preferred body size, then follow the toolbar host after it resizes. */
export function configurePopupSize(): void {
  if (
    typeof chrome === 'undefined' ||
    !chrome.extension?.getViews?.({ type: 'popup' }).includes(window)
  )
    return;

  const root = document.documentElement;
  root.classList.add('toolbar-popup');
  // Firefox measures BODY before resizing its initial 300×150 viewport. Using
  // viewport dimensions at that stage would lock the popup to that tiny size.
  window.addEventListener(
    'resize',
    () => root.classList.add('toolbar-popup-sized'),
    { once: true }
  );
}
