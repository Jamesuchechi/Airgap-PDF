import type { Asset } from '@airgap-pdf/core';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFString,
} from '@cantoo/pdf-lib';
import { unzlibSync } from 'fflate';
import { tokenizeContentStream } from './pdfContentStream.js';

export type LeakCategory =
  | 'extracted-text'
  | 'raw-stream'
  | 'annotation'
  | 'bookmark'
  | 'form-field'
  | 'attachment'
  | 'metadata'
  | 'previous-revision'
  | 'black-box-over-text';

export interface VerificationLeak {
  category: LeakCategory;
  location: string;
  detail: string;
}

export interface VerificationCheckSummary {
  id: string;
  label: string;
  passed: boolean;
  hitCount: number;
}

export interface VerificationReport {
  passed: boolean;
  checks: VerificationCheckSummary[];
  leaks: VerificationLeak[];
  revisionCount: number;
}

export interface VerifyOptions {
  /** Forbidden literal strings or regexes to verify are absent. */
  forbiddenTerms?: string[];
  /** Optional page text extractor (e.g. pdfjsRenderEngine.extractText). */
  extractPageText?: (pageIndex: number) => Promise<string>;
  /** Optional page text-run extractor for black-box-over-text audit. */
  extractPageRuns?: (
    pageIndex: number,
  ) => Promise<Array<{ text: string; xPct: number; yPct: number; wPct: number; hPct: number }>>;
}

function decodePdfTextObj(val: unknown): string {
  if (val instanceof PDFString) return val.decodeText();
  if (val instanceof PDFHexString) return val.decodeText();
  return '';
}

function decompressStream(stream: PDFRawStream): string {
  const raw = stream.contents;
  const filter = stream.dict.get(PDFName.of('Filter'));
  const isFlate =
    filter instanceof PDFName
      ? filter.asString() === '/FlateDecode'
      : filter instanceof PDFArray &&
        filter.asArray().some((f) => f instanceof PDFName && f.asString() === '/FlateDecode');

  let decoded: string;
  if (isFlate) {
    try {
      const inflated = unzlibSync(raw);
      decoded = new TextDecoder('latin1').decode(inflated);
    } catch {
      decoded = new TextDecoder('latin1').decode(raw);
    }
  } else {
    decoded = new TextDecoder('latin1').decode(raw);
  }
  const hexDecoded: string[] = [];
  for (const m of decoded.matchAll(/<([0-9A-Fa-f]{4,})>/g)) {
    const hex = m[1] ?? '';
    let s = '';
    for (let i = 0; i + 1 < hex.length; i += 2) {
      const code = Number.parseInt(hex.slice(i, i + 2), 16);
      if (code >= 32 && code < 127) s += String.fromCharCode(code);
    }
    if (s) hexDecoded.push(s);
  }
  return hexDecoded.length > 0 ? `${decoded}\n${hexDecoded.join(' ')}` : decoded;
}

function findMatchingTerm(haystack: string, terms: string[]): string | null {
  if (!haystack || terms.length === 0) return null;
  const lower = haystack.toLowerCase();
  for (const term of terms) {
    const t = term.trim();
    if (!t) continue;
    if (lower.includes(t.toLowerCase())) return t;
  }
  return null;
}

function countEofMarkers(rawBytes: Uint8Array): number {
  const text = new TextDecoder('latin1').decode(rawBytes);
  const matches = text.match(/%%EOF/g);
  return matches ? matches.length : 0;
}

