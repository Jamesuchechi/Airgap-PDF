import { AirgapError, type Asset, defineTool, findPdfRevisions, ok, z } from '@airgap-pdf/core';

export const xrayOptions = z.object({
  format: z.enum(['json', 'markdown']).default('json').describe('Report export format'),
});

export interface XRayFinding {
  id: string;
  severity: 'info' | 'warn' | 'risk';
  title: string;
  detail: string;
  fixKey?: 'metadata' | 'javascript' | 'embeddedFiles' | 'hiddenLayers' | 'annotations' | 'forms';
}

export interface XRayReport {
  fileName: string;
  sizeBytes: number;
  pageCount: number;
  revisionCount: number;
  findings: XRayFinding[];
}

export function buildXRayFindings(
  summary: ReturnType<Awaited<ReturnType<import('@airgap-pdf/core').PdfEngine['open']>>['inspect']>,
  revisionCount: number,
): XRayFinding[] {
  const findings: XRayFinding[] = [];
  const metaKeys = Object.entries(summary.metadata).filter(([, v]) =>
    Array.isArray(v) ? v.length > 0 : Boolean(v),
  );
  if (metaKeys.length > 0 || summary.hasXmpMetadata || summary.hasPieceInfo) {
    findings.push({
      id: 'metadata',
      severity: 'warn',
      title: 'Identity & metadata present',
      detail: `${metaKeys.length} Info fields${summary.hasXmpMetadata ? ', XMP stream' : ''}${summary.hasPieceInfo ? ', /PieceInfo' : ''}`,
      fixKey: 'metadata',
    });
  }
  if (summary.hasJavaScript || summary.hasOpenAction) {
    findings.push({
      id: 'javascript',
      severity: 'risk',
      title: 'Active scripts or auto-actions',
      detail:
        `${summary.hasJavaScript ? 'JavaScript ' : ''}${summary.hasOpenAction ? 'OpenAction/AA' : ''}`.trim(),
      fixKey: 'javascript',
    });
  }
  if (summary.hasEmbeddedFiles) {
    findings.push({
      id: 'embeddedFiles',
      severity: 'risk',
      title: 'Embedded file attachments',
      detail: `${summary.embeddedFileCount} embedded file(s)`,
      fixKey: 'embeddedFiles',
    });
  }
  if (summary.hasHiddenLayers) {
    findings.push({
      id: 'hiddenLayers',
      severity: 'warn',
      title: 'Optional Content Groups (layers)',
      detail: 'Document contains /OCProperties layers that may hide content',
      fixKey: 'hiddenLayers',
    });
  }
  if (summary.annotationCount > 0) {
    findings.push({
      id: 'annotations',
      severity: 'warn',
      title: 'Annotations / comments',
      detail: `${summary.annotationCount} annotation(s) found`,
      fixKey: 'annotations',
    });
  }
  if (summary.formFieldCount > 0) {
    findings.push({
      id: 'forms',
      severity: 'info',
      title: 'Fillable form fields',
      detail: `${summary.formFieldCount} AcroForm field(s)`,
      fixKey: 'forms',
    });
  }
  if (revisionCount > 1) {
    findings.push({
      id: 'revisions',
      severity: 'risk',
      title: 'Multiple incremental revisions',
      detail: `${revisionCount} %%EOF revisions found; earlier versions may remain recoverable`,
    });
  }
  return findings;
}

export const xrayTool = defineTool({
  id: 'xray',
  name: 'X-Ray leak audit',
  summary: 'Audit a PDF for hidden metadata, scripts, attachments, layers, and revisions.',
  category: 'inspect',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'report',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.0 },
  deterministic: true,
  options: xrayOptions,

  async run(ctx, [input], { format }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    if (ctx.signal.aborted) {
      throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
    }
    ctx.progress(0.2, 'Scanning PDF structure...');
    const bytes = new Uint8Array(await input.blob.arrayBuffer());
    const revisions = findPdfRevisions(bytes);
    const doc = await ctx.pdf.open(input);
    const summary = doc.inspect();
    const findings = buildXRayFindings(summary, revisions.length);

    const report: XRayReport = {
      fileName: input.name,
      sizeBytes: input.size,
      pageCount: doc.pageCount,
      revisionCount: revisions.length,
      findings,
    };

    const body =
      format === 'markdown'
        ? [
            `# X-Ray Report: ${report.fileName}`,
            `- Pages: ${report.pageCount} · Size: ${report.sizeBytes} bytes · Revisions: ${report.revisionCount}`,
            '',
            ...findings.map((f) => `- **[${f.severity.toUpperCase()}] ${f.title}:** ${f.detail}`),
          ].join('\n')
        : `${JSON.stringify(report, null, 2)}\n`;

    const blob = new Blob([body], {
      type: format === 'markdown' ? 'text/markdown' : 'application/json',
    });
    const out: Asset = {
      id: crypto.randomUUID(),
      name: `${input.stem}-xray.${format === 'markdown' ? 'md' : 'json'}`,
      stem: `${input.stem}-xray`,
      mime: blob.type,
      size: blob.size,
      blob,
    };
    ctx.progress(1, 'Done');
    return ok([out]);
  },
});

export default xrayTool;
