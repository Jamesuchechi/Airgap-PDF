import { AirgapError, defineTool, ok, pageRange, z } from '@airgap-pdf/core';

export const pageNumbersOptions = z.object({
  template: z
    .string()
    .min(1)
    .default('Page {n} of {total}')
    .describe('Template ({n}, {total}, {date}, {filename})'),
  position: z
    .enum(['bottom-center', 'bottom-right', 'bottom-left', 'top-center', 'top-right'])
    .default('bottom-center')
    .describe('Position'),
  fontSize: z.number().min(8).max(36).default(11).describe('Font size'),
  startAt: z.number().int().min(1).default(1).describe('Starting number'),
  pages: pageRange().default('all').describe('Pages'),
});

function positionCoords(pos: string): { xPct: number; yPct: number } {
  switch (pos) {
    case 'bottom-left':
      return { xPct: 0.08, yPct: 0.94 };
    case 'bottom-right':
      return { xPct: 0.76, yPct: 0.94 };
    case 'top-center':
      return { xPct: 0.42, yPct: 0.04 };
    case 'top-right':
      return { xPct: 0.76, yPct: 0.04 };
    default:
      return { xPct: 0.42, yPct: 0.94 };
  }
}

export const pageNumbersTool = defineTool({
  id: 'page-numbers',
  name: 'Page numbers',
  summary: 'Add page numbers, headers, or footers with tokens.',
  category: 'edit',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: false,
  options: pageNumbersOptions,

  async run(ctx, [input], { template, position, fontSize, startAt, pages }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    const doc = await ctx.pdf.open(input);
    const indices = doc.resolveRange(pages);
    const total = doc.pageCount;
    const today = new Date().toISOString().slice(0, 10);
    const coords = positionCoords(position);

    for (let i = 0; i < indices.length; i++) {
      if (ctx.signal.aborted) {
        throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
      }
      const idx = indices[i];
      if (idx === undefined) continue;
      const text = template
        .replaceAll('{n}', String(startAt + i))
        .replaceAll('{total}', String(total))
        .replaceAll('{date}', today)
        .replaceAll('{filename}', input.name);

      await doc.drawText(idx, {
        text,
        xPct: coords.xPct,
        yPct: coords.yPct,
        fontSize,
        colorHex: '#222222',
      });
      ctx.progress(
        0.1 + 0.75 * ((i + 1) / Math.max(1, indices.length)),
        `Numbered page ${idx + 1}`,
      );
    }

    const out = await doc.save({ name: `${input.stem}-numbered.pdf`, objectStreams: true });
    ctx.progress(1, 'Done');
    return ok([out]);
  },
});

export default pageNumbersTool;
