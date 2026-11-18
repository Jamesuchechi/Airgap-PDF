import { type Asset, DEFAULT_LIMITS, type ToolContext } from '@airgap-pdf/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cantooPdfEngine } from '../engines/cantooPdfLib.js';
import { extractPageTextRuns, pdfjsRenderEngine } from '../engines/pdfjsRender.js';
import {
  buildRedactionAuditLog,
  REDACTION_PATTERNS,
  type RedactionRegion,
  redactTool,
} from '../tools/redact.js';
import { type VerificationReport, verifyRedaction } from '../utils/redactionVerifier.js';

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
  const [dpi, setDpi] = useState<150 | 200 | 300>(200);
  const [historyCleared, setHistoryCleared] = useState(false);

  // Real PDF state
  const [pageCount, setPageCount] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageImgUrl, setPageImgUrl] = useState<string | null>(null);
  const [regions, setRegions] = useState<RedactionRegion[]>([]);
  const [burnedPreview, setBurnedPreview] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [forbiddenTerms, setForbiddenTerms] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [redactedAsset, setRedactedAsset] = useState<Asset | null>(null);
  const [report, setReport] = useState<VerificationReport | null>(null);

  // Drag drawing state
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setRegions([]);
    setForbiddenTerms([]);
    setRedactedAsset(null);
    setReport(null);
    setPageIndex(0);
    setStatusMsg(null);
    setErrorMsg(null);
    if (!primaryAsset) {
      setPageCount(1);
      return;
    }
    let cancelled = false;
    void pdfjsRenderEngine
      .getPageCount(primaryAsset)
      .then((n) => {
        if (!cancelled) setPageCount(n);
      })
      .catch(() => {
        if (!cancelled) setPageCount(1);
      });
    return () => {
      cancelled = true;
    };
  }, [primaryAsset]);

  useEffect(() => {
    const target = redactedAsset ?? primaryAsset;
    if (!target) {
      setPageImgUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void pdfjsRenderEngine
      .renderPage(target, pageIndex, { dpi: 150, format: 'png' })
      .then((res) => {
        if (cancelled) return;
        const blob =
          res.blob instanceof Blob
            ? res.blob
            : new Blob([res.blob as unknown as ArrayBuffer], { type: 'image/png' });
        objectUrl = URL.createObjectURL(blob);
        setPageImgUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setPageImgUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [primaryAsset, redactedAsset, pageIndex]);

  const toStagePct = (clientX: number, clientY: number) => {
    const el = stageRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height))),
    };
  };

  const handlePointerUp = () => {
    if (dragStart && dragCurrent) {
      const xPct = Math.min(dragStart.x, dragCurrent.x);
      const yPct = Math.min(dragStart.y, dragCurrent.y);
      const wPct = Math.abs(dragCurrent.x - dragStart.x);
      const hPct = Math.abs(dragCurrent.y - dragStart.y);
      if (wPct >= 0.01 && hPct >= 0.01) {
        setRegions((prev) => [
          ...prev,
          { pageIndex, xPct, yPct, wPct, hPct, category: 'manual-region' },
        ]);
        setRedactedAsset(null);
        setReport(null);
      }
    }
    setDragStart(null);
    setDragCurrent(null);
  };

  const runSearchAndAdd = useCallback(
    async (pattern: RegExp, category: string) => {
      if (!primaryAsset) return;
      setBusy(true);
      setErrorMsg(null);
      setStatusMsg('Scanning document text for matches...');
      try {
        const added: RedactionRegion[] = [];
        const matchedTerms = new Set<string>(forbiddenTerms);
        for (let p = 0; p < pageCount; p++) {
          const runs = await extractPageTextRuns(primaryAsset, p);
          for (const run of runs) {
            pattern.lastIndex = 0;
            const m = pattern.exec(run.text);
            if (m) {
              matchedTerms.add(m[0]);
              added.push({
                pageIndex: p,
                xPct: run.xPct,
                yPct: run.yPct,
                wPct: run.wPct,
                hPct: run.hPct,
                category,
              });
            }
          }
        }
        setRegions((prev) => [...prev, ...added]);
        setForbiddenTerms([...matchedTerms]);
        setRedactedAsset(null);
        setReport(null);
        setStatusMsg(
          added.length > 0
            ? `Marked ${added.length} matching region(s) across ${pageCount} page(s).`
            : 'No matches found.',
        );
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [primaryAsset, pageCount, forbiddenTerms],
  );

  const handleSearchSubmit = () => {
    const q = searchQuery.trim();
    if (!q) return;
    try {
      const rx = isRegex
        ? new RegExp(q, 'gi')
        : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      void runSearchAndAdd(rx, isRegex ? 'regex-match' : 'text-search');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid regular expression.');
    }
  };

  const handleRedactAndVerify = async () => {
    if (!primaryAsset || regions.length === 0) return;
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg('Applying redaction...');
    try {
      const ctx: ToolContext = {
        pdf: cantooPdfEngine,
        render: pdfjsRenderEngine,
        limits: DEFAULT_LIMITS,
        progress: (_pct, msg) => {
          if (msg) setStatusMsg(msg);
        },
        log: () => {},
        signal: new AbortController().signal,
      };
      const res = await redactTool.run(ctx, [primaryAsset], {
        mode,
        dpi,
        regions,
        stripMetadata: true,
      });
      if (!res.ok) throw new Error(res.error.userMessage);
      const out = res.outputs[0];
      if (!out) throw new Error('Redaction returned no output.');

      setStatusMsg('Running post-redaction verification...');
      const ver = await verifyRedaction(out, {
        forbiddenTerms,
        extractPageText: (p) => pdfjsRenderEngine.extractText(out, p),
        extractPageRuns: (p) => extractPageTextRuns(out, p),
      });
      setRedactedAsset(out);
      setReport(ver);
      setStatusMsg(
        ver.passed
          ? 'Redaction & verification passed (0 leaks).'
          : `Verification blocked download (${ver.leaks.length} leak(s) detected).`,
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAuditCurrentPdf = async () => {
    if (!primaryAsset) return;
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg('Auditing PDF for black-box leaks, metadata, and revision history...');
    try {
      const ver = await verifyRedaction(primaryAsset, {
        extractPageRuns: (p) => extractPageTextRuns(primaryAsset, p),
      });
      setReport(ver);
      setStatusMsg(
        ver.passed
          ? 'Audit passed: no suspicious black boxes or hidden revisions found.'
          : `Audit flagged ${ver.leaks.length} issue(s).`,
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadVerified = () => {
    if (!redactedAsset || !report?.passed) return;
    const url = URL.createObjectURL(redactedAsset.blob as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = redactedAsset.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExportAuditLog = () => {
    const log = buildRedactionAuditLog({
      fileName: primaryAsset?.name ?? 'document.pdf',
      mode,
      regions,
      verification: report,
    });
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${primaryAsset?.stem ?? 'redaction'}-audit-log.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const pageRegions = regions.filter((r) => r.pageIndex === pageIndex);
  const canDownload = primaryAsset ? Boolean(redactedAsset && report?.passed) : historyCleared;

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
            {primaryAsset
              ? `${primaryAsset.name} · Page ${pageIndex + 1} of ${pageCount}`
              : 'Sample preview · Page 3 of 12'}
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
              Precise (content-stream)
            </button>
          </fieldset>
        </div>

        <div
          className="panel"
          style={{
            alignSelf: 'stretch',
            padding: '10px 14px',
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          <strong>Safe vs Precise:</strong>{' '}
          {mode === 'safe'
            ? `Safe mode rasterizes affected pages at ${dpi} DPI, burns solid black boxes into pixels, and strips metadata/history. Zero text or vector data can survive.`
            : 'Precise mode tokenizes PDF content streams, drops text operators under regions, clips overlapping images, and keeps unaffected text selectable.'}
        </div>

        {primaryAsset ? (
          <>
            <div
              style={{
                alignSelf: 'stretch',
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <input
                type="text"
                className="input"
                placeholder={isRegex ? 'Regex pattern...' : 'Search text to redact...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearchSubmit();
                }}
                style={{ flex: 1, minWidth: 160 }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={isRegex}
                  onChange={(e) => setIsRegex(e.target.checked)}
                />
                Regex
              </label>
              <button type="button" className="btn2" disabled={busy} onClick={handleSearchSubmit}>
                Mark matches
              </button>
              {Object.entries(REDACTION_PATTERNS).map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  className="btn2"
                  disabled={busy}
                  onClick={() => void runSearchAndAdd(preset.regex, key)}
                >
                  + {preset.label}
                </button>
              ))}
            </div>

            <div
              style={{
                alignSelf: 'stretch',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn2"
                  disabled={pageIndex <= 0}
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                >
                  Prev
                </button>
                <span className="mono">
                  Page {pageIndex + 1}/{pageCount}
                </span>
                <button
                  type="button"
                  className="btn2"
                  disabled={pageIndex >= pageCount - 1}
                  onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
                >
                  Next
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {mode === 'safe' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    DPI
                    <select
                      value={dpi}
                      onChange={(e) => setDpi(Number(e.target.value) as 150 | 200 | 300)}
                    >
                      <option value={150}>150</option>
                      <option value={200}>200</option>
                      <option value={300}>300</option>
                    </select>
                  </label>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="checkbox"
                    checked={burnedPreview}
                    onChange={(e) => setBurnedPreview(e.target.checked)}
                  />
                  Burned-in preview
                </label>
                <button
                  type="button"
                  className="btn2"
                  disabled={regions.length === 0}
                  onClick={() => {
                    setRegions([]);
                    setForbiddenTerms([]);
                    setRedactedAsset(null);
                    setReport(null);
                  }}
                >
                  Clear ({regions.length})
                </button>
              </div>
            </div>

            <div
              ref={stageRef}
              onPointerDown={(e) => {
                if (redactedAsset) return;
                const pt = toStagePct(e.clientX, e.clientY);
                setDragStart(pt);
                setDragCurrent(pt);
              }}
              onPointerMove={(e) => {
                if (!dragStart) return;
                setDragCurrent(toStagePct(e.clientX, e.clientY));
              }}
              onPointerUp={handlePointerUp}
              style={{
                position: 'relative',
                alignSelf: 'center',
                maxWidth: '100%',
                border: '1px solid var(--border)',
                cursor: redactedAsset ? 'default' : 'crosshair',
                userSelect: 'none',
                touchAction: 'none',
              }}
            >
              {pageImgUrl ? (
                <img
                  src={pageImgUrl}
                  alt={`Page ${pageIndex + 1} preview`}
                  draggable={false}
                  style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
                />
              ) : (
                <div style={{ padding: 48 }} className="muted">
                  Rendering page...
                </div>
              )}

              {!redactedAsset &&
                pageRegions.map((r) => (
                  <div
                    key={`${r.pageIndex}-${r.xPct.toFixed(4)}-${r.yPct.toFixed(4)}-${r.wPct.toFixed(4)}-${r.hPct.toFixed(4)}`}
                    style={{
                      position: 'absolute',
                      left: `${r.xPct * 100}%`,
                      top: `${r.yPct * 100}%`,
                      width: `${r.wPct * 100}%`,
                      height: `${r.hPct * 100}%`,
                      background: burnedPreview ? '#000000' : '#D9822B33',
                      border: burnedPreview ? '1px solid #000' : '2px dashed #9A4E0A',
                      pointerEvents: 'none',
                    }}
                  />
                ))}

              {dragStart && dragCurrent && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${Math.min(dragStart.x, dragCurrent.x) * 100}%`,
                    top: `${Math.min(dragStart.y, dragCurrent.y) * 100}%`,
                    width: `${Math.abs(dragCurrent.x - dragStart.x) * 100}%`,
                    height: `${Math.abs(dragCurrent.y - dragStart.y) * 100}%`,
                    background: '#D9822B44',
                    border: '2px dashed #D9822B',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>
          </>
        ) : (
          <div className="redact-sheet">
            <div style={{ font: "34px 'Instrument Serif', Georgia, serif" }}>
              Settlement Agreement
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
        )}

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
          Extracted text, decompressed streams, annotations, bookmarks, form fields, metadata, and
          black-box overlays are verified before download is unlocked.
        </span>

        {primaryAsset ? (
          <>
            <div className="panel" style={{ padding: '10px 20px', fontSize: 13 }}>
              {report ? (
                report.checks.map((chk) => (
                  <div
                    key={chk.id}
                    className="row"
                    style={{ color: chk.passed ? 'var(--accent)' : '#FFB454' }}
                  >
                    <span>{chk.label}</span>
                    <span>{chk.passed ? '0 hits' : `${chk.hitCount} hit(s)`}</span>
                  </div>
                ))
              ) : (
                <div className="muted">
                  Draw redaction regions (or click Audit PDF) to run all 6 verification checks.
                </div>
              )}
            </div>

            {statusMsg && (
              <div className="muted" style={{ fontSize: 12 }}>
                {statusMsg}
              </div>
            )}
            {errorMsg && (
              <div role="alert" className="alert">
                {errorMsg}
              </div>
            )}
            {report && !report.passed && (
              <div role="alert" className="alert">
                {report.leaks.map((l) => (
                  <div key={`${l.category}-${l.location}-${l.detail}`}>
                    <strong>{l.location}:</strong> {l.detail}
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className="btn"
              disabled={busy || regions.length === 0}
              onClick={() => void handleRedactAndVerify()}
            >
              {busy ? 'Working...' : `Redact & Verify (${regions.length} region(s))`}
            </button>

            <button
              type="button"
              className="btn2"
              disabled={busy}
              onClick={() => void handleAuditCurrentPdf()}
            >
              Audit PDF (Verify Redaction)
            </button>

            <button
              type="button"
              className="btn2"
              disabled={!canDownload}
              aria-disabled={!canDownload}
              onClick={handleDownloadVerified}
            >
              {canDownload ? 'Download verified copy' : 'Download verified copy (blocked)'}
            </button>

            <button
              type="button"
              className="btn2"
              disabled={regions.length === 0 && !report}
              onClick={handleExportAuditLog}
            >
              Export audit log (JSON)
            </button>
          </>
        ) : (
          <>
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
                All 6 verification checks passed. Open or load a PDF to redact and verify it.
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
              {historyCleared ? 'Download verified copy' : 'Download verified copy (blocked)'}
            </button>
          </>
        )}

        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>
          Safe mode rasterizes affected pages and rebuilds the PDF cleanly. Always visually inspect
          the output before sharing.
        </p>
      </aside>
    </main>
  );
}
