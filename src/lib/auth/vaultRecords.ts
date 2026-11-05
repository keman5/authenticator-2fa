import type { PlainVaultRecord, StoredVault, VaultData, VaultEnvelope } from './types';

export function isEncryptedVaultRecord(record: StoredVault | null): record is VaultEnvelope {
  return Boolean(record && 'cipher' in record && 'kdf' in record);
}

export function isPlainVaultRecord(record: StoredVault | null): record is PlainVaultRecord {
  return Boolean(record && 'format' in record && record.format === 'plain');
}

export function createPlainVaultRecord(
  data: VaultData,
  previous?: PlainVaultRecord | null,
  screenLock = previous?.screenLock
): PlainVaultRecord {
  if (data.browserSync && !screenLock) {
    throw new Error('Browser Sync requires a password-protected vault.');
  }
  const now = new Date().toISOString();
  return {
    version: 1,
    format: 'plain',
    data,
    ...(screenLock ? { screenLock: { ...screenLock } } : {}),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now
  };
}
