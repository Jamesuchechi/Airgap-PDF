import type { Asset } from '@airgap-pdf/core';
import { PDFDocument } from '@cantoo/pdf-lib';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { extractPageTextRuns, pdfjsRenderEngine, type TextRunBox } from '../engines/pdfjsRender.js';
import type { OverlayOp } from '../tools/annotate.js';

interface EditableRun extends TextRunBox {
  id: string;
  originalText: string;
  fontSize: number;
  colorHex: string;
  dirty: boolean;
}

interface ReaderPageProps {
  primaryAsset: Asset | undefined;
  thumbnails: string[];
  onApplyEdits: (operations: OverlayOp[]) => void;
  onLoadNewAsset: (asset: Asset) => void;
  onDownload: (asset: Asset) => void;
  onChooseFiles: () => void;
  onSamplePdf: () => void;
  onBackToWorkbench: () => void;
  busy: boolean;
}

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function ReaderPage({
  primaryAsset,
  thumbnails,
  onApplyEdits,
  onLoadNewAsset,
  onDownload,
  onChooseFiles,
  onSamplePdf,
  onBackToWorkbench,
  busy,
}: ReaderPageProps) {
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [editTool, setEditTool] = useState<'text' | 'highlight' | 'draw'>('text');
  const [showThumbs, setShowThumbs] = useState(true);
  const [pageCount, setPageCount] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState<number>(1);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [textRuns, setTextRuns] = useState<TextRunBox[]>([]);
  const [editableRuns, setEditableRuns] = useState<EditableRun[]>([]);
  const [findQuery, setFindQuery] = useState('');

  // Inline editing state
  const [ops, setOps] = useState<OverlayOp[]>([]);
  const [fontSize, setFontSize] = useState(14);
  const [colorHex, setColorHex] = useState('#111111');
  const [draftTextBox, setDraftTextBox] = useState<{
    xPct: number;
    yPct: number;
    text: string;
  } | null>(null);
  const [highlightStart, setHighlightStart] = useState<{ xPct: number; yPct: number } | null>(null);
  const [highlightCur, setHighlightCur] = useState<{ xPct: number; yPct: number } | null>(null);
  const [freehandPts, setFreehandPts] = useState<Array<{ xPct: number; yPct: number }>>([]);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPageIndex(0);
    setOps([]);
    setDraftTextBox(null);
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
    if (!primaryAsset) {
      setPageUrl(null);
      setTextRuns([]);
      setEditableRuns([]);
      return;
    }
    let cancelled = false;
    let objUrl: string | null = null;
    const renderDpi = Math.min(240, Math.round(144 * zoom));
    void (async () => {
      try {
        const rendered = await pdfjsRenderEngine.renderPage(primaryAsset, pageIndex, {
          dpi: renderDpi,
          format: 'png',
        });
        if (cancelled) return;
        const blob =
          rendered.blob instanceof Blob
            ? rendered.blob
            : new Blob([await rendered.blob.arrayBuffer()], { type: 'image/png' });
        objUrl = URL.createObjectURL(blob);
        setPageUrl(objUrl);

        const runs = await extractPageTextRuns(primaryAsset, pageIndex);
        if (!cancelled) {
          setTextRuns(runs);
          setEditableRuns(
            runs.map((r, idx) => ({
              ...r,
              id: `run-${pageIndex}-${idx}-${r.xPct.toFixed(3)}-${r.yPct.toFixed(3)}`,
              originalText: r.text,
              fontSize: Math.max(8, Math.min(48, Math.round(r.hPct * 792))),
              colorHex: '#111111',
              dirty: false,
            })),
          );
        }
      } catch {
        if (!cancelled) {
          setPageUrl(null);
          setTextRuns([]);
          setEditableRuns([]);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [primaryAsset, pageIndex, zoom]);

  // Keyboard navigation in Preview mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== 'preview') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        setPageIndex((p) => Math.min(pageCount - 1, p + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setPageIndex((p) => Math.max(0, p - 1));
      } else if (e.key === '=' || e.key === '+') {
        setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)));
      } else if (e.key === '-') {
        setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, pageCount]);

  const toPct = (e: PointerEvent<HTMLDivElement>) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { xPct: 0.1, yPct: 0.1 };
    return {
      xPct: Math.max(0, Math.min(0.98, (e.clientX - rect.left) / rect.width)),
      yPct: Math.max(0, Math.min(0.98, (e.clientY - rect.top) / rect.height)),
    };
  };

  const commitDraftText = () => {
    if (!draftTextBox) return;
    const trimmed = draftTextBox.text.trim();
    if (trimmed) {
      setOps((prev) => [
        ...prev,
        {
          kind: 'text',
          pageIndex,
          text: trimmed,
          xPct: draftTextBox.xPct,
          yPct: draftTextBox.yPct,
          fontSize,
          colorHex,
        },
      ]);
    }
    setDraftTextBox(null);
  };

  const handleStagePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (mode !== 'edit' || !primaryAsset) return;
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const pt = toPct(e);
    if (editTool === 'text') {
      commitDraftText();
      setDraftTextBox({ xPct: pt.xPct, yPct: pt.yPct, text: '' });
    } else if (editTool === 'highlight') {
      setHighlightStart(pt);
      setHighlightCur(pt);
    } else if (editTool === 'draw') {
      setFreehandPts([pt]);
    }
  };

  const handleStagePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (mode !== 'edit') return;
    const pt = toPct(e);
    if (editTool === 'highlight' && highlightStart) {
      setHighlightCur(pt);
    } else if (editTool === 'draw' && freehandPts.length > 0) {
      setFreehandPts((prev) => [...prev, pt]);
    }
  };

  const handleStagePointerUp = () => {
    if (mode !== 'edit') return;
    if (editTool === 'highlight' && highlightStart && highlightCur) {
      const xPct = Math.min(highlightStart.xPct, highlightCur.xPct);
      const yPct = Math.min(highlightStart.yPct, highlightCur.yPct);
      const wPct = Math.abs(highlightCur.xPct - highlightStart.xPct);
      const hPct = Math.abs(highlightCur.yPct - highlightStart.yPct);
      if (wPct >= 0.01 && hPct >= 0.005) {
        setOps((prev) => [
          ...prev,
          {
            kind: 'rect',
            pageIndex,
            xPct,
            yPct,
            widthPct: wPct,
            heightPct: hPct,
            colorHex: '#FFE14D',
            opacity: 0.35,
            filled: true,
          },
        ]);
      }
      setHighlightStart(null);
      setHighlightCur(null);
    } else if (editTool === 'draw' && freehandPts.length >= 2) {
      setOps((prev) => [
        ...prev,
        { kind: 'freehand', pageIndex, points: freehandPts, strokeWidth: 2.5, colorHex },
      ]);
      setFreehandPts([]);
    }
  };

  const handleCreateBlankPdf = async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    const saved = await doc.save();
    const copy = new Uint8Array(saved.byteLength);
    copy.set(saved);
    const blob = new Blob([copy], { type: 'application/pdf' });
    onLoadNewAsset({
      id: crypto.randomUUID(),
      name: 'untitled.pdf',
      stem: 'untitled',
      mime: 'application/pdf',
      size: blob.size,
      blob,
    });
    setMode('edit');
  };

  const handleSaveAllEdits = () => {
    commitDraftText();
    const dirtyRuns = editableRuns.filter((r) => r.dirty);
    const replacementOps: OverlayOp[] = [];
    for (const r of dirtyRuns) {
      replacementOps.push({
        kind: 'rect',
        pageIndex,
        xPct: Math.max(0, r.xPct - 0.003),
        yPct: Math.max(0, r.yPct - 0.003),
        widthPct: Math.min(1, Math.max(0.02, r.wPct + 0.01)),
        heightPct: Math.min(1, Math.max(0.01, r.hPct * 1.25)),
        colorHex: '#FFFFFF',
        opacity: 1,
        filled: true,
      });
      if (r.text.trim().length > 0) {
        replacementOps.push({
          kind: 'text',
          pageIndex,
          text: r.text,
          xPct: r.xPct,
          yPct: r.yPct,
          fontSize: r.fontSize,
          colorHex: r.colorHex,
        });
      }
    }
    const combined = [...replacementOps, ...ops];
    if (combined.length === 0) return;
    onApplyEdits(combined);
    setOps([]);
    setMode('preview');
  };

  const dirtyCount = editableRuns.filter((r) => r.dirty).length + ops.length;
  const pageOps = ops.filter((o) => o.pageIndex === pageIndex);
  const queryLower = findQuery.trim().toLowerCase();
  const matchCount = queryLower
    ? textRuns.filter((r) => r.text.toLowerCase().includes(queryLower)).length
    : 0;

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      {/* Reader / Editor Top Toolbar */}
      <div
        className="panel"
        style={{
          borderRadius: 0,
          borderLeft: 0,
          borderRight: 0,
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>
            {primaryAsset ? primaryAsset.name : 'Document Reader & Editor'}
          </strong>
          <fieldset className="seg" style={{ border: 0, padding: 0, margin: 0 }}>
            <button
              type="button"
              aria-pressed={mode === 'preview'}
              onClick={() => {
                commitDraftText();
                setMode('preview');
              }}
            >
              Preview
            </button>
            <button
              type="button"
              aria-pressed={mode === 'edit'}
              disabled={!primaryAsset}
              onClick={() => setMode('edit')}
            >
              Edit
            </button>
          </fieldset>

          {mode === 'preview' && primaryAsset && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="search"
                className="text-input"
                placeholder="Find in page..."
                aria-label="Find in page"
                value={findQuery}
                onChange={(e) => setFindQuery(e.target.value)}
                style={{ width: 150, padding: '4px 8px', fontSize: 12 }}
              />
              {queryLower && (
                <span className="mono muted" style={{ fontSize: 11 }}>
                  {matchCount} match(es)
                </span>
              )}
            </div>
          )}

          {mode === 'edit' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <select
                aria-label="Edit tool"
                value={editTool}
                onChange={(e) => setEditTool(e.target.value as 'text' | 'highlight' | 'draw')}
              >
                <option value="text">Edit / Type Text</option>
                <option value="highlight">Highlight</option>
                <option value="draw">Draw Ink</option>
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                Size
                <input
                  type="number"
                  min={8}
                  max={72}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value) || 14)}
                  style={{ width: 54 }}
                />
              </label>
              <input
                type="color"
                aria-label="Text and ink color"
                value={colorHex}
                onChange={(e) => setColorHex(e.target.value)}
              />
              <button
                type="button"
                className="btn2"
                disabled={ops.length === 0}
                onClick={() => setOps((prev) => prev.slice(0, -1))}
              >
                Undo edit
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy || dirtyCount === 0}
                onClick={handleSaveAllEdits}
              >
                {busy ? 'Saving...' : `Save Edits (${dirtyCount})`}
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {primaryAsset && (
            <>
              <button type="button" className="btn2" onClick={() => setShowThumbs((v) => !v)}>
                {showThumbs ? 'Hide Pages' : 'Show Pages'}
              </button>
              <button
                type="button"
                className="btn2"
                disabled={pageIndex <= 0}
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              >
                Prev
              </button>
              <span className="mono" style={{ fontSize: 12 }}>
                {pageIndex + 1} / {pageCount}
              </span>
              <button
                type="button"
                className="btn2"
                disabled={pageIndex >= pageCount - 1}
                onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
              >
                Next
              </button>

              <select
                aria-label="Zoom level"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              >
                {ZOOM_LEVELS.map((z) => (
                  <option key={z} value={z}>
                    {Math.round(z * 100)}%
                  </option>
                ))}
              </select>

              <button type="button" className="btn2" onClick={() => onDownload(primaryAsset)}>
                Download
              </button>
            </>
          )}
          <button type="button" className="btn2" onClick={() => void handleCreateBlankPdf()}>
            New Blank PDF
          </button>
          <button type="button" className="btn2" onClick={onChooseFiles}>
            Open PDF
          </button>
          <button type="button" className="btn2" onClick={onBackToWorkbench}>
            Workbench
          </button>
        </div>
      </div>

      {/* Main Reader Body */}
      {mode === 'edit' && primaryAsset && (
        <div
          className="mono"
          style={{
            padding: '6px 16px',
            fontSize: 12,
            background: 'var(--accent-bg)',
            borderBottom: '1px solid var(--accent-border)',
            color: 'var(--accent)',
          }}
        >
          Edit mode: click any existing text on the page to rewrite it, or click blank space to type
          new text. Click &ldquo;Save Edits&rdquo; when finished.
        </div>
      )}
      {!primaryAsset ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 32,
          }}
        >
          <h2 style={{ margin: 0, font: '400 28px var(--font-serif)' }}>
            Read, edit existing text, or write a fresh PDF
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Click any existing text in Edit mode to rewrite it directly on the page, or start a
            blank document.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn" onClick={() => void handleCreateBlankPdf()}>
              New Blank PDF
            </button>
            <button type="button" className="btn2" onClick={onChooseFiles}>
              Choose PDF
            </button>
            <button type="button" className="btn2" onClick={onSamplePdf}>
              Try sample PDF
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Left Page Thumbnails Rail */}
          {showThumbs && (
            <aside
              aria-label="Page thumbnails"
              style={{
                width: 140,
                overflowY: 'auto',
                borderRight: '1px solid var(--border)',
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {Array.from({ length: pageCount }, (_, k) => ({ pageNum: k + 1, idx: k })).map(
                ({ pageNum, idx }) => {
                  const thumb = thumbnails[idx];
                  const active = idx === pageIndex;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => {
                        commitDraftText();
                        setPageIndex(idx);
                      }}
                      style={{
                        padding: 4,
                        borderRadius: 6,
                        border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                        background: 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={`Page ${pageNum}`}
                          style={{ width: '100%', borderRadius: 4, display: 'block' }}
                        />
                      ) : (
                        <div style={{ height: 90, width: '100%', background: '#1a1d1b' }} />
                      )}
                      <span className="mono muted" style={{ fontSize: 11 }}>
                        {pageNum}
                      </span>
                    </button>
                  );
                },
              )}
            </aside>
          )}

          {/* Center Scrollable Document Stage */}
          <section
            aria-label="Document canvas"
            style={{
              flex: 1,
              overflow: 'auto',
              padding: 24,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
              background: '#080a09',
            }}
          >
            <div
              ref={stageRef}
              onPointerDown={handleStagePointerDown}
              onPointerMove={handleStagePointerMove}
              onPointerUp={handleStagePointerUp}
              style={{
                position: 'relative',
                width: `${Math.round(680 * zoom)}px`,
                maxWidth: 'none',
                boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
                cursor: mode === 'edit' ? (editTool === 'text' ? 'text' : 'crosshair') : 'text',
                userSelect: mode === 'preview' ? 'text' : 'none',
              }}
            >
              {pageUrl ? (
                <img
                  src={pageUrl}
                  alt={`Page ${pageIndex + 1}`}
                  draggable={false}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              ) : (
                <div style={{ padding: 80, textAlign: 'center' }} className="muted">
                  Rendering page...
                </div>
              )}

              {/* Selectable text overlay in Preview mode */}
              {mode === 'preview' &&
                textRuns.map((run) => {
                  const isMatch =
                    queryLower.length > 0 && run.text.toLowerCase().includes(queryLower);
                  return (
                    <span
                      key={`${run.xPct.toFixed(4)}-${run.yPct.toFixed(4)}-${run.text.slice(0, 12)}`}
                      style={{
                        position: 'absolute',
                        left: `${run.xPct * 100}%`,
                        top: `${run.yPct * 100}%`,
                        width: `${run.wPct * 100}%`,
                        height: `${run.hPct * 100}%`,
                        color: 'transparent',
                        background: isMatch ? 'rgba(255, 225, 77, 0.45)' : 'transparent',
                        fontSize: `${Math.max(8, run.hPct * 680 * zoom)}px`,
                        lineHeight: 1,
                        whiteSpace: 'pre',
                        overflow: 'hidden',
                      }}
                    >
                      {run.text}
                    </span>
                  );
                })}

              {/* Direct inline editing of existing PDF text runs in Edit mode */}
              {mode === 'edit' &&
                editTool === 'text' &&
                editableRuns.map((run) => (
                  <input
                    key={run.id}
                    type="text"
                    aria-label={`Edit text: ${run.originalText}`}
                    value={run.text}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditableRuns((prev) =>
                        prev.map((item) =>
                          item.id === run.id
                            ? { ...item, text: val, dirty: val !== item.originalText }
                            : item,
                        ),
                      );
                    }}
                    style={{
                      position: 'absolute',
                      left: `${run.xPct * 100}%`,
                      top: `${run.yPct * 100}%`,
                      minWidth: `${Math.max(4, run.wPct * 100)}%`,
                      height: `${Math.max(2, run.hPct * 115)}%`,
                      fontSize: `${Math.max(9, run.hPct * 680 * zoom)}px`,
                      fontFamily: 'Helvetica, Arial, sans-serif',
                      lineHeight: 1,
                      padding: '0 2px',
                      margin: 0,
                      border: run.dirty ? '1px solid #2563eb' : '1px dashed rgba(37,99,235,0.35)',
                      background: run.dirty ? '#ffffff' : 'transparent',
                      color: run.dirty ? run.colorHex : 'transparent',
                      caretColor: '#111111',
                      outline: 'none',
                    }}
                  />
                ))}

              {/* Committed new inline edits overlay */}
              {pageOps.map((op) => {
                if (op.kind === 'text') {
                  return (
                    <div
                      key={`op-text-${op.xPct}-${op.yPct}-${op.text}`}
                      style={{
                        position: 'absolute',
                        left: `${op.xPct * 100}%`,
                        top: `${op.yPct * 100}%`,
                        color: op.colorHex,
                        fontSize: `${Math.round(op.fontSize * zoom)}px`,
                        fontFamily: 'Helvetica, Arial, sans-serif',
                        lineHeight: 1.1,
                        pointerEvents: 'none',
                        whiteSpace: 'pre',
                      }}
                    >
                      {op.text}
                    </div>
                  );
                }
                if (op.kind === 'rect') {
                  return (
                    <div
                      key={`op-hl-${op.xPct}-${op.yPct}-${op.widthPct}`}
                      style={{
                        position: 'absolute',
                        left: `${op.xPct * 100}%`,
                        top: `${op.yPct * 100}%`,
                        width: `${op.widthPct * 100}%`,
                        height: `${op.heightPct * 100}%`,
                        background: 'rgba(255, 225, 77, 0.4)',
                        pointerEvents: 'none',
                      }}
                    />
                  );
                }
                return null;
              })}

              {/* Freehand ink SVG overlay */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                }}
              >
                {pageOps
                  .filter(
                    (o): o is Extract<OverlayOp, { kind: 'freehand' }> => o.kind === 'freehand',
                  )
                  .map((o) => (
                    <polyline
                      key={`ink-${o.points[0]?.xPct}-${o.points[0]?.yPct}-${o.points.length}`}
                      fill="none"
                      stroke={o.colorHex}
                      strokeWidth="0.45"
                      points={o.points.map((p) => `${p.xPct * 100},${p.yPct * 100}`).join(' ')}
                    />
                  ))}
                {freehandPts.length >= 2 && (
                  <polyline
                    fill="none"
                    stroke={colorHex}
                    strokeWidth="0.45"
                    points={freehandPts.map((p) => `${p.xPct * 100},${p.yPct * 100}`).join(' ')}
                  />
                )}
              </svg>

              {/* Live highlight drag preview */}
              {highlightStart && highlightCur && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${Math.min(highlightStart.xPct, highlightCur.xPct) * 100}%`,
                    top: `${Math.min(highlightStart.yPct, highlightCur.yPct) * 100}%`,
                    width: `${Math.abs(highlightCur.xPct - highlightStart.xPct) * 100}%`,
                    height: `${Math.abs(highlightCur.yPct - highlightStart.yPct) * 100}%`,
                    background: 'rgba(255, 225, 77, 0.38)',
                    border: '1px dashed #eab308',
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* Active inline text input box */}
              {draftTextBox && (
                <input
                  type="text"
                  placeholder="Type text..."
                  value={draftTextBox.text}
                  onChange={(e) =>
                    setDraftTextBox((prev) => (prev ? { ...prev, text: e.target.value } : null))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitDraftText();
                    if (e.key === 'Escape') setDraftTextBox(null);
                  }}
                  onBlur={commitDraftText}
                  style={{
                    position: 'absolute',
                    left: `${draftTextBox.xPct * 100}%`,
                    top: `${draftTextBox.yPct * 100}%`,
                    fontSize: `${Math.round(fontSize * zoom)}px`,
                    color: colorHex,
                    background: 'rgba(255,255,255,0.9)',
                    border: '1px dashed #2563eb',
                    padding: '2px 4px',
                    minWidth: 140,
                    outline: 'none',
                  }}
                />
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
