import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('index.html CSP', () => {
  it('contains the strict meta CSP policy with no unsafe-inline or external origins', () => {
    expect(indexHtml).toContain('http-equiv="Content-Security-Policy"');
    expect(indexHtml).toContain("default-src 'none'");
    expect(indexHtml).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(indexHtml).toContain("worker-src 'self' blob:");
    expect(indexHtml).toContain("style-src 'self'");
    expect(indexHtml).toContain("font-src 'self'");
    expect(indexHtml).toContain("connect-src 'self'");
    expect(indexHtml).toContain("base-uri 'none'");
    expect(indexHtml).toContain("form-action 'none'");
    expect(indexHtml).toContain("object-src 'none'");
    expect(indexHtml).not.toContain('unsafe-inline');
    expect(indexHtml).not.toMatch(/https?:\/\//);
  });
});
