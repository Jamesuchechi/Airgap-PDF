import { type Asset, findPdfRevisions, type SanitizeOptions } from '@airgap-pdf/core';
import { useEffect, useState } from 'react';
import { cantooPdfEngine } from '../engines/cantooPdfLib.js';
import { buildXRayFindings, type XRayReport } from '../tools/xray.js';

interface XRayPanelProps {
  asset: Asset;
  disabled: boolean;
  onFixWithSanitize: (opts: SanitizeOptions) => void;
}

export function XRayPanel({ asset, disabled, onFixWithSanitize }: XRayPanelProps) {
  const [report, setReport] = useState<XRayReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const bytes = new Uint8Array(await asset.blob.arrayBuffer());
        const revs = findPdfRevisions(bytes);
        const doc = await cantooPdfEngine.open(asset);
        if (cancelled) return;
        const summary = doc.inspect();
        setReport({
          fileName: asset.name,
          sizeBytes: asset.size,
          pageCount: doc.pageCount,
          revisionCount: revs.length,
          findings: buildXRayFindings(summary, revs.length),
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not inspect PDF.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset]);

  const exportReport = (fmt: 'json' | 'markdown') => {
    if (!report) return;
    const body =
      fmt === 'markdown'
        ? [
            `# X-Ray Report: ${report.fileName}`,
            `- Pages: ${report.pageCount} · Size: ${report.sizeBytes} bytes · Revisions: ${report.revisionCount}`,
            '',
            ...report.findings.map(
              (f) => `- **[${f.severity.toUpperCase()}] ${f.title}:** ${f.detail}`,
            ),
          ].join('\n')
        : `${JSON.stringify(report, null, 2)}\n`;
    const blob = new Blob([body], {
      type: fmt === 'markdown' ? 'text/markdown' : 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${asset.stem}-xray.${fmt === 'markdown' ? 'md' : 'json'}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (error) return <div className="alert">{error}</div>;
  if (!report) return <div className="mono">Scanning PDF...</div>;

  return (
    <div className="panel" style={{ padding: 18, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, font: '400 24px var(--font-serif)' }}>X-Ray Leak Report</h2>
          <div className="mono">
            {report.pageCount} pages · {report.revisionCount} revision(s)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn2" onClick={() => exportReport('json')}>
            Export JSON
          </button>
          <button type="button" className="btn2" onClick={() => exportReport('markdown')}>
            Export Markdown
          </button>
        </div>
      </div>

      {report.findings.length === 0 ? (
        <div style={{ color: 'var(--accent)', fontSize: 13 }}>
          No metadata, active scripts, attachments, hidden layers, or extra revisions detected.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {report.findings.map((f) => (
            <div key={f.id} className="row" style={{ alignItems: 'center' }}>
              <div>
                <strong
                  style={{
                    color:
                      f.severity === 'risk'
                        ? '#FFB454'
                        : f.severity === 'warn'
                          ? '#FFD9A0'
                          : 'var(--text)',
                  }}
                >
                  [{f.severity.toUpperCase()}] {f.title}
                </strong>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn"
        disabled={disabled}
        onClick={() =>
          onFixWithSanitize({
            metadata: true,
            javascript: true,
            embeddedFiles: true,
            hiddenLayers: true,
            annotations: true,
            forms: true,
          })
        }
      >
        Fix all with Sanitize
      </button>
    </div>
  );
}
