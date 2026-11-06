import { useEffect } from 'react';
import { clearVaultSessionKey } from '../lib/auth/storage';
import type { AuthenticatorVault } from '../lib/state/authenticator';

/** Inactivity locks the same vault as the manual button, including other open extension pages. */
export function useAutoLock(vault: AuthenticatorVault) {
  const minutes = vault.settings.autoLockMinutes ?? 5;
  useEffect(() => {
    if (!vault.passwordProtected || vault.locked || minutes < 0) return;
    const activity = () => {
      void vault.recordActivity().catch(() => void vault.lock());
    };
    const close = () => {
      if (minutes === 0) {
        // Dispatch removal before the document disappears; a deferred mutation
        // queue or Web Lock may never get another turn after pagehide.
        void clearVaultSessionKey().catch(() => {});
        void vault.lock();
      }
    };
    const timer = window.setInterval(() => {
      if (minutes > 0)
        void vault.checkAutoLock().catch(() => void vault.lock());
    }, 1000);
    for (const event of ['pointerdown', 'keydown', 'input'])
      document.addEventListener(event, activity, true);
    window.addEventListener('pagehide', close);
    return () => {
      window.clearInterval(timer);
      for (const event of ['pointerdown', 'keydown', 'input'])
        document.removeEventListener(event, activity, true);
      window.removeEventListener('pagehide', close);
    };
  }, [vault, minutes, vault.passwordProtected, vault.locked]);
}
