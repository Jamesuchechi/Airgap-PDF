import { PDFDocument } from '@cantoo/pdf-lib';

export interface CornerPoint {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

export interface QuadCorners {
  tl: CornerPoint;
  tr: CornerPoint;
  br: CornerPoint;
  bl: CornerPoint;
}

export type ScanFilterMode = 'color' | 'grayscale' | 'bw';

export const DEFAULT_CORNERS: QuadCorners = {
  tl: { x: 0.06, y: 0.06 },
  tr: { x: 0.94, y: 0.06 },
  br: { x: 0.94, y: 0.94 },
  bl: { x: 0.06, y: 0.94 },
};

/**
 * Heuristic Sobel-based document quadrilateral corner detector.
 * Falls back to DEFAULT_CORNERS when no clear rectangular boundary is found.
 */
export function detectDocumentCorners(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): QuadCorners {
  if (width < 16 || height < 16) return DEFAULT_CORNERS;

  const luma = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    luma[i] =
      0.299 * (rgba[idx] ?? 0) + 0.587 * (rgba[idx + 1] ?? 0) + 0.114 * (rgba[idx + 2] ?? 0);
  }

  let bestTl = { score: Number.POSITIVE_INFINITY, x: 0.06, y: 0.06 };
  let bestTr = { score: Number.POSITIVE_INFINITY, x: 0.94, y: 0.06 };
  let bestBr = { score: Number.POSITIVE_INFINITY, x: 0.94, y: 0.94 };
  let bestBl = { score: Number.POSITIVE_INFINITY, x: 0.06, y: 0.94 };
  let edgeHits = 0;

  const step = Math.max(1, Math.floor(Math.min(width, height) / 160));
  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const gx = (luma[y * width + x + 1] ?? 0) - (luma[y * width + x - 1] ?? 0);
      const gy = (luma[(y + 1) * width + x] ?? 0) - (luma[(y - 1) * width + x] ?? 0);
      const mag = Math.hypot(gx, gy);
      if (mag < 42) continue;
      edgeHits++;

      const nx = x / width;
      const ny = y / height;

      const dTl = nx + ny;
      const dTr = 1 - nx + ny;
      const dBr = 1 - nx + (1 - ny);
      const dBl = nx + (1 - ny);

      if (dTl < bestTl.score) bestTl = { score: dTl, x: nx, y: ny };
      if (dTr < bestTr.score) bestTr = { score: dTr, x: nx, y: ny };
      if (dBr < bestBr.score) bestBr = { score: dBr, x: nx, y: ny };
      if (dBl < bestBl.score) bestBl = { score: dBl, x: nx, y: ny };
    }
  }

  if (edgeHits < 20) return DEFAULT_CORNERS;

  const spanX = Math.min(bestTr.x, bestBr.x) - Math.max(bestTl.x, bestBl.x);
  const spanY = Math.min(bestBl.y, bestBr.y) - Math.max(bestTl.y, bestTr.y);
  if (spanX < 0.25 || spanY < 0.25) return DEFAULT_CORNERS;

  return {
    tl: { x: bestTl.x, y: bestTl.y },
    tr: { x: bestTr.x, y: bestTr.y },
    br: { x: bestBr.x, y: bestBr.y },
    bl: { x: bestBl.x, y: bestBl.y },
  };
}

/**
 * Solve an 8x8 linear system to compute the 3x3 homography mapping destination
 * rectangle [0..dstW, 0..dstH] -> source quadrilateral in pixel coordinates.
 */
