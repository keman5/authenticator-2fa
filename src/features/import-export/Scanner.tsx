import { useEffect, useRef, useState } from 'react';
import { Camera, Monitor, Upload } from 'lucide-react';
import { useCopy, useVault } from '../../app/vault';
import { ErrorMessage, FilePicker } from '../../shared/ui/controls';
import { decodeQrFiles } from '../../lib/auth/qr';
import { decodeQrImageData } from '../../lib/auth/qrDecode';
import { getErrorMessage } from '../../lib/auth/errors';
import {
  cameraConstraints,
  describeCameraFailure,
  type CameraFailure,
  type CameraStage
} from '../../lib/auth/camera';
import {
  isCameraWindow,
  readAppRoute,
  needsCameraWindow,
  openAppWindow
} from '../../lib/extension/appWindow';

export function Scanner({
  onImported,
  onPageScan
}: {
  onImported: () => void;
  onPageScan: () => Promise<void>;
}) {
  const vault = useVault(),
    { ui, tr } = useCopy();
  const [mode, setMode] = useState<'shot' | 'upload' | 'cam'>(() =>
      isCameraWindow(location.href)
        ? 'cam'
        : readAppRoute(location.href) === 'add-qr'
          ? 'upload'
          : 'shot'
    ),
    [error, setError] = useState(''),
    [cameraFailure, setCameraFailure] = useState<CameraFailure | null>(null),
    [busy, setBusy] = useState(false),
    [active, setActive] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    generation = useRef(0),
    mounted = useRef(true);
  function stop() {
    generation.current += 1;
    clearTimeout(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    if (mounted.current) setActive(false);
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop();
    };
  }, []);
  useEffect(() => {
    stop();
    setError('');
    setCameraFailure(null);
  }, [mode]);
  async function importDecoded(text: string) {
    const result = await vault.importText(text);
    if (!result.imported)
      throw new Error(
        result.errors[0] ??
          tr(result.skipped ? 'importAllDuplicates' : 'importNoneFound')
      );
    stop();
    onImported();
  }
  async function files(files: File[]) {
    setBusy(true);
    setError('');
    setCameraFailure(null);
    try {
      await importDecoded((await decodeQrFiles(files)).join('\n'));
    } catch (error) {
      if (mounted.current) setError(getErrorMessage(error, tr('importFailed')));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function decodeFrame(element: HTMLVideoElement) {
    const width = element.videoWidth,
      height = element.videoHeight;
    if (!width || !height) return '';
    const scale = Math.min(1, 1920 / width, 1080 / height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas rendering is unavailable.');
    context.drawImage(element, 0, 0, canvas.width, canvas.height);
    return decodeQrImageData(
      context.getImageData(0, 0, canvas.width, canvas.height)
    );
  }
  async function startCamera() {
    stop();
    setBusy(true);
    setError('');
    setCameraFailure(null);
    const current = ++generation.current;
    const handoff = needsCameraWindow();
    let stage: CameraStage = 'access';
    try {
      if (handoff) {
        await openAppWindow('add-qr', 'browser-window');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(ui('noCamera'));
      const acquired =
        await navigator.mediaDevices.getUserMedia(cameraConstraints());
      if (!mounted.current || generation.current !== current) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = acquired;
      const element = video.current!;
      stage = 'playback';
      element.srcObject = acquired;
      await element.play();
      if (!mounted.current || generation.current !== current) return;
      setActive(true);
      const scan = async () => {
        if (generation.current !== current || !mounted.current) return;
        let importing = false;
        try {
          const text = await decodeFrame(element);
          if (generation.current !== current) return;
          if (text) {
            importing = true;
            await importDecoded(text);
            return;
          }
        } catch (error) {
          if (generation.current === current) {
            if (importing) setError(getErrorMessage(error, tr('importFailed')));
            else {
              setCameraFailure(describeCameraFailure(error, 'decode'));
              setError(tr('cameraDecodeFailed'));
            }
            stop();
          }
          return;
        }
        if (generation.current === current)
          timer.current = setTimeout(() => void scan(), 350);
      };
      void scan();
    } catch (error) {
      if (mounted.current && generation.current === current) {
        if (handoff) setError(getErrorMessage(error, tr('cameraAccessFailed')));
        else {
          const failure = describeCameraFailure(error, stage);
          setCameraFailure(failure);
          const copy = {
            blocked: 'cameraAccessBlocked',
            missing: 'cameraNotFound',
            start: 'cameraStartFailed',
            playback: 'cameraPlaybackFailed',
            decode: 'cameraDecodeFailed',
            other: 'cameraAccessFailed'
          } as const;
          setError(tr(copy[failure.reason]));
        }
        stop();
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function screenshot() {
    stop();
    setBusy(true);
    setError('');
    setCameraFailure(null);
    const current = ++generation.current;
    let captured: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getDisplayMedia)
        throw new Error(ui('noDisplayMedia'));
      captured = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });
      if (!mounted.current || generation.current !== current) return;
      stream.current = captured;
      const element = document.createElement('video');
      element.muted = true;
      element.srcObject = captured;
      await element.play();
      const text = await decodeFrame(element);
      if (generation.current !== current) return;
      if (!text) throw new Error(ui('shotNoQr'));
      await importDecoded(text);
    } catch (error) {
      if (mounted.current && generation.current === current)
        setError(getErrorMessage(error, tr('importFailed')));
    } finally {
      captured?.getTracks().forEach((track) => track.stop());
      if (stream.current === captured) stream.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <>
      <div className="scan-ways">
        {(
          [
            { value: 'shot', key: 'wayShot', Icon: Monitor },
            { value: 'upload', key: 'wayUpload', Icon: Upload },
            { value: 'cam', key: 'wayCam', Icon: Camera }
          ] as const
        ).map(({ value, key, Icon }) => (
          <button
            className={`scan-way ${mode === value ? 'active' : ''}`}
            type="button"
            key={value}
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
          >
            <Icon size={19} />
            <span>{ui(key)}</span>
          </button>
        ))}
      </div>
      {mode === 'cam' && (
        <>
          <div className="cam-frame">
            <video ref={video} playsInline muted />
            {!active && (
              <div className="cam-placeholder">
                {ui('camPh1')}
                <br />
                {ui('camPh2')}
              </div>
            )}
            <div className="scan-corners">
              <i />
              <i />
              <i />
              <i />
            </div>
            {active && <div className="scan-line" />}
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button
              className="btn-primary"
              type="button"
              disabled={busy || active}
              onClick={() => void startCamera()}
            >
              {ui('camStart')}
            </button>
            {needsCameraWindow() && (
              <span className="muted">{tr('cameraOpensInWindow')}</span>
            )}
            {active && (
              <button className="btn-soft" type="button" onClick={stop}>
                {ui('camStop')}
              </button>
            )}
          </div>
        </>
      )}
      {mode === 'shot' && (
        <>
          <p className="desc">{ui('shotDesc')}</p>
          <div className="btn-row">
            <button
              className="btn-primary"
              type="button"
              disabled={busy}
              onClick={() => void screenshot()}
            >
              {ui('shotBtn')}
            </button>
            <button
              className="btn-soft"
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError('');
                setCameraFailure(null);
                void onPageScan()
                  .catch((error) =>
                    setError(getErrorMessage(error, tr('scanPageFailed')))
                  )
                  .finally(() => setBusy(false));
              }}
            >
              {tr('scanPage')}
            </button>
          </div>
        </>
      )}
      {mode === 'upload' && (
        <>
          <div
            className="drop-zone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (!busy) void files(Array.from(event.dataTransfer.files));
            }}
          >
            <p>{ui('dropMain')}</p>
            <p className="muted">{ui('dropSub')}</p>
            <FilePicker
              route="add-qr"
              accept="image/*"
              onFiles={(selection) => void files(selection)}
              onError={setError}
              disabled={busy}
            >
              {ui('wayUpload')}
            </FilePicker>
          </div>
        </>
      )}
      {busy && (
        <p className="scan-msg" role="status">
          {ui('recognizing')}
        </p>
      )}
      {error && (
        <ErrorMessage>
          <p>{error}</p>
          {cameraFailure && (
            <details>
              <summary>{tr('cameraErrorDetails')}</summary>
              <p>
                {
                  {
                    access: 'getUserMedia',
                    playback: 'video.play',
                    decode: 'QR decode'
                  }[cameraFailure.stage]
                }{' '}
                · {cameraFailure.name}
                {cameraFailure.message && `: ${cameraFailure.message}`}
              </p>
            </details>
          )}
        </ErrorMessage>
      )}
    </>
  );
}
