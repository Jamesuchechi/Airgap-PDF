import { describe, expect, it } from 'vitest';
import { findPdfRevisions } from './revisions.js';

function toBytes(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i);
  return out;
}

describe('findPdfRevisions', () => {
  it('detects multiple incremental %%EOF revisions with startxref', () => {
    const raw =
      '%PDF-1.7\n1 0 obj\n<<>>\nendobj\nstartxref\n9\n%%EOF\n' +
      '2 0 obj\n<<>>\nendobj\nstartxref\n50\n%%EOF\n';
    const bytes = toBytes(raw);
    const revs = findPdfRevisions(bytes);
    expect(revs).toHaveLength(2);
    expect(revs[0]?.sizeBytes).toBeLessThan(revs[1]?.sizeBytes ?? 0);
  });

  it('ignores the first %%EOF on linearized PDFs', () => {
    const raw =
      '%PDF-1.7\n1 0 obj\n<< /Linearized 1 >>\nendobj\nstartxref\n9\n%%EOF\n' +
      '2 0 obj\n<<>>\nendobj\nstartxref\n60\n%%EOF\n';
    const bytes = toBytes(raw);
    const revs = findPdfRevisions(bytes);
    expect(revs).toHaveLength(1);
  });
});
