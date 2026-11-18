# Show HN Draft

**Title:** Show HN: Airgap PDF – Client-side PDF tools (with real redaction) that work offline

**Body:**

Hi HN! I built Airgap PDF (https://jamesuchechi.github.io/airgap-pdf/), a 100% client-side PDF workbench that never uploads your files—and lets you prove it in 30 seconds.

Why I built it:
- Most "free online PDF tools" upload your contracts, payslips, or scans to someone else's server.
- Even worse, many redaction tools just draw black rectangles over live text.

What makes Airgap PDF different:
1. **CSP-sealed workers:** A strict `<meta>` Content-Security-Policy (`connect-src 'self'`) and a 1-line `blob:` worker shim ensure neither the main thread nor Web Workers/WASM can phone home. Open DevTools → Network or flip on Airplane Mode and everything still works.
2. **Real Redaction + Verifier:** Choose Safe (rasterize) or Precise (content-stream tokenizer + image clipping). Before download unlocks, a verifier re-parses the output and scans extracted text, decompressed streams, annotations, bookmarks, form fields, metadata, and `%%EOF` revisions.
3. **Forensics & Extras:** X-Ray leak audit, Time Machine (inspect/recover earlier incremental PDF revisions), Document Reader & Live Editor, Compare (Myers text diff + visual pixel diff), local Tesseract.js OCR, Document Scanner, URL-fragment Recipes, and `@airgap-pdf/cli` running the same Zod-defined tools in Node.

Repo (Apache-2.0): https://github.com/Jamesuchechi/Airgap-PDF

Would love feedback on the redaction verifier, edge cases on mobile Safari, and what tools to prioritize next!
