import { AirgapError, defineTool, ok, z } from '@airgap-pdf/core';

export const mergeOptions = z.object({
  outputName: z.string().default('merged.pdf').describe('Output filename'),
  ranges: z
    .array(z.string())
    .optional()
    .describe('Optional per-file page ranges (e.g. ["1-3", "all"])'),
});

export const mergeTool = defineTool({
  id: 'merge',
  name: 'Merge PDFs',
  summary: 'Combine multiple PDFs into one document in order.',
  category: 'organize',
  accepts: { mime: ['application/pdf'], min: 2, max: 'many' },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: true,
  options: mergeOptions,

  async run(ctx, inputs, { outputName, ranges }) {
    if (inputs.length < 2) {
      throw new AirgapError(
        'InvalidOptions',
        'Need at least 2 PDFs',
        'Select at least 2 PDFs to merge.',
      );
    }

    ctx.progress(0.05, 'Creating merged document...');
    const outDoc = await ctx.pdf.create();

    for (let i = 0; i < inputs.length; i++) {
      if (ctx.signal.aborted) {
        throw new AirgapError('Cancelled', 'Merge cancelled', 'Operation cancelled.');
      }
      const input = inputs[i];
      if (!input) continue;

      const src = await ctx.pdf.open(input);
      const rangeExpr = ranges?.[i] ?? 'all';
      const indices = src.resolveRange(rangeExpr);
      await outDoc.copyPagesFrom(src, indices);
      ctx.progress(0.1 + 0.75 * ((i + 1) / inputs.length), `Added ${input.name}`);
    }

    ctx.progress(0.9, 'Saving merged PDF...');
    const out = await outDoc.save({
      name: outputName.endsWith('.pdf') ? outputName : `${outputName}.pdf`,
      objectStreams: true,
    });
    ctx.progress(1, 'Done');
    return ok([out]);
  },
});

export default mergeTool;
