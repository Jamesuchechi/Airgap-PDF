import { AirgapError, defineTool, ok, z } from '@airgap-pdf/core';

export const splitOptions = z.object({
  mode: z.enum(['every', 'ranges']).default('every').describe('Split mode'),
  everyN: z.number().int().min(1).default(1).describe('Pages per part (when mode is every)'),
  rangesText: z
    .string()
    .default('1-1')
    .describe('Comma/semicolon-separated ranges (e.g. "1-2; 3-5")'),
});

export const splitTool = defineTool({
  id: 'split',
  name: 'Split PDF',
  summary: 'Split a PDF every N pages or by custom page ranges.',
  category: 'organize',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'zip',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: true,
  options: splitOptions,

  async run(ctx, [input], { mode, everyN, rangesText }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }

    ctx.progress(0.05, 'Opening PDF...');
    const src = await ctx.pdf.open(input);
    const total = src.pageCount;
    if (total === 0) {
      throw new AirgapError('CorruptPdf', 'Empty PDF', 'This PDF has 0 pages.');
    }

    const groups: number[][] = [];
    if (mode === 'every') {
      for (let start = 0; start < total; start += everyN) {
        const chunk: number[] = [];
        for (let p = start; p < Math.min(total, start + everyN); p++) {
          chunk.push(p);
        }
        groups.push(chunk);
      }
    } else {
      const specs = rangesText
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      if (specs.length === 0) {
        throw new AirgapError('InvalidOptions', 'Empty ranges', 'Provide at least one page range.');
      }
      for (const spec of specs) {
        const indices = src.resolveRange(spec);
        if (indices.length > 0) groups.push(indices);
      }
    }

    const outputs = [];
    for (let i = 0; i < groups.length; i++) {
      if (ctx.signal.aborted) {
        throw new AirgapError('Cancelled', 'Split cancelled', 'Operation cancelled.');
      }
      const group = groups[i];
      if (!group || group.length === 0) continue;
      const part = await ctx.pdf.create();
      await part.copyPagesFrom(src, group);
      const saved = await part.save({
        name: `${input.stem}-part-${String(i + 1).padStart(2, '0')}.pdf`,
        objectStreams: true,
      });
      outputs.push(saved);
      ctx.progress(0.15 + 0.85 * ((i + 1) / groups.length), `Created part ${i + 1}`);
    }

    return ok(outputs);
  },
});

export default splitTool;
