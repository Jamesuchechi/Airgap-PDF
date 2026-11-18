import { test as base, expect } from '@playwright/test';

const ALLOWED_ORIGINS = new Set(['http://127.0.0.1:4173', 'http://localhost:4173']);

function isAllowedUrl(rawUrl: string): boolean {
  if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
    return true;
  }
  try {
    const parsed = new URL(rawUrl);
    return ALLOWED_ORIGINS.has(parsed.origin);
  } catch {
    return false;
  }
}

/**
 * Global zero-network fixture: fails any test if a page, dedicated worker,
 * or Service Worker completes or sends an off-origin network request.
 */
export const test = base.extend({
  page: async ({ page, context }, use) => {
    const violations: string[] = [];

    const checkUrl = (source: string, url: string) => {
      if (!isAllowedUrl(url)) {
        violations.push(`[${source}] ${url}`);
      }
    };

    // Observe all requests in the browser context (pages, workers, and Service Workers)
    context.on('request', (req) => {
      checkUrl('context.request', req.url());
    });

    // Explicitly observe Service Worker registration & lifecycle
    context.on('serviceworker', (worker) => {
      checkUrl('serviceworker.url', worker.url());
    });

    page.on('request', (req) => {
      checkUrl('page.request', req.url());
    });

    await use(page);

    expect(violations, `Off-origin network requests detected:\n${violations.join('\n')}`).toEqual(
      [],
    );
  },
});

export { expect };
