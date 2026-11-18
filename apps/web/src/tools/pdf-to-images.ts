import {
  AirgapError,
  type Asset,
  defineTool,
  ok,
  pageRange,
  resolvePageRange,
  z,
} from '@airgap-pdf/core';

export const pdfToImagesOptions = z.object({
  dpi: z
    .union([z.literal(72), z.literal(150), z.literal(300)])
    .default(150)
    .describe('Render DPI'),
  format: z.enum(['png', 'jpeg']).default('png').describe('Image format'),
  pages: pageRange().default('all').describe('Pages to export'),
});

export const pdfToImagesTool = defineTool({
  id: 'pdf-to-images',
  name: 'PDF to images',
  summary: 'Render PDF pages to PNG or JPEG images (with iOS pixel cap).',
  category: 'convert',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'images',
  runtime: ['browser'],
  needs: ['pdf.render'],
  memory: { multiplier: 3.0 },
  deterministic: false,
  options: pdfToImagesOptions,

  async run(ctx, [input], { dpi, format, pages }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    if (!ctx.render) {
      throw new AirgapError('EngineUnavailable', 'RenderEngine missing', 'Renderer unavailable.');
    }

    const total = await ctx.render.getPageCount(input);
    const indices = resolvePageRange(pages, total);
    const outputs: Asset[] = [];
    let anyDownscaled = false;

    for (let i = 0; i < indices.length; i++) {
      if (ctx.signal.aborted) {
        throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
      }
      const idx = indices[i];
      if (idx === undefined) continue;
      const rendered = await ctx.render.renderPage(input, idx, {
        dpi,
        format,
        maxPixels: ctx.limits.maxCanvasPixels,
      });
      if (rendered.downscaled) anyDownscaled = true;
      const ext = format === 'jpeg' ? 'jpg' : 'png';
      const name = `${input.stem}-p${String(idx + 1).padStart(3, '0')}.${ext}`;
      outputs.push({
        id: crypto.randomUUID(),
        name,
        stem: name.replace(/\.[^.]+$/, ''),
        mime: format === 'jpeg' ? 'image/jpeg' : 'image/png',
        size: rendered.blob.size,
        blob: rendered.blob,
      });
      ctx.progress((i + 1) / Math.max(1, indices.length), `Rendered page ${idx + 1}`);
    }

    if (anyDownscaled) {
      ctx.log('warn', 'One or more pages were downscaled to fit browser canvas limits.');
    }
    return ok(outputs);
  },
});

export default pdfToImagesTool;
