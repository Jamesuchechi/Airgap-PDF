import http from 'node:http';
import { expect, test } from './fixtures.js';

test.describe('M0 Foundation', () => {
  test('renders Hello Airgap, active CSP pill, and shimmed worker', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Your PDF never leaves the room.' }),
    ).toBeVisible();
    await expect(page.getByTestId('trust-pill')).toContainText('0 OBSERVED REQUESTS · CSP ACTIVE');
    await expect(page.getByTestId('worker-status')).toContainText(
      'ready (maxCanvasPixels=16777216)',
    );
  });

  test('blob-shimmed worker inherits meta CSP and blocks off-origin fetch', async ({ page }) => {
    let originBHits = 0;
    const serverB = http.createServer((_req, res) => {
      originBHits += 1;
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('leaked');
    });
    await new Promise<void>((resolve) => serverB.listen(0, '127.0.0.1', resolve));
    const addr = serverB.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed to bind serverB');
    const originBUrl = `http://127.0.0.1:${addr.port}/`;

    try {
      await page.goto('/');
      await expect(page.getByTestId('worker-status')).toContainText('ready');

      const result = await page.evaluate(async (targetUrl) => {
        if (!window.__airgapProbeWorkerFetch) {
          throw new Error('__airgapProbeWorkerFetch not registered');
        }
        return window.__airgapProbeWorkerFetch(targetUrl);
      }, originBUrl);

      expect(result.blocked).toBe(true);
      expect(originBHits).toBe(0);
    } finally {
      serverB.close();
    }
  });

  test('works offline after initial Service Worker precache', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByTestId('sw-status')).toContainText('ready (offline capable)');

    await context.setOffline(true);
    await page.reload();

    await expect(
      page.getByRole('heading', { name: 'Your PDF never leaves the room.' }),
    ).toBeVisible();
    await expect(page.getByTestId('worker-status')).toContainText(
      'ready (maxCanvasPixels=16777216)',
    );
  });

  test('Home -> Trust modal -> Redact & Verify blocked download guard', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Your PDF never leaves the room.' }),
    ).toBeVisible();

    await page.getByTestId('trust-pill').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: /Redact, verified/i }).click();
    await expect(page.getByRole('heading', { name: 'Verification' })).toBeVisible();

    const blockedBtn = page.getByRole('button', { name: /Download verified copy/i });
    await expect(blockedBtn).toBeDisabled();

    await page.getByRole('button', { name: 'Rebuild without history' }).click();
    await expect(blockedBtn).toBeEnabled();
  });

  test('M1/M2: sample PDF -> rotate -> organize pages -> undo -> download', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try sample PDF' }).click();

    await expect(page.getByRole('heading', { name: /sample-contract\.pdf/ })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Page 1 preview' })).toBeVisible();

    await page.getByRole('button', { name: 'Run rotate pages' }).click();
    await expect(page.getByRole('status')).toContainText('rotate finished');

    await page.getByRole('button', { name: 'Organize pages' }).click();
    await page.getByRole('button', { name: 'Move page 1 right' }).click();
    await page.getByRole('button', { name: 'Run organize pages' }).click();
    await expect(page.getByRole('status')).toContainText('reorder finished');

    const undoBtn = page.getByRole('button', { name: 'Undo' });
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();

    const redoBtn = page.getByRole('button', { name: 'Redo' });
    await expect(redoBtn).toBeEnabled();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('sample-contract-rotated.pdf');
  });

  test('M4: type new text onto PDF and save via worker', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try sample PDF' }).click();
    await expect(page.getByRole('img', { name: 'Page 1 preview' })).toBeVisible();

    await page.getByRole('button', { name: 'Edit, annotate & sign' }).click();
    const editable = page.getByRole('img', { name: 'Editable page 1' });
    await expect(editable).toBeVisible();

    await page.getByLabel('Text to place on page').fill('Approved by Ada');
    await editable.click({ position: { x: 80, y: 120 }, force: true });

    await page.getByRole('button', { name: /Apply & Save PDF \(1\)/ }).click();
    await expect(page.getByRole('status')).toContainText('annotate finished');
  });
});
