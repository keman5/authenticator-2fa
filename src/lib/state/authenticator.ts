import { enrollPasskey, readPasskeyKey, removePasskey } from '../auth/passkey';
import type { BrowserSyncState } from '../auth/browserSync';
import {
  accountOrigin,
  reconcileSyncAccounts,
  SYNC_PREFIX
} from '../auth/browserSync';
import {
  connectBrowserSync,
  deleteBrowserSyncGroup,
  prepareBrowserSync
} from '../auth/browserSyncSession';
import {
  BrowserSyncError,
  browserSyncAvailable,
  type BrowserSyncErrorCode
} from '../auth/browserSyncStorage';
import { withVaultLock } from '../auth/vaultLock';
import { createAccount, generateOtpCode, updateAccount } from '../auth/otp';
import { AccountChangedError } from '../auth/errors';
import {
  clearStoredVault,
  clearVaultSessionKey,
  loadStoredVault,
  loadVaultSessionKey,
  saveStoredVault,
  saveVaultSessionKey,
  touchVaultSession
} from '../auth/storage';
import {
  createVaultEnvelope,
  encryptVaultData,
  exportVaultKey,
  getVaultKeyFingerprint,
  importVaultKey,
  unlockVaultEnvelope,
  unlockVaultEnvelopeWithKey,
  type UnlockedVault
} from '../auth/vaultCrypto';
import {
  createPlainVaultRecord,
  isEncryptedVaultRecord,
  isPlainVaultRecord
} from '../auth/vaultRecords';
import { importEncryptedBackup } from '../auth/backup';
import { importAnyText } from '../auth/importText';
import {
  compareAccountOrder,
  mergeImportedAccounts,
  normalizeAccountOrder,
  reorderAccountsById
} from '../auth/vaultImport';
import type {
  AccountDraft,
  AppSettings,
  AuthenticatorAccount,
  ImportResult,
  OtpCode,
  PlainVaultRecord,
  StoredVault,
  VaultData,
  VaultEnvelope
} from '../auth/types';
import { createDefaultAppSettings, normalizeAppSettings } from '../auth/types';

type AccountReference = string | AuthenticatorAccount;

export class AuthenticatorVault {
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private state = {
    initialized: false,
    hasVault: false,
    locked: false,
    passwordProtected: false,
    busy: false,
    accounts: [] as AuthenticatorAccount[],
    settings: createDefaultAppSettings(),
    codes: {} as Record<string, OtpCode>,
    notice: '',
    noticeKey: 0,
    error: '',
    syncStatus: 'off' as 'off' | 'syncing' | 'ready' | 'pending' | 'error',
    syncError: '' as BrowserSyncErrorCode | '',
    browserSync: undefined as BrowserSyncState | undefined
  };

