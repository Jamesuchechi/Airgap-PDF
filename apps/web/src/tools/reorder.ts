import { AirgapError, defineTool, ok, z } from '@airgap-pdf/core';

export const reorderOptions = z.object({
  sequence: z
    .array(
      z.object({
        sourceIndex: z.number().int().min(0),
        rotateBy: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
      }),
    )
    .min(1)
    .describe('Ordered page sequence'),
});

export const reorderTool = defineTool({
  id: 'reorder',
  name: 'Organize pages',
  summary: 'Reorder, duplicate, delete, and rotate pages visually.',
  category: 'organize',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: true,
  options: reorderOptions,

  async run(ctx, [input], { sequence }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    if (ctx.signal.aborted) {
      throw new AirgapError('Cancelled', 'Reorder cancelled', 'Operation cancelled.');
    }

    ctx.progress(0.1, 'Opening PDF...');
    const src = await ctx.pdf.open(input);
    const outDoc = await ctx.pdf.create();

    for (let i = 0; i < sequence.length; i++) {
      if (ctx.signal.aborted) {
        throw new AirgapError('Cancelled', 'Reorder cancelled', 'Operation cancelled.');
      }
      const item = sequence[i];
      if (!item) continue;
      if (item.sourceIndex < 0 || item.sourceIndex >= src.pageCount) {
        throw new AirgapError(
          'InvalidOptions',
          `Invalid page index ${item.sourceIndex}`,
          'Page index out of bounds.',
        );
      }
      await outDoc.copyPagesFrom(src, [item.sourceIndex]);
      if (item.rotateBy !== 0) {
        outDoc.page(outDoc.pageCount - 1).rotateBy(item.rotateBy);
      }
      ctx.progress(0.15 + 0.7 * ((i + 1) / sequence.length), `Placed page ${i + 1}`);
    }

    ctx.progress(0.9, 'Saving organized PDF...');
    const out = await outDoc.save({ name: `${input.stem}-organized.pdf`, objectStreams: true });
    ctx.progress(1, 'Done');
    return ok([out]);
  },
});

export default reorderTool;
