import { AirgapError, defineTool, ok, z } from '@airgap-pdf/core';

export const metadataOptions = z.object({
  title: z.string().default('').describe('Title'),
  author: z.string().default('').describe('Author'),
  subject: z.string().default('').describe('Subject'),
  keywords: z.string().default('').describe('Keywords (comma-separated)'),
  creator: z.string().default('').describe('Creator'),
  producer: z.string().default('').describe('Producer'),
});

export const metadataTool = defineTool({
  id: 'metadata',
  name: 'Edit metadata',
  summary: 'View and update PDF document Info metadata.',
  category: 'edit',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.0 },
  deterministic: true,
  options: metadataOptions,

  async run(ctx, [input], { title, author, subject, keywords, creator, producer }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    if (ctx.signal.aborted) {
      throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
    }
    ctx.progress(0.2, 'Opening PDF...');
    const doc = await ctx.pdf.open(input);
    const kwList = keywords
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    doc.setMetadata({
      title,
      author,
      subject,
      keywords: kwList,
      creator,
      producer,
    });
    ctx.progress(0.85, 'Saving PDF...');
    const out = await doc.save({ name: `${input.stem}-metadata.pdf`, objectStreams: true });
    ctx.progress(1, 'Done');
    const details = (
      [
        ['Title', title],
        ['Author', author],
        ['Subject', subject],
        ['Keywords', kwList.join(', ')],
        ['Creator', creator],
        ['Producer', producer],
      ] as const
    )
      .filter(([, v]) => v.trim().length > 0)
      .map(([k, v]) => `${k}: "${v}"`);
    return ok([out], `Updated PDF metadata (${details.length} field(s) set)`, details);
  },
});

export default metadataTool;
