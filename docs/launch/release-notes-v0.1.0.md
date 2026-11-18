# Airgap PDF v0.1.0 Release Notes

**PDF tools that keep working with the Wi-Fi switched off.**

## Highlights

- **25+ Client-Side PDF Tools:** Organize (merge, split, reorder, rotate, delete, extract, insert blank, interleave), Convert (images ↔ PDF, PDF → text, local Tesseract.js OCR), Edit & Sign (inline Reader & Editor, annotations, signatures, AcroForms, watermark, page numbers, Bates, metadata, crop/resize), Compress (never-make-bigger guard), and Protect/Inspect (AES-256 protect/unlock, Sanitize with removal report, X-Ray, Time Machine).
- **Real Redaction + Post-Redaction Verifier:** Safe (rasterize) and Precise (content-stream tokenizer + image clipping) modes, gated by an automated 6-point leak verifier + standalone **Verify Redaction** auditor.
- **Compare & Document Scanner:** Myers text diff (insert/delete/move) + perceptual pixelmatch-style visual diff overlay + PDF report export, plus camera/photo document scanning with edge detection, manual 4-corner adjustment, perspective warp, and B/W/grayscale/color filters.
- **Verifiable Privacy:** `<meta>` CSP (`connect-src 'self'`), 1-line `blob:` worker shim, Trust telemetry panel, Offline PWA (`file_handlers` + `share_target`), `@airgap-pdf/verify` build manifest verifier, and `@airgap-pdf/cli` for headless Node execution.
