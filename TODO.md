# TODO: Airgap PDF

Working name: **Airgap PDF** (see D1). This file is the execution plan. Architecture lives in
[ARCHITECTURE.md](./ARCHITECTURE.md); product framing lives in [README.md](./README.md).

## How to read this file

- **Order matters.** Milestones are sequenced so that every milestone ends with something shippable.
- **Size legend:** `S` ≤ 2 h · `M` ≤ 1 day · `L` ≤ 3 days · `XL` > 3 days (split it before starting).
- **Every task has an acceptance line.** If you cannot say how you would know it is done, it is not a task yet.
- **Spikes are time-boxed experiments**, not features. They end in a written decision (an ADR), not code you keep.
- `[ ]` open · `[x]` done · `[~]` in progress · `[!]` blocked.

### The one rule

**The privacy claim is the product.** Nothing merges that makes a network request carrying user data,
adds a third-party origin, or adds analytics. This is enforced by CI from M0 onward, not by good intentions.

---

## 0. Decisions to make before writing code

| # | Decision | Options | Recommendation | Blocks |
|---|---|---|---|---|
| D1 | **Name** | Airgap PDF, or your pick | Keep Airgap PDF; `@airgap` npm scope is taken, so use `@airgap-pdf/*` | Repo, npm scope, README |
| D2 | **License** | Apache-2.0 | **Apache-2.0** (patent grant); **no AGPL engines (Ghostscript/MuPDF), ever** | `LICENSE`, M6 |
| D3 | **UI framework & monorepo** | React + Vite + 5 packages vs lean | React + Vite + TS; start with `apps/web` + `packages/core` (keep Zod schemas, hand-write complex UIs) | M0, M1 |
| D4 | **Positioning for v0.1** | Broad toolkit vs. sharp niche | Launch broad on easy tools, but market the **trust + redaction + X-Ray** story. That is the differentiator | Launch copy |
| D5 | **Persistence default** | Persist workspace / memory only | **Memory only by default**, opt-in persistence | M1 storage |
| D6 | **Monetisation** | None / sponsors / paid desktop bundle | None for now. Revisit after traction. Do not design for it | Nothing |

- [ ] **D1** Confirm `@airgap-pdf` npm scope and domain availability. *Done when:* GitHub repo name, `@airgap-pdf` npm scope and domain are confirmed.
- [x] **D2** Switch `LICENSE` to Apache-2.0; write `docs/adr/0002-license.md` in M0 (no AGPL engines).
- [ ] **D3-D6** Record each as a short ADR. *Done when:* `docs/adr/0003…0006` exist.

---

## 1. Spikes (time-boxed research)

Run the cheap, high-risk ones **before** committing to the architecture they affect.
Each spike ends with an ADR or a note appended to ARCHITECTURE.md.

