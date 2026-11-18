# ADR 0006: Zod-First Tool Schemas & Headless CLI

- **Status:** Accepted
- **Context:** Maintaining separate option forms, CLI flag parsers, and recipe validators for 20+ tools causes drift.
- **Decision:** Each tool declares one `zod` `options` schema via `defineTool`. `ToolOptionsForm` (React), `parseFlagsForSchema` (`@airgap-pdf/cli`), and `validateRecipe` (`@airgap-pdf/core`) all derive directly from that schema.
- **Consequences:** Adding a tool option automatically updates the web UI, CLI `--help` / flags, and recipe validation.
