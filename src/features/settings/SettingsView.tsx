import { useState } from 'react';
import { useCopy, useVault } from '../../app/vault';
import {
  Confirm,
  ErrorMessage,
  Header,
  Password,
  Select,
  Switch
} from '../../shared/ui/controls';
import { LANGUAGES, detectBrowserLanguage } from '../../lib/i18n/languages';
import { loadPasskeyRecord, removePasskey } from '../../lib/auth/passkey';
import { getErrorMessage } from '../../lib/auth/errors';
import type { AppSettings } from '../../lib/auth/types';
import packageJson from '../../../package.json';

type SettingsPage = 'settings' | 'password' | 'passkey' | 'sync';
export function SettingsView({
  onNavigate
}: {
  onNavigate: (page: SettingsPage) => void;
}) {
  const vault = useVault(),
    { ui, tr } = useCopy();
  const settings = vault.settings;
  function update(patch: Partial<AppSettings>) {
    void vault.updateSettings(patch).catch((error) => {
      vault.error = getErrorMessage(error, tr('settingsSaveFailed'));
    });
  }
  const id = typeof chrome !== 'undefined' ? chrome.runtime?.id : undefined;
  return (
    <>
      <div className="row-title">
        <h2>{ui('settingsTitle')}</h2>
      </div>
      <div className="section-label">{ui('generalSec')}</div>
      <div className="list-card">
        <div className="list-row">
          <span className="tx">
            <b>{ui('langName')}</b>
            <small>{ui('langDesc')}</small>
          </span>
          <Select
            label={ui('langName')}
            value={
              settings.languageMode === 'system' ? 'auto' : settings.language
            }
            options={[
              { value: 'auto', label: ui('langAuto') },
              ...LANGUAGES.map(({ code, label }) => ({ value: code, label }))
            ]}
            onChange={(language) =>
              update({
                language:
                  language === 'auto' ? detectBrowserLanguage() : language,
                languageMode: language === 'auto' ? 'system' : 'manual'
              })
            }
          />
        </div>
        <div className="list-row">
          <span className="tx">
            <b>{ui('appearance')}</b>
            <small>{ui('appearanceDesc')}</small>
          </span>
          <Select
            label={ui('appearance')}
            value={settings.theme}
            options={(['system', 'light', 'dark'] as const).map((value) => ({
              value,
              label: tr(value)
            }))}
            onChange={(theme) =>
              update({ theme: theme as AppSettings['theme'] })
            }
          />
        </div>
      </div>
      <div className="section-label">{ui('behaviorSec')}</div>
      <div className="list-card">
        <Switch
          label={ui('hideName')}
          hint={ui('hideDesc')}
          checked={settings.hideCodes}
          onChange={(hideCodes) => update({ hideCodes })}
        />
        <Switch
          label={ui('secondsName')}
          hint={ui('secondsDesc')}
          checked={settings.showCountdownSeconds}
          onChange={(showCountdownSeconds) => update({ showCountdownSeconds })}
        />
        <Switch
          label={ui('autofillName')}
          hint={ui('autofillDesc')}
          checked={settings.autoPasteCodes}
          onChange={(autoPasteCodes) => update({ autoPasteCodes })}
        />
        <Switch
          label={ui('priorityName')}
          hint={ui('priorityDesc')}
          checked={settings.accountSortMode === 'contextual'}
          onChange={(enabled) =>
            update({ accountSortMode: enabled ? 'contextual' : 'manual' })
          }
        />
        <Switch
          label={ui('foldName')}
          hint={ui('foldDesc')}
          checked={!settings.alwaysShowAllCodes}
          onChange={(fold) => update({ alwaysShowAllCodes: !fold })}
        />
        <Switch
          label={ui('enhanceName')}
          hint={ui('enhanceUnavailable')}
          checked={false}
          disabled
          onChange={() => {}}
        />
      </div>
      <div className="section-label">{ui('securitySec')}</div>
      <div className="list-card">
        <button
          className="list-row"
          type="button"
          onClick={() => onNavigate('password')}
        >
          <span className="tx">
            <b>{ui('pwdName')}</b>
            <small>
              {tr(
                vault.passwordProtected
                  ? 'protectionOnHint'
                  : 'protectionOffHint'
              )}
            </small>
          </span>
          <span
            className={`status-chip ${vault.passwordProtected ? '' : 'off'}`}
          >
            {ui(vault.passwordProtected ? 'chipOn' : 'chipOff')}
          </span>
          <span className="chev">›</span>
        </button>
        <button
          className="list-row"
          type="button"
          onClick={() => onNavigate('passkey')}
        >
          <span className="tx">
            <b>{ui('passkeyName')}</b>
            <small>{ui('passkeyDesc')}</small>
          </span>
          <span className={`status-chip ${loadPasskeyRecord() ? '' : 'off'}`}>
            {ui(loadPasskeyRecord() ? 'chipOn' : 'chipOff')}
          </span>
          <span className="chev">›</span>
        </button>
        <button
          className="list-row"
          type="button"
          onClick={() => onNavigate('sync')}
        >
          <span className="tx">
            <b>{ui('syncName')}</b>
            <small>{tr('syncFeatureBrowser')}</small>
          </span>
          <span className={`status-chip ${vault.syncEnabled ? '' : 'off'}`}>
            {ui(vault.syncEnabled ? 'chipOn' : 'chipOff')}
          </span>
          <span className="chev">›</span>
        </button>
        <div className="list-row">
          <span className="tx">
            <b>{ui('autolockName')}</b>
            <small>{ui('autolockDesc')}</small>
          </span>
          <Select
            label={ui('autolockName')}
            value={String(settings.autoLockMinutes ?? 5)}
            options={[
              { value: '0', label: ui('immediate') },
              { value: '1', label: ui('minutesN', { n: 1 }) },
              { value: '5', label: ui('minutesN', { n: 5 }) },
              { value: '30', label: ui('minutesN', { n: 30 }) },
              { value: '-1', label: ui('never') }
            ]}
            onChange={(value) => update({ autoLockMinutes: Number(value) })}
          />
        </div>
      </div>
      <div className="section-label">{ui('aboutSec')}</div>
      <div className="list-card">
        <div className="list-row">
          <span className="tx">
            <b>Authenticator - 2FA</b>
            <small>{packageJson.version}</small>
          </span>
        </div>
        <div className="list-row">
          <span className="tx">
            <b>{ui('extIdName')}</b>
            <small>{id ?? ui('extIdNone')}</small>
          </span>
          {id && (
            <button
              className="btn-ghost"
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(id)
                  .then(() => vault.showNotice(tr('copied')))
                  .catch(() => {
                    vault.error = tr('copyFailed');
                  });
              }}
            >
              {ui('copy')}
            </button>
          )}
        </div>
        <a
          className="list-row"
          href="https://github.com/keman5/authenticator-2fa"
          target="_blank"
          rel="noreferrer"
        >
          <span className="tx">
            <b>{tr('sourceCode')}</b>
          </span>
          <span className="chev">↗</span>
        </a>
      </div>
    </>
  );
}
export function PasswordView({ onBack }: { onBack: () => void }) {
  const vault = useVault(),
    { ui, tr } = useCopy();
  const [current, setCurrent] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [error, setError] = useState(''),
    [removing, setRemoving] = useState(false);
  async function save() {
    setError('');
    if (password !== confirm) {
      setError(tr('passwordMismatch'));
      return;
    }
    await vault.changePassword(current, password);
    if (vault.error) setError(vault.error);
    else {
      setCurrent('');
      setPassword('');
      setConfirm('');
      onBack();
    }
  }
  return (
    <>
      <Header title={ui('pwdName')} onBack={onBack} />
      <p className="desc">
        {tr(vault.passwordProtected ? 'protectionOnHint' : 'protectionOffHint')}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {vault.passwordProtected && (
          <Password
            label={tr('currentPassword')}
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
          />
        )}
        <Password
          label={tr('newPassword')}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <Password
          label={tr('confirmPassword')}
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        <p className="desc">{tr('passwordHint')}</p>
        <div className="btn-row">
          <button
            className="btn-primary"
            type="submit"
            disabled={vault.busy || password.length < 1}
          >
            {ui('savePwd')}
          </button>
          {vault.passwordProtected && (
            <button
              className="btn-danger-soft"
              type="button"
              disabled={vault.busy || vault.syncEnabled}
              onClick={() => setRemoving(true)}
            >
              {ui('removePwd')}
            </button>
          )}
        </div>
      </form>
      {vault.syncEnabled && <p className="desc">{tr('syncProtectionHint')}</p>}
      <ErrorMessage>{error}</ErrorMessage>
      {removing && (
        <Confirm
          title={ui('removePwd')}
          busy={vault.busy}
          onCancel={() => setRemoving(false)}
          onConfirm={() => {
            void vault.removePassword(current).then(() => {
              if (vault.error) setError(vault.error);
              else {
                setRemoving(false);
                setCurrent('');
                onBack();
              }
            });
          }}
        >
          <p className="desc">{tr('currentPassword')}</p>
          <Password
            label={tr('currentPassword')}
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
          />
        </Confirm>
      )}
    </>
  );
}
export function PasskeyView({
  onBack,
  onProtect
}: {
  onBack: () => void;
  onProtect: () => void;
}) {
  const vault = useVault(),
    { ui, tr } = useCopy();
  const [registered, setRegistered] = useState(Boolean(loadPasskeyRecord())),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function register() {
    setBusy(true);
    setError('');
    try {
      await vault.registerPasskey();
      setRegistered(true);
      vault.showNotice(ui('pkRegistered'));
    } catch (error) {
      setError(getErrorMessage(error, ui('passkeyUnavailable')));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header title={ui('passkeyName')} onBack={onBack} />
      <div className="section-label">{ui('passkeySec')}</div>
      <div className="list-card">
        <div className="list-row">
          <span className="tx">
            <b>{ui(registered ? 'pkRegistered' : 'pkNone')}</b>
            <small>{ui('passkeySecureHint')}</small>
          </span>
          {vault.passwordProtected && (
            <button
              className="btn-ghost"
              type="button"
              disabled={busy}
              onClick={() => void register()}
            >
              {ui('register')}
            </button>
          )}
        </div>
      </div>
      {!vault.passwordProtected && (
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn-primary" type="button" onClick={onProtect}>
            {tr('setPassword')}
          </button>
        </div>
      )}
      {registered && (
        <div className="btn-row">
          <button
            className="btn-danger-soft"
            type="button"
            onClick={() => {
              removePasskey();
              setRegistered(false);
            }}
          >
            {tr('delete')}
          </button>
        </div>
      )}
      <p className="desc" style={{ marginTop: 10 }}>
        {ui('passkeyUnavailable')}
      </p>
      <ErrorMessage>{error}</ErrorMessage>
      <div className="section-label">{ui('shortcutsSec')}</div>
      <div className="list-card">
        <div className="list-row">
          <span className="tx">
            <b>{ui('openWindow')}</b>
            <small>{ui('shortcutsNote')}</small>
          </span>
          <span className="row-val">⌘ / Ctrl + Shift + 2</span>
        </div>
      </div>
    </>
  );
}
