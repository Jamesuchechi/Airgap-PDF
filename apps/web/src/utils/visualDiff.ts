export interface BufferDiffResult {
  diffPixels: number;
  totalPixels: number;
  pctChanged: number;
  overlay: Uint8ClampedArray;
}

/**
 * Perceptual YIQ pixel-by-pixel comparison (pixelmatch-compatible) on aligned RGBA buffers.
 * Highlights differing pixels in bright magenta-red (#FF2D55) over dimmed background.
 */
export function diffRgbaBuffers(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 0.1,
): BufferDiffResult {
  const totalPixels = width * height;
  const overlay = new Uint8ClampedArray(totalPixels * 4);
  const maxDelta = 35215 * threshold * threshold;
  let diffPixels = 0;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const r1 = a[idx] ?? 255;
    const g1 = a[idx + 1] ?? 255;
    const b1 = a[idx + 2] ?? 255;
    const r2 = b[idx] ?? 255;
    const g2 = b[idx + 1] ?? 255;
    const b2 = b[idx + 2] ?? 255;

    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;

    if (dr === 0 && dg === 0 && db === 0) {
      const gray = Math.round((0.299 * r1 + 0.587 * g1 + 0.114 * b1) * 0.35 + 165);
      overlay[idx] = gray;
      overlay[idx + 1] = gray;
      overlay[idx + 2] = gray;
      overlay[idx + 3] = 255;
      continue;
    }

    const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
    const iq = dr * 0.59597799 - dg * 0.2741761 - db * 0.32180189;
    const qv = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;
    const delta = 0.5053 * y * y + 0.299 * iq * iq + 0.1957 * qv * qv;

    if (delta > maxDelta) {
      diffPixels++;
      overlay[idx] = 255;
      overlay[idx + 1] = 45;
      overlay[idx + 2] = 85;
      overlay[idx + 3] = 255;
    } else {
      const gray = Math.round((0.299 * r1 + 0.587 * g1 + 0.114 * b1) * 0.35 + 165);
      overlay[idx] = gray;
      overlay[idx + 1] = gray;
      overlay[idx + 2] = gray;
      overlay[idx + 3] = 255;
    }
  }

  return {
    diffPixels,
    totalPixels,
    pctChanged: totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0,
    overlay,
  };
}

export interface PageVisualDiff {
  width: number;
  height: number;
  diffPixels: number;
  totalPixels: number;
  pctChanged: number;
  overlayBlob: Blob;
}

async function blobToRgba(
  blob: Blob,
  targetW: number,
  targetH: number,
): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, targetW, targetH).data;
  } finally {
    bitmap.close();
  }
}

export async function computeVisualDiffFromBlobs(
  blobA: Blob,
  blobB: Blob,
  threshold = 0.1,
): Promise<PageVisualDiff> {
  const bmpA = await createImageBitmap(blobA);
  const bmpB = await createImageBitmap(blobB);
  const width = Math.max(bmpA.width, bmpB.width);
  const height = Math.max(bmpA.height, bmpB.height);
  bmpA.close();
  bmpB.close();

  const bufA = await blobToRgba(blobA, width, height);
  const bufB = await blobToRgba(blobB, width, height);
  const res = diffRgbaBuffers(bufA, bufB, width, height, threshold);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');
  const imgData = new ImageData(new Uint8ClampedArray(res.overlay), width, height);
  ctx.putImageData(imgData, 0, 0);
  const overlayBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });

  return {
    width,
    height,
    diffPixels: res.diffPixels,
    totalPixels: res.totalPixels,
    pctChanged: res.pctChanged,
    overlayBlob,
  };
}
