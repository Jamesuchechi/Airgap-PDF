import type { Asset } from '@airgap-pdf/core';
import { useState } from 'react';

interface RedactPageProps {
  primaryAsset: Asset | undefined;
  onChooseFiles: () => void;
  onSamplePdf: () => void;
  onBackToWorkbench: () => void;
}

export function RedactPage({
  primaryAsset,
  onChooseFiles,
  onSamplePdf,
  onBackToWorkbench,
}: RedactPageProps) {
  const [mode, setMode] = useState<'safe' | 'precise'>('safe');
  const [historyCleared, setHistoryCleared] = useState(false);

  return (
    <main className="redact-layout">
      <section className="redact-stage" aria-label="Document redaction preview">
        <div
          className="mono"
          style={{
            alignSelf: 'stretch',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <span>
            {primaryAsset ? `${primaryAsset.name} · Page 1` : 'Sample preview · Page 3 of 12'}
          </span>
          <fieldset
            className="seg"
            style={{ border: 0, padding: 0, margin: 0 }}
            aria-label="Redaction mode"
          >
            <button type="button" aria-pressed={mode === 'safe'} onClick={() => setMode('safe')}>
              Safe (rasterize)
            </button>
            <button
              type="button"
              aria-pressed={mode === 'precise'}
              onClick={() => setMode('precise')}
            >
              Precise (M7)
            </button>
          </fieldset>
        </div>

        <div className="redact-sheet">
          <div style={{ font: "34px 'Instrument Serif', Georgia, serif" }}>
            {primaryAsset ? primaryAsset.name : 'Settlement Agreement'}
          </div>
          <div className="sheet-line" />
          <div className="sheet-line" style={{ width: '92%' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="sheet-line" style={{ width: '30%' }} />
            <div
              role="img"
              style={{ height: 18, background: '#0A0A0A', width: '34%' }}
              aria-label="Burned-in redaction"
            />
            <div className="sheet-line" style={{ flex: 1 }} />
          </div>
          <div className="sheet-line" style={{ width: '80%' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="sheet-line" style={{ width: '20%' }} />
            <div
              style={{
                height: 22,
                width: '38%',
                border: '2px dashed #9A4E0A',
                background: '#D9822B22',
              }}
            />
            <span className="mono" style={{ color: '#7A3E08' }}>
              pending
            </span>
          </div>
          <div className="sheet-line" style={{ width: '88%' }} />
          <div className="sheet-line" style={{ width: '64%' }} />
          <div className="sheet-line" style={{ width: '90%' }} />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignSelf: 'stretch' }}>
          <button type="button" className="btn2" onClick={onChooseFiles}>
            Open PDF
          </button>
          {!primaryAsset && (
            <button type="button" className="btn2" onClick={onSamplePdf}>
              Load sample PDF
            </button>
          )}
          {primaryAsset && (
            <button type="button" className="btn2" onClick={onBackToWorkbench}>
              Back to Workbench
            </button>
          )}
        </div>
      </section>

      <aside className="redact-verify" aria-label="Post-redaction verification">
        <h1 style={{ margin: 0, font: '400 34px var(--font-serif)' }}>Verification</h1>
        <span style={{ color: 'var(--muted)', fontSize: 14 }}>
          Extracted text diff, streams, Form XObjects, structure tags, metadata and pixels are
          checked before download is unlocked.
        </span>

        <div className="panel" style={{ padding: '10px 20px', fontSize: 13 }}>
          <div className="row">
            <span>Text diff &amp; page text</span>
            <span style={{ color: 'var(--accent)' }}>0 leaks</span>
          </div>
          <div className="row">
            <span>Streams &amp; Form XObjects</span>
            <span style={{ color: 'var(--accent)' }}>0 hits</span>
          </div>
          <div className="row">
            <span>Tags, annotations, forms</span>
            <span style={{ color: 'var(--accent)' }}>0 hits</span>
          </div>
          <div className="row">
            <span>Metadata &amp; /PieceInfo</span>
            <span style={{ color: 'var(--accent)' }}>0 hits</span>
          </div>
          <div className="row">
            <span>Pixels under boxes</span>
            <span style={{ color: 'var(--accent)' }}>uniform</span>
          </div>
          <div className="row" style={{ color: historyCleared ? 'var(--accent)' : '#FFB454' }}>
            <span>Earlier revision</span>
            <span>{historyCleared ? '0 hits (rebuilt)' : '1 hit · page 3'}</span>
          </div>
        </div>

        {!historyCleared ? (
          <div role="alert" className="alert">
            Download is blocked. An older revision inside this file still contains the text.
          </div>
        ) : (
          <div
            role="status"
            style={{
              border: '1px solid var(--accent-border)',
              background: 'var(--accent-bg)',
              color: 'var(--accent)',
              borderRadius: 10,
              padding: '12px 14px',
              fontSize: 13,
            }}
          >
            All 6 verification checks passed. Full redaction engine ships in M7.
          </div>
        )}

        <button
          type="button"
          className="btn"
          disabled={historyCleared}
          onClick={() => setHistoryCleared(true)}
        >
          {historyCleared ? 'Rebuilt cleanly' : 'Rebuild without history'}
        </button>

        <button
          type="button"
          className="btn2"
          disabled={!historyCleared}
          aria-disabled={!historyCleared}
        >
          {historyCleared ? 'Download verified copy (M7)' : 'Download verified copy (blocked)'}
        </button>

        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>
          Safe mode rasterizes affected pages and rebuilds the PDF cleanly. Always visually inspect
          the output before sharing.
        </p>
      </aside>
    </main>
  );
}
