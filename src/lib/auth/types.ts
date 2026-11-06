import {
  DEFAULT_LANGUAGE,
  detectBrowserLanguage,
  resolveSupportedLanguage
} from '../i18n/languages';
import type { BrowserSyncState } from './browserSync';

export type OtpType = 'totp' | 'hotp' | 'steam';

export type OtpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';

export type ThemePreference = 'system' | 'light' | 'dark';

export type AccountSortMode = 'manual' | 'contextual';

export interface AuthenticatorAccount {
  id: string;
  issuer: string;
  label: string;
  secret: string;
  type: OtpType;
  algorithm: OtpAlgorithm;
  digits: number;
  period: number;
  counter: number;
  sortOrder?: number;
  favorite?: boolean;
  site?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountDraft {
  issuer?: string;
  label: string;
  secret: string;
  type?: OtpType;
  algorithm?: OtpAlgorithm;
  digits?: number;
  period?: number;
  counter?: number;
  sortOrder?: number;
  favorite?: boolean;
  site?: string;
}

export interface OtpCode {
  accountId: string;
  value: string;
  remaining: number;
  progress: number;
}

export interface ImportResult {
  accounts: AuthenticatorAccount[];
  imported: number;
  skipped: number;
  errors: string[];
}

export interface VaultData {
  accounts: AuthenticatorAccount[];
  settings: AppSettings;
  // This includes the recovery key and must only be stored inside an encrypted vault.
  browserSync?: BrowserSyncState;
}

export interface AppSettings {
  language: string;
  languageMode?: 'system' | 'manual';
  theme: ThemePreference;
  showCountdownSeconds: boolean;
  hideCodes: boolean;
  autoPasteCodes: boolean;
  accountSortMode: AccountSortMode;
  alwaysShowAllCodes: boolean;
  autoLockMinutes?: number;
  enhancedInputMenu?: boolean;
  lastBackupAt?: string;
}

export interface VaultEnvelope {
  version: 1;
  kdf: {
    name: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
    salt: string;
  };
  cipher: {
    name: 'AES-GCM';
    iv: string;
    data: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PlainVaultRecord {
  version: 1;
  format: 'plain';
  data: VaultData;
  createdAt: string;
  updatedAt: string;
}

export type StoredVault = VaultEnvelope | PlainVaultRecord;

export const DEFAULT_SETTINGS: AppSettings = {
  language: DEFAULT_LANGUAGE,
  languageMode: 'system',
  theme: 'system',
  showCountdownSeconds: false,
  hideCodes: false,
  autoPasteCodes: false,
  accountSortMode: 'contextual',
  alwaysShowAllCodes: false,
  autoLockMinutes: 5,
  enhancedInputMenu: false
};

export function createDefaultAppSettings(): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    language: detectBrowserLanguage()
  };
}

export function normalizeAppSettings(
  settings: Partial<AppSettings> | undefined
): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    language:
      settings?.languageMode === 'system'
        ? detectBrowserLanguage()
        : resolveSupportedLanguage(
            settings?.language ? [settings.language] : []
          ),
    languageMode:
      settings?.languageMode ?? (settings?.language ? 'manual' : 'system'),
    hideCodes: settings?.hideCodes === true,
    accountSortMode:
      settings?.accountSortMode === 'manual' ? 'manual' : 'contextual',
    alwaysShowAllCodes: settings?.alwaysShowAllCodes === true,
    autoLockMinutes: [-1, 0, 1, 5, 30].includes(settings?.autoLockMinutes ?? 5)
      ? (settings?.autoLockMinutes ?? 5)
      : 5,
    enhancedInputMenu: false
  };
}

export const OTP_ALGORITHMS: OtpAlgorithm[] = ['SHA-1', 'SHA-256', 'SHA-512'];

export const OTP_TYPES: OtpType[] = ['totp', 'hotp', 'steam'];
