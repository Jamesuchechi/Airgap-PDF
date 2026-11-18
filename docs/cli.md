# Airgap PDF CLI (`@airgap-pdf/cli`)

Run Airgap PDF's client-side tools headlessly in Node.js with zero network calls.

## Installation & Build

```bash
pnpm --filter @airgap-pdf/cli build
node packages/cli/dist/cli.js --help
```

## Commands

- `airgap-pdf list [--json]` — List all Node-capable tools (`runtime: ['browser', 'node']`).
- `airgap-pdf <tool> [inputs...] [flags]` — Run any tool directly. Flags are generated automatically from the tool's Zod schema (`airgap-pdf <tool> --help`).
- `airgap-pdf run <recipe.json> [inputs...] [--out <path> | --out-dir <dir>] [--json]` — Execute a `RecipeV1` JSON pipeline.

## Stdin / Stdout Piping

Pass `-` as the input path to read from `stdin`, and `--out -` to write binary PDF output to `stdout`:

```bash
cat input.pdf | airgap-pdf compress - --level balanced --out - > compressed.pdf
```

## Exit Codes

- `0` — Success
- `1` — Tool or recipe execution error
- `2` — Invalid arguments, flags, or recipe schema
