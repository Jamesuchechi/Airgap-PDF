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
    const metaBefore = doc.getMetadata();
    const before = doc.inspect();

    ctx.progress(0.5, 'Sanitizing...');
    doc.sanitize(opts);
    const after = doc.inspect();

    const details: string[] = [];
    if (opts.metadata) {
      const strippedMeta = (
        [
          ['Title', metaBefore.title ?? ''],
          ['Author', metaBefore.author ?? ''],
          ['Subject', metaBefore.subject ?? ''],
          ['Keywords', (metaBefore.keywords ?? []).join(', ')],
          ['Creator', metaBefore.creator ?? ''],
          ['Producer', metaBefore.producer ?? ''],
        ] as const
      ).filter(([, val]) => val.trim().length > 0);
      for (const [label, val] of strippedMeta) {
        details.push(`Metadata ${label}: "${val.slice(0, 60)}" removed`);
      }
      if (before.hasXmpMetadata && !after.hasXmpMetadata) {
        details.push('XMP /Metadata stream removed');
      }
      if (before.hasPieceInfo && !after.hasPieceInfo) {
        details.push('Private /PieceInfo removed');
      }
    }
    if (opts.javascript) {
      if (before.hasJavaScript && !after.hasJavaScript) {
        details.push('Embedded JavaScript removed');
      }
      if (before.hasOpenAction && !after.hasOpenAction) {
        details.push('Document /OpenAction trigger removed');
      }
    }
    if (opts.embeddedFiles && before.embeddedFileCount > after.embeddedFileCount) {
      details.push(
        `Embedded attachments: ${before.embeddedFileCount - after.embeddedFileCount} removed`,
      );
    }
    if (opts.hiddenLayers && before.hasHiddenLayers && !after.hasHiddenLayers) {
      details.push('Hidden OCG layers removed');
    }
    if (opts.annotations && before.annotationCount > after.annotationCount) {
      details.push(
        `Annotations / comments: ${before.annotationCount - after.annotationCount} removed`,
      );
    }
    if (opts.forms && before.formFieldCount > after.formFieldCount) {
      details.push(
        `Form fields: ${before.formFieldCount - after.formFieldCount} flattened/stripped`,
      );
    }

    ctx.progress(0.85, 'Rebuilding clean PDF...');
    const out = await doc.save({ name: `${input.stem}-sanitized.pdf`, objectStreams: true });
    ctx.progress(1, 'Done');
    const summary =
      details.length > 0
        ? `Sanitized PDF (${details.length} item(s) removed):`
        : 'Sanitized PDF cleanly (no metadata, scripts, attachments, or annotations were present).';
    return ok([out], summary, details);
  },
});

export default sanitizeTool;
