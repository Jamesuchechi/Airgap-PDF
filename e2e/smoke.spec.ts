import http from 'node:http';
import { expect, test } from './fixtures.js';

test.describe('M0 Foundation', () => {
  test('renders Hello Airgap, active CSP pill, and shimmed worker', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Hello Airgap.' })).toBeVisible();
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

    await expect(page.getByRole('heading', { name: 'Hello Airgap.' })).toBeVisible();
    await expect(page.getByTestId('worker-status')).toContainText(
      'ready (maxCanvasPixels=16777216)',
    );
  });
});
