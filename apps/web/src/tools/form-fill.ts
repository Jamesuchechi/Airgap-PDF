import { AirgapError, defineTool, ok, z } from '@airgap-pdf/core';

export const formFillOptions = z.object({
  values: z
    .record(z.union([z.string(), z.boolean()]))
    .default({})
    .describe('Form field values'),
  flatten: z.boolean().default(false).describe('Flatten form fields into static page content'),
});

export const formFillTool = defineTool({
  id: 'form-fill',
  name: 'Fill & flatten forms',
  summary: 'Fill AcroForm fields and optionally flatten them.',
  category: 'edit',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: true,
  options: formFillOptions,

  async run(ctx, [input], { values, flatten }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    if (ctx.signal.aborted) {
      throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
    }
    ctx.progress(0.2, 'Opening AcroForm...');
    const doc = await ctx.pdf.open(input);
    doc.fillFormFields(values, flatten);
    ctx.progress(0.85, 'Saving PDF...');
    const out = await doc.save({ name: `${input.stem}-filled.pdf`, objectStreams: true });
    ctx.progress(1, 'Done');
    return ok([out]);
  },
});

export default formFillTool;
