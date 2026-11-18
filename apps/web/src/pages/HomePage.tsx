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
    desc: 'Removes text, then proves it.',
    route: '#/redact',
  },
  { id: 'xray', title: 'X-Ray', desc: 'What is this file leaking?', route: '#/workbench' },
  {
    id: 'timemachine',
    title: 'Time Machine',
    desc: 'Recover hidden revisions.',
    route: '#/workbench',
  },
  { id: 'compare', title: 'Compare', desc: 'Text and pixel diff.', route: '#/workbench' },
] as const;

const EVERYTHING_ELSE = [
  { id: 'rotate', label: 'Rotate', route: '#/workbench' },
  { id: 'merge', label: 'Merge', route: '#/workbench' },
  { id: 'split', label: 'Split', route: '#/workbench' },
  { id: 'organize', label: 'Organize', route: '#/workbench' },
  { id: 'compress', label: 'Compress', route: '#/workbench' },
  { id: 'recipes', label: 'Recipes', route: '#/workbench' },
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
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 22, justifyContent: 'center' }}
        >
          <div className="mono" style={{ color: 'var(--accent)' }}>
            The sealed PDF workbench
          </div>
          <h1 className="hero-title">Your PDF never leaves the room.</h1>
          <p style={{ margin: 0, maxWidth: 480, color: '#B4BEB8', fontSize: 17 }}>
            Merge, redact, sign and compress entirely on this device. No upload, no account. Switch
            off Wi-Fi and keep working.
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
            <button type="button" className="btn2" onClick={onOpenTrust}>
              Prove it in 30s
            </button>
            <span className="mono">or drop PDFs anywhere</span>
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
              <span className="mono">The internet</span>
              <span style={{ color: 'var(--muted-2)', fontSize: 13, marginTop: 6 }}>
                never sees a byte
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 0 }}>
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
              <b style={{ fontSize: 17 }}>{item.title}</b>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{item.desc}</span>
            </button>
          ))}
        </div>

        <div className="mono" style={{ marginTop: 10 }}>
          Everything else
        </div>
        <div className="g6">
          {EVERYTHING_ELSE.map((item) => (
            <button
              key={item.id}
              type="button"
              className="panel tool-tile"
              onClick={() => onNavigate(item.route)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