| # | Question | Box | Exit criteria |
|---|---|---|---|
| S1 | Can workers inherit the page's CSP so a `connect-src 'self'` meta tag constrains them on GitHub Pages? | 0.5 day | **Chromium done:** `fetch→Blob` fails on relative imports; 1-line `blob:` `import` shim works. **M0 must verify Firefox & WebKit** before ADR-0009 |
| S2 | Do we need `SharedArrayBuffer` for any engine we want? | 2 h | **Done:** No required engine needs SAB (`@cantoo/pdf-lib`, PDF.js, Tesseract.js single-thread/SIMD, single-thread `qpdf-wasm`, `@jsquash/jpeg`). Drop COOP/COEP (ADR-0004) |
| S3 | Is `pdf-lib` healthy enough? Evaluate maintained forks, object streams, encryption. | 0.5 day | **Done:** `Hopding/pdf-lib` unmaintained since 2021; adopt **`@cantoo/pdf-lib`** (MIT, v2.11.1, supports `useObjectStreams` + AES-256 `encrypt()`) behind `PdfEngine`. Test encrypt+objectStreams in M1 |
| S4 | **Redaction strategy.** (a) rasterise affected pages; (b) rewrite content streams to drop text/image operators inside regions. How feasible is (b) in a few days? | 2 days | Prototype on 10 corpus files + the verifier from M7 passing; ADR-0007 |
| S5 | **Memory ceilings.** Peak heap for merge / render / compress on 10, 50, 200, 500 MB inputs across Chrome, Firefox, desktop Safari, iOS Safari, Android Chrome | 1 day | Table in docs; `MemoryGuard` multipliers calibrated |
| S6 | **Compression pipeline.** Image downsample + recompress (canvas / mozjpeg-wasm / similar), object streams, cleanup. Ratio versus a competitor on 20 real-world PDFs | 1.5 days | A reproducible benchmark script and a go/no-go on a permissive-licensed approach |
| S7 | Name availability (GitHub, npm scope, domain, trademark glance) | 1 h | Decision on D1 |
| S8 | License implications of each candidate engine (qpdf, PDF.js, pdf-lib, Tesseract.js, Ghostscript, MuPDF, PDFium builds) | 2 h | License matrix in ADR-0002. Not legal advice: flag anything ambiguous |
| S9 | Incremental-update (Time Machine) feasibility: can we reliably find `%%EOF` boundaries and reopen truncated revisions with the engines we use? | 0.5 day | Works on 10 hand-made incremental PDFs; known failure cases listed |
| S10 | HEIC/AVIF decoding in-browser (Safari has native HEIC; elsewhere needs WASM) | 2 h | Decision on supported image formats for Images → PDF |

---

## 2. Milestones

### M0: Foundation (day 1-2)

Goal: a lean, instrumented repo with the security guardrails and deployed "hello world" proven before any feature work.

- [x] **(S)** Create repo `Jamesuchechi/airgap-pdf`, finalize `LICENSE` (MIT vs Apache-2.0), `.editorconfig`, `.gitignore`, `.gitattributes` (`*.pdf binary`).
  *Done when:* repo is public with a README stub.
- [x] **(S)** Lean pnpm workspace: `apps/web` + `packages/core` (defer `packages/{verify,cli}` to M2/M9).
  *Done when:* `pnpm -r build` and `pnpm -r typecheck` pass.
- [x] **(S)** Lint + format with Biome; pre-commit via lefthook.
  *Done when:* a bad commit is rejected locally and in CI.
- [x] **(S)** Vitest set up; first test runs in CI.
- [x] **(S)** Vite config: `base` from `BASE_PATH`, hash routing, `build.target` evergreen, `assetsInlineLimit: 0`, worker `format: 'es'`.
- [x] **(S)** Self-host fonts (`Instrument Serif`, `Inter`, `JetBrains Mono`) and add `<meta>` CSP tag in `index.html` (ARCHITECTURE §11.1) + unit test asserting it.
- [x] **(M)** Implement the 1-line `blob:` `import` worker CSP shim (S1) + a trivial "ping" Vite ES module worker.
- [x] **(M)** Playwright set up with the **zero-network guard** as a global fixture (observing pages, dedicated workers, **and Service Workers**) + **offline** fixture helper (`context.setOffline(true)`).
  *Done when:* worker-CSP test passes on **Chromium, Firefox, and WebKit** (an off-origin `fetch()` from a bundled worker is blocked by CSP), and an off-origin request from any context fails CI.
- [x] **(S)** `ci.yml`: install → check → build → e2e on every PR. Cache pnpm store.
- [x] **(M)** `deploy.yml` to GitHub Pages (ARCHITECTURE §19): resolve latest Action tags and pin by commit SHA; emit `airgap.manifest.json`; run `actions/attest-build-provenance` on `airgap.manifest.json`.
  *Done when:* the "hello world" page is live on Pages with CSP and attestation working.