  /** Stable functions for React useSyncExternalStore; values are plain objects. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = (): number => this.revision;

  private setState<K extends keyof typeof this.state>(
    key: K,
    value: (typeof this.state)[K]
  ): void {
    if (Object.is(this.state[key], value)) return;
    this.state[key] = value;
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }

  get initialized() {
    return this.state.initialized;
  }
  set initialized(value: (typeof this.state)['initialized']) {
    this.setState('initialized', value);
  }
  get hasVault() {
    return this.state.hasVault;
  }
  set hasVault(value: (typeof this.state)['hasVault']) {
    this.setState('hasVault', value);
  }
  get locked() {
    return this.state.locked;
  }
  set locked(value: (typeof this.state)['locked']) {
    this.setState('locked', value);
  }
  get passwordProtected() {
    return this.state.passwordProtected;
  }
  set passwordProtected(value: (typeof this.state)['passwordProtected']) {
    this.setState('passwordProtected', value);
  }
  get busy() {
    return this.state.busy;
  }
  set busy(value: (typeof this.state)['busy']) {
    this.setState('busy', value);
  }
  get accounts() {
    return this.state.accounts;
  }
  set accounts(value: (typeof this.state)['accounts']) {
    this.setState('accounts', value);
  }
  get settings() {
    return this.state.settings;
  }
  set settings(value: (typeof this.state)['settings']) {
    this.setState('settings', value);
  }
  get codes() {
    return this.state.codes;
  }
  set codes(value: (typeof this.state)['codes']) {
    this.setState('codes', value);
  }
  get notice() {
    return this.state.notice;
  }
  set notice(value: (typeof this.state)['notice']) {
    this.setState('notice', value);
  }
  get noticeKey() {
    return this.state.noticeKey;
  }
  set noticeKey(value: (typeof this.state)['noticeKey']) {
    this.setState('noticeKey', value);
  }
  get error() {
    return this.state.error;
  }
  set error(value: (typeof this.state)['error']) {
    this.setState('error', value);
  }
  get syncStatus() {
    return this.state.syncStatus;
  }
  set syncStatus(value: (typeof this.state)['syncStatus']) {
    this.setState('syncStatus', value);
  }
  get syncError() {
    return this.state.syncError;
  }
  set syncError(value: (typeof this.state)['syncError']) {
    this.setState('syncError', value);
  }
  private get browserSync() {
    return this.state.browserSync;
  }
  private set browserSync(value: (typeof this.state)['browserSync']) {
    this.setState('browserSync', value);
  }

  private storedSnapshot = 'null';
  private nextSyncAttempt = 0;
  get syncEnabled(): boolean {
    return Boolean(this.browserSync);
  }
  get syncAvailable(): boolean {
    return browserSyncAvailable();
  }
  get syncRecoveryKey(): string {
    return this.browserSync?.recoveryKey ?? '';
  }

  private key: CryptoKey | null = null;
  private encryptedVault: VaultEnvelope | null = null;
  private plainVault: PlainVaultRecord | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();
  private codeRefreshRequest = 0;

  private sortedSource: AuthenticatorAccount[] | undefined;
  private sortedCache: AuthenticatorAccount[] = [];
  get sortedAccounts(): AuthenticatorAccount[] {
    if (this.sortedSource !== this.accounts) {
      this.sortedSource = this.accounts;
      this.sortedCache = [...this.accounts].sort(compareAccountOrder);
    }
    return this.sortedCache;
  }

  async initialize(): Promise<void> {
    await this.enqueueMutation(() => this.initializeNow());
  }

  private async initializeNow(): Promise<void> {
    this.busy = true;
    try {
      const stored = await loadStoredVault();
      await this.applyStoredVault(stored);
      if (!this.locked) {
        await this.refreshCodes();
      }
    } finally {
      this.initialized = true;
      this.busy = false;
    }
  }

  async create(password: string): Promise<void> {
    await this.changePassword('', password);
  }

  async unlock(password: string): Promise<void> {
    await this.enqueueMutation(() => this.unlockNow(password));
  }

  private async unlockNow(password: string): Promise<void> {
    if (!this.encryptedVault) {
      await this.initializeNow();
    }
    if (!this.encryptedVault) {
      this.error = 'No encrypted vault exists yet.';
      return;
    }
    if (!this.locked) {
      return;
    }

    this.busy = true;
    this.clearStatus();
    try {
      const unlocked = await unlockVaultEnvelope(this.encryptedVault, password);
      this.key = unlocked.key;
      this.applyUnlockedData(unlocked.data);
      this.locked = false;
      await this.saveSessionKey(unlocked.key, this.encryptedVault);
      await this.refreshCodes();
    } catch {
      this.error = 'Unlock failed. Check the password and try again.';
    } finally {
      this.busy = false;
    }
  }

  async registerPasskey(): Promise<void> {
    if (!this.key || !this.encryptedVault || this.locked)
      throw new Error(
        'Set a vault password and unlock it before registering a passkey.'
      );
    const fingerprint = getVaultKeyFingerprint(this.encryptedVault);
    const rawKey = await crypto.subtle.exportKey('raw', this.key);
    await enrollPasskey(rawKey, fingerprint);
    if (
      !this.encryptedVault ||
      fingerprint !== getVaultKeyFingerprint(this.encryptedVault)
    ) {
      removePasskey();
      throw new Error('The vault changed. Register the passkey again.');
    }
  }

  async unlockPasskey(): Promise<void> {
    await this.enqueueMutation(async () => {
      if (!this.encryptedVault || !this.locked) return;
      this.busy = true;
      this.clearStatus();
      try {
        const fingerprint = getVaultKeyFingerprint(this.encryptedVault);
        const rawKey = await readPasskeyKey(fingerprint);
        const key = await crypto.subtle.importKey(
          'raw',
          rawKey,
          'AES-GCM',
          true,
          ['encrypt', 'decrypt']
        );
        const unlocked = await unlockVaultEnvelopeWithKey(
          this.encryptedVault,
          key
        );
        this.key = key;
        this.applyUnlockedData(unlocked.data);
        this.locked = false;
        await this.saveSessionKey(key, this.encryptedVault);
        await this.refreshCodes();
      } catch (error) {
        this.error = getErrorMessage(error);
      } finally {
        this.busy = false;
      }
    });
  }

  async lock(): Promise<void> {
    await this.enqueueMutation(async () => {
      if (!this.passwordProtected) {
        this.showNotice('Password protection is off.');
        return;
      }

      await clearVaultSessionKey();
      this.key = null;
      this.browserSync = undefined;
      this.syncStatus = 'off';
      this.accounts = [];
      this.codes = {};
      this.locked = true;
      this.showNotice('Vault locked.');
    });
  }

  /** Share actual interaction with every extension page, without renewing on mount. */
  async recordActivity(): Promise<void> {
    await this.enqueueMutation(async () => {
      if (!this.locked && this.encryptedVault) {
        await touchVaultSession(
          getVaultKeyFingerprint(this.encryptedVault),
          this.settings.autoLockMinutes ?? 5
        );
      }
    }, false);
  }

