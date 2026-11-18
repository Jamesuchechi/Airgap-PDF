export interface PdfRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ContentToken {
  type: 'op' | 'num' | 'name' | 'str' | 'hex' | 'array' | 'dict' | 'other';
  raw: string;
}

function isWhitespace(ch: number): boolean {
  return ch === 0 || ch === 9 || ch === 10 || ch === 12 || ch === 13 || ch === 32;
}

function isDelimiter(ch: number): boolean {
  return (
    ch === 40 || // (
    ch === 41 || // )
    ch === 60 || // <
    ch === 62 || // >
    ch === 91 || // [
    ch === 93 || // ]
    ch === 123 || // {
    ch === 125 || // }
    ch === 47 || // /
    ch === 37 // %
  );
}

/**
 * Tokenize a decompressed PDF content stream into high-level PDF tokens.
 */
export function tokenizeContentStream(bytes: Uint8Array): ContentToken[] {
  const text = new TextDecoder('latin1').decode(bytes);
  const tokens: ContentToken[] = [];
  const len = text.length;
  let i = 0;

  while (i < len) {
    const ch = text.charCodeAt(i);
    if (isWhitespace(ch)) {
      i++;
      continue;
    }
    // Comment
    if (ch === 37) {
      while (i < len && text.charCodeAt(i) !== 10 && text.charCodeAt(i) !== 13) {
        i++;
      }
      continue;
    }
    // Literal string (...)
    if (ch === 40) {
      const start = i++;
      let depth = 1;
      while (i < len && depth > 0) {
        const c = text.charCodeAt(i);
        if (c === 92) {
          i += 2;
          continue;
        }
        if (c === 40) depth++;
        else if (c === 41) depth--;
        i++;
      }
      tokens.push({ type: 'str', raw: text.slice(start, i) });
      continue;
    }
    // Dict <<...>> or Hex string <...>
    if (ch === 60) {
      if (text.charCodeAt(i + 1) === 60) {
        const start = i;
        i += 2;
        let depth = 1;
        while (i < len && depth > 0) {
          if (text.charCodeAt(i) === 60 && text.charCodeAt(i + 1) === 60) {
            depth++;
            i += 2;
          } else if (text.charCodeAt(i) === 62 && text.charCodeAt(i + 1) === 62) {
            depth--;
            i += 2;
          } else {
            i++;
          }
        }
        tokens.push({ type: 'dict', raw: text.slice(start, i) });
        continue;
      }
      const start = i++;
      while (i < len && text.charCodeAt(i) !== 62) i++;
      if (i < len) i++;
      tokens.push({ type: 'hex', raw: text.slice(start, i) });
      continue;
    }
    // Array [...]
    if (ch === 91) {
      const start = i++;
      let depth = 1;
      while (i < len && depth > 0) {
        const c = text.charCodeAt(i);
        if (c === 40) {
          i++;
          let sDepth = 1;
          while (i < len && sDepth > 0) {
            if (text.charCodeAt(i) === 92) {
              i += 2;
              continue;
            }
            if (text.charCodeAt(i) === 40) sDepth++;
            else if (text.charCodeAt(i) === 41) sDepth--;
            i++;
          }
          continue;
        }
        if (c === 91) depth++;
        else if (c === 93) depth--;
        i++;
      }
      tokens.push({ type: 'array', raw: text.slice(start, i) });
      continue;
    }
    // Name /...
    if (ch === 47) {
      const start = i++;
      while (i < len && !isWhitespace(text.charCodeAt(i)) && !isDelimiter(text.charCodeAt(i))) {
        i++;
      }
      tokens.push({ type: 'name', raw: text.slice(start, i) });
      continue;
    }
    // Number or operator
    const start = i;
    while (i < len && !isWhitespace(text.charCodeAt(i)) && !isDelimiter(text.charCodeAt(i))) {
      i++;
    }
    const raw = text.slice(start, i);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(raw)) {
      tokens.push({ type: 'num', raw });
    } else if (/^(true|false|null)$/.test(raw)) {
      tokens.push({ type: 'other', raw });
    } else {
      tokens.push({ type: 'op', raw });
    }
  }

  return tokens;
}

type Matrix = [number, number, number, number, number, number];

