import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isValidPageRange, resolvePageRange } from './pageRange.js';

describe('resolvePageRange', () => {
  it('handles standard expressions', () => {
    expect(resolvePageRange('all', 4)).toEqual([0, 1, 2, 3]);
    expect(resolvePageRange('odd', 5)).toEqual([0, 2, 4]);
    expect(resolvePageRange('even', 5)).toEqual([1, 3]);
    expect(resolvePageRange('last-2', 5)).toEqual([3, 4]);
    expect(resolvePageRange('1-3,5,8-', 10)).toEqual([0, 1, 2, 4, 7, 8, 9]);
  });

  it('rejects invalid expressions', () => {
    expect(() => resolvePageRange('', 5)).toThrow();
    expect(() => resolvePageRange('0', 5)).toThrow();
    expect(() => resolvePageRange('5-2', 5)).toThrow();
    expect(isValidPageRange('abc')).toBe(false);
  });

  it('satisfies property invariants (sorted, unique, in-bounds)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.array(fc.integer({ min: 1, max: 60 }), { minLength: 1, maxLength: 10 }),
        (pageCount, pages) => {
          const expr = pages.join(',');
          const res = resolvePageRange(expr, pageCount);
          const unique = new Set(res);
          expect(unique.size).toBe(res.length);
          for (let i = 0; i < res.length; i++) {
            const idx = res[i]!;
            expect(idx).toBeGreaterThanOrEqual(0);
            expect(idx).toBeLessThan(pageCount);
            if (i > 0) expect(idx).toBeGreaterThan(res[i - 1]!);
          }
        },
      ),
    );
  });
});