export function computeInverseHomography(
  corners: QuadCorners,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float64Array {
  const dstPts: Array<[number, number]> = [
    [0, 0],
    [dstW, 0],
    [dstW, dstH],
    [0, dstH],
  ];
  const srcPts: Array<[number, number]> = [
    [corners.tl.x * srcW, corners.tl.y * srcH],
    [corners.tr.x * srcW, corners.tr.y * srcH],
    [corners.br.x * srcW, corners.br.y * srcH],
    [corners.bl.x * srcW, corners.bl.y * srcH],
  ];

  // Build 8x9 augmented matrix
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [dx, dy] = dstPts[i] ?? [0, 0];
    const [sx, sy] = srcPts[i] ?? [0, 0];
    a.push([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy, sx]);
    a.push([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy, sy]);
  }

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(a[row]?.[col] ?? 0) > Math.abs(a[pivot]?.[col] ?? 0)) {
        pivot = row;
      }
    }
    const tmp = a[col];
    const pRow = a[pivot];
    if (tmp && pRow) {
      a[col] = pRow;
      a[pivot] = tmp;
    }
    const diag = a[col]?.[col] ?? 1;
    if (Math.abs(diag) < 1e-10) continue;
    for (let j = col; j < 9; j++) {
      const row = a[col];
      if (row) row[j] = (row[j] ?? 0) / diag;
    }
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const factor = a[row]?.[col] ?? 0;
      for (let j = col; j < 9; j++) {
        const r = a[row];
        const c = a[col];
        if (r && c) r[j] = (r[j] ?? 0) - factor * (c[j] ?? 0);
      }
    }
  }

  return new Float64Array([
    a[0]?.[8] ?? 1,
    a[1]?.[8] ?? 0,
    a[2]?.[8] ?? 0,
    a[3]?.[8] ?? 0,
    a[4]?.[8] ?? 1,
    a[5]?.[8] ?? 0,
    a[6]?.[8] ?? 0,
    a[7]?.[8] ?? 0,
    1,
  ]);
}

/**
 * Perspective-warp an RGBA image buffer using bilinear interpolation.
 */
export function warpPerspective(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  corners: QuadCorners,
  dstW: number,
  dstH: number,
): Uint8ClampedArray {
  const h = computeInverseHomography(corners, srcW, srcH, dstW, dstH);
  const dst = new Uint8ClampedArray(dstW * dstH * 4);

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const denom = (h[6] ?? 0) * x + (h[7] ?? 0) * y + (h[8] ?? 1);
      const sx = ((h[0] ?? 0) * x + (h[1] ?? 0) * y + (h[2] ?? 0)) / denom;
      const sy = ((h[3] ?? 0) * x + (h[4] ?? 0) * y + (h[5] ?? 0)) / denom;

      const outIdx = (y * dstW + x) * 4;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= srcW - 1 || y0 >= srcH - 1) {
        dst[outIdx] = 255;
        dst[outIdx + 1] = 255;
        dst[outIdx + 2] = 255;
        dst[outIdx + 3] = 255;
        continue;
      }

      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * srcW + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + srcW * 4;
      const i11 = i01 + 4;

      for (let c = 0; c < 3; c++) {
        const v00 = src[i00 + c] ?? 255;
        const v10 = src[i10 + c] ?? 255;
        const v01 = src[i01 + c] ?? 255;
        const v11 = src[i11 + c] ?? 255;
        const top = v00 + fx * (v10 - v00);
        const bot = v01 + fx * (v11 - v01);
        dst[outIdx + c] = Math.round(top + fy * (bot - top));
      }
      dst[outIdx + 3] = 255;
    }
  }

  return dst;
}

/**
 * Apply color, grayscale, or high-contrast B/W document filter in-place.
 */
export function applyScanFilter(data: Uint8ClampedArray, mode: ScanFilterMode): Uint8ClampedArray {
  if (mode === 'color') return data;
  const pixels = data.length / 4;
  for (let i = 0; i < pixels; i++) {
    const idx = i * 4;
    const luma =
      0.299 * (data[idx] ?? 0) + 0.587 * (data[idx + 1] ?? 0) + 0.114 * (data[idx + 2] ?? 0);
    let out: number;
    if (mode === 'bw') {
      out = luma >= 138 ? 255 : 0;
    } else {
      out = Math.max(0, Math.min(255, Math.round((luma - 128) * 1.25 + 128)));
    }
    data[idx] = out;
    data[idx + 1] = out;
    data[idx + 2] = out;
  }
  return data;
}

/**
 * Export an array of PNG/JPEG page blobs into a single multi-page PDF.
 */
export async function exportScannedPagesToPdf(
  pages: Array<{ bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' }>,
): Promise<Blob> {
  const doc = await PDFDocument.create();
  for (const p of pages) {
    const img = p.mime === 'image/jpeg' ? await doc.embedJpg(p.bytes) : await doc.embedPng(p.bytes);
    const page = doc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  const saved = await doc.save({ useObjectStreams: true });
  const copy = new Uint8Array(saved.byteLength);
  copy.set(saved);
  return new Blob([copy], { type: 'application/pdf' });
}
