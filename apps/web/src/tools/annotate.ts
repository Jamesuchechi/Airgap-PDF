import { AirgapError, defineTool, ok, z } from '@airgap-pdf/core';

export const OverlayOpSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    pageIndex: z.number().int().min(0),
    text: z.string().min(1),
    xPct: z.number().min(0).max(1),
    yPct: z.number().min(0).max(1),
    fontSize: z.number().min(6).max(96).default(14),
    colorHex: z.string().default('#111111'),
  }),
  z.object({
    kind: z.literal('rect'),
    pageIndex: z.number().int().min(0),
    xPct: z.number().min(0).max(1),
    yPct: z.number().min(0).max(1),
    widthPct: z.number().min(0.01).max(1),
    heightPct: z.number().min(0.005).max(1),
    colorHex: z.string().default('#ffd54f'),
    opacity: z.number().min(0.05).max(1).default(0.35),
    filled: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal('freehand'),
    pageIndex: z.number().int().min(0),
    points: z.array(z.object({ xPct: z.number(), yPct: z.number() })).min(2),
    colorHex: z.string().default('#111111'),
    strokeWidth: z.number().min(0.5).max(12).default(2),
  }),
  z.object({
    kind: z.literal('image'),
    pageIndex: z.number().int().min(0),
    dataUrl: z.string().startsWith('data:image/'),
    xPct: z.number().min(0).max(1),
    yPct: z.number().min(0).max(1),
    widthPct: z.number().min(0.02).max(1).default(0.24),
  }),
]);

export type OverlayOp = z.infer<typeof OverlayOpSchema>;

export const annotateOptions = z.object({
  operations: z.array(OverlayOpSchema).min(1).describe('Annotations & signatures to flatten'),
});

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' } {
  const [header, base64] = dataUrl.split(',');
  if (!header || !base64) {
    throw new AirgapError('InvalidOptions', 'Invalid image dataUrl', 'Invalid signature image.');
  }
  const mime = header.includes('image/jpeg') ? 'image/jpeg' : 'image/png';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

export const annotateTool = defineTool({
  id: 'annotate',
  name: 'Edit, annotate & sign',
  summary: 'Type new text, highlight, draw freehand, or place signatures on PDF pages.',
  category: 'edit',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: true,
  options: annotateOptions,

  async run(ctx, [input], { operations }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    const doc = await ctx.pdf.open(input);

    for (let i = 0; i < operations.length; i++) {
      if (ctx.signal.aborted) {
        throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
      }
      const op = operations[i];
      if (!op) continue;
      if (op.pageIndex >= doc.pageCount) {
        throw new AirgapError(
          'InvalidOptions',
          'Page out of bounds',
          'Target page does not exist.',
        );
      }
      if (op.kind === 'text') {
        await doc.drawText(op.pageIndex, op);
      } else if (op.kind === 'rect') {
        doc.drawRect(op.pageIndex, op);
      } else if (op.kind === 'freehand') {
        doc.drawFreehand(op.pageIndex, op);
      } else if (op.kind === 'image') {
        const { bytes, mime } = decodeDataUrl(op.dataUrl);
        await doc.drawImageOverlay(op.pageIndex, bytes, mime, {
          xPct: op.xPct,
          yPct: op.yPct,
          widthPct: op.widthPct,
        });
      }
      ctx.progress(0.1 + 0.75 * ((i + 1) / operations.length), `Applied edit ${i + 1}`);
    }

    const out = await doc.save({ name: `${input.stem}-edited.pdf`, objectStreams: true });
    ctx.progress(1, 'Done');
    return ok([out]);
  },
});

export default annotateTool;
