import { AirgapError, defineTool, ok, z } from '@airgap-pdf/core';

export const insertBlankOptions = z.object({
  afterPage: z.number().int().min(0).default(1).describe('Insert after page (0 = at start)'),
  count: z.number().int().min(1).max(50).default(1).describe('Number of blank pages'),
});

export const insertBlankTool = defineTool({
  id: 'insert-blank',
  name: 'Insert blank pages',
  summary: 'Insert one or more blank pages into a PDF.',
  category: 'organize',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: true,
  options: insertBlankOptions,

  async run(ctx, [input], { afterPage, count }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    if (ctx.signal.aborted) {
      throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
    }

    ctx.progress(0.15, 'Opening PDF...');
    const doc = await ctx.pdf.open(input);
    const insertAt = Math.min(afterPage, doc.pageCount);
    const refIdx = Math.max(0, Math.min(doc.pageCount - 1, insertAt - 1));
    const refPage = doc.pageCount > 0 ? doc.page(refIdx) : undefined;
    const size: [number, number] = refPage ? [refPage.width, refPage.height] : [595.28, 841.89];

    for (let i = 0; i < count; i++) {
      doc.insertBlankPage(insertAt + i, size);
    }

    ctx.progress(0.85, 'Saving PDF...');
    const out = await doc.save({ name: `${input.stem}-with-blanks.pdf`, objectStreams: true });
    ctx.progress(1, 'Done');
    return ok([out]);
  },
});

export default insertBlankTool;
