import { AirgapError, type Asset, sanitizeFilename, sniffMime } from '@airgap-pdf/core';
import { PDFDocument, rgb, StandardFonts } from '@cantoo/pdf-lib';
import { zipSync } from 'fflate';

export async function ingestFiles(files: FileList | File[]): Promise<Asset[]> {
  const list = Array.from(files);
  const assets: Asset[] = [];

  for (const file of list) {
    const mime = await sniffMime(file);
    if (mime !== 'application/pdf') {
      throw new AirgapError(
        'UnsupportedFeature',
        `Unsupported file type: ${mime} (${file.name})`,
        `"${file.name}" is not a valid PDF (detected ${mime} from file header).`,
      );
    }
    const { name, stem } = sanitizeFilename(file.name);
    assets.push({
      id: crypto.randomUUID(),
      name,
      stem,
      mime,
      size: file.size,
      blob: file,
    });
  }
  return assets;
}

export async function createSamplePdf(): Promise<Asset> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Airgap PDF — Sample Page ${i}`, {
      x: 56,
      y: 760,
      size: 22,
      font,
      color: rgb(0.08, 0.1, 0.09),
    });
    page.drawText('Processed 100% locally in your browser. Zero bytes uploaded.', {
      x: 56,
      y: 720,
      size: 12,
      font,
      color: rgb(0.3, 0.35, 0.32),
    });
  }
  const bytes = await doc.save({ useObjectStreams: true });
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/pdf' });
  return {
    id: crypto.randomUUID(),
    name: 'sample-contract.pdf',
    stem: 'sample-contract',
    mime: 'application/pdf',
    size: blob.size,
    blob,
  };
}

export function downloadAsset(asset: Asset): void {
  const url = URL.createObjectURL(asset.blob as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = asset.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadAllAsZip(
  assets: Asset[],
  zipName = 'airgap-outputs.zip',
): Promise<void> {
  const entries: Record<string, Uint8Array> = {};
  for (const asset of assets) {
    entries[asset.name] = new Uint8Array(await asset.blob.arrayBuffer());
  }
  const zipped = zipSync(entries);
  const copy = new Uint8Array(zipped.byteLength);
  copy.set(zipped);
  const blob = new Blob([copy], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
