# ADR-0001: Lean Monorepo with pnpm Workspaces

- **Status:** Accepted
- **Context:** Airgap PDF needs a DOM-free core (`@airgap-pdf/core`) that can run in browser workers and Node, alongside the React + Vite web app (`@airgap-pdf/web`).
- **Decision:** Start lean in M0/M1 with `apps/web` and `packages/core` in a pnpm workspace, adding `packages/verify` in M2 and `packages/cli` in M9.
- **Consequences:** Low boilerplate for v0.1 while preserving clean separation between core contracts and browser UI.
