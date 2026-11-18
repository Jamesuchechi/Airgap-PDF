import { z } from 'zod';

export type PageRangeInput = string;

const TOKEN_RE = /^(all|odd|even|last(?:-(\d+))?|(\d+)(?:-(\d+)?)?)$/i;

/**
 * Parse a 1-based page-range expression (`1-3,5,8-`, `odd`, `even`, `last-2`, `all`)
 * into sorted, deduplicated 0-based page indices within `[0, pageCount)`.
 */
export function resolvePageRange(expr: string, pageCount: number): number[] {
  if (!Number.isInteger(pageCount) || pageCount < 0) {
    throw new RangeError(`Invalid pageCount: ${pageCount}`);
  }
  if (pageCount === 0) return [];

  const trimmed = expr.trim();
  if (!trimmed) {
    throw new Error('Page range cannot be empty');
  }

  const out = new Set<number>();
  const parts = trimmed.split(',').map((s) => s.trim());

  for (const part of parts) {
    if (!part) throw new Error(`Empty token in page range: "${expr}"`);
    const m = TOKEN_RE.exec(part);
    if (!m) {
      throw new Error(`Invalid page range token: "${part}"`);
    }

    const lower = part.toLowerCase();
    if (lower === 'all') {
      for (let i = 0; i < pageCount; i++) out.add(i);
    } else if (lower === 'odd') {
      for (let i = 0; i < pageCount; i += 2) out.add(i);
    } else if (lower === 'even') {
      for (let i = 1; i < pageCount; i += 2) out.add(i);
    } else if (lower.startsWith('last')) {
      const n = m[2] ? Number(m[2]) : 1;
      if (n < 1) throw new Error(`Invalid last-N token: "${part}"`);
      const start = Math.max(0, pageCount - n);
      for (let i = start; i < pageCount; i++) out.add(i);
    } else {
      const start1 = Number(m[3]);
      if (start1 < 1) throw new Error(`Pages are 1-based: "${part}"`);
      const hasDash = part.includes('-');
      const end1 = m[4] ? Number(m[4]) : hasDash ? pageCount : start1;
      if (end1 < start1) {
        throw new Error(`Range end (${end1}) < start (${start1}) in "${part}"`);
      }
      const clampedStart = Math.min(start1, pageCount + 1);
      const clampedEnd = Math.min(end1, pageCount);
      for (let p = clampedStart; p <= clampedEnd; p++) {
        out.add(p - 1);
      }
    }
  }

  return [...out].sort((a, b) => a - b);
}

export function isValidPageRange(expr: string): boolean {
  try {
    resolvePageRange(expr, 100);
    return true;
  } catch {
    return false;
  }
}

export const pageRange = () =>
  z.string().refine(isValidPageRange, {
    message: 'Enter pages like "1-3,5,8-", "odd", "even", "last-2", or "all".',
  });
