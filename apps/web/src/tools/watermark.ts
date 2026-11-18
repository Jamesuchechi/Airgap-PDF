import { AirgapError, defineTool, ok, pageRange, z } from '@airgap-pdf/core';

export const watermarkOptions = z.object({
  text: z.string().min(1).default('CONFIDENTIAL').describe('Watermark text'),
  opacity: z.number().min(0.05).max(1).default(0.16).describe('Opacity (0.05 - 1)'),
  angle: z.number().min(-90).max(90).default(35).describe('Angle (degrees)'),
  tile: z.boolean().default(false).describe('Tile across page'),
  fontSize: z.number().min(10).max(120).default(42).describe('Font size'),
  colorHex: z.string().default('#444444').describe('Color (hex)'),
  pages: pageRange().default('all').describe('Pages'),
});

export const watermarkTool = defineTool({
  id: 'watermark',
  name: 'Watermark',
  summary: 'Stamp a single or tiled text watermark across pages.',
  category: 'edit',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: false,
  options: watermarkOptions,

  async run(ctx, [input], opts) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    const doc = await ctx.pdf.open(input);
    const indices = doc.resolveRange(opts.pages);
    for (let i = 0; i < indices.length; i++) {
      if (ctx.signal.aborted) {
        throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
      }
      const idx = indices[i];
      if (idx === undefined) continue;
      await doc.drawWatermark(idx, opts);
      ctx.progress(0.1 + 0.75 * ((i + 1) / Math.max(1, indices.length)), `Stamped page ${idx + 1}`);
    }
    const out = await doc.save({ name: `${input.stem}-watermarked.pdf`, objectStreams: true });
    ctx.progress(1, 'Done');
    return ok([out]);
  },
});

export default watermarkTool;
