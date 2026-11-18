# ADR 0004: Dual-Mode Redaction (Safe vs Precise) & Shared Verifier

- **Status:** Accepted
- **Context:** Naive PDF redaction draws black rectangles over live text, leaving secrets extractable.
- **Decision:** Provide two explicit modes:
  1. **Safe (default):** Rasterizes affected pages at chosen DPI, burns black boxes into pixels, and rebuilds cleanly.
  2. **Precise:** Tokenizes content streams, computes text-run geometry, drops intersecting text operators, clips overlapping image `Do` XObjects (`W* n`), and deletes replaced `/Contents` indirect objects.
  Both modes run the shared `verifyRedaction` auditor before unlocking download.
- **Consequences:** Verified against `corpus/redaction-fails/` in CI.
