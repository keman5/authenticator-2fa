import { useState } from 'react';
import { Copy, Eye, EyeOff } from 'lucide-react';
import { useCopy, useVault } from '../../app/vault';
import { Confirm, ErrorMessage, Header } from '../../shared/ui/controls';
import {
  generateSyncRecoveryKey,
  parseSyncRecoveryKey
} from '../../lib/auth/browserSync';
import { getSyncStatusKey } from './status';
import type { MessageKey } from '../../lib/i18n/messages';

export function SyncView({
  onBack,
  onProtect
}: {
  onBack: () => void;
  onProtect: () => void;
}) {
  const vault = useVault(),
    { ui, tr } = useCopy();
  const [mode, setMode] = useState<'idle' | 'create' | 'join'>('idle'),
    [key, setKey] = useState(''),
    [saved, setSaved] = useState(false),
    [revealed, setRevealed] = useState(false),
    [error, setError] = useState(''),
    [working, setWorking] = useState(false),
    [confirmation, setConfirmation] = useState<'stop' | 'delete' | null>(null);
  const busy = working || vault.busy || vault.syncStatus === 'syncing';
  const errors: Record<string, MessageKey> = {
    unavailable: 'syncUnavailable',
    passwordRequired: 'syncProtectionRequired',
    invalidKey: 'syncWrongKey',
    notFound: 'syncNoData',
    quota: 'syncQuota',
    invalidData: 'syncInvalidData',
    storage: 'syncFailed'
  };
  async function connect() {
    if (busy || (mode === 'create' && !saved)) return;
    setError('');
    try {
      const parsed = parseSyncRecoveryKey(key);
      setWorking(true);
      await vault.startBrowserSync(parsed, mode === 'join');
      if (vault.syncEnabled) {
        setMode('idle');
        setKey('');
        setSaved(false);
      }
    } catch {
      setError(tr('syncWrongKey'));
    } finally {
      setWorking(false);
    }
  }
  function choose(next: 'create' | 'join') {
    setError('');
    setSaved(false);
    setKey(next === 'create' ? generateSyncRecoveryKey() : '');
    setMode(next);
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      vault.showNotice(tr('copied'));
    } catch {
      setError(tr('syncKeyCopyFailed'));
    }
  }
  async function disconnect() {
    setWorking(true);
    try {
      if (confirmation === 'delete') await vault.deleteBrowserSync();
      else await vault.stopBrowserSync();
      if (!vault.syncEnabled) {
        setConfirmation(null);
        setRevealed(false);
      }
    } finally {
      setWorking(false);
    }
  }
  return (
    <>
      <Header
        title={ui('syncName')}
        onBack={() => {
          if (mode === 'idle') onBack();
          else {
            setMode('idle');
            setKey('');
            setSaved(false);
          }
        }}
      />
      <div className="section-label">{ui('howSec')}</div>
      <div className="how-card">
        {(
          ['syncFeatureEncrypted', 'syncFeatureBrowser', 'syncScope'] as const
        ).map((key, index) => (
          <div className="how-step" key={key}>
            <span className="n">{index + 1}</span>
            <p>{tr(key)}</p>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        {tr('syncRequirements')}
      </p>
      {!vault.syncAvailable ? (
        <ErrorMessage>{tr('syncUnavailable')}</ErrorMessage>
      ) : !vault.passwordProtected ? (
        <div className="sync-panel" style={{ marginTop: 14 }}>
          <p className="desc">{tr('syncProtectionRequired')}</p>
          <div className="btn-row">
            <button className="btn-primary" type="button" onClick={onProtect}>
              {tr('setPassword')}
            </button>
          </div>
        </div>
      ) : vault.syncEnabled ? (
        <>
          <div className="section-label">{ui('recoverySec')}</div>
          <div className="field">
            <label htmlFor="sync-recovery-key">{tr('syncRecoveryKey')}</label>
            <div className="recovery-wrap">
              <input
                id="sync-recovery-key"
                value={vault.syncRecoveryKey}
                readOnly
                type={revealed ? 'text' : 'password'}
                spellCheck={false}
              />
              <button
                className="eye-btn"
                type="button"
                aria-label={tr(revealed ? 'syncHideKey' : 'syncShowKey')}
                aria-pressed={revealed}
                onClick={() => setRevealed(!revealed)}
              >
                {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="btn-row">
            <button
              className="btn-soft"
              type="button"
              onClick={() => void copy(vault.syncRecoveryKey)}
            >
              <Copy size={13} style={{ display: 'inline' }} />{' '}
              {ui('copyRecovery')}
            </button>
          </div>
          <p className="muted">{tr('syncRecoveryHint')}</p>
          <div className="section-label">{ui('syncOpsSec')}</div>
          <div className="sync-panel">
            <div className="btn-row">
              <button
                className="btn-primary"
                type="button"
                disabled={busy}
                onClick={() => void vault.syncNow()}
              >
                {ui('syncNow')}
              </button>
              <button
                className="btn-soft"
                type="button"
                disabled={busy}
                onClick={() => setConfirmation('stop')}
              >
                {tr('syncStop')}
              </button>
            </div>
            <div className="sync-divider" />
            <div className="sync-kv">
              <span className="k">{ui('kvState')}</span>
              <span className="v" role="status">
                {tr(getSyncStatusKey(vault.syncStatus))}
              </span>
            </div>
            <div className="sync-kv">
              <span className="k">{ui('kvContent')}</span>
              <span className="v">
                {vault.accounts.length} {tr('accounts')}
              </span>
            </div>
            <p className="desc">{tr('syncDeliveryHint')}</p>
          </div>
          <div className="section-label">{ui('dangerSec')}</div>
          <div className="list-card">
            <button
              className="list-row"
              type="button"
              disabled={busy}
              onClick={() => setConfirmation('delete')}
            >
              <span className="tx">
                <b style={{ color: 'var(--red)' }}>{tr('syncDelete')}</b>
                <small>{tr('syncDeleteDescription')}</small>
              </span>
              <span className="chev">›</span>
            </button>
          </div>
        </>
      ) : mode === 'idle' ? (
        <div className="list-card" style={{ marginTop: 14 }}>
          <button
            className="list-row"
            type="button"
            onClick={() => choose('create')}
          >
            <span className="tx">
              <b>{tr('syncStart')}</b>
              <small>{tr('syncStartHint')}</small>
            </span>
            <span className="chev">›</span>
          </button>
          <button
            className="list-row"
            type="button"
            onClick={() => choose('join')}
          >
            <span className="tx">
              <b>{tr('syncConnect')}</b>
              <small>{tr('syncConnectHint')}</small>
            </span>
            <span className="chev">›</span>
          </button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void connect();
          }}
        >
          <div className="section-label">
            {tr(mode === 'create' ? 'syncCreateTitle' : 'syncJoinTitle')}
          </div>
          <p className="desc">
            {tr(mode === 'create' ? 'syncRecoveryHint' : 'syncJoinHint')}
          </p>
          <div className="field">
            <label htmlFor="sync-key">{tr('syncRecoveryKey')}</label>
            <textarea
              id="sync-key"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              readOnly={mode === 'create'}
              spellCheck={false}
              autoComplete="off"
              placeholder="A2FA1-XXXX-XXXX-XXXX-…"
            />
          </div>
          {mode === 'create' && (
            <>
              <button
                className="btn-soft"
                type="button"
                onClick={() => void copy(key)}
              >
                {tr('copy')}
              </button>
              <label
                className="desc"
                style={{ display: 'flex', gap: 8, marginTop: 12 }}
              >
                <input
                  type="checkbox"
                  checked={saved}
                  onChange={(event) => setSaved(event.target.checked)}
                />
                {tr('syncSavedKey')}
              </label>
            </>
          )}
          <div className="btn-row">
            <button
              className="btn-primary"
              type="submit"
              disabled={busy || !key.trim() || (mode === 'create' && !saved)}
            >
              {tr(mode === 'create' ? 'syncEnable' : 'syncJoinSubmit')}
            </button>
          </div>
        </form>
      )}
      {vault.accounts.some((account) => account.type === 'hotp') && (
        <p className="desc" style={{ marginTop: 12 }}>
          {tr('syncHotpWarning')}
        </p>
      )}
      <ErrorMessage>
        {error ||
          (vault.syncError ? tr(errors[vault.syncError] ?? 'syncFailed') : '')}
      </ErrorMessage>
      {confirmation && (
        <Confirm
          title={tr(
            confirmation === 'delete' ? 'syncDelete' : 'syncStopConfirm'
          )}
          busy={busy}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void disconnect()}
        >
          <p className="desc">
            {tr(confirmation === 'delete' ? 'syncDeleteHint' : 'syncStopHint')}
          </p>
        </Confirm>
      )}
    </>
  );
}
