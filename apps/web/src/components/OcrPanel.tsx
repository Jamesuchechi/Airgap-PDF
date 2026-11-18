import { useCallback, useEffect, useState } from 'react';
import {
  type CachedOcrPack,
  deleteCachedPack,
  downloadSelfHostedPack,
  KNOWN_LANGUAGES,
  listCachedPacks,
  saveUploadedPack,
} from '../utils/ocrPacks.js';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface OcrPanelProps {
  selectedLang: string;
  onSelectLang: (code: string) => void;
}

export function OcrPanel({ selectedLang, onSelectLang }: OcrPanelProps) {
  const [packs, setPacks] = useState<CachedOcrPack[]>([]);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listCachedPacks();
      setPacks(list);
    } catch {
      setPacks([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDownload = async (code: string) => {
    setBusyCode(code);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const saved = await downloadSelfHostedPack(code);
      await refresh();
      onSelectLang(saved.code);
      setStatusMsg(`Cached "${saved.code}" (${formatBytes(saved.size)}) in Cache Storage.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyCode(null);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusyCode('upload');
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const saved = await saveUploadedPack(file);
      await refresh();
      onSelectLang(saved.code);
      setStatusMsg(`Imported "${saved.code}" (${formatBytes(saved.size)}) into Cache Storage.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyCode(null);
    }
  };

  const handleDelete = async (code: string) => {
    setBusyCode(code);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await deleteCachedPack(code);
      await refresh();
      setStatusMsg(`Removed "${code}" from Cache Storage.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyCode(null);
    }
  };

  return (
    <section className="panel" aria-label="OCR Language-Pack Manager" style={{ marginBottom: 16 }}>
      <div
        className="panel-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>OCR Language-Pack Manager</h3>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
            Packs are stored locally in Cache Storage (
            <code className="mono">airgap-ocr-packs</code>). Never fetches third-party CDNs.
          </p>
        </div>
        <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
          Upload .traineddata(.gz)
          <input
            type="file"
            accept=".traineddata,.gz"
            style={{ display: 'none' }}
            disabled={busyCode !== null}
            onChange={(e) => {
              void handleUpload(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {statusMsg && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--success, #16a34a)' }}>
          {statusMsg}
        </p>
      )}
      {errorMsg && (
        <p
          role="alert"
          style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--danger, #dc2626)' }}
        >
          {errorMsg}
        </p>
      )}

      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {KNOWN_LANGUAGES.map((lang) => {
          const cached = packs.find((p) => p.code === lang.code);
          const isSelected = selectedLang === lang.code;
          return (
            <div
              key={lang.code}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                borderRadius: 6,
                border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                fontSize: 12,
              }}
            >
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '2px 6px', fontWeight: isSelected ? 600 : 400 }}
                onClick={() => onSelectLang(lang.code)}
              >
                {lang.label} (<span className="mono">{lang.code}</span>)
              </button>
              {cached ? (
                <>
                  <span className="mono muted" style={{ fontSize: 11 }}>
                    {formatBytes(cached.size)}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Delete ${lang.code} pack`}
                    disabled={busyCode !== null}
                    onClick={() => void handleDelete(lang.code)}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busyCode !== null}
                  onClick={() => void handleDownload(lang.code)}
                >
                  {busyCode === lang.code ? 'Fetching...' : 'Download'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {packs.filter((p) => !KNOWN_LANGUAGES.some((k) => k.code === p.code)).length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {packs
            .filter((p) => !KNOWN_LANGUAGES.some((k) => k.code === p.code))
            .map((p) => (
              <div
                key={p.code}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border:
                    selectedLang === p.code ? '1px solid var(--accent)' : '1px solid var(--border)',
                  fontSize: 12,
                }}
              >
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 6px' }}
                  onClick={() => onSelectLang(p.code)}
                >
                  <span className="mono">{p.code}</span>
                </button>
                <span className="mono muted" style={{ fontSize: 11 }}>
                  {formatBytes(p.size)}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busyCode !== null}
                  onClick={() => void handleDelete(p.code)}
                >
                  Remove
                </button>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
