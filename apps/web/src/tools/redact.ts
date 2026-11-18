import { AirgapError, defineTool, ok, z } from '@airgap-pdf/core';
import { PDFArray, PDFDocument, PDFName, PDFRawStream, rgb } from '@cantoo/pdf-lib';
import { unzlibSync } from 'fflate';
import { type PdfRect, redactContentStream } from '../utils/pdfContentStream.js';
import type { VerificationReport } from '../utils/redactionVerifier.js';

export const redactionRegionSchema = z.object({
  pageIndex: z.number().int().min(0),
  xPct: z.number().min(0).max(1),
  yPct: z.number().min(0).max(1),
  wPct: z.number().min(0.001).max(1),
  hPct: z.number().min(0.001).max(1),
  category: z.string().optional(),
});

export type RedactionRegion = z.infer<typeof redactionRegionSchema>;

export const redactOptions = z.object({
  mode: z.enum(['safe', 'precise']).default('safe'),
  dpi: z.union([z.literal(150), z.literal(200), z.literal(300)]).default(200),
  regions: z.array(redactionRegionSchema).min(1),
  stripMetadata: z.boolean().default(true),
});

export const REDACTION_PATTERNS = {
  email: {
    label: 'Emails',
    regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  },
  phone: {
    label: 'Phone numbers',
    regex: /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g,
  },
  iban: {
    label: 'IBANs',
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi,
  },
  idLike: {
    label: 'ID / SSN-like',
    regex: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  },
} as const;

export interface RedactionAuditLog {
  version: 1;
  timestamp: string;
  fileName: string;
  mode: 'safe' | 'precise';
  totalRegions: number;
  pagesAffected: number[];
  countsByCategory: Record<string, number>;
  verification: VerificationReport | null;
}

export function buildRedactionAuditLog(params: {
  fileName: string;
  mode: 'safe' | 'precise';
  regions: RedactionRegion[];
  verification: VerificationReport | null;
}): RedactionAuditLog {
  const pagesSet = new Set<number>();
  const countsByCategory: Record<string, number> = {};
  for (const r of params.regions) {
    pagesSet.add(r.pageIndex + 1);
    const cat = r.category ?? 'manual-region';
    countsByCategory[cat] = (countsByCategory[cat] ?? 0) + 1;
  }
  return {
    version: 1,
    timestamp: new Date().toISOString(),
    fileName: params.fileName,
    mode: params.mode,
    totalRegions: params.regions.length,
    pagesAffected: [...pagesSet].sort((a, b) => a - b),
    countsByCategory,
    verification: params.verification,
  };
}

function decompressPageStream(stream: PDFRawStream): Uint8Array {
  const filter = stream.dict.get(PDFName.of('Filter'));
  const isFlate =
    filter instanceof PDFName
      ? filter.asString() === '/FlateDecode'
      : filter instanceof PDFArray &&
        filter.asArray().some((f) => f instanceof PDFName && f.asString() === '/FlateDecode');
  if (isFlate) {
    try {
      return unzlibSync(stream.contents);
    } catch {
      return stream.contents;
    }
  }
  return stream.contents;
}

async function burnBoxesIntoImageBlob(blob: Blob, regions: RedactionRegion[]): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(blob);
  try {
    const { width, height } = bitmap;
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2D context');
      ctx.drawImage(bitmap, 0, 0);
      ctx.fillStyle = '#000000';
      for (const r of regions) {
        ctx.fillRect(r.xPct * width, r.yPct * height, r.wPct * width, r.hPct * height);
      }
      const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
      return new Uint8Array(await pngBlob.arrayBuffer());
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    ctx.drawImage(bitmap, 0, 0);
    ctx.fillStyle = '#000000';
    for (const r of regions) {
      ctx.fillRect(r.xPct * width, r.yPct * height, r.wPct * width, r.hPct * height);
    }
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    });
    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

