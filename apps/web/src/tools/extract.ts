import { AirgapError, defineTool, ok, pageRange, z } from '@airgap-pdf/core';

export const extractOptions = z.object({
  pages: pageRange().default('1').describe('Pages to extract (e.g. "1-3,5")'),
});

export const extractTool = defineTool({
  id: 'extract',
  name: 'Extract pages',
  summary: 'Extract selected pages into a new PDF.',
  category: 'organize',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: true,
  options: extractOptions,

  async run(ctx, [input], { pages }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    if (ctx.signal.aborted) {
      throw new AirgapError('Cancelled', 'Extract cancelled', 'Operation cancelled.');
    }
    ctx.progress(0.1, 'Opening PDF...');
    const src = await ctx.pdf.open(input);
    const indices = src.resolveRange(pages);
    if (indices.length === 0) {
      throw new AirgapError('InvalidOptions', 'No pages matched', 'No pages matched that range.');
    }

    const outDoc = await ctx.pdf.create();
    await outDoc.copyPagesFrom(src, indices);
    ctx.progress(0.85, 'Saving extracted PDF...');
    const out = await outDoc.save({ name: `${input.stem}-extracted.pdf`, objectStreams: true });
    ctx.progress(1, 'Done');
    return ok([out]);
  },
});

export default extractTool;
