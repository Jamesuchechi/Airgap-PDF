export const OCR_PACK_CACHE = 'airgap-ocr-packs';

export interface OcrLanguageInfo {
  code: string;
  label: string;
}

export const KNOWN_LANGUAGES: OcrLanguageInfo[] = [
  { code: 'eng', label: 'English' },
  { code: 'spa', label: 'Spanish' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
];

export interface CachedOcrPack {
  code: string;
  size: number;
  cachedAt: string;
}

/**
 * Resolve the same-origin URL for a self-hosted Tesseract traineddata pack.
 */
export function packUrl(code: string): string {
  const base =
    typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
      ? import.meta.env.BASE_URL
      : '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return new URL(
    `${normalizedBase}tesseract/lang/${encodeURIComponent(code)}.traineddata.gz`,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
  ).toString();
}

export function extractPackCode(urlOrName: string): string {
  const leaf = urlOrName.split('/').pop() ?? urlOrName;
  return leaf.replace(/\.traineddata(\.gz)?$/i, '').trim() || 'eng';
}

export async function listCachedPacks(): Promise<CachedOcrPack[]> {
  if (typeof caches === 'undefined') return [];
  const cache = await caches.open(OCR_PACK_CACHE);
  const requests = await cache.keys();
  const packs: CachedOcrPack[] = [];
  for (const req of requests) {
    const res = await cache.match(req);
    if (!res) continue;
    const lenHeader = res.headers.get('X-Pack-Size') ?? res.headers.get('Content-Length');
    let size = lenHeader ? Number.parseInt(lenHeader, 10) : Number.NaN;
    if (!Number.isFinite(size)) {
      const buf = await res.clone().arrayBuffer();
      size = buf.byteLength;
    }
    packs.push({
      code: extractPackCode(req.url),
      size,
      cachedAt: res.headers.get('X-Cached-At') ?? '',
    });
  }
  return packs.sort((a, b) => a.code.localeCompare(b.code));
}

export async function getPackBytes(code: string): Promise<Uint8Array | null> {
  if (typeof caches === 'undefined') return null;
  const cache = await caches.open(OCR_PACK_CACHE);
  const res = await cache.match(packUrl(code));
  if (!res) return null;
  return new Uint8Array(await res.arrayBuffer());
}

export async function downloadSelfHostedPack(code: string): Promise<CachedOcrPack> {
  if (typeof caches === 'undefined') {
    throw new Error('Cache Storage is unavailable in this browser.');
  }
  const url = packUrl(code);
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(
      `Self-hosted language pack "${code}" is not bundled on this server (HTTP ${res.status}). Upload a .traineddata or .traineddata.gz file instead.`,
    );
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  return storePackBytes(code, bytes);
}

export async function saveUploadedPack(file: File): Promise<CachedOcrPack> {
  const code = extractPackCode(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return storePackBytes(code, bytes);
}

export async function storePackBytes(code: string, bytes: Uint8Array): Promise<CachedOcrPack> {
  if (typeof caches === 'undefined') {
    throw new Error('Cache Storage is unavailable in this browser.');
  }
  const cache = await caches.open(OCR_PACK_CACHE);
  const cachedAt = new Date().toISOString();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const response = new Response(copy.buffer, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.byteLength),
      'X-Pack-Size': String(bytes.byteLength),
      'X-Cached-At': cachedAt,
    },
  });
  await cache.put(packUrl(code), response);
  return { code, size: bytes.byteLength, cachedAt };
}

export async function deleteCachedPack(code: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(OCR_PACK_CACHE);
  await cache.delete(packUrl(code));
}