interface DarkRect {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

function detectDarkRectsInStream(
  streamText: string,
  pageWidth: number,
  pageHeight: number,
): DarkRect[] {
  const tokens = tokenizeContentStream(new TextEncoder().encode(streamText));
  const operands: string[] = [];
  const darkRects: DarkRect[] = [];
  let isDarkFill = false;
  type Mat = [number, number, number, number, number, number];
  const ctmStack: Mat[] = [];
  let ctm: Mat = [1, 0, 0, 1, 0, 0];
  let pathPts: Array<{ x: number; y: number }> = [];

  const applyCtm = (x: number, y: number): { x: number; y: number } => ({
    x: ctm[0] * x + ctm[2] * y + ctm[4],
    y: ctm[1] * x + ctm[3] * y + ctm[5],
  });

  for (const tok of tokens) {
    if (tok.type !== 'op') {
      operands.push(tok.raw);
      continue;
    }
    const op = tok.raw;
    if (op === 'q') {
      ctmStack.push([...ctm]);
    } else if (op === 'Q') {
      ctm = ctmStack.pop() ?? [1, 0, 0, 1, 0, 0];
    } else if (op === 'cm' && operands.length >= 6) {
      const m: Mat = [
        Number.parseFloat(operands[0] ?? '1') || 0,
        Number.parseFloat(operands[1] ?? '0') || 0,
        Number.parseFloat(operands[2] ?? '0') || 0,
        Number.parseFloat(operands[3] ?? '1') || 0,
        Number.parseFloat(operands[4] ?? '0') || 0,
        Number.parseFloat(operands[5] ?? '0') || 0,
      ];
      ctm = [
        m[0] * ctm[0] + m[1] * ctm[2],
        m[0] * ctm[1] + m[1] * ctm[3],
        m[2] * ctm[0] + m[3] * ctm[2],
        m[2] * ctm[1] + m[3] * ctm[3],
        m[4] * ctm[0] + m[5] * ctm[2] + ctm[4],
        m[4] * ctm[1] + m[5] * ctm[3] + ctm[5],
      ];
    } else if (op === 'g' && operands.length >= 1) {
      const g = Number.parseFloat(operands[operands.length - 1] ?? '1');
      isDarkFill = g <= 0.15;
    } else if (op === 'rg' && operands.length >= 3) {
      const r = Number.parseFloat(operands[operands.length - 3] ?? '1');
      const g = Number.parseFloat(operands[operands.length - 2] ?? '1');
      const b = Number.parseFloat(operands[operands.length - 1] ?? '1');
      isDarkFill = r <= 0.15 && g <= 0.15 && b <= 0.15;
    } else if (op === 're' && operands.length >= 4) {
      const x = Number.parseFloat(operands[operands.length - 4] ?? '0');
      const y = Number.parseFloat(operands[operands.length - 3] ?? '0');
      const w = Number.parseFloat(operands[operands.length - 2] ?? '0');
      const h = Number.parseFloat(operands[operands.length - 1] ?? '0');
      pathPts.push(applyCtm(x, y), applyCtm(x + w, y + h));
    } else if ((op === 'm' || op === 'l') && operands.length >= 2) {
      const x = Number.parseFloat(operands[operands.length - 2] ?? '0');
      const y = Number.parseFloat(operands[operands.length - 1] ?? '0');
      pathPts.push(applyCtm(x, y));
    } else if ((op === 'f' || op === 'F' || op === 'f*' || op === 'B') && pathPts.length >= 2) {
      if (isDarkFill) {
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const p of pathPts) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        const rw = maxX - minX;
        const rh = maxY - minY;
        if (rw >= 8 && rh >= 6) {
          darkRects.push({
            xPct: Math.max(0, Math.min(1, minX / pageWidth)),
            yPct: Math.max(0, Math.min(1, (pageHeight - maxY) / pageHeight)),
            wPct: Math.min(1, rw / pageWidth),
            hPct: Math.min(1, rh / pageHeight),
          });
        }
      }
      pathPts = [];
    } else if (op === 'n' || op === 'S' || op === 's') {
      pathPts = [];
    }
    operands.length = 0;
  }

  return darkRects;
}

function pctRectsOverlap(
  a: { xPct: number; yPct: number; wPct: number; hPct: number },
  b: { xPct: number; yPct: number; wPct: number; hPct: number },
): boolean {
  return (
    a.xPct < b.xPct + b.wPct &&
    a.xPct + a.wPct > b.xPct &&
    a.yPct < b.yPct + b.hPct &&
    a.yPct + a.hPct > b.yPct
  );
}

/**
 * Shared post-redaction verifier and general PDF redaction auditor.
 * Scans extracted text, raw decompressed streams, annotations, bookmarks,
 * form fields, attachments, metadata /PieceInfo, previous revisions (%%EOF),
 * and suspicious black boxes drawn over underlying text.
 */
