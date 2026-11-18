import { type Asset, findPdfRevisions } from '@airgap-pdf/core';
import { useEffect, useState } from 'react';
import { cantooPdfEngine } from '../engines/cantooPdfLib.js';
import { pdfjsRenderEngine } from '../engines/pdfjsRender.js';
import { downloadAsset } from '../utils/ingest.js';

interface DiscoveredRevision {
  index: number;
  sizeBytes: number;
  pageCount: number;
  asset: Asset;
  firstPageText: string;
}

interface TimeMachinePanelProps {
  asset: Asset;
}

export function TimeMachinePanel({ asset }: TimeMachinePanelProps) {
  const [revisions, setRevisions] = useState<DiscoveredRevision[]>([]);
  const [status, setStatus] = useState('Scanning revisions...');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setStatus('Scanning %%EOF markers...');
        const bytes = new Uint8Array(await asset.blob.arrayBuffer());
        const slices = findPdfRevisions(bytes);
        const found: DiscoveredRevision[] = [];

        for (const slice of slices) {
          if (cancelled) return;
          const sub = bytes.slice(0, slice.endOffset);
          const revBlob = new Blob([sub], { type: 'application/pdf' });
          const revAsset: Asset = {
            id: `${asset.id}-rev-${slice.index}`,
            name: `${asset.stem}-rev-${slice.index + 1}.pdf`,
            stem: `${asset.stem}-rev-${slice.index + 1}`,
            mime: 'application/pdf',
            size: revBlob.size,
            blob: revBlob,
          };
          try {
            const doc = await cantooPdfEngine.open(revAsset);
            const firstPageText =
              doc.pageCount > 0 ? await pdfjsRenderEngine.extractText(revAsset, 0) : '';
            found.push({
              index: slice.index,
              sizeBytes: slice.sizeBytes,
              pageCount: doc.pageCount,
              asset: revAsset,
              firstPageText,
            });
          } catch {
            // Skip truncated/unreadable revision slice
          }
        }
        if (!cancelled) {
          setRevisions(found);
          setStatus(
            found.length <= 1
              ? 'No earlier revisions found (this does not prove the file was never edited).'
              : `Found ${found.length} recoverable revisions.`,
          );
        }
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : 'Time Machine scan failed.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset]);

  return (
    <div className="panel" style={{ padding: 18, display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0, font: '400 24px var(--font-serif)' }}>Time Machine</h2>
      <div className="mono">{status}</div>

      <div style={{ display: 'grid', gap: 8 }}>
        {revisions.map((rev) => (
          <div key={rev.asset.id} className="row" style={{ alignItems: 'center' }}>
            <div>
              <strong>Revision {rev.index + 1}</strong>{' '}
              <span className="mono">
                {rev.pageCount}p · {Math.ceil(rev.sizeBytes / 1024)} KB
              </span>
              {rev.firstPageText && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--muted)',
                    maxWidth: 420,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {rev.firstPageText}
                </div>
              )}
            </div>
            <button type="button" className="btn2" onClick={() => downloadAsset(rev.asset)}>
              Export
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
