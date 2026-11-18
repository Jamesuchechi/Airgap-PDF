import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.argv[2] ?? 'apps/web/dist');
if (!fs.existsSync(distDir)) {
  console.error(`dist directory not found: ${distDir}`);
  process.exit(1);
}

function walk(dir) {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile() && entry.name !== 'airgap.manifest.json') {
      files.push(full);
    }
  }
  return files;
}

const files = {};
for (const file of walk(distDir)) {
  const rel = path.relative(distDir, file).split(path.sep).join('/');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  files[rel] = hash;
}

const manifest = {
  version: 1,
  commit: process.env.GITHUB_SHA ?? 'local',
  builtAt: process.env.SOURCE_DATE_EPOCH
    ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
    : new Date().toISOString(),
  fileCount: Object.keys(files).length,
  files,
};

const outPath = path.join(distDir, 'airgap.manifest.json');
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${outPath} (${manifest.fileCount} files)`);
