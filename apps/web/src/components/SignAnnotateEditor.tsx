import type { Asset } from '@airgap-pdf/core';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { pdfjsRenderEngine } from '../engines/pdfjsRender.js';
import type { OverlayOp } from '../tools/annotate.js';

interface SignAnnotateEditorProps {
  asset: Asset;
  pageIndex: number;
  onApply: (operations: OverlayOp[]) => void;
  disabled: boolean;
}

type EditorMode = 'text' | 'sign' | 'highlight' | 'draw';

export function SignAnnotateEditor({
  asset,
  pageIndex,
  onApply,
  disabled,
}: SignAnnotateEditorProps) {
  const [mode, setMode] = useState<EditorMode>('text');
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [ops, setOps] = useState<OverlayOp[]>([]);

  // Text mode state
  const [pendingText, setPendingText] = useState('New text');
  const [fontSize, setFontSize] = useState(14);
  const [colorHex, setColorHex] = useState('#111111');

  // Signature pad state
  const [sigTab, setSigTab] = useState<'draw' | 'type' | 'upload'>('draw');
  const [typedSig, setTypedSig] = useState('A. Lovelace');
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigDrawing = useRef(false);

  // Freehand page draw state
  const [freehandPts, setFreehandPts] = useState<Array<{ xPct: number; yPct: number }>>([]);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let objUrl: string | null = null;
    (async () => {
      const rendered = await pdfjsRenderEngine.renderPage(asset, pageIndex, { dpi: 144 });
      if (cancelled) return;
      objUrl = URL.createObjectURL(rendered.blob as Blob);
      setPageUrl(objUrl);
    })();
    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [asset, pageIndex]);

  const toPct = (e: PointerEvent<HTMLDivElement>) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { xPct: 0.1, yPct: 0.1 };
    return {
      xPct: Math.max(0, Math.min(0.95, (e.clientX - rect.left) / rect.width)),
      yPct: Math.max(0, Math.min(0.95, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handleStagePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const { xPct, yPct } = toPct(e);
    if (mode === 'text') {
      if (!pendingText.trim()) return;
      setOps((prev) => [
        ...prev,
        {
          kind: 'text',
          pageIndex,
          text: pendingText.trim(),
          xPct,
          yPct,
          fontSize,
          colorHex,
        },
      ]);
    } else if (mode === 'highlight') {
      setOps((prev) => [
        ...prev,
        {
          kind: 'rect',
          pageIndex,
          xPct,
          yPct,
          widthPct: 0.25,
          heightPct: 0.035,
          colorHex: '#ffd54f',
          opacity: 0.35,
          filled: true,
        },
      ]);
    } else if (mode === 'sign') {
      if (!sigDataUrl) return;
      setOps((prev) => [
        ...prev,
        {
          kind: 'image',
          pageIndex,
          dataUrl: sigDataUrl,
          xPct,
          yPct,
          widthPct: 0.24,
        },
      ]);
    } else if (mode === 'draw') {
      setFreehandPts([{ xPct, yPct }]);
    }
  };

  const handleStagePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (mode !== 'draw' || freehandPts.length === 0) return;
    setFreehandPts((prev) => [...prev, toPct(e)]);
  };

  const handleStagePointerUp = () => {
    if (mode === 'draw' && freehandPts.length >= 2) {
      setOps((prev) => [
        ...prev,
        { kind: 'freehand', pageIndex, points: freehandPts, colorHex, strokeWidth: 2 },
      ]);
    }
    setFreehandPts([]);
  };

  // Signature pad helpers
  const startSigStroke = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    sigDrawing.current = true;
    const r = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111111';
  };

  const moveSigStroke = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!sigDrawing.current) return;
    const canvas = sigCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const r = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
    ctx.stroke();
  };

  const endSigStroke = () => {
    if (!sigDrawing.current) return;
    sigDrawing.current = false;
    const canvas = sigCanvasRef.current;
    if (canvas) setSigDataUrl(canvas.toDataURL('image/png'));
  };

  const clearSigPad = () => {
    const canvas = sigCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSigDataUrl(null);
  };

  const renderTypedSignature = () => {
    const c = document.createElement('canvas');
    c.width = 360;
    c.height = 100;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.font = 'italic 40px Georgia, serif';
    ctx.fillStyle = '#111111';
    ctx.fillText(typedSig || 'Signature', 16, 66);
    setSigDataUrl(c.toDataURL('image/png'));
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <fieldset
        className="seg"
        style={{ border: 0, padding: 0, margin: 0, maxWidth: 480 }}
        aria-label="Editor mode"
      >
        {(['text', 'sign', 'highlight', 'draw'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
            {m === 'text'
              ? 'Type text'
              : m === 'sign'
                ? 'Sign'
                : m === 'highlight'
                  ? 'Highlight'
                  : 'Draw'}
          </button>
        ))}
      </fieldset>

      {mode === 'text' && (
        <div className="panel" style={{ padding: 14, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <input
            type="text"
            aria-label="Text to place on page"
            className="text-input"
            style={{ flex: 1, minWidth: 180 }}
            value={pendingText}
            onChange={(e) => setPendingText(e.target.value)}
            placeholder="Type text, then click on the page..."
          />
          <select
            aria-label="Font size"
            className="text-input"
            style={{ width: 90 }}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          >
            {[10, 12, 14, 18, 24, 32].map((s) => (
              <option key={s} value={s}>
                {s}px
              </option>
            ))}
          </select>
          <input
            type="color"
            aria-label="Text color"
            value={colorHex}
            onChange={(e) => setColorHex(e.target.value)}
            style={{ width: 44, height: 44, padding: 2, borderRadius: 8, background: 'var(--bg)' }}
          />
          <span className="mono" style={{ alignSelf: 'center' }}>
            Click page to place
          </span>
        </div>
      )}

      {mode === 'sign' && (
        <div className="panel" style={{ padding: 14, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['draw', 'type', 'upload'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className="btn2"
                aria-pressed={sigTab === t}
                onClick={() => setSigTab(t)}
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              className="btn2"
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10);
                setOps((prev) => [
                  ...prev,
                  {
                    kind: 'text',
                    pageIndex,
                    text: today,
                    xPct: 0.65,
                    yPct: 0.85,
                    fontSize: 12,
                    colorHex: '#111111',
                  },
                ]);
              }}
            >
              + Date stamp
            </button>
          </div>

          {sigTab === 'draw' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <canvas
                ref={sigCanvasRef}
                width={320}
                height={100}
                style={{
                  background: '#f3f0e8',
                  borderRadius: 8,
                  touchAction: 'none',
                  cursor: 'crosshair',
                }}
                onPointerDown={startSigStroke}
                onPointerMove={moveSigStroke}
                onPointerUp={endSigStroke}
                onPointerLeave={endSigStroke}
              />
              <button type="button" className="btn2" onClick={clearSigPad}>
                Clear
              </button>
            </div>
          )}

          {sigTab === 'type' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="text-input"
                style={{ flex: 1, minWidth: 180 }}
                value={typedSig}
                onChange={(e) => setTypedSig(e.target.value)}
              />
              <button type="button" className="btn2" onClick={renderTypedSignature}>
                Use signature
              </button>
            </div>
          )}

          {sigTab === 'upload' && (
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === 'string') setSigDataUrl(reader.result);
                };
                reader.readAsDataURL(f);
              }}
            />
          )}

          <span className="mono">
            {sigDataUrl
              ? 'Signature ready — click on the page to place.'
              : 'Create signature above.'}
          </span>
        </div>
      )}

      <div
        ref={stageRef}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 620,
          background: '#f3f0e8',
          borderRadius: 6,
          overflow: 'hidden',
          cursor: 'crosshair',
          touchAction: mode === 'draw' ? 'none' : 'auto',
          userSelect: 'none',
        }}
      >
        {pageUrl && (
          <img
            src={pageUrl}
            alt={`Editable page ${pageIndex + 1}`}
            style={{ display: 'block', width: '100%', height: 'auto', pointerEvents: 'none' }}
          />
        )}

        {ops
          .filter((o) => o.pageIndex === pageIndex)
          .map((op) => {
            const key = JSON.stringify(op);
            if (op.kind === 'text') {
              return (
                <div
                  key={key}
                  style={{
                    position: 'absolute',
                    left: `${op.xPct * 100}%`,
                    top: `${op.yPct * 100}%`,
                    color: op.colorHex,
                    fontSize: op.fontSize,
                    fontFamily: 'Helvetica, sans-serif',
                    pointerEvents: 'none',
                  }}
                >
                  {op.text}
                </div>
              );
            }
            if (op.kind === 'rect') {
              return (
                <div
                  key={key}
                  style={{
                    position: 'absolute',
                    left: `${op.xPct * 100}%`,
                    top: `${op.yPct * 100}%`,
                    width: `${op.widthPct * 100}%`,
                    height: `${op.heightPct * 100}%`,
                    background: op.colorHex,
                    opacity: op.opacity,
                    pointerEvents: 'none',
                  }}
                />
              );
            }
            if (op.kind === 'image') {
              return (
                <img
                  key={key}
                  src={op.dataUrl}
                  alt="Placed signature"
                  style={{
                    position: 'absolute',
                    left: `${op.xPct * 100}%`,
                    top: `${op.yPct * 100}%`,
                    width: `${op.widthPct * 100}%`,
                    pointerEvents: 'none',
                  }}
                />
              );
            }
            return null;
          })}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className="btn"
          disabled={disabled || ops.length === 0}
          onClick={() => onApply(ops)}
        >
          Apply &amp; Save PDF ({ops.length})
        </button>
        <button
          type="button"
          className="btn2"
          disabled={ops.length === 0}
          onClick={() => setOps((p) => p.slice(0, -1))}
        >
          Undo edit
        </button>
        <button
          type="button"
          className="btn2"
          disabled={ops.length === 0}
          onClick={() => setOps([])}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
