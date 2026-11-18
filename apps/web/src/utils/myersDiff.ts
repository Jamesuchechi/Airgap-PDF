export type DiffOp = 'equal' | 'insert' | 'delete' | 'move';

export interface DiffLine {
  op: DiffOp;
  text: string;
  aPage?: number;
  bPage?: number;
}

export interface PageTextInput {
  pageIndex: number;
  text: string;
}

interface TaggedLine {
  text: string;
  pageIndex: number;
}

/**
 * Myers O(ND) diff over two arrays of tagged lines, followed by move detection
 * for lines that were deleted in one location and inserted elsewhere.
 */
export function computeMyersDiff(aPages: PageTextInput[], bPages: PageTextInput[]): DiffLine[] {
  const aLines: TaggedLine[] = [];
  for (const p of aPages) {
    for (const raw of p.text.split(/\r?\n/)) {
      const line = raw.trim();
      if (line) aLines.push({ text: line, pageIndex: p.pageIndex });
    }
  }

  const bLines: TaggedLine[] = [];
  for (const p of bPages) {
    for (const raw of p.text.split(/\r?\n/)) {
      const line = raw.trim();
      if (line) bLines.push({ text: line, pageIndex: p.pageIndex });
    }
  }

  const n = aLines.length;
  const m = bLines.length;
  if (n === 0 && m === 0) return [];
  if (n === 0) {
    return bLines.map((l) => ({ op: 'insert', text: l.text, bPage: l.pageIndex }));
  }
  if (m === 0) {
    return aLines.map((l) => ({ op: 'delete', text: l.text, aPage: l.pageIndex }));
  }

  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 1);
  const trace: Int32Array[] = [];

  for (let d = 0; d <= max; d++) {
    trace.push(new Int32Array(v));
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0))) {
        x = v[offset + k + 1] ?? 0;
      } else {
        x = (v[offset + k - 1] ?? 0) + 1;
      }
      let y = x - k;
      while (x < n && y < m && aLines[x]?.text === bLines[y]?.text) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        return backtrackMoves(backtrack(trace, aLines, bLines, offset));
      }
    }
  }

  return [];
}

function backtrack(
  trace: Int32Array[],
  aLines: TaggedLine[],
  bLines: TaggedLine[],
  offset: number,
): DiffLine[] {
  const result: DiffLine[] = [];
  let x = aLines.length;
  let y = bLines.length;

  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    if (!v) continue;
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0))) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = v[offset + prevK] ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      const a = aLines[x - 1];
      const b = bLines[y - 1];
      if (a && b) {
        result.push({ op: 'equal', text: a.text, aPage: a.pageIndex, bPage: b.pageIndex });
      }
      x--;
      y--;
    }

    if (d > 0) {
      if (x === prevX) {
        const b = bLines[y - 1];
        if (b) result.push({ op: 'insert', text: b.text, bPage: b.pageIndex });
        y--;
      } else {
        const a = aLines[x - 1];
        if (a) result.push({ op: 'delete', text: a.text, aPage: a.pageIndex });
        x--;
      }
    }
  }

  return result.reverse();
}

function backtrackMoves(lines: DiffLine[]): DiffLine[] {
  const deletedCounts = new Map<string, number>();
  const insertedCounts = new Map<string, number>();
  for (const l of lines) {
    if (l.op === 'delete') deletedCounts.set(l.text, (deletedCounts.get(l.text) ?? 0) + 1);
    if (l.op === 'insert') insertedCounts.set(l.text, (insertedCounts.get(l.text) ?? 0) + 1);
  }
  const movedTexts = new Set<string>();
  for (const [txt, delC] of deletedCounts) {
    if (delC > 0 && (insertedCounts.get(txt) ?? 0) > 0) {
      movedTexts.add(txt);
    }
  }
  return lines.map((l) => {
    if ((l.op === 'delete' || l.op === 'insert') && movedTexts.has(l.text)) {
      return { ...l, op: 'move' };
    }
    if (l.op === 'equal' && l.aPage !== undefined && l.bPage !== undefined && l.aPage !== l.bPage) {
      return { ...l, op: 'move' };
    }
    return l;
  });
}
