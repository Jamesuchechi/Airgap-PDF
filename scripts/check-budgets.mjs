import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'apps/web/dist/assets');

if (!fs.existsSync(assetsDir)) {
  console.error(`Missing build output at ${assetsDir}. Run "pnpm build" first.`);
  process.exit(1);
}

let totalJs = 0;
let totalCss = 0;
let largestJs = { name: '', size: 0 };

for (const entry of fs.readdirSync(assetsDir)) {
  const stat = fs.statSync(path.join(assetsDir, entry));
  if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
    totalJs += stat.size;
    if (stat.size > largestJs.size) largestJs = { name: entry, size: stat.size };
  } else if (entry.endsWith('.css')) {
    totalCss += stat.size;
  }
}

const cssBudgetKb = 50;
const largestJsBudgetKb = 1700; // includes pdfjs worker + pdf-lib + tesseract wrapper
const cssKb = +(totalCss / 1024).toFixed(1);
const largestJsKb = +(largestJs.size / 1024).toFixed(1);
const totalJsKb = +(totalJs / 1024).toFixed(1);

console.log(
  `Bundle budgets: CSS=${cssKb} KB (<= ${cssBudgetKb} KB), Largest JS=${largestJs.name} ${largestJsKb} KB (<= ${largestJsBudgetKb} KB), Total JS=${totalJsKb} KB`,
);

if (cssKb > cssBudgetKb || largestJsKb > largestJsBudgetKb) {
  console.error('Bundle budget exceeded!');
  process.exit(1);
}