- [x] **(S)** Add `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue/PR templates, and `docs/adr/` (ADR-0001..0009).

**Exit:** `main` is protected; worker-CSP passes on Chromium/Firefox/WebKit; zero-network + offline + deploy/attestation pipeline works.

---

### M1: Runtime and shell (week 1)

Goal: the machinery every tool plugs into, proven by one trivial tool.

**Core (packages/core)**
- [x] **(M)** `defineTool`, `Tool`, `ToolContext`, `ToolResult`, `ok()/fail()` types per ARCHITECTURE §6.
- [x] **(M)** Typed error taxonomy: `PasswordRequired`, `CorruptPdf`, `UnsupportedFeature`, `LimitExceeded`, `OutOfMemory`, `Cancelled`, `EngineUnavailable`. Must survive `structuredClone` across worker boundaries.
  *Done when:* each error round-trips through Comlink with its class and fields intact.
- [x] **(S)** `pageRange()` zod type + parser (`1-3,5,8-` / `odd` / `even` / `last-2` / `all`), 1-based in UI, 0-based internally.
  *Done when:* fast-check property tests pass (round-trip, no duplicates, always within bounds).
- [x] **(M)** `Limits` object (max pages, max decoded stream, max canvas pixels, depth, watchdog) with defaults from ARCHITECTURE §12.
- [x] **(M)** `Blob`-backed `Asset` model + lightweight `Version` model (defer SHA-256 content-addressing & OPFS/IDB to M2/M3).
- [x] **(S)** Tool registry: auto-discovery through a generated index (no manual list to forget).
- [x] **(M)** Tool-harness test helper: given a tool + fixtures, asserts the universal invariants (opens output, cancellable, no network, deterministic where claimed, progress is monotonic).

**Engines (apps/web/src/engines)**
- [x] **(M)** `PdfEngine` interface + **`@cantoo/pdf-lib`** adapter (open, copy pages, rotate, delete, save with `useObjectStreams`, `encrypt`). Include a cross-viewer test for `encrypt()` + `useObjectStreams: true`.
- [x] **(M)** `RenderEngine` interface + PDF.js adapter (render page → `ImageBitmap`/`Blob`, extract text with positions). Self-host `cmaps/` and `standard_fonts/` in `public/pdfjs/`, set `isEvalSupported: false`, disable scripting, and route PDF.js worker through the `blob:` CSP shim.
- [x] **(S)** Lazy engine loader with capability negotiation and a clear `EngineUnavailable` failure.

**Execution**
- [x] **(L)** Worker pool: size = `min(hardwareConcurrency - 1, 4)`, Comlink RPC, `Blob` inputs (never detach main thread's canonical copy), per-job `MessageChannel` for progress and cancellation, hard-cancel by terminating and respawning the worker, and **terminate idle heavy WASM workers** after use.
  *Done when:* cancelling a 500-page merge frees the worker within 500 ms and the UI stays at 60 fps throughout.
- [x] **(M)** `MemoryGuard`: estimates peak usage = input size × tool multiplier; warns or refuses; uses `navigator.deviceMemory` where present and conservative defaults where not.
- [x] **(M)** Watchdog: a job with no progress for N seconds is flagged and offers to cancel.

**Storage**
- [x] **(M)** In-memory `Blob` workspace store (default) with undo/redo stack (OPFS/IDB persistence deferred to M2/M3).

**Shell (apps/web)**
- [x] **(M)** App skeleton: hash router, layout, error boundary, toast system, theme (system/light/dark).
- [x] **(L)** File ingest: drag-and-drop, file picker, paste, folder drop, multi-select. Detect type by magic bytes, not extension. Reject non-PDF early with a useful message.
- [x] **(M)** Command palette (`⌘/Ctrl-K`) generated from the tool registry.
- [x] **(M)** Auto-generated tool options form from zod schema (fields: number, enum, boolean, string, page-range, color, file). Custom component override hook.
- [x] **(M)** Job panel: progress, cancel, retry, per-job log, memory warnings.
- [x] **(S)** Result handling: download, download all as zip (fflate), "use result as input" (chain).
- [x] **(S)** First tool end-to-end: **rotate** (also the template for `pnpm new:tool`).
- [x] **(M)** `pnpm new:tool <id>` scaffold script.

**Exit:** a user can drop a PDF, rotate it, undo, and download it; the work runs in a worker; the zero-network and offline e2e tests pass.

---

### M2: v0.1 "Organize" + Trust v1 (week 2) **→ first public release**

Goal: the tools everyone needs, plus the thing nobody else has.

**Organize tools**
- [x] **(M)** Merge (drag to order, per-file page ranges, bookmarks preserved where feasible).
- [x] **(M)** Split (ranges, every N pages, by bookmark, by blank-page separator).
- [x] **(M)** Delete / extract / duplicate pages.
- [x] **(L)** Visual page organizer: virtualised thumbnail grid (PDF.js render in worker, LRU cache), drag reorder, multi-select, rotate-in-place, keyboard operable.
  *Done when:* a 300-page document scrolls smoothly and reorders without dropping frames.
- [x] **(S)** Insert blank pages; interleave odd/even scans.

**Trust v1**
- [x] **(M)** **Trust panel** UI: `"0 observed requests · CSP active"` status, active CSP, allowed origins, session request log, link to verification steps.
- [x] **(M)** Request observer: `PerformanceObserver` for resource timing on the main thread + wrapped `fetch/XMLHttpRequest/WebSocket/sendBeacon` in workers reporting to the panel. Label honestly as *observed*.
- [x] **(M)** Build manifest: after build, emit `airgap.manifest.json` with a SHA-256 for every file; include commit SHA and build time.
- [x] **(M)** Provenance: `actions/attest-build-provenance` on `apps/web/dist/airgap.manifest.json` (plus entry bundles).
- [x] **(L)** `@airgap-pdf/verify` CLI (`packages/verify`): fetch deployed files, hash them, compare to the manifest, and verify the attestation.
  *Done when:* it passes on the live site and fails when a file is altered.
- [x] **(S)** "Offline ready" indicator wired to the service worker's precache status.

**PWA**
- [x] **(M)** `vite-plugin-pwa` (Workbox): precache the app shell; runtime-cache lazy WASM chunks on first use; never auto-reload during a running job (update prompt instead).
- [x] **(S)** Manifest, icons (maskable), theme colors, offline fallback page.

**Launch plumbing**
- [ ] **(S)** README screenshots / GIF of the flow; fill the status column honestly.
- [ ] **(S)** Tag `v0.1.0`, GitHub Release with the build manifest attached.

**Exit:** merge/split/reorder/rotate/delete work on real files; Trust panel is live; build verification works; the site works offline.

---

### M3: Convert + Recipes (week 3)

- [x] **(M)** Images → PDF: page size options (fit, A4, Letter), margins, orientation, per-image reorder. Formats per S10.
- [x] **(M)** PDF → images: DPI, format, page range; zip export; progress.
- [x] **(S)** Enforce canvas size limits; downscale automatically with a notice (iOS Safari pixel cap).
- [x] **(M)** PDF → text / Markdown for text-layer PDFs, with reading-order heuristics and a "this looks scanned, try OCR" hint.
- [x] **(L)** **Recipes v1**: schema `v1`, validation against tool schemas, runner that chains outputs to inputs, UI builder (add/reorder/remove steps, per-step options), save/load JSON, URL-fragment sharing (`deflate` + base64url).
  *Done when:* a shared link recreates the identical recipe, and the same JSON runs unchanged in the CLI later.
- [x] **(S)** Recipe versioning + migrations scaffold.
- [x] **(S)** A "recipe gallery" of 5-10 useful presets shipped in-repo.

---

### M4: Edit and Sign (weeks 4-5)

- [x] **(L)** Signature manager: draw (pressure-smooth canvas), type (font choices), upload image (background removal). Stored locally only if persistence is on.
- [x] **(L)** Placement editor: drag/resize on the page, multiple placements, date/initials stamps.
- [x] **(M)** Watermark (text/image, opacity, angle, tile, page range).
- [x] **(M)** Page numbers, headers/footers with tokens (`{n}`, `{total}`, `{date}`, `{filename}`).
- [x] **(M)** **Bates numbering** (prefix, start, digits, position, per-file or continuous across a merged set).
- [x] **(M)** Crop and resize pages to a paper size.
- [x] **(M)** Metadata editor (Info dict + XMP).
- [x] **(L)** AcroForm fill + flatten, with field discovery UI. Document XFA as unsupported with a clear message.
- [x] **(XL → split)** Annotation editor: overlay layer on PDF.js render → flatten into the PDF. Split into: (a) highlight/underline/strike, (b) text box + shapes, (c) freehand, (d) stamps/images, (e) undo/redo + selection model.
- [x] **(S)** Accessibility pass on every editor: keyboard operable, focus-visible, labelled controls.

---

### M5: Protect + Inspect (weeks 5-6)

- [x] **(L)** Password protect (AES-256) & remove password (when password known) via `@cantoo/pdf-lib` behind `PdfEngine` (qpdf WASM deferred until linearize/repair is needed).
- [x] **(L)** **Sanitize**: strip metadata, XMP, JavaScript, embedded files, hidden OCG layers, comments, form data; configurable per option; produces a before/after report.
- [x] **(XL → split)** **X-Ray** report:
  - (a) Info dict + XMP + producer/creator chain
  - (b) Embedded files, JavaScript, launch/URI actions
  - (c) OCG/hidden layers, annotations, comments, form fields with values
  - (d) Embedded images: EXIF/GPS, original dimensions, color profile
  - (e) Revision count and sizes
  - (f) Risk summary with severity + one-click "fix with Sanitize"
- [x] **(L)** **Time Machine** per S9: enumerate revisions, render each, diff text between revisions, export any revision.
- [x] **(M)** Export X-Ray report as JSON/Markdown (contains no file content, only findings).

---

### M6: Compress + OCR (weeks 6-8)

- [x] **(XL → split)** Compression per S6 and ADR-0002:
  - (a) Baseline: object streams + stream recompression + dedupe + drop unused objects
  - (b) Image pipeline: detect, downsample to target DPI, re-encode, skip already-small images
  - (c) Presets (Light / Balanced / Strong) with a before/after size estimate
  - (d) Never make a file bigger: if output ≥ input, return the original and say so
  - (e) Benchmark script in `bench/` and results in docs
- [x] **(L)** OCR via Tesseract.js: language packs downloaded on demand from our own origin (never a CDN), progress per page, output searchable PDF with an invisible text layer positioned from word boxes.
  *Done when:* a scanned page is searchable and selectable in a stock PDF viewer, and OCR works offline once the pack is cached.
- [x] **(M)** Language-pack manager (download, cache, delete, size shown).
- [x] **(M)** Pre-OCR cleanup: deskew, contrast, despeckle (Canvas/OffscreenCanvas).

---

### M7: Real redaction + Verify Redaction (weeks 8-10)

This is the flagship. Do not rush it, and do not ship a half-version: a bad redaction tool is worse than none.

- [x] **(L)** Redaction UI: draw regions, search-and-redact (text, regex, presets for email/phone/IBAN/ID-like patterns), preview with "burned-in" rendering.
- [x] **(L)** Safe mode: rasterise affected pages at chosen DPI, replace page content.
- [x] **(XL → split)** Precise mode per S4: (a) content-stream tokenizer, (b) text-run geometry, (c) drop/clip operators under regions, (d) image masking, (e) fonts/ToUnicode leftovers.
- [x] **(L)** **Post-redaction verifier** (shared with Verify Redaction): re-extract text; scan raw decompressed streams; annotations; bookmarks; form fields; attachments; metadata; previous revisions. Fails loudly with locations.
  *Done when:* it catches every leak in a corpus of intentionally-bad redactions in `corpus/redaction-fails/`.
- [x] **(M)** **Verify Redaction** page: audit any PDF, report suspicious black boxes with text underneath.
- [x] **(M)** Redaction log (what was removed, counts, never the content) exportable for audit.
- [x] **(M)** Prominent in-app explainer of Safe vs Precise.

---

### M8: Compare + Scan (weeks 10-12)

- [x] **(L)** Compare: text diff (Myers) with page mapping, insert/delete/move highlighting.
- [x] **(L)** Visual diff: render both at the same DPI, align, `pixelmatch` overlay, tolerance slider, swipe / onion-skin / side-by-side views.
- [x] **(M)** Compare report export (PDF with changes highlighted).
- [x] **(L)** Scanner mode: `getUserMedia`, capture, edge detection, perspective correction, filters (B/W, grayscale, color), multi-page, reorder, export. Works on iOS Safari and Android Chrome.
- [x] **(M)** Scanner: manual corner adjustment fallback when auto-detect fails.

---

### M9: CLI, embed, integration (weeks 12-13)

- [x] **(L)** `@airgap-pdf/cli`: flags generated from zod schemas, `run recipe.json`, stdin/stdout piping, exit codes, `--json` output.
- [x] **(M)** Verify tools declaring `runtime: ['browser','node']` pass the same harness in Node (use `@napi-rs/canvas` for render-dependent tools).
- [x] **(M)** Embed routes (`#/embed/<tool>`) with a minimal chrome and optional `postMessage` API (`ready`, `result`, `error`). Document origin checks.
- [x] **(M)** PWA `file_handlers` (open PDFs with the app on desktop Chromium) and `share_target` (Android).
- [x] **(S)** Docs: CLI usage, embed guide, recipe cookbook.

