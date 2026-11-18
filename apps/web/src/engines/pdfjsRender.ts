import {
  AirgapError,
  type Asset,
  DEFAULT_LIMITS,
  type RenderEngine,
  type RenderedPage,
} from '@airgap-pdf/core';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createCspWorker } from '../workers/createWorker.js';

let workerInitialized = false;

function ensurePdfjsWorker(): void {
  if (workerInitialized) return;
  if (typeof Worker !== 'undefined' && typeof document !== 'undefined') {
    // Route PDF.js's own worker through our 1-line blob: import shim so it inherits <meta> CSP.
    pdfjsLib.GlobalWorkerOptions.workerPort = createCspWorker(pdfjsWorkerUrl);
  }
  workerInitialized = true;
}

function getAssetBase(): string {
  if (typeof document !== 'undefined') {
    return new URL('./pdfjs/', document.baseURI).href;
  }
  return './pdfjs/';
}

export const pdfjsRenderEngine: RenderEngine = {
  id: 'pdfjs-dist',

  async getPageCount(asset: Asset, opts?: { password?: string }): Promise<number> {
    ensurePdfjsWorker();
    const data = new Uint8Array(await asset.blob.arrayBuffer());
    const base = getAssetBase();
    const task = pdfjsLib.getDocument({
      data,
      password: opts?.password,
      useSystemFonts: false,
      cMapUrl: `${base}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${base}standard_fonts/`,
    });
    try {
      const doc = await task.promise;
      return doc.numPages;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/password/i.test(msg)) {
        throw new AirgapError(
          'PasswordRequired',
          msg,
          'This PDF requires a password.',
          'Enter password',
        );
      }
      throw new AirgapError('CorruptPdf', msg, 'Could not render this PDF.');
    } finally {
      await task.destroy();
    }
  },

  async renderPage(
    asset: Asset,
    pageIndex: number,
    opts?: { dpi?: number; maxPixels?: number; password?: string },
  ): Promise<RenderedPage> {
    ensurePdfjsWorker();
    const data = new Uint8Array(await asset.blob.arrayBuffer());
    const base = getAssetBase();
    const task = pdfjsLib.getDocument({
      data,
      password: opts?.password,
      useSystemFonts: false,
      cMapUrl: `${base}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${base}standard_fonts/`,
    });
    try {
      const doc = await task.promise;
      const page = await doc.getPage(pageIndex + 1);
      const dpi = Math.min(opts?.dpi ?? 108, DEFAULT_LIMITS.maxRenderDpi);
      let scale = dpi / 72;
      let viewport = page.getViewport({ scale });
      const maxPixels = opts?.maxPixels ?? DEFAULT_LIMITS.maxCanvasPixels;
      const pixels = viewport.width * viewport.height;
      if (pixels > maxPixels) {
        scale *= Math.sqrt(maxPixels / pixels);
        viewport = page.getViewport({ scale });
      }

      const width = Math.max(1, Math.floor(viewport.width));
      const height = Math.max(1, Math.floor(viewport.height));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new AirgapError(
          'EngineUnavailable',
          'No 2D canvas context',
          'Canvas rendering is unavailable.',
        );
      }
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
      });
      // Release Safari canvas backing memory eagerly
      canvas.width = 1;
      canvas.height = 1;
      return { pageIndex, width, height, blob };
    } finally {
      await task.destroy();
    }
  },

  async extractText(
    asset: Asset,
    pageIndex: number,
    opts?: { password?: string },
  ): Promise<string> {
    ensurePdfjsWorker();
    const data = new Uint8Array(await asset.blob.arrayBuffer());
    const base = getAssetBase();
    const task = pdfjsLib.getDocument({
      data,
      password: opts?.password,
      useSystemFonts: false,
      cMapUrl: `${base}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${base}standard_fonts/`,
    });
    try {
      const doc = await task.promise;
      const page = await doc.getPage(pageIndex + 1);
      const content = await page.getTextContent();
      return content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .trim();
    } finally {
      await task.destroy();
    }
  },
};
