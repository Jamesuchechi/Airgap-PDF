# ADR 0003: `PdfEngine` & `RenderEngine` Abstraction

- **Status:** Accepted
- **Context:** `@cantoo/pdf-lib` handles structural PDF editing and AES-256 encryption, while `pdfjs-dist` handles accurate page rendering and text extraction. Coupling tools directly to library internals would make future engine swaps (e.g., MuPDF/PDFium WASM) difficult.
- **Decision:** Define `PdfEngine`, `PdfDoc`, and `RenderEngine` interfaces in `@airgap-pdf/core` (`packages/core/src/engines.ts`). Tools receive `ctx.pdf` and `ctx.render` via `ToolContext`.
- **Consequences:** All 21 Node-capable tools run identically in browser Web Workers and `@airgap-pdf/cli` without DOM coupling.