---

### M10: Hardening and launch (weeks 13-14)

- [ ] **(L)** Security review pass: fuzz the open path with malformed PDFs (timeouts, memory), review every `innerHTML`/`dangerouslySetInnerHTML` (should be zero), review limits.
- [ ] **(M)** Accessibility audit (axe in CI + manual screen-reader pass), keyboard-only run-through of every tool.
- [ ] **(M)** i18n: extract strings, ship English + 2 community-ready locales, RTL check.
- [ ] **(M)** Performance pass against budgets (ARCHITECTURE §23); Lighthouse CI.
- [ ] **(M)** Cross-browser matrix manual pass (Chrome, Firefox, Safari, iOS Safari, Android Chrome).
- [ ] **(S)** Publish measured limits table (from S5) to the README.
- [ ] **(M)** Launch assets: 60-second demo video, 3-screenshot set, comparison page, a "How to verify we don't upload your files" blog post.
- [ ] **(S)** Launch posts (Show HN, r/selfhosted, r/privacy, Product Hunt, relevant legal/HR communities). Lead with the **verifiable privacy** and **real redaction** angles.
- [ ] **(S)** Triage process: labels, `good first issue` list of 15+ small tools/fixes.

---

## 3. Cross-cutting checklists

### Definition of Done (every PR)

