import { PDFDocument, rgb, StandardFonts } from '@cantoo/pdf-lib';
import type { DiffLine } from './myersDiff.js';

export interface CompareReportInput {
  nameA: string;
  nameB: string;
  diffLines: DiffLine[];
  visualPctChanged: number | null;
}

/**
 * Generate a multi-page PDF Compare Report highlighting inserted, deleted, and moved lines.
 */
export async function exportCompareReportPdf(input: CompareReportInput): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageW = 595;
  const pageH = 842;
  const margin = 44;
  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;

  const inserts = input.diffLines.filter((l) => l.op === 'insert').length;
  const deletes = input.diffLines.filter((l) => l.op === 'delete').length;
  const moves = input.diffLines.filter((l) => l.op === 'move').length;

  page.drawText('Airgap PDF — Compare Report', {
    x: margin,
    y,
    size: 18,
    font: bold,
    color: rgb(0.08, 0.1, 0.09),
  });
  y -= 22;

  page.drawText(`Document A: ${input.nameA}`, { x: margin, y, size: 10, font });
  y -= 14;
  page.drawText(`Document B: ${input.nameB}`, { x: margin, y, size: 10, font });
  y -= 16;

  const summary = `Summary: +${inserts} inserted · -${deletes} deleted · ~${moves} moved${
    input.visualPctChanged !== null ? ` · ${input.visualPctChanged.toFixed(2)}% visual diff` : ''
  }`;
  page.drawText(summary, { x: margin, y, size: 11, font: bold });
  y -= 24;

  const changed = input.diffLines.filter((l) => l.op !== 'equal');
  if (changed.length === 0) {
    page.drawText('No text differences detected.', { x: margin, y, size: 11, font });
  } else {
    for (const line of changed) {
      if (y < margin + 20) {
        page = doc.addPage([pageW, pageH]);
        y = pageH - margin;
      }
      const prefix =
        line.op === 'insert'
          ? `+ [B p.${(line.bPage ?? 0) + 1}] `
          : line.op === 'delete'
            ? `- [A p.${(line.aPage ?? 0) + 1}] `
            : `~ [moved] `;
      const color =
        line.op === 'insert'
          ? rgb(0.05, 0.55, 0.25)
          : line.op === 'delete'
            ? rgb(0.75, 0.12, 0.18)
            : rgb(0.72, 0.44, 0.04);

      const safeText = `${prefix}${line.text}`.slice(0, 92).replace(/[^\x20-\x7E]/g, '?');
      page.drawText(safeText, { x: margin, y, size: 9.5, font, color });
      y -= 13;
    }
  }

  const saved = await doc.save({ useObjectStreams: true });
  const copy = new Uint8Array(saved.byteLength);
  copy.set(saved);
  return new Blob([copy], { type: 'application/pdf' });
}
