import { AirgapError, defineTool, ok, z } from '@airgap-pdf/core';
import { createWorker } from 'tesseract.js';
import { downloadSelfHostedPack, getPackBytes } from '../utils/ocrPacks.js';
import { cleanupPageBlob } from '../utils/preOcrCleanup.js';

export const ocrOptions = z.object({
  lang: z
    .string()
    .min(2)
    .max(16)
    .default('eng')
    .describe('OCR language code (e.g. eng, spa, fra, deu)'),
  grayscale: z.boolean().default(true).describe('Convert pages to grayscale before OCR'),
  contrast: z
    .number()
    .min(0.5)
    .max(3)
    .default(1.35)
    .describe('Pre-OCR contrast boost (1.0 = none)'),
  despeckle: z.boolean().default(true).describe('Apply 3x3 median despeckle filter before OCR'),
});

function selfUrl(subpath: string): string {
  const base =
    typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
      ? import.meta.env.BASE_URL
      : '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return new URL(
    `${normalizedBase}${subpath}`,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
  ).toString();
}

export const ocrTool = defineTool({
  id: 'ocr',
  name: 'OCR (Searchable PDF)',
  summary:
    'Recognize scanned pages locally with Tesseract.js and embed an invisible searchable text layer.',
  category: 'edit',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser'],
  needs: ['pdf.edit', 'pdf.render'],
  memory: { multiplier: 3.5 },
  deterministic: false,
  options: ocrOptions,

  async run(ctx, [input], { lang, grayscale, contrast, despeckle }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    if (ctx.signal.aborted) {
      throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
    }

    if (!ctx.render) {
      throw new AirgapError(
        'EngineUnavailable',
        'Render engine unavailable',
        'OCR requires a PDF page renderer.',
      );
    }

    ctx.progress(0.05, `Loading "${lang}" OCR language pack...`);
    let packBytes = await getPackBytes(lang);
    if (!packBytes) {
      try {
        await downloadSelfHostedPack(lang);
        packBytes = await getPackBytes(lang);
      } catch (err) {
        throw new AirgapError(
          'InvalidOptions',
          'Missing OCR language pack',
          err instanceof Error
            ? err.message
            : `Upload or cache the "${lang}.traineddata.gz" pack in the Language-Pack Manager first.`,
        );
      }
    }
    if (!packBytes) {
      throw new AirgapError(
        'InvalidOptions',
        'Missing OCR language pack',
        `Upload or cache the "${lang}.traineddata.gz" pack in the Language-Pack Manager first.`,
      );
    }

    const src = await ctx.pdf.open(input);
    const outDoc = await ctx.pdf.create();
    const pageCount = src.pageCount;
    await outDoc.copyPagesFrom(
      src,
      Array.from({ length: pageCount }, (_, i) => i),
    );

    ctx.progress(0.12, 'Starting local Tesseract worker...');
    const worker = await createWorker([{ code: lang, data: packBytes }], undefined, {
      workerPath: selfUrl('tesseract/worker.min.js'),
      corePath: selfUrl('tesseract'),
      langPath: selfUrl('tesseract/lang'),
      cacheMethod: 'none',
      workerBlobURL: true,
      logger: (msg) => {
        if (msg.status === 'recognizing text' && typeof msg.progress === 'number') {
          ctx.log('debug', `Tesseract: ${Math.round(msg.progress * 100)}%`);
        }
      },
    });

    try {
      for (let i = 0; i < pageCount; i++) {
        if (ctx.signal.aborted) {
          throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
        }

        const basePct = 0.15 + (i / Math.max(1, pageCount)) * 0.78;
        ctx.progress(basePct, `OCR page ${i + 1} of ${pageCount}...`);

        const rendered = await ctx.render.renderPage(input, i, {
          dpi: 200,
          format: 'png',
        });
        const cleaned = await cleanupPageBlob(rendered.blob, {
          grayscale,
          contrast,
          despeckle,
        });

        const result = await worker.recognize(cleaned, {}, { blocks: true });
        const pageMeta = outDoc.page(i);
        const words =
          result.data.blocks?.flatMap((b) =>
            b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)),
          ) ?? [];

        for (const w of words) {
          const text = w.text.trim();
          if (!text) continue;
          const xPct = Math.max(0, Math.min(1, w.bbox.x0 / rendered.width));
          const yPct = Math.max(0, Math.min(1, w.bbox.y0 / rendered.height));
          const fontSize = Math.max(
            4,
            Math.round(((w.bbox.y1 - w.bbox.y0) / rendered.height) * pageMeta.height),
          );
          await outDoc.drawText(i, {
            text,
            xPct,
            yPct,
            fontSize,
            opacity: 0,
          });
        }
      }
    } finally {
      await worker.terminate();
    }

    ctx.progress(0.95, 'Saving searchable PDF...');
    const out = await outDoc.save({
      name: `${input.stem}-ocr.pdf`,
      objectStreams: true,
    });
    ctx.progress(1, 'Done');
    return ok([out]);
  },
});

export default ocrTool;