- [ ] Types, lint, unit tests pass
- [ ] If it touches a tool: harness invariants pass (opens, cancellable, no network, progress monotonic)
- [ ] If it touches the UI: keyboard operable, labelled, works at 360 px width, works in dark mode
- [ ] Zero-network and offline e2e still pass
- [ ] Bundle budget unchanged or justified
- [ ] User-facing strings are extractable (no hard-coded copy)
- [ ] Docs/README status column updated
- [ ] No new third-party origin; no new runtime dependency without an ADR if it is > 50 KB gzipped or has a copyleft license

### Test corpus to build (`corpus/`)

- [ ] `normal/`: text-heavy, image-heavy, forms, bookmarks, multi-column, RTL, CJK, rotated pages
- [ ] `hostile/`: truncated, broken xref, circular page tree, huge page count, decompression bombs, giant MediaBox, invalid fonts
- [ ] `weird/`: incrementally-updated, linearized, encrypted (RC4/AES), XFA, portfolio/attachments, JavaScript-bearing
- [ ] `redaction-fails/`: black boxes over live text, annotation-only redactions, redacted-but-revisioned files
- [ ] `scans/`: skewed, low contrast, mixed languages for OCR
- [ ] Keep checked-in files tiny; fetch larger ones via `pnpm corpus:fetch`

