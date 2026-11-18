import { AirgapError, type Asset } from '@airgap-pdf/core';
import { describe, expect, it } from 'vitest';
import { cantooPdfEngine } from './cantooPdfLib.js';

describe('cantooPdfEngine', () => {
  it('creates, rotates, encrypts with useObjectStreams: true, and re-opens with password', async () => {
    const doc = await cantooPdfEngine.create();
    expect(doc.pageCount).toBe(0);

    // Build a 1-page PDF via save + reopen
    const { PDFDocument } = await import('@cantoo/pdf-lib');
    const raw = await PDFDocument.create();
    raw.addPage([400, 600]);
    const bytes = await raw.save();
    const asset: Asset = {
      id: 'seed',
      name: 'seed.pdf',
      stem: 'seed',
      mime: 'application/pdf',
      size: bytes.byteLength,
      blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
    };

    const opened = await cantooPdfEngine.open(asset);
    opened.page(0).rotateBy(90);
    const encrypted = await opened.save({
      name: 'encrypted.pdf',
      objectStreams: true,
      encrypt: { userPassword: 'secret' },
    });

    await expect(cantooPdfEngine.open(encrypted)).rejects.toThrow(AirgapError);

    const unlocked = await cantooPdfEngine.open(encrypted, { password: 'secret' });
    expect(unlocked.pageCount).toBe(1);
    expect(unlocked.page(0).rotation).toBe(90);
  });
});
