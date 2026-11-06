import { useEffect, useState } from 'react';
import { useCopy, useVault } from '../../app/vault';
import { ErrorMessage, Header } from '../../shared/ui/controls';
import { renderQrDataUrl } from '../../lib/auth/qr';
import { accountToOtpAuthUri } from '../../lib/auth/otpauth';
import { getErrorMessage } from '../../lib/auth/errors';
import type { AuthenticatorAccount } from '../../lib/auth/types';

export function QrView({
  accounts,
  onBack
}: {
  accounts: AuthenticatorAccount[];
  onBack: () => void;
}) {
  const { ui, tr } = useCopy(),
    vault = useVault();
  const [index, setIndex] = useState(0),
    [image, setImage] = useState(''),
    [error, setError] = useState('');
  const account = accounts[index];
  const uri = account ? accountToOtpAuthUri(account) : '';
  useEffect(() => {
    let current = true;
    setImage('');
    setError('');
    void renderQrDataUrl(uri)
      .then((url) => {
        if (current) setImage(url);
      })
      .catch((error) => {
        if (current) setError(getErrorMessage(error, tr('exportFailed')));
      });
    return () => {
      current = false;
    };
  }, [uri]);
  return (
    <>
      <Header title={ui('qrDefault')} onBack={onBack} />
      <div className="qr-box">
        {image && <img src={image} alt={ui('qrDefault')} />}
      </div>
      <p className="desc" style={{ textAlign: 'center' }}>
        {account?.issuer} · {account?.label}
        {accounts.length > 1 && ` (${index + 1}/${accounts.length})`}
      </p>
      <div className="uri-box" style={{ marginTop: 10, userSelect: 'text' }}>
        {uri}
      </div>
      <div
        className="btn-row"
        style={{ justifyContent: 'center', marginTop: 10 }}
      >
        {accounts.length > 1 && (
          <button
            className="btn-soft"
            type="button"
            onClick={() =>
              setIndex((index - 1 + accounts.length) % accounts.length)
            }
          >
            {ui('prev')}
          </button>
        )}
        <button
          className="btn-soft"
          type="button"
          onClick={() => {
            void navigator.clipboard
              .writeText(uri)
              .then(() => vault.showNotice(ui('copiedUri')))
              .catch(() => setError(tr('copyFailed')));
          }}
        >
          {ui('copyLink')}
        </button>
        {accounts.length > 1 && (
          <button
            className="btn-soft"
            type="button"
            onClick={() => setIndex((index + 1) % accounts.length)}
          >
            {ui('next')}
          </button>
        )}
      </div>
      {image && (
        <div className="btn-row">
          <a
            className="btn-soft"
            href={image}
            download={`${account.label || 'account'}-qr.png`}
          >
            {tr('export')}
          </a>
        </div>
      )}
      <ErrorMessage>{error}</ErrorMessage>
    </>
  );
}