### Security backlog

- [ ] Threat model reviewed and kept in ARCHITECTURE §11 and §12
- [ ] Dependency scanning (Dependabot/Renovate) with a **14-day cool-off** on new releases before upgrade
- [ ] Lockfile review in PRs; no install scripts without review
- [ ] Subresource integrity not applicable (no CDNs): keep it that way
- [ ] `SECURITY.md` with private reporting and response targets

### Community and docs

- [ ] `CONTRIBUTING.md`: setup, add-a-tool, test, ADR process
- [ ] Architecture diagrams kept in Mermaid in the repo
- [ ] Changelog via Changesets
- [ ] Roadmap issues mirror this file's milestones
- [ ] Discussions enabled; a short "Why no analytics?" pinned post

---

## 4. Risk register

| Risk | Likelihood | Impact | Mitigation / trigger |
|---|---|---|---|
| pdf-lib is effectively unmaintained | High | Medium | `PdfEngine` abstraction (ADR-0003); fork or swap engine; S3 early |
| Copyleft engine (Ghostscript/MuPDF) pulled in accidentally | Medium | High | License matrix (S8); CI license check; heavy engines isolated and optional |
| Large files crash mobile browsers | High | High | `MemoryGuard`, measured ceilings, streaming where possible, clear messaging |
| Redaction bug leaks data | Medium | **Severe** | Mandatory post-redaction verifier; adversarial corpus; Safe mode default; slow, tested rollout |
| WASM bundle sizes hurt first load | Medium | Medium | Lazy-load per tool; precache after first idle; budgets in CI |
| GitHub Pages limits (site size, bandwidth, build frequency) | Low-Med | Medium | Keep dist well under limits; fall back to Cloudflare Pages/Netlify; nothing is Pages-specific |
| "Observed requests" misread as proof | Medium | Medium | Honest labelling; documented limits; CI network tests are the real guard |
| Scope creep into Office conversion | High | Medium | Explicit non-goal in README; point people elsewhere |
| Maintainer burnout (solo) | Medium | High | Tool registry lowers contribution cost; `good first issue` pipeline; strict scope |
| Name/trademark conflict | Low | Medium | S7 before public launch |

