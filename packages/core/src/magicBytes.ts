/** Detect PDF or common image MIME types from magic bytes, never from file extension. */
export async function sniffMime(blob: {
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
}): Promise<string> {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (head.length >= 5) {
    // %PDF- (allow leading whitespace/BOM within first 16 bytes)
    const ascii = String.fromCharCode(...head);
    if (ascii.includes('%PDF-')) return 'application/pdf';
  }
  if (
    head.length >= 8 &&
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47
  ) {
    return 'image/png';
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    head.length >= 12 &&
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50
  ) {
    return 'image/webp';
  }
  return 'application/octet-stream';
}
