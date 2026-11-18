import { AirgapError, defineTool, ok, z } from '@airgap-pdf/core';

export const protectOptions = z.object({
  userPassword: z.string().min(1).describe('Password required to open the PDF'),
  ownerPassword: z.string().optional().describe('Optional owner/permissions password'),
});

export const protectTool = defineTool({
  id: 'protect',
  name: 'Password protect',
  summary: 'Encrypt a PDF with AES-256 password protection.',
  category: 'protect',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: false,
  options: protectOptions,

  async run(ctx, [input], { userPassword, ownerPassword }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    if (ctx.signal.aborted) {
      throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
    }
    ctx.progress(0.2, 'Opening PDF...');
    const doc = await ctx.pdf.open(input);
    ctx.progress(0.6, 'Encrypting with AES-256...');
    const out = await doc.save({
      name: `${input.stem}-protected.pdf`,
      objectStreams: true,
      encrypt: {
        userPassword,
        ...(ownerPassword ? { ownerPassword } : {}),
      },
    });
    ctx.progress(1, 'Done');
    return ok([out], `Encrypted "${input.name}" with AES-256`, [
      'User open password set',
      ...(ownerPassword ? ['Owner permissions password set'] : []),
    ]);
  },
});

export default protectTool;
