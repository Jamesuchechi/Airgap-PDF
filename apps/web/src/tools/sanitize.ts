import { AirgapError, defineTool, ok, z } from '@airgap-pdf/core';

export const sanitizeOptions = z.object({
  metadata: z.boolean().default(true).describe('Strip Info metadata, XMP, and /PieceInfo'),
  javascript: z.boolean().default(true).describe('Strip JavaScript and OpenAction triggers'),
  embeddedFiles: z.boolean().default(true).describe('Strip embedded file attachments'),
  hiddenLayers: z.boolean().default(true).describe('Strip hidden OCG layers'),
  annotations: z.boolean().default(true).describe('Strip comments and annotations'),
  forms: z.boolean().default(true).describe('Flatten/strip form data'),
});

export const sanitizeTool = defineTool({
  id: 'sanitize',
  name: 'Sanitize PDF',
  summary: 'Strip metadata, JavaScript, attachments, hidden layers, comments, and forms.',
  category: 'protect',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: true,
  options: sanitizeOptions,

  async run(ctx, [input], opts) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    if (ctx.signal.aborted) {
      throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
    }
    ctx.progress(0.2, 'Inspecting PDF...');
    const doc = await ctx.pdf.open(input);
    ctx.progress(0.5, 'Sanitizing...');
    doc.sanitize(opts);
    ctx.progress(0.85, 'Rebuilding clean PDF...');
    const out = await doc.save({ name: `${input.stem}-sanitized.pdf`, objectStreams: true });
    ctx.progress(1, 'Done');
    return ok([out]);
  },
});

export default sanitizeTool;
