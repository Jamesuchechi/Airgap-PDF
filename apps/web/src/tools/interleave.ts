import { AirgapError, defineTool, ok, z } from '@airgap-pdf/core';

export const interleaveOptions = z.object({
  reverseSecond: z
    .boolean()
    .default(false)
    .describe('Reverse second PDF (common for duplex sheet-fed scans)'),
});

export const interleaveTool = defineTool({
  id: 'interleave',
  name: 'Interleave scans',
  summary: 'Alternate pages from two PDFs (odd/even simplex scans).',
  category: 'organize',
  accepts: { mime: ['application/pdf'], min: 2, max: 2 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: true,
  options: interleaveOptions,

  async run(ctx, [first, second], { reverseSecond }) {
    if (!first || !second) {
      throw new AirgapError(
        'InvalidOptions',
        'Need 2 PDFs',
        'Select two PDFs (odd pages and even pages) to interleave.',
      );
    }
    if (ctx.signal.aborted) {
      throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
    }

    ctx.progress(0.1, 'Opening PDFs...');
    const docA = await ctx.pdf.open(first);
    const docB = await ctx.pdf.open(second);
    const outDoc = await ctx.pdf.create();

    const maxPages = Math.max(docA.pageCount, docB.pageCount);
    for (let i = 0; i < maxPages; i++) {
      if (ctx.signal.aborted) {
        throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
      }
      if (i < docA.pageCount) {
        await outDoc.copyPagesFrom(docA, [i]);
      }
      if (i < docB.pageCount) {
        const bIdx = reverseSecond ? docB.pageCount - 1 - i : i;
        await outDoc.copyPagesFrom(docB, [bIdx]);
      }
      ctx.progress(0.15 + 0.7 * ((i + 1) / Math.max(1, maxPages)), `Interleaved pair ${i + 1}`);
    }

    ctx.progress(0.9, 'Saving interleaved PDF...');
    const out = await outDoc.save({ name: `${first.stem}-interleaved.pdf`, objectStreams: true });
    ctx.progress(1, 'Done');
    return ok([out]);
  },
});

export default interleaveTool;
