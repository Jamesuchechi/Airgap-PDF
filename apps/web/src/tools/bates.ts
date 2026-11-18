import { AirgapError, type Asset, defineTool, ok, z } from '@airgap-pdf/core';

export const batesOptions = z.object({
  prefix: z.string().default('CONF-').describe('Bates prefix'),
  start: z.number().int().min(1).default(1).describe('Starting number'),
  digits: z.number().int().min(1).max(10).default(6).describe('Zero-padded digits'),
  position: z
    .enum(['bottom-right', 'bottom-left', 'top-right'])
    .default('bottom-right')
    .describe('Position'),
  continuous: z.boolean().default(true).describe('Continuous numbering across multiple files'),
});

export const batesTool = defineTool({
  id: 'bates',
  name: 'Bates numbering',
  summary: 'Apply sequential legal Bates stamps across one or more PDFs.',
  category: 'edit',
  accepts: { mime: ['application/pdf'], min: 1, max: 'many' },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: true,
  options: batesOptions,

  async run(ctx, inputs, { prefix, start, digits, position, continuous }) {
    if (inputs.length === 0) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    const coords =
      position === 'bottom-left'
        ? { xPct: 0.06, yPct: 0.94 }
        : position === 'top-right'
          ? { xPct: 0.74, yPct: 0.04 }
          : { xPct: 0.74, yPct: 0.94 };

    let counter = start;
    const outputs: Asset[] = [];

    for (let f = 0; f < inputs.length; f++) {
      const input = inputs[f];
      if (!input) continue;
      if (!continuous) counter = start;

      const doc = await ctx.pdf.open(input);
      for (let i = 0; i < doc.pageCount; i++) {
        if (ctx.signal.aborted) {
          throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
        }
        const label = `${prefix}${String(counter).padStart(digits, '0')}`;
        counter += 1;
        await doc.drawText(i, {
          text: label,
          xPct: coords.xPct,
          yPct: coords.yPct,
          fontSize: 10,
          colorHex: '#111111',
        });
      }
      outputs.push(await doc.save({ name: `${input.stem}-bates.pdf`, objectStreams: true }));
      ctx.progress((f + 1) / inputs.length, `Stamped ${input.name}`);
    }

    return ok(outputs);
  },
});

export default batesTool;
