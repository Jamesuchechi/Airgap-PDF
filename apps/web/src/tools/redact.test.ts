import fs from 'node:fs';
import path from 'node:path';
import { type Asset, assertToolInvariants } from '@airgap-pdf/core';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { cantooPdfEngine } from '../engines/cantooPdfLib.js';
import { redactContentStream } from '../utils/pdfContentStream.js';
import { verifyRedaction } from '../utils/redactionVerifier.js';
import { buildRedactionAuditLog, redactTool } from './redact.js';

function loadCorpusAsset(filename: string): Asset {
  const filePath = path.resolve(
    import.meta.dirname,
    '../../../../corpus/redaction-fails',
    filename,
  );
  const bytes = new Uint8Array(fs.readFileSync(filePath));
  const blob = new Blob([bytes], { type: 'application/pdf' });
  return {
    id: filename,
    name: filename,
    stem: filename.replace(/\.pdf$/, ''),
    mime: 'application/pdf',
    size: blob.size,
    blob,
  };
}

describe('M7 Real Redaction + Post-Redaction Verifier', () => {
  it('catches every leak in corpus/redaction-fails/', async () => {
    const cases: Array<{ file: string; term: string; category: string }> = [
      {
        file: '01-black-box-over-text.pdf',
        term: 'SECRET_SSN_123-45-6789',
        category: 'raw-stream',
      },
      {
        file: '02-incremental-revision.pdf',
        term: 'SECRET_TOKEN_XYZ',
        category: 'previous-revision',
      },
      {
        file: '03-metadata-leak.pdf',
        term: 'CONFIDENTIAL_PROJECT_ORION',
        category: 'metadata',
      },
      {
        file: '04-annotation-leak.pdf',
        term: 'SECRET_NOTE_999',
        category: 'annotation',
      },
      {
        file: '05-form-field-leak.pdf',
        term: 'SECRET_ACCOUNT_42',
        category: 'form-field',
      },
      {
        file: '06-bookmark-leak.pdf',
        term: 'SECRET_CHAPTER_7',
        category: 'bookmark',
      },
    ];

    for (const c of cases) {
      const asset = loadCorpusAsset(c.file);
      const report = await verifyRedaction(asset, { forbiddenTerms: [c.term] });
      expect(report.passed, `${c.file} should fail verification`).toBe(false);
      expect(report.leaks.some((l) => l.category === c.category)).toBe(true);
    }
  });

  it('detects suspicious black box drawn over underlying text', async () => {
    const asset = loadCorpusAsset('01-black-box-over-text.pdf');
    const report = await verifyRedaction(asset, {
      extractPageRuns: async () => [
        {
          text: 'SECRET_SSN_123-45-6789',
          xPct: 50 / 400,
          yPct: (300 - 214) / 300,
          wPct: 180 / 400,
          hPct: 14 / 300,
        },
      ],
    });
    expect(report.passed).toBe(false);
    expect(report.leaks.some((l) => l.category === 'black-box-over-text')).toBe(true);
  });

  it('Precise mode drops text operators under region while keeping surrounding text and passing verification', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 300]);
    page.drawText('PUBLIC_HEADER', { x: 50, y: 260, size: 14, font });
    page.drawText('SECRET_SSN_123-45-6789', { x: 50, y: 150, size: 14, font });
    doc.setTitle('SECRET_SSN_123-45-6789');

    const bytes = await doc.save({ useObjectStreams: false });
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy], { type: 'application/pdf' });
    const input: Asset = {
      id: 'precise-src',
      name: 'precise.pdf',
      stem: 'precise',
      mime: 'application/pdf',
      size: blob.size,
      blob,
    };

    // Normalized top-left rect covering y=150 on a 300pt tall page -> yPct around (300-165)/300 = 0.45
    const outputs = await assertToolInvariants({
      tool: redactTool,
      inputs: [input],
      validOptions: {
        mode: 'precise',
        dpi: 200,
        stripMetadata: true,
        regions: [
          {
            pageIndex: 0,
            xPct: 0.1,
            yPct: 0.42,
            wPct: 0.65,
            hPct: 0.12,
            category: 'idLike',
          },
        ],
      },
      invalidOptions: { mode: 'precise', regions: [] },
      pdf: cantooPdfEngine,
    });

    const out = outputs[0];
    expect(out).toBeDefined();
    if (!out) return;

    const verSecret = await verifyRedaction(out, {
      forbiddenTerms: ['SECRET_SSN_123-45-6789'],
    });
    expect(verSecret.passed).toBe(true);

    // PUBLIC_HEADER was outside the region and should remain in the stream
    const verPublic = await verifyRedaction(out, {
      forbiddenTerms: ['PUBLIC_HEADER'],
    });
    expect(verPublic.passed).toBe(false);
    expect(verPublic.leaks.some((l) => l.category === 'raw-stream')).toBe(true);
  });

  it('clips overlapping image XObjects in Precise mode', () => {
    const stream = new TextEncoder().encode('q 200 0 0 150 50 50 cm /Im1 Do Q\n');
    const res = redactContentStream(stream, [{ x: 80, y: 80, w: 60, h: 30 }], 400, 300);
    const outText = new TextDecoder().decode(res.bytes);
    expect(res.clippedImageOps).toBe(1);
    expect(outText).toContain('W* n /Im1 Do Q');
  });

  it('builds exportable redaction audit log without leaking secret text', () => {
    const log = buildRedactionAuditLog({
      fileName: 'contract.pdf',
      mode: 'safe',
      regions: [
        { pageIndex: 0, xPct: 0.1, yPct: 0.1, wPct: 0.2, hPct: 0.05, category: 'email' },
        { pageIndex: 2, xPct: 0.2, yPct: 0.3, wPct: 0.2, hPct: 0.05, category: 'manual-region' },
      ],
      verification: null,
    });
    expect(log.totalRegions).toBe(2);
    expect(log.pagesAffected).toEqual([1, 3]);
    expect(log.countsByCategory).toEqual({ email: 1, 'manual-region': 1 });
  });
});
