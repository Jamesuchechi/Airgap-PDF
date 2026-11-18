# ADR-0002: Apache-2.0 License and Permissive-Only Engines

- **Status:** Accepted
- **Context:** Strong PDF compressors/renderers (Ghostscript, MuPDF) are dual-licensed AGPL-3.0 / Commercial.
- **Decision:** License Airgap PDF under **Apache-2.0** (for its explicit patent grant) and **never** ship AGPL engines. Rely exclusively on permissive MIT / Apache-2.0 / BSD engines (`@cantoo/pdf-lib`, `PDF.js`, `qpdf-wasm`, `Tesseract.js`, `fflate`, `@jsquash/jpeg`).
- **Consequences:** Slightly lower compression ratios than Ghostscript, but unambiguous permissive licensing for all users and contributors.
