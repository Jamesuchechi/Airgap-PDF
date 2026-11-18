import type { BlobLike } from '@airgap-pdf/core';

export interface PreOcrOptions {
  grayscale: boolean;
  contrast: number;
  despeckle: boolean;
}

export const DEFAULT_PRE_OCR: PreOcrOptions = {
  grayscale: true,
  contrast: 1.35,
  despeckle: true,
};

/**
 * Apply grayscale conversion, linear contrast stretching around midpoint 128,
 * and a 3x3 median despeckle filter on an RGBA pixel buffer in-place.
 */
export function applyPixelCleanup(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: PreOcrOptions,
): Uint8ClampedArray {
  const factor = Math.max(0.5, Math.min(3, opts.contrast));
  const total = width * height;

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    let r = data[idx] ?? 0;
    let g = data[idx + 1] ?? 0;
    let b = data[idx + 2] ?? 0;

    if (opts.grayscale) {
      const luma = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      r = luma;
      g = luma;
      b = luma;
    }

    if (factor !== 1) {
      r = clampByte((r - 128) * factor + 128);
      g = clampByte((g - 128) * factor + 128);
      b = clampByte((b - 128) * factor + 128);
    }

    data[idx] = r;
    data[idx + 1] = g;
    data[idx + 2] = b;
  }

  if (opts.despeckle && width >= 3 && height >= 3) {
    const src = new Uint8ClampedArray(data);
    const windowVals = new Uint8Array(9);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) {
          let k = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              windowVals[k++] = src[((y + dy) * width + (x + dx)) * 4 + c] ?? 0;
            }
          }
          windowVals.sort();
          data[(y * width + x) * 4 + c] = windowVals[4] ?? 0;
        }
      }
    }
  }

  return data;
}

function clampByte(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return Math.round(v);
}

/**
 * Decode a rendered page image Blob and apply pre-OCR contrast/grayscale/despeckle cleanup.
 */
export async function cleanupPageBlob(input: BlobLike, opts: PreOcrOptions): Promise<Blob> {
  const blob =
    input instanceof Blob
      ? input
      : new Blob([await input.arrayBuffer()], { type: input.type || 'image/png' });
  if (!opts.grayscale && opts.contrast === 1 && !opts.despeckle) {
    return blob;
  }
  const bitmap = await createImageBitmap(blob);
  try {
    const { width, height } = bitmap;
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return blob;
      ctx.drawImage(bitmap, 0, 0);
      const imgData = ctx.getImageData(0, 0, width, height);
      applyPixelCleanup(imgData.data, width, height, opts);
      ctx.putImageData(imgData, 0, 0);
      return await canvas.convertToBlob({ type: 'image/png' });
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0);
    const imgData = ctx.getImageData(0, 0, width, height);
    applyPixelCleanup(imgData.data, width, height, opts);
    ctx.putImageData(imgData, 0, 0);
    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((out) => resolve(out ?? blob), 'image/png');
    });
  } finally {
    bitmap.close();
  }
}
