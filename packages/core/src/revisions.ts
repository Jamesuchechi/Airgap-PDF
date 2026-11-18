export interface RevisionSlice {
  index: number;
  endOffset: number;
  sizeBytes: number;
}

/**
 * Enumerate candidate incremental-update revision boundaries (`%%EOF` markers)
 * in raw PDF bytes, validating preceding `startxref` markers and skipping the
 * initial linearization `%%EOF` when `/Linearized` is present.
 */
function bytesToLatin1(bytes: Uint8Array): string {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return out;
}

export function findPdfRevisions(bytes: Uint8Array): RevisionSlice[] {
  const text = bytesToLatin1(bytes);
  const isLinearized = /\/Linearized\b/.test(text.slice(0, Math.min(text.length, 4096)));

  const eofOffsets: number[] = [];
  let searchFrom = 0;
  while (true) {
    const idx = text.indexOf('%%EOF', searchFrom);
    if (idx === -1) break;
    // Check that a `startxref` appears within the preceding 256 bytes
    const windowStart = Math.max(0, idx - 256);
    const preceding = text.slice(windowStart, idx);
    if (/startxref\s+\d+/.test(preceding)) {
      let end = idx + 5;
      if (text[end] === '\r') end++;
      if (text[end] === '\n') end++;
      eofOffsets.push(end);
    }
    searchFrom = idx + 5;
  }

  // Linearized PDFs have a dummy first %%EOF for the first-page hint table
  const filtered = isLinearized && eofOffsets.length > 1 ? eofOffsets.slice(1) : eofOffsets;

  return filtered.map((endOffset, index) => ({
    index,
    endOffset,
    sizeBytes: endOffset,
  }));
}
