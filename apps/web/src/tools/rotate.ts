import { AirgapError, defineTool, ok, pageRange, z } from '@airgap-pdf/core';

export const rotateOptions = z.object({
  degrees: z
    .union([z.literal(90), z.literal(180), z.literal(270)])
    .default(90)
    .describe('Clockwise rotation in degrees'),
  pages: pageRange().default('all').describe('Pages to rotate (e.g. "1-3,5", "odd", "all")'),
});

export const rotateTool = defineTool({
  id: 'rotate',
  name: 'Rotate pages',
  summary: 'Rotate selected pages by 90, 180 or 270 degrees.',
  category: 'organize',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: true,
  options: rotateOptions,

  async run(ctx, [input], { degrees, pages }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    ctx.progress(0.05, 'Opening PDF...');
    const doc = await ctx.pdf.open(input);
    const indices = doc.resolveRange(pages);

    for (let i = 0; i < indices.length; i++) {
      if (ctx.signal.aborted) {
        throw new AirgapError('Cancelled', 'Rotation cancelled', 'Operation cancelled.');
      }
      const idx = indices[i];
      if (idx === undefined) continue;
      doc.page(idx).rotateBy(degrees);
      ctx.progress(0.1 + 0.75 * ((i + 1) / Math.max(1, indices.length)), `Rotated page ${idx + 1}`);
    }

    ctx.progress(0.9, 'Saving PDF...');
    const out = await doc.save({ name: `${input.stem}-rotated.pdf`, objectStreams: true });
    ctx.progress(1, 'Done');
    return ok([out]);
  },
});

export default rotateTool;
