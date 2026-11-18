# Contributing to Airgap PDF

## The One Rule

**The privacy claim is the product.** Nothing merges that makes a network request carrying user data, adds a third-party origin, or adds analytics/telemetry.

## Local Setup

Requirements: Node 22+ and pnpm 12+.

```bash
pnpm install
pnpm check
pnpm build
pnpm test:e2e
```

## Pull Request Checklist

- `pnpm check` (typecheck + Biome + Vitest) passes
- `pnpm test:e2e` (zero-network + worker CSP + offline) passes
- No new third-party origins, CDNs, or analytics packages
- Architectural decisions are recorded in `docs/adr/`
