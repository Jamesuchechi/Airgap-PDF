import fs from 'node:fs';
import path from 'node:path';
import { AirgapError, type Asset, DEFAULT_LIMITS } from '@airgap-pdf/core';
import { describe, expect, it } from 'vitest';
import { cantooPdfEngine } from './engines/cantooPdfLib.js';
import { isRtlLocale, LOCALES, t } from './i18n/messages.js';

function collectTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectTsFiles(full, acc);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function makeMalformedAsset(name: string, bytes: Uint8Array): Asset {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/pdf' });
  return {
    id: name,
    name,
    stem: name,
    mime: 'application/pdf',
    size: blob.size,
    blob,
  };
}

describe('M10 Security, Fuzzing & i18n', () => {
  it('contains zero innerHTML, dangerouslySetInnerHTML, eval, or new Function sinks', () => {
    const repoRoot = path.resolve(import.meta.dirname, '../../..');
    const dirs = [
      path.join(repoRoot, 'apps/web/src'),
      path.join(repoRoot, 'packages/core/src'),
      path.join(repoRoot, 'packages/cli/src'),
      path.join(repoRoot, 'packages/verify/src'),
    ];
    const forbidden = /\b(innerHTML|dangerouslySetInnerHTML|eval)\s*\(|new\s+Function\s*\(/;
    const hits: string[] = [];
    for (const d of dirs) {
      if (!fs.existsSync(d)) continue;
      for (const file of collectTsFiles(d)) {
        const src = fs.readFileSync(file, 'utf8');
        if (forbidden.test(src)) hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });

  it('handles malformed/fuzzed PDFs cleanly without crashing or hanging', async () => {
    const payloads: Array<{ name: string; bytes: Uint8Array }> = [
      { name: 'empty.pdf', bytes: new Uint8Array(0) },
      { name: 'garbage.pdf', bytes: new Uint8Array([0x00, 0xff, 0x13, 0x37, 0xde, 0xad]) },
      {
        name: 'truncated-header.pdf',
        bytes: new TextEncoder().encode('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<'),
      },
      {
        name: 'corrupt-xref.pdf',
        bytes: new TextEncoder().encode(
          '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nstartxref\n999999\n%%EOF',
        ),
      },
      {
        name: 'cyclic-dict.pdf',
        bytes: new TextEncoder().encode(
          '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 1 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF',
        ),
      },
    ];

    for (const p of payloads) {
      const asset = makeMalformedAsset(p.name, p.bytes);
      await expect(cantooPdfEngine.open(asset)).rejects.toBeInstanceOf(AirgapError);
    }
  });

  it('enforces safe default resource limits', () => {
    expect(DEFAULT_LIMITS.maxInputBytesDesktop).toBeGreaterThan(0);
    expect(DEFAULT_LIMITS.maxPages).toBeGreaterThan(0);
    expect(DEFAULT_LIMITS.maxCanvasPixels).toBeLessThanOrEqual(16_777_216);
    expect(DEFAULT_LIMITS.maxRenderDpi).toBeLessThanOrEqual(300);
    expect(DEFAULT_LIMITS.watchdogMs).toBeGreaterThan(0);
  });

  it('supports English, Spanish, and Arabic (RTL) locales', () => {
    expect(LOCALES.map((l) => l.code)).toEqual(['en', 'es', 'ar']);
    expect(isRtlLocale('en')).toBe(false);
    expect(isRtlLocale('es')).toBe(false);
    expect(isRtlLocale('ar')).toBe(true);
    expect(t('en', 'app.tagline')).toBe('Your PDF never leaves the room.');
    expect(t('es', 'app.tagline')).toBe('Tu PDF nunca sale de la sala.');
    expect(t('ar', 'app.tagline')).toContain('PDF');
  });
});
