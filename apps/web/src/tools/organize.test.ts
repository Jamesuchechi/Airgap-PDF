import { type Asset, assertToolInvariants } from '@airgap-pdf/core';
import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { cantooPdfEngine } from '../engines/cantooPdfLib.js';
import { deletePagesTool } from './delete-pages.js';
import { extractTool } from './extract.js';
import { insertBlankTool } from './insert-blank.js';
import { interleaveTool } from './interleave.js';
import { mergeTool } from './merge.js';
import { reorderTool } from './reorder.js';
import { splitTool } from './split.js';

async function makePdf(pages: number, name = 'doc.pdf'): Promise<Asset> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([300 + i * 10, 400]);
  const bytes = await doc.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/pdf' });
  return {
    id: crypto.randomUUID(),
    name,
    stem: name.replace(/\.pdf$/, ''),
    mime: 'application/pdf',
    size: blob.size,
    blob,
  };
}

describe('Organize tools', () => {
  it('mergeTool combines multiple PDFs in order', async () => {
    const a = await makePdf(2, 'a.pdf');
    const b = await makePdf(3, 'b.pdf');
    const outputs = await assertToolInvariants({
      tool: mergeTool,
      inputs: [a, b],
      validOptions: { outputName: 'combined.pdf' },
      pdf: cantooPdfEngine,
    });
    const merged = await cantooPdfEngine.open(outputs[0]!);
    expect(merged.pageCount).toBe(5);
  });

  it('splitTool splits every N pages', async () => {
    const doc = await makePdf(5);
    const outputs = await assertToolInvariants({
      tool: splitTool,
      inputs: [doc],
      validOptions: { mode: 'every', everyN: 2, rangesText: '1-2' },
      pdf: cantooPdfEngine,
    });
    expect(outputs).toHaveLength(3);
    expect((await cantooPdfEngine.open(outputs[0]!)).pageCount).toBe(2);
    expect((await cantooPdfEngine.open(outputs[2]!)).pageCount).toBe(1);
  });

  it('extractTool and deletePagesTool produce complementary page counts', async () => {
    const doc = await makePdf(4);
    const extracted = await assertToolInvariants({
      tool: extractTool,
      inputs: [doc],
      validOptions: { pages: '2-3' },
      pdf: cantooPdfEngine,
    });
    expect((await cantooPdfEngine.open(extracted[0]!)).pageCount).toBe(2);

    const deleted = await assertToolInvariants({
      tool: deletePagesTool,
      inputs: [doc],
      validOptions: { pages: '2-3' },
      pdf: cantooPdfEngine,
    });
    expect((await cantooPdfEngine.open(deleted[0]!)).pageCount).toBe(2);
  });

  it('reorderTool reorders, duplicates, and rotates pages', async () => {
    const doc = await makePdf(3);
    const outputs = await assertToolInvariants({
      tool: reorderTool,
      inputs: [doc],
      validOptions: {
        sequence: [
          { sourceIndex: 2, rotateBy: 90 },
          { sourceIndex: 0, rotateBy: 0 },
          { sourceIndex: 0, rotateBy: 180 },
        ],
      },
      pdf: cantooPdfEngine,
    });
    const outDoc = await cantooPdfEngine.open(outputs[0]!);
    expect(outDoc.pageCount).toBe(3);
    expect(outDoc.page(0).rotation).toBe(90);
    expect(outDoc.page(2).rotation).toBe(180);
  });

  it('insertBlankTool inserts blank pages', async () => {
    const doc = await makePdf(2);
    const outputs = await assertToolInvariants({
      tool: insertBlankTool,
      inputs: [doc],
      validOptions: { afterPage: 1, count: 2 },
      pdf: cantooPdfEngine,
    });
    expect((await cantooPdfEngine.open(outputs[0]!)).pageCount).toBe(4);
  });

  it('interleaveTool alternates odd and even scans', async () => {
    const odd = await makePdf(2, 'odd.pdf');
    const even = await makePdf(2, 'even.pdf');
    const outputs = await assertToolInvariants({
      tool: interleaveTool,
      inputs: [odd, even],
      validOptions: { reverseSecond: true },
      pdf: cantooPdfEngine,
    });
    expect((await cantooPdfEngine.open(outputs[0]!)).pageCount).toBe(4);
  });
});
