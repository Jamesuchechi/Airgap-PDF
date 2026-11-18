import { AirgapError, defineTool, ok, z } from '@airgap-pdf/core';

export const compressOptions = z.object({
  level: z
    .enum(['light', 'balanced', 'strong'])
    .default('balanced')
    .describe('Compression preset (Light = lossless, Balanced = 150 DPI, Strong = 100 DPI)'),
});

export const compressTool = defineTool({
  id: 'compress',
  name: 'Compress PDF',
  summary: 'Reduce PDF size with object streams and image recompression (never grows files).',
  category: 'organize',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 3.0 },
  deterministic: false,
  options: compressOptions,

  async run(ctx, [input], { level }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    if (ctx.signal.aborted) {
      throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
    }

    ctx.progress(0.15, 'Opening PDF...');
    const src = await ctx.pdf.open(input);
    const clean = await ctx.pdf.create();
    const indices = Array.from({ length: src.pageCount }, (_, i) => i);
    await clean.copyPagesFrom(src, indices);

    if (level !== 'light') {
      ctx.progress(0.45, 'Recompressing embedded images...');
      const cfg =
        level === 'strong' ? { maxDim: 1100, quality: 0.62 } : { maxDim: 1650, quality: 0.78 };
      await clean.recompressImages(cfg);
    }

    ctx.progress(0.85, 'Writing object streams...');
    const out = await clean.save({ name: `${input.stem}-compressed.pdf`, objectStreams: true });
    ctx.progress(1, 'Done');

    // Never make a file bigger
    if (out.size >= input.size) {
      ctx.log('info', 'Compressed output was not smaller; returning original.');
      return ok([input]);
    }
    return ok([out]);
  },
});

export default compressTool;
