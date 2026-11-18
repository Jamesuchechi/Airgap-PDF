import { type Asset, assertToolInvariants } from '@airgap-pdf/core';
import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { cantooPdfEngine } from '../engines/cantooPdfLib.js';
import { protectTool } from './protect.js';
import { sanitizeTool } from './sanitize.js';
import { unlockTool } from './unlock.js';
import { xrayTool } from './xray.js';

async function makeDirtyPdf(): Promise<Asset> {
  const doc = await PDFDocument.create();
  doc.addPage([400, 600]);
  doc.setTitle('Secret Draft');
  doc.setAuthor('Jane Doe');
  const bytes = await doc.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/pdf' });
  return {
    id: crypto.randomUUID(),
    name: 'dirty.pdf',
    stem: 'dirty',
    mime: 'application/pdf',
    size: blob.size,
    blob,
  };
}

describe('M5 Protect + Inspect tools', () => {
  it('protectTool encrypts and unlockTool decrypts with password', async () => {
    const doc = await makeDirtyPdf();
    const encrypted = await assertToolInvariants({
      tool: protectTool,
      inputs: [doc],
      validOptions: { userPassword: 'pass' },
      pdf: cantooPdfEngine,
      outputPassword: 'pass',
    });
    await expect(cantooPdfEngine.open(encrypted[0]!)).rejects.toThrow();

    const unlocked = await assertToolInvariants({
      tool: unlockTool,
      inputs: [encrypted[0]!],
      validOptions: { password: 'pass' },
      pdf: cantooPdfEngine,
    });
    const reopened = await cantooPdfEngine.open(unlocked[0]!);
    expect(reopened.pageCount).toBe(1);
  });

  it('xrayTool reports metadata leaks and sanitizeTool strips them', async () => {
    const doc = await makeDirtyPdf();
    const reports = await assertToolInvariants({
      tool: xrayTool,
      inputs: [doc],
      validOptions: { format: 'json' },
      pdf: cantooPdfEngine,
    });
    const reportJson = JSON.parse(await reports[0]!.blob.text()) as {
      findings: Array<{ id: string }>;
    };
    expect(reportJson.findings.some((f) => f.id === 'metadata')).toBe(true);

    const sanitized = await assertToolInvariants({
      tool: sanitizeTool,
      inputs: [doc],
      validOptions: {
        metadata: true,
        javascript: true,
        embeddedFiles: true,
        hiddenLayers: true,
        annotations: true,
        forms: true,
      },
      pdf: cantooPdfEngine,
    });
    const cleanDoc = await cantooPdfEngine.open(sanitized[0]!);
    expect(cleanDoc.getMetadata().title).toBe('');
    expect(cleanDoc.getMetadata().author).toBe('');
  });
});