---

## 5. Parking lot (ideas, not commitments)

- PAdES cryptographic signing (with local key files / WebCrypto)
- PDF/A validation (read-only checker, not converter)
- Form builder (create fillable fields)
- "Print to Airgap" virtual printer companion (desktop)
- Browser extension: right-click a PDF link → open in Airgap locally
- Batch mode: drop a folder of PDFs, apply a recipe to each, zip the results
- Table extraction → CSV/XLSX
- Accessibility checker (tags, reading order, alt text) for PDFs
- Local-LLM summarisation via WebGPU (strictly opt-in, strictly local)
- Folder-watching on desktop via File System Access API
- Redaction presets by jurisdiction (GDPR, HIPAA-style identifiers)
- Print-ready imposition (booklet, n-up)
- Plugin system for third-party tool packs (needs a sandbox design first)

---

## 6. First two hours: copy-paste bootstrap

```bash
mkdir airgap-pdf && cd airgap-pdf
git init -b main
corepack enable
cat > package.json <<'EOF'
{
  "name": "airgap-pdf",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "pnpm --filter @airgap/web dev",
    "build": "pnpm -r build",
    "check": "pnpm -r typecheck && pnpm lint && pnpm test",
    "lint": "biome check .",
    "test": "vitest run",
    "test:e2e": "playwright test"
  }
}
EOF
printf "packages:\n  - 'apps/*'\n  - 'packages/*'\n" > pnpm-workspace.yaml
mkdir -p apps/web packages/core corpus e2e docs/adr
pnpm add -Dw typescript vitest @biomejs/biome @playwright/test fast-check
pnpm create vite apps/web --template react-ts
pnpm --filter ./apps/web add comlink zod zustand fflate @cantoo/pdf-lib pdfjs-dist
pnpm --filter ./apps/web add -D vite-plugin-pwa
```

Then: commit, push, enable GitHub Pages (Source: GitHub Actions), and land the `ci.yml` + `deploy.yml`
from ARCHITECTURE §19 before writing a single tool.