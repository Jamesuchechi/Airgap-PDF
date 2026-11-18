# ADR 0005: Resource Limits & iOS Safari Canvas Caps

- **Status:** Accepted
- **Context:** Client-side PDF processing runs inside browser memory; iOS Safari enforces strict canvas backing-store limits and kills tabs on OOM.
- **Decision:** Enforce `DEFAULT_LIMITS` in `@airgap-pdf/core` (`maxInputBytesDesktop: 500 MB`, `maxInputBytesMobile: 150 MB`, `maxPages: 5000`, `maxCanvasPixels: 16_777_216`, `maxRenderDpi: 300`, `watchdogMs: 30_000`) and eagerly release temporary canvas backing memory after `toBlob`.
- **Consequences:** Large files warn before execution and downscale render viewports cleanly instead of crashing mobile browsers.