function mulMatrix(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

function rectsIntersect(a: PdfRect, b: PdfRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function estimateTextLength(tok: ContentToken): number {
  if (tok.type === 'str') return Math.max(1, tok.raw.length - 2);
  if (tok.type === 'hex') return Math.max(1, (tok.raw.length - 2) / 2);
  if (tok.type === 'array') {
    const matches = tok.raw.match(/\([^)]*\)|<[^>]*>/g);
    if (!matches) return 4;
    return Math.max(
      1,
      matches.reduce((acc, m) => acc + Math.max(1, m.length - 2), 0),
    );
  }
  return 4;
}

export interface RedactStreamResult {
  bytes: Uint8Array;
  droppedTextOps: number;
  clippedImageOps: number;
}

/**
 * Filter a PDF content stream in Precise mode:
 * - Tracks CTM + text matrices to compute text-run geometry
 * - Drops text-showing operators (Tj, TJ, ', ") whose bounding box intersects any region
 * - Wraps intersecting image/XObject Do operators in an even-odd clip path excluding regions
 */
export function redactContentStream(
  bytes: Uint8Array,
  regions: PdfRect[],
  pageWidth: number,
  pageHeight: number,
): RedactStreamResult {
  if (regions.length === 0) {
    return { bytes, droppedTextOps: 0, clippedImageOps: 0 };
  }

  const tokens = tokenizeContentStream(bytes);
  const out: string[] = [];
  const operands: ContentToken[] = [];

  const ctmStack: Matrix[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  let tm: Matrix = [1, 0, 0, 1, 0, 0];
  let tlm: Matrix = [1, 0, 0, 1, 0, 0];
  let fontSize = 12;
  let leading = 14;
  let droppedTextOps = 0;
  let clippedImageOps = 0;

  const numAt = (idx: number): number => {
    const t = operands[idx];
    return t ? Number.parseFloat(t.raw) || 0 : 0;
  };

  for (const tok of tokens) {
    if (tok.type !== 'op') {
      operands.push(tok);
      continue;
    }

    const op = tok.raw;
    if (op === 'q') {
      ctmStack.push([...ctm]);
      out.push(...operands.map((o) => o.raw), op);
      operands.length = 0;
      continue;
    }
    if (op === 'Q') {
      ctm = ctmStack.pop() ?? [1, 0, 0, 1, 0, 0];
      out.push(...operands.map((o) => o.raw), op);
      operands.length = 0;
      continue;
    }
    if (op === 'cm' && operands.length >= 6) {
      const m: Matrix = [numAt(0), numAt(1), numAt(2), numAt(3), numAt(4), numAt(5)];
      ctm = mulMatrix(m, ctm);
    } else if (op === 'BT') {
      tm = [1, 0, 0, 1, 0, 0];
      tlm = [1, 0, 0, 1, 0, 0];
    } else if (op === 'Tf' && operands.length >= 2) {
      fontSize = Math.abs(numAt(1)) || 12;
    } else if (op === 'TL' && operands.length >= 1) {
      leading = numAt(0);
    } else if (op === 'Tm' && operands.length >= 6) {
      tm = [numAt(0), numAt(1), numAt(2), numAt(3), numAt(4), numAt(5)];
      tlm = [...tm];
    } else if ((op === 'Td' || op === 'TD') && operands.length >= 2) {
      const tx = numAt(0);
      const ty = numAt(1);
      if (op === 'TD') leading = -ty;
      tlm = mulMatrix([1, 0, 0, 1, tx, ty], tlm);
      tm = [...tlm];
    } else if (op === 'T*') {
      tlm = mulMatrix([1, 0, 0, 1, 0, -leading], tlm);
      tm = [...tlm];
    } else if (op === 'Tj' || op === 'TJ' || op === "'" || op === '"') {
      if (op === "'" || op === '"') {
        tlm = mulMatrix([1, 0, 0, 1, 0, -leading], tlm);
        tm = [...tlm];
      }
      const combined = mulMatrix(tm, ctm);
      const scaleY = Math.hypot(combined[2], combined[3]) || 1;
      const scaleX = Math.hypot(combined[0], combined[1]) || 1;
      const h = Math.max(6, fontSize * scaleY);
      const lastArg = operands[operands.length - 1];
      const charCount = lastArg ? estimateTextLength(lastArg) : 4;
      const w = Math.max(8, charCount * fontSize * 0.55 * scaleX);
      const runRect: PdfRect = {
        x: combined[4] - 2,
        y: combined[5] - h * 0.25,
        w: w + 4,
        h: h * 1.25,
      };
      if (regions.some((r) => rectsIntersect(runRect, r))) {
        droppedTextOps++;
        operands.length = 0;
        continue;
      }
    } else if (op === 'Do' && operands.length >= 1) {
      // CTM maps unit square [0,0]..[1,1] for images
      const imgRect: PdfRect = {
        x: Math.min(ctm[4], ctm[4] + ctm[0]),
        y: Math.min(ctm[5], ctm[5] + ctm[3]),
        w: Math.abs(ctm[0]) || pageWidth,
        h: Math.abs(ctm[3]) || pageHeight,
      };
      const hitRegions = regions.filter((r) => rectsIntersect(imgRect, r));
      if (hitRegions.length > 0) {
        clippedImageOps++;
        out.push('q', `0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)} re`);
        for (const r of hitRegions) {
          out.push(`${r.x.toFixed(2)} ${r.y.toFixed(2)} ${r.w.toFixed(2)} ${r.h.toFixed(2)} re`);
        }
        out.push('W*', 'n', ...operands.map((o) => o.raw), op, 'Q');
        operands.length = 0;
        continue;
      }
    }

    out.push(...operands.map((o) => o.raw), op);
    operands.length = 0;
  }

  if (operands.length > 0) {
    out.push(...operands.map((o) => o.raw));
  }

  const encoded = new TextEncoder().encode(`${out.join(' ')}\n`);
  return { bytes: encoded, droppedTextOps, clippedImageOps };
}