  async checkAutoLock(): Promise<void> {
    // The queue checks the persisted session deadline before this operation.
    await this.enqueueMutation(async () => {}, false);
  }

  async addAccount(draft: AccountDraft): Promise<void> {
    const account = createAccount(draft);
    await this.enqueueMutation(() => this.mergeAccounts([account]));
  }

  async updateAccount(
    reference: AccountReference,
    draft: Partial<AccountDraft>
  ): Promise<void> {
    const target = typeof reference === 'string' ? reference : { ...reference };
    const update = { ...draft };
    await this.enqueueMutation(() => this.updateAccountNow(target, update));
  }

  async deleteAccount(reference: AccountReference): Promise<void> {
    const snapshot =
      typeof reference === 'string' ? reference : { ...reference };
    await this.enqueueMutation(async () => {
      const target = await this.requireAccount(snapshot);
      const accounts = this.accounts.filter(
        (account) => account.id !== target.id
      );
      await this.persistData(
        { accounts, settings: this.settings },
        'Account removed.'
      );
      await this.refreshCodes();
    });
  }

  async reorderAccounts(orderedIds: string[]): Promise<void> {
    const requestedOrder = [...orderedIds];
    await this.enqueueMutation(async () => {
      if (this.settings.accountSortMode !== 'manual') {
        return;
      }

      const resolvedOrder = requestedOrder.map(
        (id) => this.findAccount(id)?.id
      );
      if (!resolvedOrder.every((id) => id !== undefined)) return;
      const accounts = reorderAccountsById(this.sortedAccounts, resolvedOrder);
      if (!accounts) {
        return;
      }

      await this.persistData({ accounts, settings: this.settings });
    });
  }

  async advanceHotp(reference: AccountReference): Promise<void> {
    const snapshot =
      typeof reference === 'string' ? reference : { ...reference };
    await this.enqueueMutation(async () => {
      const account = await this.requireAccount(snapshot);
      if (account.type !== 'hotp') throw new AccountChangedError();
      await this.updateAccountNow(account.id, { counter: account.counter + 1 });
    });
  }

  async importText(text: string): Promise<ImportResult> {
    const result = importAnyText(text);
    const merged = await this.enqueueMutation(() =>
      this.mergeAccounts(result.accounts)
    );
    return {
      ...result,
      imported: merged.imported,
      skipped: result.skipped + merged.skipped
    };
  }

  async importEncryptedBackupText(
    text: string,
    password: string
  ): Promise<ImportResult> {
    const result = await importEncryptedBackup(text, password);
    const merged = await this.enqueueMutation(() =>
      this.mergeAccounts(result.accounts)
    );
    return {
      ...result,
      imported: merged.imported,
      skipped: result.skipped + merged.skipped
    };
  }

