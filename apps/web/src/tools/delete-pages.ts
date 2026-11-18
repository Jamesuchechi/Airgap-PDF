import { AirgapError, defineTool, ok, pageRange, z } from '@airgap-pdf/core';

export const deletePagesOptions = z.object({
  pages: pageRange().default('1').describe('Pages to delete (e.g. "1,3-5")'),
});

export const deletePagesTool = defineTool({
  id: 'delete-pages',
  name: 'Delete pages',
  summary: 'Remove selected pages from a PDF.',
  category: 'organize',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: true,
  options: deletePagesOptions,

  async run(ctx, [input], { pages }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    if (ctx.signal.aborted) {
      throw new AirgapError('Cancelled', 'Delete cancelled', 'Operation cancelled.');
    }
    ctx.progress(0.1, 'Opening PDF...');
    const src = await ctx.pdf.open(input);
    const toDelete = new Set(src.resolveRange(pages));
    const keep: number[] = [];
    for (let i = 0; i < src.pageCount; i++) {
      if (!toDelete.has(i)) keep.push(i);
    }
    if (keep.length === 0) {
      throw new AirgapError(
        'InvalidOptions',
        'Cannot delete all pages',
        'At least one page must remain in the PDF.',
      );
    }

    const outDoc = await ctx.pdf.create();
    await outDoc.copyPagesFrom(src, keep);
    ctx.progress(0.85, 'Saving PDF...');
    const out = await outDoc.save({ name: `${input.stem}-trimmed.pdf`, objectStreams: true });
    ctx.progress(1, 'Done');
    return ok([out]);
  },
});

export default deletePagesTool;
