import { base64ToBytes, bytesToBase64 } from './base32';

export interface ScreenLock {
  salt: string;
  hash: string;
  allowShortcut: boolean;
}

export async function createScreenLock(password: string, allowShortcut = false): Promise<ScreenLock> {
  if (!password) throw new Error('Vault password must be at least 1 character.');
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await hashPassword(password, salt), allowShortcut };
}

export async function verifyScreenLock(lock: ScreenLock, password: string): Promise<boolean> {
  if (!password || typeof lock.salt !== 'string' || typeof lock.hash !== 'string') return false;
  try {
    return await hashPassword(password, lock.salt) === lock.hash;
  } catch {
    return false;
  }
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const bytes = base64ToBytes(salt);
  if (bytes.length !== 16) throw new Error('Invalid screen lock salt.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(bytes), iterations: 310_000 }, key, 256
  );
  return bytesToBase64(new Uint8Array(hash));
}
