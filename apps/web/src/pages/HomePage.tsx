import { type DragEvent, useState } from 'react';

interface HomePageProps {
  workerStatus: string;
  swStatus: string;
  onChooseFiles: () => void;
  onSamplePdf: () => void;
  onDropFiles: (files: FileList) => void;
  onOpenTrust: () => void;
  onNavigate: (route: string) => void;
  onSelectTool: (toolId: string) => void;
}

const ONLY_HERE = [
  {
    id: 'redact',
    title: 'Redact, verified',
    desc: 'Removes text & pixels, then proves 0 leaks.',
    route: '#/redact',
    badge: 'Flagship',
    icon: 'M12 2L4 5v6c0 5.5 3.4 10.6 8 12 4.6-1.4 8-6.5 8-12V5l-8-3z',
  },
  {
    id: 'xray',
    title: 'X-Ray',
    desc: 'Inspect hidden scripts, metadata & attachments.',
    toolId: 'xray',
    badge: 'Audit',
    icon: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  },
  {
    id: 'timemachine',
    title: 'Time Machine',
    desc: 'Recover earlier incremental PDF revisions.',
    toolId: 'time-machine',
    badge: 'Forensics',
    icon: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-2v6l4 2',
  },
  {
    id: 'compare',
    title: 'Compare',
    desc: 'Myers text diff & perceptual pixel overlay.',
    route: '#/compare',
    badge: 'Diff',
    icon: 'M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4m6-18h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M12 2v20',
  },
] as const;

const EVERYTHING_ELSE = [
  {
    id: 'reader',
    label: 'Reader & Editor',
    sub: 'Preview, search & edit text directly',
    route: '#/reader',
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-2 13H8m8-4H8m2-4H8',
  },
  {
    id: 'rotate',
    label: 'Rotate',
    sub: '90° / 180° / 270° page rotation',
    toolId: 'rotate',
    icon: 'M21 12a9 9 0 1 1-3-6.7L21 8m0-5v5h-5',
  },
  {
    id: 'merge',
    label: 'Merge',
    sub: 'Combine multiple PDFs in order',
    toolId: 'merge',
    icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  },
  {
    id: 'split',
    label: 'Split',
    sub: 'Extract ranges or split every N pages',
    toolId: 'split',
    icon: 'M16 3h5v5M8 3H3v5M3 16v5h5m13-5v5h-5M12 3v18',
  },
  {
    id: 'compress',
    label: 'Compress',
    sub: 'Shrink size, never grows files',
    toolId: 'compress',
    icon: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7',
  },
  {
    id: 'ocr',
    label: 'OCR (Local)',
    sub: 'Searchable PDFs via Tesseract.js',
    toolId: 'ocr',
    icon: 'M4 7V4h3m10 0h3v3M4 17v3h3m10 0h3v-3M7 12h10',
  },
  {
    id: 'scan',
    label: 'Scanner',
    sub: 'Camera capture & perspective crop',
    route: '#/scan',
    icon: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2v11z',
  },
  {
    id: 'recipes',
    label: 'Recipes',
    sub: 'Chain multi-step JSON pipelines',
    route: '#/recipe',
    icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  },
] as const;

function CardIcon({ d }: { d: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, color: 'var(--accent)' }}
    >
      <path d={d} />
    </svg>
  );
}

export function HomePage({
  workerStatus,
  swStatus,
  onChooseFiles,
  onSamplePdf,
  onDropFiles,
  onOpenTrust,
  onNavigate,
  onSelectTool,
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
            <div className="row">
              <button
                type="button"
                className="btn2"
                onClick={onOpenTrust}
                style={{ width: '100%', padding: '8px 12px', fontSize: 12 }}
              >
                Prove it in 30s (Trust &amp; CSP details)
              </button>
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
              onClick={() => {
                if ('toolId' in item) onSelectTool(item.toolId);
                else onNavigate(item.route);
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CardIcon d={item.icon} />
                  <b style={{ fontSize: 17 }}>{item.title}</b>
                </span>
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
              onClick={() => {
                if ('toolId' in item) onSelectTool(item.toolId);
                else onNavigate(item.route);
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CardIcon d={item.icon} />
                <span>{item.label}</span>
              </span>
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
