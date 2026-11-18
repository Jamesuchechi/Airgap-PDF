import { type DragEvent, useState } from 'react';

interface HomePageProps {
  workerStatus: string;
  swStatus: string;
  onChooseFiles: () => void;
  onSamplePdf: () => void;
  onDropFiles: (files: FileList) => void;
  onOpenTrust: () => void;
  onNavigate: (route: string) => void;
}

const ONLY_HERE = [
  {
    id: 'redact',
    title: 'Redact, verified',
    desc: 'Removes text & pixels, then proves 0 leaks.',
    route: '#/redact',
    badge: 'Flagship',
  },
  {
    id: 'xray',
    title: 'X-Ray',
    desc: 'Inspect hidden scripts, metadata & attachments.',
    route: '#/workbench',
    badge: 'Audit',
  },
  {
    id: 'timemachine',
    title: 'Time Machine',
    desc: 'Recover earlier incremental PDF revisions.',
    route: '#/workbench',
    badge: 'Forensics',
  },
  {
    id: 'compare',
    title: 'Compare',
    desc: 'Myers text diff & perceptual pixel overlay.',
    route: '#/compare',
    badge: 'Diff',
  },
] as const;

const EVERYTHING_ELSE = [
  {
    id: 'reader',
    label: 'Reader & Editor',
    sub: 'Preview, search & edit text directly',
    route: '#/reader',
  },
  { id: 'rotate', label: 'Rotate', sub: '90° / 180° / 270° page rotation', route: '#/workbench' },
  { id: 'merge', label: 'Merge', sub: 'Combine multiple PDFs in order', route: '#/workbench' },
  {
    id: 'split',
    label: 'Split',
    sub: 'Extract ranges or split every N pages',
    route: '#/workbench',
  },
  {
    id: 'compress',
    label: 'Compress',
    sub: 'Shrink size, never grows files',
    route: '#/workbench',
  },
  {
    id: 'ocr',
    label: 'OCR (Local)',
    sub: 'Searchable PDFs via Tesseract.js',
    route: '#/workbench',
  },
  { id: 'scan', label: 'Scanner', sub: 'Camera capture & perspective crop', route: '#/scan' },
  { id: 'recipes', label: 'Recipes', sub: 'Chain multi-step JSON pipelines', route: '#/recipe' },
] as const;

export function HomePage({
  workerStatus,
  swStatus,
  onChooseFiles,
  onSamplePdf,
  onDropFiles,
  onOpenTrust,
  onNavigate,
}: HomePageProps) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      onDropFiles(e.dataTransfer.files);
    }
  };

  return (
    <main>
      <div className="hero">
        <div>
          <span className="eyebrow">The sealed PDF workbench</span>
          <h1 className="hero-title">Your PDF never leaves the room.</h1>
          <p className="hero-sub">
            Read, edit, redact, sign, OCR, compare and compress entirely on this device. No upload,
            no account. Switch off Wi-Fi and keep working.
          </p>
          <section
            aria-label="Drop PDF files here"
            className={`dropzone ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <button type="button" className="btn" onClick={onChooseFiles}>
              Choose PDFs
            </button>
            <button type="button" className="btn2" onClick={onSamplePdf}>
              Try sample PDF
            </button>
            <button type="button" className="btn2" onClick={() => onNavigate('#/reader')}>
              Reader &amp; Editor
            </button>
            <button type="button" className="btn2" onClick={onOpenTrust}>
              Prove it in 30s
            </button>
            <span className="mono">or drop PDFs anywhere · Ctrl+K for commands</span>
          </section>
        </div>

        <section className="panel" aria-label="Local-only architecture and live diagnostics">
          <div className="airgap-diagram">
            <div className="diagram-box local">
              <span className="mono" style={{ color: 'var(--accent)' }}>
                This device
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="mini-page">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="mini-page tilted">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </div>

            <div className="no-route">
              {'// // //'}
              <br />
              NO
              <br />
              ROUTE
            </div>

            <div className="diagram-box remote">
              <span className="mono" style={{ color: 'var(--muted)' }}>
                The internet
              </span>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>never sees a byte</span>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div className="row">
              <span className="mono">Observed requests</span>
              <span style={{ color: 'var(--accent)' }}>0</span>
            </div>
            <div className="row">
              <span className="mono">Policy</span>
              <span>connect-src &apos;self&apos;</span>
            </div>
            <div className="row">
              <span className="mono">Shimmed worker</span>
              <span data-testid="worker-status">{workerStatus}</span>
            </div>
            <div className="row">
              <span className="mono">Service worker</span>
              <span data-testid="sw-status">{swStatus}</span>
            </div>
          </div>
        </section>
      </div>

      <section className="sec" aria-label="Tools">
        <div className="mono">Only here</div>
        <div className="g4">
          {ONLY_HERE.map((item) => (
            <button
              key={item.id}
              type="button"
              className="feature-card"
              onClick={() => onNavigate(item.route)}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                }}
              >
                <b style={{ fontSize: 17 }}>{item.title}</b>
                <span className="mono" style={{ fontSize: 10, color: 'var(--accent)' }}>
                  {item.badge}
                </span>
              </div>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{item.desc}</span>
            </button>
          ))}
        </div>

        <div className="mono" style={{ marginTop: 12 }}>
          Everything else
        </div>
        <div className="g4">
          {EVERYTHING_ELSE.map((item) => (
            <button
              key={item.id}
              type="button"
              className="panel tool-tile"
              onClick={() => onNavigate(item.route)}
            >
              <span>{item.label}</span>
              <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 400 }}>
                {item.sub}
              </span>
            </button>
          ))}
        </div>
      </section>

      <footer className="trust-strip">
        <span>100% Client-Side WASM · 0 Bytes Uploaded</span>
        <span>CSP-Sealed Workers · Offline PWA</span>
        <span>21 Node CLI Tools · Open Source</span>
      </footer>
    </main>
  );
}
