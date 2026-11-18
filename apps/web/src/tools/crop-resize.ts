import { AirgapError, defineTool, ok, pageRange, z } from '@airgap-pdf/core';

export const cropResizeOptions = z.object({
  mode: z.enum(['crop', 'resize']).default('resize').describe('Mode'),
  paperSize: z.enum(['a4', 'letter']).default('a4').describe('Target paper size (resize)'),
  marginPt: z.number().min(0).max(200).default(36).describe('Crop margin (points)'),
  pages: pageRange().default('all').describe('Pages'),
});

export const cropResizeTool = defineTool({
  id: 'crop-resize',
  name: 'Crop & resize',
  summary: 'Crop page margins or resize pages to A4 or Letter.',
  category: 'edit',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: true,
  options: cropResizeOptions,

  async run(ctx, [input], { mode, paperSize, marginPt, pages }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    const doc = await ctx.pdf.open(input);
    const indices = doc.resolveRange(pages);
    for (let i = 0; i < indices.length; i++) {
      if (ctx.signal.aborted) {
        throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
      }
      const idx = indices[i];
      if (idx === undefined) continue;
      doc.cropOrResize(idx, { mode, paperSize, marginPt });
      ctx.progress(
        0.1 + 0.75 * ((i + 1) / Math.max(1, indices.length)),
        `Processed page ${idx + 1}`,
      );
    }
    const out = await doc.save({ name: `${input.stem}-${mode}.pdf`, objectStreams: true });
    ctx.progress(1, 'Done');
    return ok([out]);
  },
});

export default cropResizeTool;
