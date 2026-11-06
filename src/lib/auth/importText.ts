import { normalizeImportedAccounts } from './otp';
import { parseImportText } from './otpauth';
import type { ImportResult } from './types';

export function importAnyText(text: string): ImportResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { accounts: [], imported: 0, skipped: 0, errors: [] };
  }

  if (trimmed.startsWith('{')) {
    const raw = JSON.parse(trimmed) as Record<string, unknown>;
    if (
      'format' in raw ||
      ('app' in raw && (raw.app !== '2fa-authenticator' || raw.version !== 1))
    ) {
      throw new Error('Backup file format is not supported.');
    }
    if (Array.isArray(raw.accounts)) {
      const accounts = normalizeImportedAccounts(raw.accounts);
      return { accounts, imported: accounts.length, skipped: 0, errors: [] };
    }
  }

  return parseImportText(text);
}
