import { useState } from 'react';
import { useCopy, useVault } from '../../app/vault';
import {
  Confirm,
  ErrorMessage,
  Field,
  FilePicker,
  Password,
  Select
} from '../../shared/ui/controls';
import {
  createEncryptedBackupFile,
  createPlainOtpAuthFile,
  downloadFile,
  readPortableBackup
} from '../../lib/auth/backup';
import { readImportFiles } from '../../lib/auth/importFiles';
import { getErrorMessage } from '../../lib/auth/errors';
import type { AuthenticatorAccount, ImportResult } from '../../lib/auth/types';

export function ImportExportView({
  onQr
}: {
  onQr: (accounts: AuthenticatorAccount[]) => void;
}) {
  const vault = useVault(),
    { ui, tr } = useCopy();
  const [text, setText] = useState(''),
    [password, setPassword] = useState(''),
    [format, setFormat] = useState('enc'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [exportPassword, setExportPassword] = useState(''),
    [exporting, setExporting] = useState(false),
    [plainConfirm, setPlainConfirm] = useState(false),
    [wipe, setWipe] = useState(false),
    [deleteConfirmation, setDeleteConfirmation] = useState(''),
    [status, setStatus] = useState('');
  const [pending, setPending] = useState<{ name: string; text: string }[]>([]);
  function report(result: ImportResult) {
    if (result.imported) {
      setStatus(tr('importAddedCount', { count: result.imported }));
      setText('');
    } else
      setError(
        result.errors[0] ??
          tr(result.skipped ? 'importAllDuplicates' : 'importNoneFound')
      );
  }
  async function importText() {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      report(
        readPortableBackup(text)
          ? await vault.importEncryptedBackupText(text, password)
          : await vault.importText(text)
      );
    } catch (error) {
      setError(getErrorMessage(error, tr('importFailed')));
    } finally {
      setBusy(false);
    }
  }
  async function importFiles(files: File[]) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const selection = await readImportFiles(files);
      let imported = 0,
        skipped = 0;
      const errors = [...selection.errors];
      for (const document of selection.texts) {
        try {
          const result = await vault.importText(document);
          imported += result.imported;
          skipped += result.skipped;
          errors.push(...result.errors);
        } catch (error) {
          errors.push(getErrorMessage(error, tr('importFailed')));
        }
      }
      if (selection.encrypted.length)
        setPending((previous) => [...previous, ...selection.encrypted]);
      if (imported) setStatus(tr('importAddedCount', { count: imported }));
      if (errors.length) setError(errors.join('\n'));
      else if (!imported && !selection.encrypted.length)
        setError(tr(skipped ? 'importAllDuplicates' : 'importNoneFound'));
    } catch (error) {
      setError(getErrorMessage(error, tr('importFailed')));
    } finally {
      setBusy(false);
    }
  }
  async function importPending() {
    if (!pending[0]) return;
    setBusy(true);
    setError('');
    try {
      report(await vault.importEncryptedBackupText(pending[0].text, password));
      setPending((previous) => previous.slice(1));
      setPassword('');
    } catch (error) {
      setError(getErrorMessage(error, tr('importFailed')));
    } finally {
      setBusy(false);
    }
  }
  async function exportFile() {
    setBusy(true);
    setError('');
    try {
      if (format === 'enc') {
        const file = await createEncryptedBackupFile(
          vault.accounts,
          vault.settings,
          exportPassword
        );
        downloadFile({
          ...file,
          filename: file.filename.replace(/\.json$/, '.2fa')
        });
      } else if (format === 'json')
        downloadFile({
          filename: 'authenticator-2fa-backup.json',
          blob: new Blob(
            [
              JSON.stringify(
                {
                  app: '2fa-authenticator',
                  version: 1,
                  exportedAt: new Date().toISOString(),
                  accounts: vault.accounts
                },
                null,
                2
              )
            ],
            { type: 'application/json' }
          )
        });
      else downloadFile(createPlainOtpAuthFile(vault.accounts));
      await vault.updateSettings({ lastBackupAt: new Date().toISOString() });
      vault.showNotice(tr('exportDone'));
      setExportPassword('');
      setExporting(false);
      setPlainConfirm(false);
    } catch (error) {
      setError(getErrorMessage(error, tr('exportFailed')));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="row-title">
        <h2>{ui('dataTitle')}</h2>
        <span className="count">{ui('dataSub')}</span>
      </div>
      <div className="section-label">{ui('importSec')}</div>
      <div className="field">
        <label htmlFor="import-text">{ui('importTextLabel')}</label>
        <textarea
          id="import-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={ui('importTextPh')}
        />
      </div>
      <Password
        label={ui('importPwdLabel')}
        value={password}
        onChange={setPassword}
      />
      <div className="btn-row">
        <button
          className="btn-primary"
          type="button"
          onClick={() => void importText()}
          disabled={busy || !text.trim()}
        >
          {ui('importBtn')}
        </button>
        <FilePicker
          route="import"
          accept=".json,.txt,.2fa,image/*"
          onFiles={(files) => void importFiles(files)}
          onError={setError}
          disabled={busy}
        >
          {ui('pickFile')}
        </FilePicker>
      </div>
      <div
        className="drop-zone"
        role="region"
        aria-label={tr('importDropTitle')}
        style={{ marginTop: 10, padding: 12 }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!busy) void importFiles(Array.from(event.dataTransfer.files));
        }}
      >
        {tr('importDropHint')}
      </div>
      {pending[0] && (
        <div className="how-card" style={{ marginTop: 10 }}>
          <p className="desc">
            {tr('importEncryptedPrompt')} · {pending[0].name}
          </p>
          <div className="btn-row">
            <button
              className="btn-primary"
              type="button"
              disabled={busy || !password}
              onClick={() => void importPending()}
            >
              {tr('import')}
            </button>
            <button
              className="btn-soft"
              type="button"
              disabled={busy}
              onClick={() => {
                setPending((previous) => previous.slice(1));
                setPassword('');
              }}
            >
              {tr('cancel')}
            </button>
          </div>
        </div>
      )}
      <ErrorMessage>{error}</ErrorMessage>
      {status && (
        <p className="scan-msg ok" role="status">
          {status}
        </p>
      )}
      <div className="section-label">{ui('exportSec')}</div>
      <p className="desc">{ui('exportDesc')}</p>
      <Field label={ui('exportFmtLabel')}>
        <Select
          label={ui('exportFmtLabel')}
          value={format}
          onChange={(value) => {
            setFormat(value);
            setExporting(false);
          }}
          options={[
            { value: 'enc', label: ui('fmtEnc') },
            { value: 'json', label: ui('fmtJson') },
            { value: 'txt', label: ui('fmtTxt') }
          ]}
        />
      </Field>
      {exporting && (
        <>
          <Password
            label={tr('backupPassword')}
            value={exportPassword}
            onChange={setExportPassword}
            autoComplete="new-password"
          />
          <p className="desc">{tr('passwordHint')}</p>
        </>
      )}
      <div className="btn-row">
        <button
          className="btn-primary"
          type="button"
          disabled={
            busy ||
            !vault.accounts.length ||
            (exporting && exportPassword.length < 8)
          }
          onClick={() => {
            if (format === 'enc') {
              if (exporting) void exportFile();
              else setExporting(true);
            } else setPlainConfirm(true);
          }}
        >
          {ui(exporting ? 'expGo' : 'exportBtn')}
        </button>
        {exporting && (
          <button
            className="btn-soft"
            type="button"
            onClick={() => {
              setExportPassword('');
              setExporting(false);
            }}
          >
            {tr('cancel')}
          </button>
        )}
        <button
          className="btn-soft"
          type="button"
          disabled={!vault.accounts.length}
          onClick={() => onQr(vault.sortedAccounts)}
        >
          {ui('migQr')}
        </button>
      </div>
      <p className="last-backup" style={{ marginTop: 8 }}>
        {vault.settings.lastBackupAt
          ? ui('lastBackupAt', {
              time: new Date(vault.settings.lastBackupAt).toLocaleString(
                vault.settings.language,
                { dateStyle: 'short', timeStyle: 'short' }
              )
            })
          : ui('lastBackupNone')}
      </p>
      <div className="section-label">{ui('dangerSec')}</div>
      <div className="list-card">
        <button
          className="list-row"
          type="button"
          onClick={() => {
            setDeleteConfirmation('');
            setWipe(true);
          }}
        >
          <span className="tx">
            <b style={{ color: 'var(--red)' }}>{ui('wipe')}</b>
            <small>{ui('wipeDesc')}</small>
          </span>
          <span className="chev">›</span>
        </button>
      </div>
      {plainConfirm && (
        <Confirm
          title={tr('plainWarning')}
          danger={false}
          busy={busy}
          onCancel={() => setPlainConfirm(false)}
          onConfirm={() => void exportFile()}
        />
      )}
      {wipe && (
        <Confirm
          title={ui('wipe')}
          busy={busy || deleteConfirmation !== 'DELETE'}
          onCancel={() => setWipe(false)}
          onConfirm={() => {
            if (deleteConfirmation !== 'DELETE') return;
            setBusy(true);
            void vault
              .resetVault()
              .then(() => setWipe(false))
              .finally(() => setBusy(false));
          }}
        >
          <div className="field">
            <label htmlFor="delete-confirmation">
              {tr('deleteVaultConfirm')}
            </label>
            <input
              id="delete-confirmation"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {vault.syncEnabled && (
            <p className="desc">{tr('syncLocalDeleteHint')}</p>
          )}
        </Confirm>
      )}
    </>
  );
}