  async updateSettings(settings: Partial<AppSettings>): Promise<void> {
    const update = {
      ...settings,
      ...(settings.language !== undefined && settings.languageMode === undefined
        ? { languageMode: 'manual' as const }
        : {})
    };
    await this.enqueueMutation(async () => {
      await this.persistData(
        {
          accounts: this.accounts,
          settings: { ...this.settings, ...update }
        },
        'Settings saved.'
      );
      if (update.autoLockMinutes !== undefined && this.encryptedVault) {
        await touchVaultSession(
          getVaultKeyFingerprint(this.encryptedVault),
          this.settings.autoLockMinutes ?? 5
        );
      }
    });
  }

  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    await this.enqueueMutation(() =>
      this.changePasswordNow(currentPassword, newPassword)
    );
  }

  private async changePasswordNow(
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    this.busy = true;
    this.clearStatus();
    try {
      const wasPasswordProtected = this.passwordProtected;
      let data = this.getCurrentData();
      if (this.passwordProtected) {
        if (!this.encryptedVault) {
          throw new Error('No encrypted vault exists yet.');
        }
        try {
          const unlocked = await unlockVaultEnvelope(
            this.encryptedVault,
            currentPassword
          );
          data = normalizeVaultData(unlocked.data);
        } catch {
          throw new Error('Current password is incorrect.');
        }
      }

      const unlocked = await createVaultEnvelope(data, newPassword);
      await this.saveLocalVault(unlocked.envelope);
      removePasskey();
      this.key = unlocked.key;
      this.encryptedVault = unlocked.envelope;
      this.plainVault = null;
      this.hasVault = true;
      this.passwordProtected = true;
      this.locked = false;
      this.applyUnlockedData(unlocked.data);
      await this.saveSessionKey(unlocked.key, unlocked.envelope);
      this.showNotice(
        wasPasswordProtected ? 'Vault password changed.' : 'Vault password set.'
      );
    } catch (error) {
      this.error = getErrorMessage(error);
    } finally {
      this.busy = false;
    }
  }

  async removePassword(currentPassword: string): Promise<void> {
    await this.enqueueMutation(() => this.removePasswordNow(currentPassword));
  }

  private async removePasswordNow(currentPassword: string): Promise<void> {
    if (this.syncEnabled) {
      this.error = 'Turn off Browser Sync before removing password protection.';
      return;
    }
    if (!this.passwordProtected) {
      this.showNotice('Password protection is already off.');
      return;
    }
    if (!this.encryptedVault) {
      this.error = 'No encrypted vault exists yet.';
      return;
    }

    this.busy = true;
    this.clearStatus();
    try {
      let data: VaultData;
      try {
        const unlocked = await unlockVaultEnvelope(
          this.encryptedVault,
          currentPassword
        );
        data = normalizeVaultData(unlocked.data);
      } catch {
        throw new Error('Current password is incorrect.');
      }

      if (data.browserSync) {
        throw new Error(
          'Turn off Browser Sync before removing password protection.'
        );
      }

      const plainVault = createPlainVaultRecord(data, this.plainVault);
      await this.saveLocalVault(plainVault);
      this.key = null;
      this.encryptedVault = null;
      this.plainVault = plainVault;
      this.hasVault = true;
      removePasskey();
      this.passwordProtected = false;
      this.locked = false;
      this.applyUnlockedData(plainVault.data);
      await clearVaultSessionKey();
      this.showNotice('Vault password removed.');
    } catch (error) {
      this.error = getErrorMessage(error);
    } finally {
      this.busy = false;
    }
  }

  async resetVault(): Promise<void> {
    await this.enqueueMutation(() => this.resetVaultNow());
  }

  private async resetVaultNow(): Promise<void> {
    this.busy = true;
    this.clearStatus();
    try {
      await clearStoredVault();
      removePasskey();
      this.applyVaultSnapshot(null);
      await clearVaultSessionKey();
    } catch (error) {
      this.error = getErrorMessage(error);
    } finally {
      this.busy = false;
    }
  }

  async refreshCodes(now = Date.now()): Promise<void> {
    const request = ++this.codeRefreshRequest;
    const accounts = this.accounts;
    if (this.locked || accounts.length === 0) {
      this.codes = {};
      return;
    }

    const entries = await Promise.all(
      accounts.map((account) => generateOtpCode(account, now))
    );
    if (
      request !== this.codeRefreshRequest ||
      this.locked ||
      this.accounts !== accounts
    ) {
      return;
    }
    this.codes = Object.fromEntries(
      entries.map((entry) => [entry.accountId, entry])
    );
  }

  showNotice(message: string): void {
    this.notice = message;
    this.noticeKey += 1;
  }

  clearNotice(): void {
    this.notice = '';
  }

  private async applyStoredVault(stored: StoredVault | null): Promise<void> {
    let unlocked: UnlockedVault | null = null;
    if (isEncryptedVaultRecord(stored)) {
      try {
        const sessionKey = await loadVaultSessionKey(
          getVaultKeyFingerprint(stored)
        );
        if (sessionKey) {
          const key = await importVaultKey(sessionKey);
          const result = await unlockVaultEnvelopeWithKey(stored, key);
          const data = normalizeVaultData(result.data);
          // Legacy sessions have no policy metadata; validate the encrypted
          // setting too before publishing any decrypted accounts.
          if (
            await loadVaultSessionKey(
              getVaultKeyFingerprint(stored),
              data.settings.autoLockMinutes ?? 5
            )
          )
            unlocked = { key, data };
        }
      } catch {
        this.applyVaultSnapshot(stored);
        await clearVaultSessionKey();
        return;
      }
    }
    // Commit together after decryption, so a refresh cannot unmount active forms.
    this.applyVaultSnapshot(stored, unlocked);
  }

  private applyVaultSnapshot(
    stored: StoredVault | null,
    unlocked: UnlockedVault | null = null
  ): void {
    const sameEncryptedVault =
      isEncryptedVaultRecord(stored) &&
      this.encryptedVault &&
      getVaultKeyFingerprint(stored) ===
        getVaultKeyFingerprint(this.encryptedVault);
    this.storedSnapshot = JSON.stringify(stored);
    this.browserSync = undefined;
    this.syncStatus = 'off';
    this.syncError = '';
    this.key = unlocked?.key ?? null;
    this.encryptedVault = isEncryptedVaultRecord(stored) ? stored : null;
    this.plainVault = isPlainVaultRecord(stored) ? stored : null;
    this.accounts = [];
    this.codes = {};
    if (!sameEncryptedVault) this.settings = createDefaultAppSettings();
    this.hasVault = Boolean(this.encryptedVault || this.plainVault);
    this.passwordProtected = Boolean(this.encryptedVault);
    this.locked = this.passwordProtected && !unlocked;
    const data = unlocked?.data ?? this.plainVault?.data;
    if (data) this.applyUnlockedData(data);
  }

  private enqueueMutation<T>(
    operation: () => Promise<T>,
    syncAfter = true
  ): Promise<T> {
    const result = this.mutationQueue.then(() =>
      withVaultLock(async () => {
        // Other extension pages and background imports share this lock. Re-read
        // inside it so a stale popup cannot overwrite their committed changes.
        if (this.initialized) {
          const stored = await loadStoredVault();
          const storedChanged = JSON.stringify(stored) !== this.storedSnapshot;
          const sessionCleared =
            !storedChanged &&
            this.encryptedVault &&
            !this.locked &&
            !(await loadVaultSessionKey(
              getVaultKeyFingerprint(this.encryptedVault),
              this.settings.autoLockMinutes ?? 5
            ));
          if (storedChanged || sessionCleared) {
            await this.applyStoredVault(stored);
            await this.refreshCodes();
          }
        }
        const value = await operation();
        if (
          syncAfter &&
          this.browserSync &&
          !this.locked &&
          Date.now() >= this.nextSyncAttempt
        ) {
          await this.syncBrowserNow();
        }
        return value;
      })
    );
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private findAccount(id: string): AuthenticatorAccount | undefined {
    const direct = this.accounts.find((account) => account.id === id);
    if (direct || !this.browserSync) return direct;

    const records = Object.values(this.browserSync.records);
    // A stale form must never cross a deletion into a later restoration.
    if (records.some((record) => record.id === id)) return undefined;
    const aliases = records.filter(
      (record) =>
        record.account &&
        !record.restorationId &&
        record.mergedIds?.includes(id)
    );
    if (aliases.length !== 1) return undefined;
    return this.accounts.find((account) => account.id === aliases[0].id);
  }

  private async findReferencedAccount(
    reference: AuthenticatorAccount
  ): Promise<AuthenticatorAccount | undefined> {
    const origin = await accountOrigin(reference);
    const records = Object.values(this.browserSync?.records ?? {}).filter(
      (record) =>
        record.origins?.includes(origin) &&
        (!record.restorationId || record.restorationId === reference.id)
    );
    if (records.some((record) => record.account === null)) return undefined;
    const candidates = this.accounts.filter((account) =>
      records.some((record) => record.id === account.id)
    );
    if (candidates.length)
      return candidates.length === 1 ? candidates[0] : undefined;

    const account = this.findAccount(reference.id);
    // Legacy records may have no origin. Matching credentials still proves an
    // existing ID or alias; an independently edited ID collision does not.
    return account &&
      (await accountOrigin({ ...account, id: reference.id })) === origin
      ? account
      : undefined;
  }

  private async requireAccount(
    reference: AccountReference
  ): Promise<AuthenticatorAccount> {
    if (this.locked) throw new Error('Unlock the vault before making changes.');
    const account =
      typeof reference === 'string'
        ? this.findAccount(reference)
        : await this.findReferencedAccount(reference);
    if (!account) throw new AccountChangedError();
    return account;
  }

  private async updateAccountNow(
    reference: AccountReference,
    draft: Partial<AccountDraft>
  ): Promise<void> {
    const account = await this.requireAccount(reference);
    const index = this.accounts.indexOf(account);

    const accounts = [...this.accounts];
    accounts[index] = updateAccount(account, draft);
    // A backup exported before upload must already identify replacement credentials.
    const synced = this.browserSync
      ? await reconcileSyncAccounts(this.browserSync, accounts, [])
      : null;
    await this.persistData(
      { accounts: synced?.accounts ?? accounts, settings: this.settings },
      'Account updated.',
      synced?.state
    );
    await this.refreshCodes();
  }

  private async mergeAccounts(
    incoming: AuthenticatorAccount[]
  ): Promise<{ imported: number; skipped: number }> {
    if (incoming.length === 0) {
      this.showNotice('No accounts were found to import.');
      return { imported: 0, skipped: 0 };
    }

    const merged = await mergeImportedAccounts(
      this.accounts,
      incoming,
      this.browserSync
    );
    if (merged.imported === 0) {
      this.showNotice('No new accounts were imported.');
      return { imported: 0, skipped: merged.skipped };
    }

    await this.persistData(
      { accounts: merged.accounts, settings: this.settings },
      `${merged.imported} account${merged.imported === 1 ? '' : 's'} imported.`,
      merged.browserSync
    );
    await this.refreshCodes();
    return { imported: merged.imported, skipped: merged.skipped };
  }

  private async persistData(
    data: VaultData,
    message?: string,
    browserSync = this.browserSync
  ): Promise<void> {
    const normalizedData = normalizeVaultData({ ...data, browserSync });

    if (this.passwordProtected) {
      if (!this.key || !this.encryptedVault) {
        throw new Error('Unlock the vault before making changes.');
      }

      const envelope = await encryptVaultData(
        normalizedData,
        this.key,
        this.encryptedVault
      );
      await this.saveLocalVault(envelope);
      this.encryptedVault = envelope;
      this.plainVault = null;
    } else {
      const plainVault = createPlainVaultRecord(
        normalizedData,
        this.plainVault
      );
      await this.saveLocalVault(plainVault);
      this.plainVault = plainVault;
      this.encryptedVault = null;
      this.key = null;
    }

    this.applyUnlockedData(normalizedData);
    this.hasVault = true;
    this.locked = false;
    if (message) {
      this.showNotice(message);
    }
  }

  async startBrowserSync(recoveryKey: string, join: boolean): Promise<void> {
    await this.runSyncAction(async () => {
      if (this.browserSync) return;
      if (!this.passwordProtected || this.locked)
        throw new BrowserSyncError('passwordRequired');
      const connected = await connectBrowserSync(
        recoveryKey,
        join,
        this.accounts
      );
      await this.persistData(
        { accounts: connected.accounts, settings: this.settings },
        undefined,
        connected.state
      );
      this.nextSyncAttempt = 0;
      await this.refreshCodes();
    });
  }

  async syncNow(): Promise<void> {
    await this.runSyncAction(async () => {
      this.nextSyncAttempt = 0;
    });
  }

  async stopBrowserSync(): Promise<void> {
    await this.runSyncAction(() => this.disconnectBrowserSync());
  }

  async deleteBrowserSync(): Promise<void> {
    await this.runSyncAction(async () => {
      if (!this.browserSync || this.locked) return;
      await deleteBrowserSyncGroup(this.browserSync.recoveryKey);
      await this.disconnectBrowserSync();
    });
  }

  private async disconnectBrowserSync(): Promise<void> {
    if (!this.browserSync || this.locked) return;
    // Explicit null-like override: omit metadata while retaining every local account.
    const previous = this.browserSync;
    this.browserSync = undefined;
    try {
      await this.persistData(this.getCurrentData());
    } catch (error) {
      this.browserSync = previous;
      throw error;
    }
    this.syncStatus = 'off';
    this.syncError = '';
  }

  private async runSyncAction(operation: () => Promise<void>): Promise<void> {
    try {
      await this.enqueueMutation(async () => {
        this.syncError = '';
        this.syncStatus = 'syncing';
        await operation();
        if (!this.browserSync) this.syncStatus = 'off';
      });
    } catch (error) {
      this.reportSyncError(error);
    }
  }

  private async syncBrowserNow(): Promise<void> {
    if (!this.browserSync || this.locked || !this.passwordProtected) return;
    this.syncStatus = 'syncing';
    this.nextSyncAttempt = Date.now() + 5000;
    try {
      const prepared = await prepareBrowserSync(
        this.browserSync,
        this.accounts
      );
      const data = {
        accounts: prepared.accounts,
        settings: this.settings,
        browserSync: prepared.state
      };
      if (
        JSON.stringify(normalizeVaultData(data)) !==
        JSON.stringify(this.getCurrentData())
      ) {
        await this.persistData(data, undefined, prepared.state);
        await this.refreshCodes();
      }
      // If the popup closes here, the encrypted baseline above retains pending
      // records. Opening/unlocking the vault retries without losing changes.
      await prepared.publish();
      this.syncStatus = 'ready';
      this.syncError = '';
    } catch (error) {
      this.reportSyncError(error);
    }
  }

  private reportSyncError(error: unknown): void {
    this.syncError = error instanceof BrowserSyncError ? error.code : 'storage';
    this.syncStatus = this.browserSync ? 'pending' : 'error';
  }

  /** Watch only while an extension page is mounted; no keys live in a worker. */
  watchStorage(): () => void {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged)
      return () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      const syncChanged =
        area === 'sync' &&
        Object.keys(changes).some((key) => key.startsWith(SYNC_PREFIX));
      const localChanged =
        area === 'local' &&
        Boolean(changes['vastblast.2fa-authenticator.vault']);
      const lockedElsewhere =
        area === 'session' &&
        Boolean(changes['vastblast.2fa-authenticator.session-key']?.oldValue) &&
        !changes['vastblast.2fa-authenticator.session-key'].newValue;
      if (lockedElsewhere) {
        void this.initialize().catch(() => {
          this.error = 'Unable to reload the vault.';
        });
      } else if (localChanged || (syncChanged && this.syncEnabled)) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          void this.syncNow();
        }, 1000);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    const retry = setInterval(() => {
      if (this.syncEnabled && !this.locked) void this.syncNow();
    }, 15000);
    return () => {
      clearTimeout(timer);
      clearInterval(retry);
      chrome.storage.onChanged.removeListener(listener);
    };
  }

  private async saveLocalVault(record: StoredVault): Promise<void> {
    await saveStoredVault(record);
    this.storedSnapshot = JSON.stringify(record);
  }

  private async saveSessionKey(
    key: CryptoKey,
    envelope: VaultEnvelope
  ): Promise<void> {
    await saveVaultSessionKey(
      getVaultKeyFingerprint(envelope),
      await exportVaultKey(key),
      this.settings.autoLockMinutes ?? 5
    );
  }

  private applyUnlockedData(data: VaultData): void {
    this.accounts = normalizeAccountOrder(data.accounts);
    this.settings = normalizeAppSettings(data.settings);
    this.browserSync = this.passwordProtected ? data.browserSync : undefined;
    if (this.browserSync) this.syncStatus = 'pending';
  }

  private getCurrentData(): VaultData {
    return normalizeVaultData({
      accounts: this.accounts,
      settings: this.settings,
      browserSync: this.browserSync
    });
  }

  private clearStatus(): void {
    this.clearNotice();
    this.error = '';
  }
}

function normalizeVaultData(data: VaultData): VaultData {
  // Browser extension storage structured-clones values, so persist plain objects
  // with no framework proxies or listener metadata.
  return {
    accounts: normalizeAccountOrder(data.accounts),
    settings: normalizeAppSettings(data.settings),
    ...(data.browserSync
      ? {
          browserSync: JSON.parse(
            JSON.stringify(data.browserSync)
          ) as BrowserSyncState
        }
      : {})
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export const authenticatorVault = new AuthenticatorVault();
