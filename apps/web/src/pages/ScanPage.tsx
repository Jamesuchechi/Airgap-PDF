import type { Asset } from '@airgap-pdf/core';
import { useEffect, useRef, useState } from 'react';
import {
  applyScanFilter,
  type CornerPoint,
  DEFAULT_CORNERS,
  detectDocumentCorners,
  exportScannedPagesToPdf,
  type QuadCorners,
  type ScanFilterMode,
  warpPerspective,
} from '../utils/scanner.js';

interface ScannedPageItem {
  id: string;
  previewUrl: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

interface ScanPageProps {
  onSendToWorkbench: (asset: Asset) => void;
  onBackToWorkbench: () => void;
}

type CornerKey = keyof QuadCorners;

export function ScanPage({ onSendToWorkbench, onBackToWorkbench }: ScanPageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cropStageRef = useRef<HTMLDivElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [capturedSize, setCapturedSize] = useState<{ w: number; h: number } | null>(null);
  const [capturedRgba, setCapturedRgba] = useState<Uint8ClampedArray | null>(null);
  const [corners, setCorners] = useState<QuadCorners>(DEFAULT_CORNERS);
  const [draggingCorner, setDraggingCorner] = useState<CornerKey | null>(null);
  const [filterMode, setFilterMode] = useState<ScanFilterMode>('bw');
  const [pages, setPages] = useState<ScannedPageItem[]>([]);
  const [busy, setBusy] = useState(false);

  const stopCamera = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
        streamRef.current = null;
      }
    };
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera API unavailable. Use "Upload / Take Photo" below instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      });
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? `${err.message}. Use "Upload / Take Photo" below instead.`
          : 'Could not start camera.',
      );
    }
  };

  const loadImageBitmapForCrop = async (source: ImageBitmap) => {
    const maxDim = 1400;
    const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
    const w = Math.max(16, Math.round(source.width * scale));
    const h = Math.max(16, Math.round(source.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(source, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const detected = detectDocumentCorners(imgData.data, w, h);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    });
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(URL.createObjectURL(blob));
    setCapturedSize({ w, h });
    setCapturedRgba(imgData.data);
    setCorners(detected);
  };

  const handleCaptureFrame = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const bmp = await createImageBitmap(video);
    try {
      await loadImageBitmapForCrop(bmp);
      stopCamera();
    } finally {
      bmp.close();
    }
  };

  const handleUploadPhoto = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const bmp = await createImageBitmap(file);
    try {
      await loadImageBitmapForCrop(bmp);
    } finally {
      bmp.close();
    }
  };

  const handleCornerMove = (clientX: number, clientY: number) => {
    if (!draggingCorner || !cropStageRef.current) return;
    const rect = cropStageRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
    setCorners((prev) => ({ ...prev, [draggingCorner]: { x, y } }));
  };

  const handleApplyAndAddPage = async () => {
    if (!capturedRgba || !capturedSize) return;
    setBusy(true);
    try {
      const dstW = 1100;
      const dstH = 1420;
      const warped = warpPerspective(
        capturedRgba,
        capturedSize.w,
        capturedSize.h,
        corners,
        dstW,
        dstH,
      );
      applyScanFilter(warped, filterMode);

      const canvas = document.createElement('canvas');
      canvas.width = dstW;
      canvas.height = dstH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2D context');
      ctx.putImageData(new ImageData(new Uint8ClampedArray(warped), dstW, dstH), 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
          'image/jpeg',
          0.9,
        );
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const previewUrl = URL.createObjectURL(blob);
      setPages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), previewUrl, bytes, width: dstW, height: dstH },
      ]);
      if (capturedUrl) URL.revokeObjectURL(capturedUrl);
      setCapturedUrl(null);
      setCapturedRgba(null);
      setCapturedSize(null);
    } finally {
      setBusy(false);
    }
  };

  const movePage = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= pages.length) return;
    setPages((prev) => {
      const next = [...prev];
      const a = next[idx];
      const b = next[target];
      if (!a || !b) return prev;
      next[idx] = b;
      next[target] = a;
      return next;
    });
  };

  const handleExportPdf = async (sendToWorkbench: boolean) => {
    if (pages.length === 0) return;
    setBusy(true);
    try {
      const pdfBlob = await exportScannedPagesToPdf(
        pages.map((p) => ({ bytes: p.bytes, mime: 'image/jpeg' as const })),
      );
      if (sendToWorkbench) {
        onSendToWorkbench({
          id: crypto.randomUUID(),
          name: 'scanned-document.pdf',
          stem: 'scanned-document',
          mime: 'application/pdf',
          size: pdfBlob.size,
          blob: pdfBlob,
        });
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'scanned-document.pdf';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } finally {
      setBusy(false);
    }
  };

  const cornerList: Array<{ key: CornerKey; pt: CornerPoint; label: string }> = [
    { key: 'tl', pt: corners.tl, label: 'Top-left' },
    { key: 'tr', pt: corners.tr, label: 'Top-right' },
    { key: 'br', pt: corners.br, label: 'Bottom-right' },
    { key: 'bl', pt: corners.bl, label: 'Bottom-left' },
  ];

  return (
    <main className="page" style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
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
          <h1 style={{ margin: 0, font: '400 32px var(--font-serif)' }}>Document Scanner</h1>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            Capture with camera or photo upload, auto-detect edges with manual corner adjustment,
            warp perspective, filter, and export multi-page PDF.
          </p>
        </div>
        <button type="button" className="btn2" onClick={onBackToWorkbench}>
          Back to Workbench
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.5fr) minmax(260px, 1fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <section className="panel">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {!cameraActive ? (
              <button type="button" className="btn" onClick={() => void startCamera()}>
                Start Camera
              </button>
            ) : (
              <>
                <button type="button" className="btn" onClick={() => void handleCaptureFrame()}>
                  Capture Frame
                </button>
                <button type="button" className="btn2" onClick={stopCamera}>
                  Stop Camera
                </button>
              </>
            )}
            <label className="btn2" style={{ cursor: 'pointer' }}>
              Upload / Take Photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => {
                  void handleUploadPhoto(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {cameraError && (
            <div role="alert" className="alert" style={{ marginBottom: 12 }}>
              {cameraError}
            </div>
          )}

          {cameraActive && (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={{ width: '100%', borderRadius: 8, background: '#000', marginBottom: 12 }}
            />
          )}

          {capturedUrl && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginBottom: 8,
                  fontSize: 12,
                }}
              >
                <span>Drag the 4 corner handles to adjust perspective crop:</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    aria-label="Scan filter"
                    value={filterMode}
                    onChange={(e) => setFilterMode(e.target.value as ScanFilterMode)}
                  >
                    <option value="bw">Black &amp; White</option>
                    <option value="grayscale">Grayscale</option>
                    <option value="color">Color</option>
                  </select>
                  <button
                    type="button"
                    className="btn2"
                    onClick={() => setCorners(DEFAULT_CORNERS)}
                  >
                    Reset Corners
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void handleApplyAndAddPage()}
                  >
                    {busy ? 'Processing...' : 'Crop & Add Page'}
                  </button>
                </div>
              </div>

              <div
                ref={cropStageRef}
                onPointerMove={(e) => handleCornerMove(e.clientX, e.clientY)}
                onPointerUp={() => setDraggingCorner(null)}
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  maxWidth: '100%',
                  touchAction: 'none',
                  userSelect: 'none',
                }}
              >
                <img
                  src={capturedUrl}
                  alt="Captured document"
                  draggable={false}
                  style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
                />
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
                  <polygon
                    points={`${corners.tl.x * 100},${corners.tl.y * 100} ${corners.tr.x * 100},${corners.tr.y * 100} ${corners.br.x * 100},${corners.br.y * 100} ${corners.bl.x * 100},${corners.bl.y * 100}`}
                    fill="#6BFFB022"
                    stroke="#6BFFB0"
                    strokeWidth="0.8"
                  />
                </svg>
                {cornerList.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-label={`${c.label} corner handle`}
                    onPointerDown={() => setDraggingCorner(c.key)}
                    style={{
                      position: 'absolute',
                      left: `${c.pt.x * 100}%`,
                      top: `${c.pt.y * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      border: '2px solid #0C0E0D',
                      background: '#6BFFB0',
                      cursor: 'grab',
                      padding: 0,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {!cameraActive && !capturedUrl && (
            <div className="muted" style={{ padding: 32, textAlign: 'center', fontSize: 13 }}>
              Start your camera or upload a photo of a document to begin scanning.
            </div>
          )}
        </section>

        <aside className="panel">
          <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Scanned Pages ({pages.length})</h3>
          {pages.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              No pages added yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pages.map((p, idx) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: 6,
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                  }}
                >
                  <img
                    src={p.previewUrl}
                    alt={`Scanned page ${idx + 1}`}
                    style={{ width: 48, height: 62, objectFit: 'cover', borderRadius: 4 }}
                  />
                  <span className="mono" style={{ flex: 1, fontSize: 12 }}>
                    Page {idx + 1}
                  </span>
                  <button
                    type="button"
                    className="btn2"
                    disabled={idx === 0}
                    onClick={() => movePage(idx, -1)}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="btn2"
                    disabled={idx === pages.length - 1}
                    onClick={() => movePage(idx, 1)}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="btn2"
                    onClick={() => {
                      URL.revokeObjectURL(p.previewUrl);
                      setPages((prev) => prev.filter((item) => item.id !== p.id));
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void handleExportPdf(false)}
              >
                Export PDF ({pages.length} page(s))
              </button>
              <button
                type="button"
                className="btn2"
                disabled={busy}
                onClick={() => void handleExportPdf(true)}
              >
                Open in Workbench
              </button>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
