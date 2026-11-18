import { type Asset, assertToolInvariants } from '@airgap-pdf/core';
import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { cantooPdfEngine } from '../engines/cantooPdfLib.js';
import { extractPackCode, packUrl } from '../utils/ocrPacks.js';
import { applyPixelCleanup } from '../utils/preOcrCleanup.js';
import { compressTool } from './compress.js';
import { ocrOptions } from './ocr.js';

async function makeTestPdf(pages = 2): Promise<Asset> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`Page ${i + 1}`, { x: 40, y: 340, size: 16 });
  }
  const bytes = await doc.save({ useObjectStreams: false });
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/pdf' });
  return {
    id: 'test-compress-id',
    name: 'sample.pdf',
    stem: 'sample',
    mime: 'application/pdf',
    size: blob.size,
    blob,
  };
}

describe('compressTool invariants', () => {
  it('passes universal tool harness invariants and never returns a larger file', async () => {
    const input = await makeTestPdf(2);
    const outputs = await assertToolInvariants({
      tool: compressTool,
      inputs: [input],
      validOptions: { level: 'balanced' },
      invalidOptions: { level: 'ultra' },
      pdf: cantooPdfEngine,
    });

    const first = outputs[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(first.size).toBeLessThanOrEqual(input.size);
  });

  it('returns original asset when already minimal (never-make-bigger guard)', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const bytes = await doc.save({ useObjectStreams: true });
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy], { type: 'application/pdf' });
    const input: Asset = {
      id: 'tiny-id',
      name: 'tiny.pdf',
      stem: 'tiny',
      mime: 'application/pdf',
      size: blob.size,
      blob,
    };

    const outputs = await assertToolInvariants({
      tool: compressTool,
      inputs: [input],
      validOptions: { level: 'light' },
      invalidOptions: { level: 'invalid' },
      pdf: cantooPdfEngine,
    });

    expect(outputs[0]?.size).toBeLessThanOrEqual(input.size);
  });
});

describe('preOcrCleanup and ocrPacks', () => {
  it('converts RGBA pixels to grayscale, boosts contrast, and despeckles isolated noise', () => {
    // 3x3 image: dark background (40, 40, 40) with a single bright speckle at center (250, 10, 10)
    const width = 3;
    const height = 3;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = 40;
      data[i * 4 + 1] = 40;
      data[i * 4 + 2] = 40;
      data[i * 4 + 3] = 255;
    }
    const center = 4 * 4;
    data[center] = 250;
    data[center + 1] = 10;
    data[center + 2] = 10;

    applyPixelCleanup(data, width, height, {
      grayscale: true,
      contrast: 1.5,
      despeckle: true,
    });

    // Grayscale + contrast 1.5 turns 40 into (40-128)*1.5+128 = -4 -> 0
    // Median despeckle replaces the isolated center speckle with 0
    expect(data[center]).toBe(0);
    expect(data[center + 1]).toBe(0);
    expect(data[center + 2]).toBe(0);
  });

  it('extracts language pack codes and builds same-origin pack URLs', () => {
    expect(extractPackCode('eng.traineddata.gz')).toBe('eng');
    expect(extractPackCode('deu.traineddata')).toBe('deu');
    expect(packUrl('spa')).toContain('/tesseract/lang/spa.traineddata.gz');
  });

  it('validates OCR tool options schema', () => {
    const parsed = ocrOptions.parse({});
    expect(parsed).toEqual({
      lang: 'eng',
      grayscale: true,
      contrast: 1.35,
      despeckle: true,
    });
    expect(() => ocrOptions.parse({ contrast: 10 })).toThrow();
  });
});
