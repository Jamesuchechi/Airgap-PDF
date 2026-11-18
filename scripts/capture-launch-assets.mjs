import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs/launch');
fs.mkdirSync(outDir, { recursive: true });

const server = spawn(
  'pnpm',
  [
    '--filter',
    '@airgap-pdf/web',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4179',
    '--strictPort',
  ],
  { cwd: root, stdio: 'ignore', env: { ...process.env, BASE_PATH: '/' } },
);

async function waitForServer(url) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Preview server did not start in time');
}

try {
  const baseUrl = 'http://127.0.0.1:4179/';
  await waitForServer(baseUrl);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();

  // 1. Home page
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '01-home.png') });

  // 2. Load sample PDF -> Workbench
  await page.getByRole('button', { name: 'Try sample PDF' }).click();
  await page.waitForSelector('ul[aria-label="Page previews"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '02-workbench.png') });

  // 3. Open Redact & Verify
  await page.getByRole('button', { name: /Redact & Verify/i }).click();
  await page.waitForSelector('h1:has-text("Verification")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '03-redact-verify.png') });

  const video = page.video();
  await context.close();
  await browser.close();

  if (video) {
    const rawVideoPath = await video.path();
    const targetVideoPath = path.join(outDir, 'demo.webm');
    fs.renameSync(rawVideoPath, targetVideoPath);
    console.log(`Saved demo video -> ${targetVideoPath}`);
  }
  console.log(`Saved 3 screenshots -> ${outDir}`);
} finally {
  server.kill('SIGTERM');
}
