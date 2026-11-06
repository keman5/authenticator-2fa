import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode
} from 'react';
import {
  AuthenticatorVault,
  authenticatorVault
} from '../lib/state/authenticator';
import { t, type MessageKey } from '../lib/i18n/messages';
import interfaceMessages from '../lib/i18n/interface.json';
import { interfaceToVaultKey } from '../lib/i18n/interfaceMap';

const VaultContext = createContext(authenticatorVault);
export function VaultProvider({
  vault,
  children
}: {
  vault: AuthenticatorVault;
  children: ReactNode;
}) {
  return (
    <VaultContext.Provider value={vault}>{children}</VaultContext.Provider>
  );
}
export function useVault() {
  const vault = useContext(VaultContext);
  useSyncExternalStore(vault.subscribe, vault.getSnapshot, vault.getSnapshot);
  return vault;
}
export type InterfaceKey = keyof typeof interfaceMessages.en;
export function useCopy() {
  const vault = useVault();
  const language = vault.settings.language;
  const code = language === 'zh' ? 'zh-CN' : language;
  const messages =
    interfaceMessages[code as keyof typeof interfaceMessages] ??
    interfaceMessages.en;
  return {
    ui: (key: InterfaceKey, values?: Record<string, string | number>) => {
      const mapped =
        interfaceToVaultKey[key as keyof typeof interfaceToVaultKey];
      const value =
        !(code in interfaceMessages) && mapped
          ? t(language, mapped, values)
          : (messages[key] ?? interfaceMessages.en[key]);
      return value.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
        String(values?.[name] ?? placeholder)
      );
    },
    tr: (key: MessageKey, values?: Record<string, string | number>) =>
      t(language, key, values)
  };
}
