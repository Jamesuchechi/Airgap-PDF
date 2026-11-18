import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { exportCompareReportPdf } from './compareReport.js';
import { computeMyersDiff } from './myersDiff.js';
import {
  applyScanFilter,
  DEFAULT_CORNERS,
  detectDocumentCorners,
  warpPerspective,
} from './scanner.js';
import { diffRgbaBuffers } from './visualDiff.js';

describe('M8 Compare + Scan', () => {
  it('computes Myers text diff with insert, delete, equal, and move ops', () => {
    const a = [
      { pageIndex: 0, text: 'Header\nRemoved line\nMoved clause' },
      { pageIndex: 1, text: 'Footer' },
    ];
    const b = [
      { pageIndex: 0, text: 'Header\nAdded line' },
      { pageIndex: 1, text: 'Moved clause\nFooter' },
    ];
    const diff = computeMyersDiff(a, b);
    expect(diff.some((d) => d.op === 'equal' && d.text === 'Header')).toBe(true);
    expect(diff.some((d) => d.op === 'delete' && d.text === 'Removed line')).toBe(true);
    expect(diff.some((d) => d.op === 'insert' && d.text === 'Added line')).toBe(true);
    expect(diff.some((d) => d.op === 'move' && d.text === 'Moved clause')).toBe(true);
  });

  it('computes YIQ visual pixel diff and highlights changed pixels', () => {
    const w = 4;
    const h = 4;
    const a = new Uint8ClampedArray(w * h * 4).fill(255);
    const b = new Uint8ClampedArray(w * h * 4).fill(255);
    // Change pixel (1,1) to black in B
    const idx = (1 * w + 1) * 4;
    b[idx] = 0;
    b[idx + 1] = 0;
    b[idx + 2] = 0;

    const res = diffRgbaBuffers(a, b, w, h, 0.1);
    expect(res.diffPixels).toBe(1);
    expect(res.totalPixels).toBe(16);
    expect(res.overlay[idx]).toBe(255);
    expect(res.overlay[idx + 1]).toBe(45);
    expect(res.overlay[idx + 2]).toBe(85);
  });

  it('exports a valid PDF Compare Report', async () => {
    const blob = await exportCompareReportPdf({
      nameA: 'v1.pdf',
      nameB: 'v2.pdf',
      diffLines: [
        { op: 'equal', text: 'Same', aPage: 0, bPage: 0 },
        { op: 'insert', text: 'New clause', bPage: 0 },
        { op: 'delete', text: 'Old clause', aPage: 0 },
      ],
      visualPctChanged: 2.5,
    });
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPageCount()).toBe(1);
  });

  it('detects document corners, warps perspective, and applies B/W filter', () => {
    const w = 40;
    const h = 40;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inside = x >= 6 && x <= 33 && y >= 6 && y <= 33;
        const val = inside ? 245 : 20;
        const idx = (y * w + x) * 4;
        rgba[idx] = val;
        rgba[idx + 1] = val;
        rgba[idx + 2] = val;
        rgba[idx + 3] = 255;
      }
    }

    const corners = detectDocumentCorners(rgba, w, h);
    expect(corners.tl.x).toBeLessThan(0.3);
    expect(corners.br.x).toBeGreaterThan(0.7);

    const warped = warpPerspective(rgba, w, h, DEFAULT_CORNERS, 20, 20);
    expect(warped.length).toBe(20 * 20 * 4);

    applyScanFilter(warped, 'bw');
    expect(warped[0] === 0 || warped[0] === 255).toBe(true);
  });
});
