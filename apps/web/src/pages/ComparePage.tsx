import type { Asset } from '@airgap-pdf/core';
import { useEffect, useState } from 'react';
import { pdfjsRenderEngine } from '../engines/pdfjsRender.js';
import { exportCompareReportPdf } from '../utils/compareReport.js';
import { ingestFiles } from '../utils/ingest.js';
import { computeMyersDiff, type DiffLine, type PageTextInput } from '../utils/myersDiff.js';
import { computeVisualDiffFromBlobs } from '../utils/visualDiff.js';

interface ComparePageProps {
  assets: Asset[];
  onBackToWorkbench: () => void;
}

export function ComparePage({ assets, onBackToWorkbench }: ComparePageProps) {
  const [docA, setDocA] = useState<Asset | undefined>(() => assets[0]);
  const [docB, setDocB] = useState<Asset | undefined>(() => assets[1]);
  const [tab, setTab] = useState<'text' | 'visual'>('text');
  const [visualMode, setVisualMode] = useState<'side-by-side' | 'swipe' | 'onion'>('side-by-side');
  const [tolerance, setTolerance] = useState(0.1);
  const [dpi, setDpi] = useState<100 | 150 | 200>(150);
  const [swipePct, setSwipePct] = useState(50);
  const [onionOpacity, setOnionOpacity] = useState(0.5);
  const [showOverlay, setShowOverlay] = useState(false);

  const [pageIndex, setPageIndex] = useState(0);
  const [maxPages, setMaxPages] = useState(1);
  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
  const [urlA, setUrlA] = useState<string | null>(null);
  const [urlB, setUrlB] = useState<string | null>(null);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [pctChanged, setPctChanged] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pickFile = async (files: FileList | null, target: 'A' | 'B') => {
    if (!files || files.length === 0) return;
    const loaded = await ingestFiles(files);
    const first = loaded[0];
    if (!first) return;
    if (target === 'A') setDocA(first);
    else setDocB(first);
    setPageIndex(0);
  };

  // Run Myers text diff whenever docA or docB changes
  useEffect(() => {
    if (!docA || !docB) {
      setDiffLines([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setErrorMsg(null);
    void (async () => {
      try {
        const countA = await pdfjsRenderEngine.getPageCount(docA);
        const countB = await pdfjsRenderEngine.getPageCount(docB);
        if (!cancelled) setMaxPages(Math.max(1, countA, countB));

        const pagesA: PageTextInput[] = [];
        for (let i = 0; i < countA; i++) {
          pagesA.push({ pageIndex: i, text: await pdfjsRenderEngine.extractText(docA, i) });
        }
        const pagesB: PageTextInput[] = [];
        for (let i = 0; i < countB; i++) {
          pagesB.push({ pageIndex: i, text: await pdfjsRenderEngine.extractText(docB, i) });
        }
        if (!cancelled) setDiffLines(computeMyersDiff(pagesA, pagesB));
      } catch (err) {
        if (!cancelled) setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docA, docB]);

  // Run Visual Diff for current page
  useEffect(() => {
    if (!docA || !docB) {
      setUrlA(null);
      setUrlB(null);
      setOverlayUrl(null);
      setPctChanged(null);
      return;
    }
    let cancelled = false;
    const createdUrls: string[] = [];

    void (async () => {
      try {
        const countA = await pdfjsRenderEngine.getPageCount(docA);
        const countB = await pdfjsRenderEngine.getPageCount(docB);
        const idxA = Math.min(pageIndex, Math.max(0, countA - 1));
        const idxB = Math.min(pageIndex, Math.max(0, countB - 1));

        const rA = await pdfjsRenderEngine.renderPage(docA, idxA, { dpi, format: 'png' });
        const rB = await pdfjsRenderEngine.renderPage(docB, idxB, { dpi, format: 'png' });
        const bA =
          rA.blob instanceof Blob
            ? rA.blob
            : new Blob([rA.blob as unknown as ArrayBuffer], { type: 'image/png' });
        const bB =
          rB.blob instanceof Blob
            ? rB.blob
            : new Blob([rB.blob as unknown as ArrayBuffer], { type: 'image/png' });

        const vis = await computeVisualDiffFromBlobs(bA, bB, tolerance);
        if (cancelled) return;

        const uA = URL.createObjectURL(bA);
        const uB = URL.createObjectURL(bB);
        const uO = URL.createObjectURL(vis.overlayBlob);
        createdUrls.push(uA, uB, uO);

        setUrlA(uA);
        setUrlB(uB);
        setOverlayUrl(uO);
        setPctChanged(vis.pctChanged);
      } catch (err) {
        if (!cancelled) setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
      for (const u of createdUrls) URL.revokeObjectURL(u);
    };
  }, [docA, docB, pageIndex, dpi, tolerance]);

  const handleExportReport = async () => {
    if (!docA || !docB) return;
    const pdfBlob = await exportCompareReportPdf({
      nameA: docA.name,
      nameB: docB.name,
      diffLines,
      visualPctChanged: pctChanged,
    });
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compare-${docA.stem}-vs-${docB.stem}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main className="page" style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 20px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, font: '400 32px var(--font-serif)' }}>Compare PDFs</h1>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            Myers text diff (insert / delete / move) and perceptual pixel visual diff.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn"
            disabled={!docA || !docB || busy}
            onClick={() => void handleExportReport()}
          >
            Export Compare Report (PDF)
          </button>
          <button type="button" className="btn2" onClick={onBackToWorkbench}>
            Back to Workbench
          </button>
        </div>
      </div>

      <div
        className="panel"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <span>
            <strong>Document A (Original):</strong> {docA ? docA.name : 'None selected'}
          </span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => void pickFile(e.target.files, 'A')}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <span>
            <strong>Document B (Revised):</strong> {docB ? docB.name : 'None selected'}
          </span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => void pickFile(e.target.files, 'B')}
          />
        </label>
      </div>

      {errorMsg && (
        <div role="alert" className="alert" style={{ marginBottom: 12 }}>
          {errorMsg}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <fieldset className="seg" style={{ border: 0, padding: 0, margin: 0 }}>
          <button type="button" aria-pressed={tab === 'text'} onClick={() => setTab('text')}>
            Text Diff (Myers)
          </button>
          <button type="button" aria-pressed={tab === 'visual'} onClick={() => setTab('visual')}>
            Visual Diff {pctChanged !== null ? `(${pctChanged.toFixed(2)}% diff)` : ''}
          </button>
        </fieldset>

        {tab === 'visual' && (
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
              fontSize: 12,
            }}
          >
            <button
              type="button"
              className="btn2"
              disabled={pageIndex <= 0}
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            >
              Prev
            </button>
            <span className="mono">
              Page {pageIndex + 1}/{maxPages}
            </span>
            <button
              type="button"
              className="btn2"
              disabled={pageIndex >= maxPages - 1}
              onClick={() => setPageIndex((p) => Math.min(maxPages - 1, p + 1))}
            >
              Next
            </button>

            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              DPI
              <select
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value) as 100 | 150 | 200)}
              >
                <option value={100}>100</option>
                <option value={150}>150</option>
                <option value={200}>200</option>
              </select>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              Tolerance ({tolerance.toFixed(2)})
              <input
                type="range"
                min={0.05}
                max={0.5}
                step={0.05}
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
              />
            </label>

            <select
              aria-label="Visual comparison mode"
              value={visualMode}
              onChange={(e) => setVisualMode(e.target.value as 'side-by-side' | 'swipe' | 'onion')}
            >
              <option value="side-by-side">Side-by-side</option>
              <option value="swipe">Swipe</option>
              <option value="onion">Onion-skin</option>
            </select>
          </div>
        )}
      </div>

      {!docA || !docB ? (
        <div className="panel muted" style={{ padding: 24, textAlign: 'center' }}>
          Select both Document A and Document B to inspect text and visual differences.
        </div>
      ) : tab === 'text' ? (
        <div className="panel" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {busy && diffLines.length === 0 ? (
            <div className="muted">Computing Myers diff...</div>
          ) : diffLines.length === 0 ? (
            <div className="muted">No extractable text found in either document.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {diffLines.map((line, i) => {
                const bg =
                  line.op === 'insert'
                    ? '#16a34a22'
                    : line.op === 'delete'
                      ? '#dc262622'
                      : line.op === 'move'
                        ? '#d9770622'
                        : 'transparent';
                const prefix =
                  line.op === 'insert'
                    ? '+'
                    : line.op === 'delete'
                      ? '-'
                      : line.op === 'move'
                        ? '~'
                        : ' ';
                const pageLabel =
                  line.op === 'insert'
                    ? `B p.${(line.bPage ?? 0) + 1}`
                    : line.op === 'delete'
                      ? `A p.${(line.aPage ?? 0) + 1}`
                      : `p.${(line.aPage ?? line.bPage ?? 0) + 1}`;
                return (
                  <div
                    key={`${line.op}-${pageLabel}-${line.text.slice(0, 24)}-${i.toString(36)}`}
                    style={{
                      display: 'flex',
                      gap: 8,
                      padding: '4px 8px',
                      borderRadius: 4,
                      background: bg,
                    }}
                  >
                    <span className="muted" style={{ minWidth: 56 }}>
                      {pageLabel}
                    </span>
                    <span style={{ fontWeight: 700, minWidth: 12 }}>{prefix}</span>
                    <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {line.text}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="panel">
          {visualMode === 'side-by-side' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
              }}
            >
              <div>
                <div className="mono muted" style={{ fontSize: 11, marginBottom: 4 }}>
                  Document A
                </div>
                {urlA && <img src={urlA} alt="Document A page" style={{ maxWidth: '100%' }} />}
              </div>
              <div>
                <div className="mono muted" style={{ fontSize: 11, marginBottom: 4 }}>
                  Document B
                </div>
                {urlB && <img src={urlB} alt="Document B page" style={{ maxWidth: '100%' }} />}
              </div>
              <div>
                <div className="mono muted" style={{ fontSize: 11, marginBottom: 4 }}>
                  Pixelmatch Diff Overlay
                </div>
                {overlayUrl && (
                  <img src={overlayUrl} alt="Visual diff overlay" style={{ maxWidth: '100%' }} />
                )}
              </div>
            </div>
          )}

          {visualMode === 'swipe' && urlA && urlB && (
            <div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                  fontSize: 12,
                }}
              >
                Swipe ({swipePct}%)
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={swipePct}
                  onChange={(e) => setSwipePct(Number(e.target.value))}
                />
              </label>
              <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
                <img src={urlB} alt="Document B" style={{ display: 'block', maxWidth: '100%' }} />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${swipePct}%`,
                    overflow: 'hidden',
                    borderRight: '2px solid var(--accent)',
                  }}
                >
                  <img src={urlA} alt="Document A" style={{ display: 'block', maxWidth: 'none' }} />
                </div>
              </div>
            </div>
          )}

          {visualMode === 'onion' && urlA && urlB && (
            <div>
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  alignItems: 'center',
                  marginBottom: 8,
                  fontSize: 12,
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Opacity ({Math.round(onionOpacity * 100)}%)
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={onionOpacity}
                    onChange={(e) => setOnionOpacity(Number(e.target.value))}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="checkbox"
                    checked={showOverlay}
                    onChange={(e) => setShowOverlay(e.target.checked)}
                  />
                  Show diff overlay
                </label>
              </div>
              <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
                <img src={urlA} alt="Document A" style={{ display: 'block', maxWidth: '100%' }} />
                <img
                  src={showOverlay && overlayUrl ? overlayUrl : urlB}
                  alt="Overlay"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    maxWidth: '100%',
                    opacity: onionOpacity,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
