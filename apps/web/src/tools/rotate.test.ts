import { type Asset, assertToolInvariants } from '@airgap-pdf/core';
import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { cantooPdfEngine } from '../engines/cantooPdfLib.js';
import { rotateTool } from './rotate.js';

async function makeTestPdf(pages = 3): Promise<Asset> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([300, 400]);
  const bytes = await doc.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/pdf' });
  return {
    id: 'test-id',
    name: 'test.pdf',
    stem: 'test',
    mime: 'application/pdf',
    size: blob.size,
    blob,
  };
}

describe('rotateTool invariants', () => {
  it('passes universal tool harness invariants and rotates only selected pages', async () => {
    const input = await makeTestPdf(3);
    const outputs = await assertToolInvariants({
      tool: rotateTool,
      inputs: [input],
      validOptions: { degrees: 90, pages: '1,3' },
      invalidOptions: { degrees: 45, pages: '1' },
      pdf: cantooPdfEngine,
    });

    const first = outputs[0];
    expect(first).toBeDefined();
    if (!first) return;

    const outDoc = await cantooPdfEngine.open(first);
    expect(outDoc.pageCount).toBe(3);
    expect(outDoc.page(0).rotation).toBe(90);
    expect(outDoc.page(1).rotation).toBe(0);
    expect(outDoc.page(2).rotation).toBe(90);
  });
});
