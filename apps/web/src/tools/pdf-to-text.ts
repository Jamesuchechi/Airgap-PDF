import {
  AirgapError,
  type Asset,
  defineTool,
  ok,
  pageRange,
  resolvePageRange,
  z,
} from '@airgap-pdf/core';

export const pdfToTextOptions = z.object({
  format: z.enum(['markdown', 'text']).default('markdown').describe('Output format'),
  pages: pageRange().default('all').describe('Pages to extract'),
});

export const pdfToTextTool = defineTool({
  id: 'pdf-to-text',
  name: 'PDF to text',
  summary: 'Extract text or Markdown from text-layer PDFs.',
  category: 'convert',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'text',
  runtime: ['browser'],
  needs: ['pdf.text'],
  memory: { multiplier: 2.0 },
  deterministic: true,
  options: pdfToTextOptions,

  async run(ctx, [input], { format, pages }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    if (!ctx.render) {
      throw new AirgapError('EngineUnavailable', 'RenderEngine missing', 'Renderer unavailable.');
    }

    const total = await ctx.render.getPageCount(input);
    const indices = resolvePageRange(pages, total);
    const chunks: string[] = [];
    let totalChars = 0;

    for (let i = 0; i < indices.length; i++) {
      if (ctx.signal.aborted) {
        throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
      }
      const idx = indices[i];
      if (idx === undefined) continue;
      const text = await ctx.render.extractText(input, idx);
      totalChars += text.length;
      chunks.push(format === 'markdown' ? `## Page ${idx + 1}\n\n${text}` : text);
      ctx.progress((i + 1) / Math.max(1, indices.length), `Extracted page ${idx + 1}`);
    }

    const avgChars = totalChars / Math.max(1, indices.length);
    let body = chunks.join('\n\n');
    if (avgChars < 20) {
      body = `> Note: Very little selectable text was found (${Math.round(avgChars)} chars/page). This PDF looks scanned — try OCR (M6).\n\n${body}`;
    }

    const ext = format === 'markdown' ? 'md' : 'txt';
    const blob = new Blob([body], {
      type: format === 'markdown' ? 'text/markdown' : 'text/plain',
    });
    const out: Asset = {
      id: crypto.randomUUID(),
      name: `${input.stem}.${ext}`,
      stem: input.stem,
      mime: blob.type,
      size: blob.size,
      blob,
    };
    return ok([out]);
  },
});

export default pdfToTextTool;