export const redactTool = defineTool({
  id: 'redact',
  name: 'Real Redaction',
  summary:
    'Permanently remove text and image pixels under regions in Safe (rasterize) or Precise (content-stream) mode.',
  category: 'protect',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 4.0 },
  deterministic: false,
  options: redactOptions,

  async run(ctx, [input], { mode, dpi, regions, stripMetadata }) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    if (ctx.signal.aborted) {
      throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
    }

    const rawBytes = new Uint8Array(await input.blob.arrayBuffer());
    const srcDoc = await PDFDocument.load(rawBytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const outDoc = await PDFDocument.create({ updateMetadata: false });
    const pageCount = srcDoc.getPageCount();

    const regionsByPage = new Map<number, RedactionRegion[]>();
    for (const r of regions) {
      const list = regionsByPage.get(r.pageIndex) ?? [];
      list.push(r);
      regionsByPage.set(r.pageIndex, list);
    }

    for (let i = 0; i < pageCount; i++) {
      if (ctx.signal.aborted) {
        throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
      }

      const pageRegions = regionsByPage.get(i) ?? [];
      const srcPage = srcDoc.getPage(i);
      const { width: pw, height: ph } = srcPage.getSize();
      ctx.progress(0.1 + (i / Math.max(1, pageCount)) * 0.75, `Redacting page ${i + 1}...`);

      if (pageRegions.length > 0 && mode === 'safe') {
        if (!ctx.render) {
          throw new AirgapError(
            'EngineUnavailable',
            'Render engine unavailable',
            'Safe rasterize redaction requires a PDF page renderer.',
          );
        }
        const rendered = await ctx.render.renderPage(input, i, { dpi, format: 'png' });
        const rawImg =
          rendered.blob instanceof Blob
            ? rendered.blob
            : new Blob([await rendered.blob.arrayBuffer()], { type: 'image/png' });
        const burnedBytes = await burnBoxesIntoImageBlob(rawImg, pageRegions);
        const embedded = await outDoc.embedPng(burnedBytes);
        const newPage = outDoc.addPage([pw, ph]);
        newPage.drawImage(embedded, { x: 0, y: 0, width: pw, height: ph });
        continue;
      }

      const [copied] = await outDoc.copyPages(srcDoc, [i]);
      if (!copied) continue;
      outDoc.addPage(copied);

      if (pageRegions.length > 0 && mode === 'precise') {
        // Strip annotations & PieceInfo on redacted page
        copied.node.delete(PDFName.of('Annots'));
        copied.node.delete(PDFName.of('PieceInfo'));

        const pdfRects: PdfRect[] = pageRegions.map((r) => ({
          x: r.xPct * pw,
          y: ph - (r.yPct + r.hPct) * ph,
          w: r.wPct * pw,
          h: r.hPct * ph,
        }));

        const contentsVal = copied.node.get(PDFName.of('Contents'));
        const contents = copied.node.Contents();
        const combinedChunks: Uint8Array[] = [];
        const oldRefs: unknown[] = [];
        if (contents instanceof PDFRawStream) {
          combinedChunks.push(decompressPageStream(contents));
          if (contentsVal) oldRefs.push(contentsVal);
        } else if (contents instanceof PDFArray) {
          for (let k = 0; k < contents.size(); k++) {
            const ref = contents.get(k);
            const s = outDoc.context.lookup(ref);
            if (s instanceof PDFRawStream) {
              combinedChunks.push(decompressPageStream(s));
              oldRefs.push(ref);
            }
          }
        }

        if (combinedChunks.length > 0) {
          const totalLen = combinedChunks.reduce((acc, c) => acc + c.byteLength + 1, 0);
          const merged = new Uint8Array(totalLen);
          let offset = 0;
          for (const c of combinedChunks) {
            merged.set(c, offset);
            offset += c.byteLength;
            merged[offset++] = 10;
          }

          const filtered = redactContentStream(merged, pdfRects, pw, ph);
          const newStream = outDoc.context.flateStream(filtered.bytes);
          const newRef = outDoc.context.register(newStream);
          copied.node.set(PDFName.of('Contents'), newRef);
          for (const oldRef of oldRefs) {
            // @ts-expect-error delete accepts PDFRef
            outDoc.context.delete(oldRef);
          }
        }

        for (const rect of pdfRects) {
          copied.drawRectangle({
            x: rect.x,
            y: rect.y,
            width: rect.w,
            height: rect.h,
            color: rgb(0, 0, 0),
            borderWidth: 0,
          });
        }
      }
    }

    if (stripMetadata) {
      outDoc.setTitle('');
      outDoc.setAuthor('');
      outDoc.setSubject('');
      outDoc.setKeywords([]);
      outDoc.setCreator('');
      outDoc.setProducer('');
      outDoc.catalog.delete(PDFName.of('Metadata'));
      outDoc.catalog.delete(PDFName.of('StructTreeRoot'));
      outDoc.catalog.delete(PDFName.of('Outlines'));
      outDoc.catalog.delete(PDFName.of('Names'));
      outDoc.catalog.delete(PDFName.of('AcroForm'));
    }

    ctx.progress(0.95, 'Rebuilding clean PDF...');
    const saved = await outDoc.save({ useObjectStreams: true });
    const copy = new Uint8Array(saved.byteLength);
    copy.set(saved);
    const blob = new Blob([copy], { type: 'application/pdf' });
    ctx.progress(1, 'Done');

    return ok([
      {
        id: crypto.randomUUID(),
        name: `${input.stem}-redacted.pdf`,
        stem: `${input.stem}-redacted`,
        mime: 'application/pdf',
        size: blob.size,
        blob,
      },
    ]);
  },
});

export default redactTool;
