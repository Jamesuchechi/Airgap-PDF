import { AirgapError, defineTool, ok, z } from '@airgap-pdf/core';

export const unlockOptions = z.object({
  password: z.string().min(1).describe('Current PDF password'),
});

export const unlockTool = defineTool({
  id: 'unlock',
  name: 'Unlock PDF',
  summary: 'Remove password protection when you know the password.',
  category: 'protect',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: true,
  options: unlockOptions,

  async run(ctx, [input], { password }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    if (ctx.signal.aborted) {
      throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
    }
    ctx.progress(0.2, 'Decrypting PDF...');
    const src = await ctx.pdf.open(input, { password });
    const outDoc = await ctx.pdf.create();
    const indices = Array.from({ length: src.pageCount }, (_, i) => i);
    await outDoc.copyPagesFrom(src, indices);
    ctx.progress(0.7, 'Saving unlocked PDF...');
    const out = await outDoc.save({ name: `${input.stem}-unlocked.pdf`, objectStreams: true });
    ctx.progress(1, 'Done');
    return ok([out], `Unlocked "${input.name}" (${src.pageCount} page(s), password removed)`);
  },
});

export default unlockTool;