export async function verifyRedaction(
  asset: Asset,
  opts: VerifyOptions = {},
): Promise<VerificationReport> {
  const rawBytes = new Uint8Array(await asset.blob.arrayBuffer());
  const terms = (opts.forbiddenTerms ?? []).filter((t) => t.trim().length > 0);
  const leaks: VerificationLeak[] = [];

  const doc = await PDFDocument.load(rawBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  // 1. Extracted text check
  const pageCount = doc.getPageCount();
  if (opts.extractPageText && terms.length > 0) {
    for (let i = 0; i < pageCount; i++) {
      const txt = await opts.extractPageText(i);
      const hit = findMatchingTerm(txt, terms);
      if (hit) {
        leaks.push({
          category: 'extracted-text',
          location: `Page ${i + 1}`,
          detail: 'Extracted page text still contains a redacted term.',
        });
      }
    }
  }

  // 2. Raw decompressed streams check
  if (terms.length > 0) {
    for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream) {
        const decoded = decompressStream(obj);
        const hit = findMatchingTerm(decoded, terms);
        if (hit) {
          leaks.push({
            category: 'raw-stream',
            location: `Object ${ref.objectNumber} ${ref.generationNumber} R`,
            detail: 'Decompressed PDF stream still contains a redacted term.',
          });
        }
      }
    }
  }

  // 3. Annotations check
  for (let i = 0; i < pageCount; i++) {
    const page = doc.getPage(i);
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annots) continue;
    for (let a = 0; a < annots.size(); a++) {
      const annot = doc.context.lookupMaybe(annots.get(a), PDFDict);
      if (!annot) continue;
      if (terms.length > 0) {
        for (const key of ['Contents', 'T', 'Subj', 'RC']) {
          const val = decodePdfTextObj(annot.lookup(PDFName.of(key)));
          if (findMatchingTerm(val, terms)) {
            leaks.push({
              category: 'annotation',
              location: `Page ${i + 1}, Annotation #${a + 1} (/${key})`,
              detail: 'Annotation text contains a redacted term.',
            });
          }
        }
      }
    }
  }

  // 4. Bookmarks / Outlines check
  if (terms.length > 0) {
    const outlines = doc.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict);
    if (outlines) {
      const visited = new Set<unknown>();
      const walkOutline = (node: PDFDict | undefined, idx: number): void => {
        if (!node || visited.has(node)) return;
        visited.add(node);
        const title = decodePdfTextObj(node.lookup(PDFName.of('Title')));
        if (findMatchingTerm(title, terms)) {
          leaks.push({
            category: 'bookmark',
            location: `Bookmark #${idx}`,
            detail: 'Bookmark title contains a redacted term.',
          });
        }
        walkOutline(node.lookupMaybe(PDFName.of('First'), PDFDict), idx + 1);
        walkOutline(node.lookupMaybe(PDFName.of('Next'), PDFDict), idx + 1);
      };
      walkOutline(outlines.lookupMaybe(PDFName.of('First'), PDFDict), 1);
    }
  }

  // 5. Form fields check
  if (terms.length > 0) {
    try {
      const form = doc.getForm();
      for (const field of form.getFields()) {
        const name = field.getName();
        const dict = field.acroField.dict;
        const combined = [
          name,
          decodePdfTextObj(dict.lookup(PDFName.of('V'))),
          decodePdfTextObj(dict.lookup(PDFName.of('DV'))),
          decodePdfTextObj(dict.lookup(PDFName.of('TU'))),
        ].join(' ');
        if (findMatchingTerm(combined, terms)) {
          leaks.push({
            category: 'form-field',
            location: `Form field "${name}"`,
            detail: 'AcroForm field value/tooltip contains a redacted term.',
          });
        }
      }
    } catch {
      // No AcroForm
    }
  }

  // 6. Embedded attachments check
  const namesDict = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  const embeddedFiles = namesDict?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  if (embeddedFiles) {
    const efNames = embeddedFiles.lookupMaybe(PDFName.of('Names'), PDFArray);
    if (efNames && terms.length > 0) {
      for (let i = 0; i < efNames.size(); i += 2) {
        const fname = decodePdfTextObj(efNames.get(i));
        if (findMatchingTerm(fname, terms)) {
          leaks.push({
            category: 'attachment',
            location: `Embedded file "${fname}"`,
            detail: 'Embedded file name contains a redacted term.',
          });
        }
      }
    }
  }

  // 7. Metadata & /PieceInfo check
  const metaFields = [
    doc.getTitle() ?? '',
    doc.getAuthor() ?? '',
    doc.getSubject() ?? '',
    doc.getKeywords() ?? '',
    doc.getCreator() ?? '',
    doc.getProducer() ?? '',
  ].join(' ');
  if (terms.length > 0 && findMatchingTerm(metaFields, terms)) {
    leaks.push({
      category: 'metadata',
      location: 'Document Info dictionary',
      detail: 'PDF metadata contains a redacted term.',
    });
  }
  const xmpRaw = doc.catalog.lookup(PDFName.of('Metadata'));
  const xmpStream = xmpRaw instanceof PDFRawStream ? xmpRaw : undefined;
  if (xmpStream && terms.length > 0) {
    const xmpText = decompressStream(xmpStream);
    if (findMatchingTerm(xmpText, terms)) {
      leaks.push({
        category: 'metadata',
        location: 'XMP /Metadata stream',
        detail: 'XMP metadata stream contains a redacted term.',
      });
    }
  }
  for (let i = 0; i < pageCount; i++) {
    const pieceInfo = doc.getPage(i).node.lookupMaybe(PDFName.of('PieceInfo'), PDFDict);
    if (pieceInfo) {
      leaks.push({
        category: 'metadata',
        location: `Page ${i + 1} /PieceInfo`,
        detail: 'Private application /PieceInfo dictionary present.',
      });
    }
  }

  // 8. Previous revisions (incremental updates) check
  const revisionCount = countEofMarkers(rawBytes);
  if (revisionCount > 1) {
    const rawLatin = new TextDecoder('latin1').decode(rawBytes);
    const hasTermInRaw = terms.length > 0 && findMatchingTerm(rawLatin, terms) !== null;
    leaks.push({
      category: 'previous-revision',
      location: `${revisionCount} %%EOF markers`,
      detail: hasTermInRaw
        ? 'Incremental PDF revision history is present and contains a redacted term.'
        : 'Incremental PDF revision history (multiple %%EOF markers) may retain prior objects.',
    });
  }

  // 9. Suspicious black boxes drawn over underlying text (Verify Redaction audit)
  if (opts.extractPageRuns) {
    for (let i = 0; i < pageCount; i++) {
      const page = doc.getPage(i);
      const { width, height } = page.getSize();
      const runs = await opts.extractPageRuns(i);
      if (runs.length === 0) continue;

      const contents = page.node.Contents();
      const streamTexts: string[] = [];
      if (contents instanceof PDFRawStream) {
        streamTexts.push(decompressStream(contents));
      } else if (contents instanceof PDFArray) {
        for (let k = 0; k < contents.size(); k++) {
          const s = doc.context.lookup(contents.get(k));
          if (s instanceof PDFRawStream) streamTexts.push(decompressStream(s));
        }
      }
      const darkRects = detectDarkRectsInStream(streamTexts.join('\n'), width, height);
      for (const rect of darkRects) {
        const under = runs.find((r) => pctRectsOverlap(rect, r));
        if (under) {
          leaks.push({
            category: 'black-box-over-text',
            location: `Page ${i + 1}`,
            detail: 'Suspicious black rectangle drawn over extractable underlying text.',
          });
          break;
        }
      }
    }
  }

  const countBy = (cats: LeakCategory[]) => leaks.filter((l) => cats.includes(l.category)).length;

  const checks: VerificationCheckSummary[] = [
    {
      id: 'extracted-text',
      label: 'Extracted page text',
      passed: countBy(['extracted-text']) === 0,
      hitCount: countBy(['extracted-text']),
    },
    {
      id: 'raw-streams',
      label: 'Raw decompressed streams',
      passed: countBy(['raw-stream']) === 0,
      hitCount: countBy(['raw-stream']),
    },
    {
      id: 'annots-forms-bookmarks',
      label: 'Annotations, forms & bookmarks',
      passed: countBy(['annotation', 'form-field', 'bookmark']) === 0,
      hitCount: countBy(['annotation', 'form-field', 'bookmark']),
    },
    {
      id: 'metadata-attachments',
      label: 'Metadata, /PieceInfo & attachments',
      passed: countBy(['metadata', 'attachment']) === 0,
      hitCount: countBy(['metadata', 'attachment']),
    },
    {
      id: 'revisions',
      label: 'Previous revisions (%%EOF)',
      passed: countBy(['previous-revision']) === 0,
      hitCount: countBy(['previous-revision']),
    },
    {
      id: 'black-boxes',
      label: 'Black boxes over text',
      passed: countBy(['black-box-over-text']) === 0,
      hitCount: countBy(['black-box-over-text']),
    },
  ];

  return {
    passed: leaks.length === 0,
    checks,
    leaks,
    revisionCount,
  };
}
