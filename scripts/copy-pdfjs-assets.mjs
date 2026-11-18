import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcBase = path.join(root, 'apps/web/node_modules/pdfjs-dist');
const dstBase = path.join(root, 'apps/web/public/pdfjs');

for (const dir of ['cmaps', 'standard_fonts']) {
  const src = path.join(srcBase, dir);
  const dst = path.join(dstBase, dir);
  if (!fs.existsSync(src)) {
    console.warn(`Skipping missing ${src}`);
    continue;
  }
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
  console.log(`Copied ${dir} -> ${dst}`);
}
