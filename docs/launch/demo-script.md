# 60-Second Launch Demo Script

- **0:00–0:10 — Home & Trust Proof:** Open Airgap PDF (`01-home.png`). Point to the top-right Trust Pill (`0 OBSERVED REQUESTS · CSP ACTIVE · OFFLINE READY`) and switch DevTools to Offline / Airplane Mode.
- **0:10–0:25 — Workbench & Editing:** Click **Load sample PDF** (`02-workbench.png`). Rotate page 1, reorder pages, or type new text directly onto the PDF in the Sign & Annotate editor.
- **0:25–0:45 — Real Redaction + Post-Redaction Verifier:** Open **Redact & Verify** (`03-redact-verify.png`). Draw a redaction box or click **+ Emails / + ID / SSN**, run **Redact & Verify** in Safe or Precise mode, and show all 6 leak checks passing before **Download verified copy** unlocks.
- **0:45–0:60 — Compare, Scan & CLI:** Briefly show **Compare PDFs** (Myers text diff + pixelmatch visual diff), **Document Scanner**, and the headless `@airgap-pdf/cli` (`airgap-pdf compress - --level balanced --out -`).

Recorded walkthrough video: [`demo.webm`](./demo.webm)
