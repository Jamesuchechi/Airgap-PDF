# How to Verify Airgap PDF Doesn't Upload Your Files

"Client-side" is easy to claim and rarely checked. Airgap PDF is designed so you can verify **zero uploads** yourself in under 30 seconds.

## 1. Watch the Network Tab

1. Open DevTools (`F12` or `Cmd+Opt+I`) → **Network** tab.
2. Check **Preserve log** and clear existing entries.
3. Drop a sensitive PDF into Airgap PDF and run **Rotate**, **Compress**, **OCR**, or **Redact & Verify**.
4. **Result:** Zero network requests leave the page. Every asset (`worker.min.js`, `pdf.worker.min.mjs`, `tesseract-core*.wasm.js`) is served from `'self'` (your own origin) and cached locally.

## 2. Pull the Plug (Airplane Mode)

1. Load Airgap PDF once so the Service Worker precaches the app shell.
2. Turn off Wi-Fi / enable **Airplane Mode** (or check **Offline** in DevTools → Network).
3. Reload the page and process a PDF.
4. **Result:** Everything continues to work from a cold start offline.

## 3. Inspect the Content-Security-Policy & Trust Panel

Click the **Trust Pill** (`0 OBSERVED REQUESTS · CSP ACTIVE`) in the top bar.
The `<meta http-equiv="Content-Security-Policy">` enforces:

- `default-src 'self'`
- `connect-src 'self'` (the browser itself blocks `fetch`, `XHR`, `WebSocket`, and `sendBeacon` to any external host)
- `worker-src 'self' blob:` (workers are wrapped in a 1-line blob shim so they inherit the page's `<meta>` CSP)

## 4. Verify the Deployed Build Against CI

Every deployment ships `airgap.manifest.json` with SHA-256 hashes of all built files:

```bash
npx @airgap-pdf/verify https://jamesuchechi.github.io/airgap-pdf/
```

If any deployed file differs from the public CI build, `@airgap-pdf/verify` reports the exact mismatch.
