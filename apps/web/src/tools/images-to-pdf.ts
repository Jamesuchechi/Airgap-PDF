import { AirgapError, defineTool, ok, z } from '@airgap-pdf/core';

export const imagesToPdfOptions = z.object({
  pageSize: z.enum(['fit', 'a4', 'letter']).default('a4').describe('Page size'),
  orientation: z.enum(['auto', 'portrait', 'landscape']).default('auto').describe('Orientation'),
  marginPt: z.number().min(0).max(144).default(36).describe('Margin (points)'),
});

async function toEmbeddableBytes(
  blob: Blob,
  mime: string,
): Promise<{ bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' }> {
  if (mime === 'image/png' || mime === 'image/jpeg') {
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime };
  }
  if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    throw new AirgapError(
      'UnsupportedFeature',
      `Cannot transcode ${mime}`,
      `Transcoding ${mime} requires OffscreenCanvas.`,
    );
  }
  const bmp = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new AirgapError('EngineUnavailable', 'No 2D context', 'Canvas 2D is unavailable.');
  }
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
  return { bytes: new Uint8Array(await pngBlob.arrayBuffer()), mime: 'image/png' };
}

export const imagesToPdfTool = defineTool({
  id: 'images-to-pdf',
  name: 'Images to PDF',
  summary: 'Combine PNG, JPEG, or WebP images into a PDF.',
  category: 'convert',
  accepts: { mime: ['image/png', 'image/jpeg', 'image/webp'], min: 1, max: 'many' },
  produces: 'pdf',
  runtime: ['browser'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: true,
  options: imagesToPdfOptions,

  async run(ctx, inputs, opts) {
    if (inputs.length === 0) {
      throw new AirgapError('InvalidOptions', 'No images', 'Choose at least one image.');
    }
    const doc = await ctx.pdf.create();
    for (let i = 0; i < inputs.length; i++) {
      if (ctx.signal.aborted) {
        throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
      }
      const img = inputs[i];
      if (!img) continue;
      const { bytes, mime } = await toEmbeddableBytes(img.blob as Blob, img.mime);
      await doc.addImagePage(bytes, mime, opts);
      ctx.progress(0.1 + 0.75 * ((i + 1) / inputs.length), `Added ${img.name}`);
    }
    const out = await doc.save({ name: 'images.pdf', objectStreams: true });
    ctx.progress(1, 'Done');
    return ok([out]);
  },
});

export default imagesToPdfTool;
