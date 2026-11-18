import { type Asset, assertToolInvariants } from '@airgap-pdf/core';
import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { cantooPdfEngine } from '../engines/cantooPdfLib.js';
import { annotateTool } from './annotate.js';
import { batesTool } from './bates.js';
import { cropResizeTool } from './crop-resize.js';
import { formFillTool } from './form-fill.js';
import { metadataTool } from './metadata.js';
import { pageNumbersTool } from './page-numbers.js';
import { watermarkTool } from './watermark.js';

// 1x1 transparent PNG data URL
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function makePdf(pages = 2, name = 'doc.pdf'): Promise<Asset> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([400, 600]);
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

async function makeFormPdf(): Promise<Asset> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 600]);
  const form = doc.getForm();
  const nameField = form.createTextField('fullName');
  nameField.addToPage(page, { x: 50, y: 500, width: 200, height: 30 });
  const agreeBox = form.createCheckBox('agree');
  agreeBox.addToPage(page, { x: 50, y: 450, width: 20, height: 20 });
  const bytes = await doc.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/pdf' });
  return {
    id: crypto.randomUUID(),
    name: 'form.pdf',
    stem: 'form',
    mime: 'application/pdf',
    size: blob.size,
    blob,
  };
}

describe('M4 Edit & Sign tools', () => {
  it('watermarkTool stamps single and tiled watermarks', async () => {
    const doc = await makePdf(2);
    await assertToolInvariants({
      tool: watermarkTool,
      inputs: [doc],
      validOptions: {
        text: 'DRAFT',
        opacity: 0.2,
        angle: 35,
        tile: true,
        fontSize: 36,
        colorHex: '#333333',
        pages: 'all',
      },
      pdf: cantooPdfEngine,
    });
  });

  it('pageNumbersTool and batesTool stamp sequential numbers', async () => {
    const doc = await makePdf(2);
    await assertToolInvariants({
      tool: pageNumbersTool,
      inputs: [doc],
      validOptions: {
        template: 'Page {n}/{total}',
        position: 'bottom-center',
        fontSize: 11,
        startAt: 1,
        pages: 'all',
      },
      pdf: cantooPdfEngine,
    });
    await assertToolInvariants({
      tool: batesTool,
      inputs: [doc],
      validOptions: {
        prefix: 'EX-',
        start: 10,
        digits: 4,
        position: 'bottom-right',
        continuous: true,
      },
      pdf: cantooPdfEngine,
    });
  });

  it('cropResizeTool resizes pages to A4', async () => {
    const doc = await makePdf(1);
    const outs = await assertToolInvariants({
      tool: cropResizeTool,
      inputs: [doc],
      validOptions: { mode: 'resize', paperSize: 'a4', marginPt: 36, pages: 'all' },
      pdf: cantooPdfEngine,
    });
    const outDoc = await cantooPdfEngine.open(outs[0]!);
    expect(Math.round(outDoc.page(0).width)).toBe(595);
  });

  it('metadataTool updates Info dict metadata', async () => {
    const doc = await makePdf(1);
    const outs = await assertToolInvariants({
      tool: metadataTool,
      inputs: [doc],
      validOptions: {
        title: 'Contract',
        author: 'Ada',
        subject: 'NDA',
        keywords: 'legal,nda',
        creator: 'Airgap',
        producer: 'Airgap',
      },
      pdf: cantooPdfEngine,
    });
    const opened = await cantooPdfEngine.open(outs[0]!);
    expect(opened.getMetadata().title).toBe('Contract');
    expect(opened.getMetadata().author).toBe('Ada');
  });

  it('annotateTool flattens typed text, highlights, freehand, and signatures', async () => {
    const doc = await makePdf(1);
    await assertToolInvariants({
      tool: annotateTool,
      inputs: [doc],
      validOptions: {
        operations: [
          {
            kind: 'text',
            pageIndex: 0,
            text: 'Signed by Ada',
            xPct: 0.1,
            yPct: 0.2,
            fontSize: 14,
            colorHex: '#111111',
          },
          {
            kind: 'rect',
            pageIndex: 0,
            xPct: 0.1,
            yPct: 0.3,
            widthPct: 0.3,
            heightPct: 0.04,
            colorHex: '#ffd54f',
            opacity: 0.35,
            filled: true,
          },
          {
            kind: 'freehand',
            pageIndex: 0,
            points: [
              { xPct: 0.1, yPct: 0.5 },
              { xPct: 0.2, yPct: 0.55 },
            ],
            colorHex: '#111111',
            strokeWidth: 2,
          },
          { kind: 'image', pageIndex: 0, dataUrl: TINY_PNG, xPct: 0.1, yPct: 0.7, widthPct: 0.2 },
        ],
      },
      pdf: cantooPdfEngine,
    });
  });

  it('formFillTool fills and flattens AcroForm fields', async () => {
    const formPdf = await makeFormPdf();
    const opened = await cantooPdfEngine.open(formPdf);
    expect(opened.getFormFields()).toHaveLength(2);

    const outs = await assertToolInvariants({
      tool: formFillTool,
      inputs: [formPdf],
      validOptions: { values: { fullName: 'Ada Lovelace', agree: true }, flatten: true },
      pdf: cantooPdfEngine,
    });
    const flattened = await cantooPdfEngine.open(outs[0]!);
    expect(flattened.getFormFields()).toHaveLength(0);
  });
});
