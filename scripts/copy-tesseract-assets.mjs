import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const dstDir = path.join(root, 'apps/web/public/tesseract');

fs.mkdirSync(dstDir, { recursive: true });

const tesseractPkg = webRequire.resolve('tesseract.js/package.json');
const workerSrc = path.join(path.dirname(tesseractPkg), 'dist', 'worker.min.js');
if (fs.existsSync(workerSrc)) {
  fs.copyFileSync(workerSrc, path.join(dstDir, 'worker.min.js'));
  console.log(`Copied worker.min.js -> ${dstDir}`);
} else {
  console.warn(`Skipping missing ${workerSrc}`);
}

const tesseractRequire = createRequire(tesseractPkg);
const corePkg = tesseractRequire.resolve('tesseract.js-core/package.json');
const coreDir = path.dirname(corePkg);
for (const entry of fs.readdirSync(coreDir)) {
  if (entry.startsWith('tesseract-core') && (entry.endsWith('.js') || entry.endsWith('.wasm'))) {
    fs.copyFileSync(path.join(coreDir, entry), path.join(dstDir, entry));
  }
}
console.log(`Copied tesseract-core assets -> ${dstDir}`);
