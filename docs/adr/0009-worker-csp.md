# ADR-0009: Worker CSP Inheritance via 1-Line `blob:` Import Shim

- **Status:** Accepted (verified on Chromium, Firefox, and WebKit in M0)
- **Context:** GitHub Pages cannot set HTTP `Content-Security-Policy` headers on worker scripts, and direct `new Worker(url)` workers ignore the document's `<meta>` CSP. Meanwhile, `fetch(url) → Blob` fails on Vite ES module workers containing relative chunk imports.
- **Decision:** Bootstrap every worker (including library-spawned workers) via a 1-line `blob:` `import` shim (`new Blob([\`import \${JSON.stringify(absUrl)};\`])`), and observe Service Workers in the Playwright zero-network fixture.
- **Consequences:** Workers inherit `connect-src 'self'` while resolving relative ES module chunks and `import.meta.url` normally.
