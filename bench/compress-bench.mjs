import { createRequire } from 'node:module';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const { PDFDocument, StandardFonts } = webRequire('@cantoo/pdf-lib');

async function runBench() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 20; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`Benchmark page ${i + 1} `.repeat(20), { x: 40, y: 780, size: 11, font });
  }
  const uncompressed = await doc.save({ useObjectStreams: false });
  const t0 = performance.now();
  const reopened = await PDFDocument.load(uncompressed);
  const compressed = await reopened.save({ useObjectStreams: true });
  const dt = performance.now() - t0;

  const ratio = ((1 - compressed.byteLength / uncompressed.byteLength) * 100).toFixed(1);
  console.log(
    `Compress bench: ${uncompressed.byteLength} B -> ${compressed.byteLength} B (${ratio}% saved) in ${dt.toFixed(1)} ms`,
  );
}

await runBench();
