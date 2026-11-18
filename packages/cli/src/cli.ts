#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  AirgapError,
  type Asset,
  DEFAULT_LIMITS,
  migrateRecipe,
  type RecipeV1,
  type ToolContext,
  validateRecipe,
} from '@airgap-pdf/core';
import { cantooPdfEngine } from '../../../apps/web/src/engines/cantooPdfLib.js';
import { getNodeTool, NODE_TOOLS } from '../../../apps/web/src/tools/nodeRegistry.js';
import { describeFlags, parseFlagsForSchema } from './zodFlags.js';

export interface CliResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

async function readStdinBytes(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks));
}

async function loadInputAsset(filePath: string): Promise<Asset> {
  const bytes =
    filePath === '-' ? await readStdinBytes() : new Uint8Array(fs.readFileSync(filePath));
  const name = filePath === '-' ? 'stdin.pdf' : path.basename(filePath);
  const stem = name.replace(/\.[^.]+$/, '') || 'document';
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/pdf' });
  return {
    id: crypto.randomUUID(),
    name,
    stem,
    mime: 'application/pdf',
    size: blob.size,
    blob,
  };
}

function makeCliContext(): ToolContext {
  return {
    pdf: cantooPdfEngine,
    limits: DEFAULT_LIMITS,
    progress: () => {},
    log: () => {},
    signal: new AbortController().signal,
  };
}

function formatToolHelp(toolId: string): string {
  const tool = getNodeTool(toolId);
  if (!tool) return `Unknown tool: ${toolId}`;
  const flags = describeFlags(tool.options);
  const lines = [
    `airgap-pdf ${tool.id} <input...> [options]`,
    '',
    tool.summary,
    '',
    'Tool options:',
    ...flags.map((f) => {
      const vals = f.values ? ` (${f.values.join('|')})` : '';
      const def =
        f.defaultValue !== undefined ? ` [default: ${JSON.stringify(f.defaultValue)}]` : '';
      return `  --${f.name} <${f.type}>${vals}${def}${f.description ? `  ${f.description}` : ''}`;
    }),
    '',
    'Global options:',
    '  --out <path>       Write single output to file (or "-" for stdout)',
    '  --out-dir <dir>    Write multiple outputs into directory',
    '  --json             Emit machine-readable JSON result',
  ];
  return lines.join('\n');
}

function formatRootHelp(): string {
  return [
    'Usage: airgap-pdf <command|tool> [inputs...] [options]',
    '',
    'Commands:',
    '  list               List all Node-capable tools',
    '  run <recipe.json>  Execute a RecipeV1 JSON pipeline',
    '  <tool>             Run a PDF tool directly (use <tool> --help for flags)',
    '',
    'Examples:',
    '  airgap-pdf rotate input.pdf --degrees 90 --out rotated.pdf',
    '  cat input.pdf | airgap-pdf compress - --level balanced --out - > out.pdf',
    '  airgap-pdf run recipe.json input.pdf --out-dir ./out --json',
  ].join('\n');
}

async function writeOutputs(
  outputs: Asset[],
  outPath?: string,
  outDir?: string,
): Promise<Array<{ name: string; size: number; mime: string; path?: string }>> {
  const written: Array<{ name: string; size: number; mime: string; path?: string }> = [];

  if (outPath === '-') {
    const first = outputs[0];
    if (!first) return written;
    const bytes = new Uint8Array(await first.blob.arrayBuffer());
    process.stdout.write(bytes);
    written.push({ name: first.name, size: first.size, mime: first.mime, path: '-' });
    return written;
  }

  if (outPath && outputs.length === 1 && outputs[0]) {
    const first = outputs[0];
    const bytes = new Uint8Array(await first.blob.arrayBuffer());
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, bytes);
    written.push({ name: first.name, size: first.size, mime: first.mime, path: outPath });
    return written;
  }

  const targetDir = outDir ?? '.';
  fs.mkdirSync(targetDir, { recursive: true });
  for (const out of outputs) {
    const dest = path.join(targetDir, out.name);
    const bytes = new Uint8Array(await out.blob.arrayBuffer());
    fs.writeFileSync(dest, bytes);
    written.push({ name: out.name, size: out.size, mime: out.mime, path: dest });
  }
  return written;
}

export async function runCli(argv: string[]): Promise<CliResult> {
  const cmd = argv[0];
  const jsonFlag = argv.includes('--json');

  if (!cmd || cmd === '--help' || cmd === '-h') {
    return { exitCode: 0, stdout: formatRootHelp() };
  }

  if (cmd === 'list') {
    const items = NODE_TOOLS.map((t) => ({ id: t.id, name: t.name, summary: t.summary }));
    if (jsonFlag) {
      return { exitCode: 0, stdout: JSON.stringify({ ok: true, tools: items }, null, 2) };
    }
    return {
      exitCode: 0,
      stdout: items.map((t) => `${t.id.padEnd(16)} ${t.summary}`).join('\n'),
    };
  }

  if (cmd === 'run') {
    const rest = argv.slice(1);
    let recipePath: string | undefined;
    const inputPaths: string[] = [];
    let outPath: string | undefined;
    let outDir: string | undefined;

    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (!a) continue;
      if (a === '--json') continue;
      if (a === '--out') {
        outPath = rest[++i];
      } else if (a === '--out-dir') {
        outDir = rest[++i];
      } else if (!recipePath) {
        recipePath = a;
      } else {
        inputPaths.push(a);
      }
    }

    if (!recipePath || inputPaths.length === 0) {
      const msg = 'Usage: airgap-pdf run <recipe.json> <input.pdf...> [--out <path>] [--json]';
      return {
        exitCode: 2,
        ...(jsonFlag
          ? { stdout: JSON.stringify({ ok: false, error: { code: 'InvalidArgs', message: msg } }) }
          : { stderr: msg }),
      };
    }

    let recipe: RecipeV1;
    try {
      const raw = JSON.parse(fs.readFileSync(recipePath, 'utf8'));
      recipe = validateRecipe(migrateRecipe(raw), getNodeTool);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 2,
        ...(jsonFlag
          ? {
              stdout: JSON.stringify({ ok: false, error: { code: 'InvalidRecipe', message: msg } }),
            }
          : { stderr: msg }),
      };
    }

    try {
      let currentAssets = await Promise.all(inputPaths.map((p) => loadInputAsset(p)));
      const ctx = makeCliContext();
      for (const step of recipe.steps) {
        const tool = getNodeTool(step.tool);
        if (!tool) {
          throw new AirgapError(
            'EngineUnavailable',
            `Tool "${step.tool}" is not supported in Node CLI`,
            `Tool "${step.tool}" requires a browser runtime.`,
          );
        }
        const parsed = tool.options.parse(step.options ?? {});
        const res = await tool.run(ctx, currentAssets, parsed);
        if (!res.ok) throw new Error(res.error.userMessage);
        currentAssets = res.outputs;
      }
      const written = await writeOutputs(currentAssets, outPath, outDir);
      return {
        exitCode: 0,
        stdout: jsonFlag
          ? JSON.stringify({ ok: true, outputs: written }, null, 2)
          : outPath === '-'
            ? ''
            : written.map((w) => `Wrote ${w.path} (${w.size} B)`).join('\n'),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        ...(jsonFlag
          ? { stdout: JSON.stringify({ ok: false, error: { code: 'RunFailed', message: msg } }) }
          : { stderr: msg }),
      };
    }
  }

  const tool = getNodeTool(cmd);
  if (!tool) {
    const msg = `Unknown command or tool "${cmd}". Run "airgap-pdf list" to see available tools.`;
    return {
      exitCode: 2,
      ...(jsonFlag
        ? { stdout: JSON.stringify({ ok: false, error: { code: 'UnknownTool', message: msg } }) }
        : { stderr: msg }),
    };
  }

  let parsedArgs: ReturnType<typeof parseFlagsForSchema>;
  try {
    parsedArgs = parseFlagsForSchema(tool.options, argv.slice(1));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 2,
      ...(jsonFlag
        ? { stdout: JSON.stringify({ ok: false, error: { code: 'InvalidFlags', message: msg } }) }
        : { stderr: msg }),
    };
  }

  if (parsedArgs.help) {
    return { exitCode: 0, stdout: formatToolHelp(tool.id) };
  }

  if (parsedArgs.positional.length === 0) {
    const msg = `Missing input PDF for "${tool.id}". Use "-" to read from stdin.`;
    return {
      exitCode: 2,
      ...(jsonFlag
        ? { stdout: JSON.stringify({ ok: false, error: { code: 'MissingInput', message: msg } }) }
        : { stderr: msg }),
    };
  }

  let parsedOpts: unknown;
  try {
    parsedOpts = tool.options.parse(parsedArgs.options);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 2,
      ...(jsonFlag
        ? { stdout: JSON.stringify({ ok: false, error: { code: 'InvalidOptions', message: msg } }) }
        : { stderr: msg }),
    };
  }

  try {
    const inputs = await Promise.all(parsedArgs.positional.map((p) => loadInputAsset(p)));
    const res = await tool.run(makeCliContext(), inputs, parsedOpts);
    if (!res.ok) {
      return {
        exitCode: 1,
        ...(parsedArgs.jsonOutput
          ? { stdout: JSON.stringify({ ok: false, error: res.error }) }
          : { stderr: res.error.userMessage }),
      };
    }
    const written = await writeOutputs(res.outputs, parsedArgs.outPath, parsedArgs.outDir);
    return {
      exitCode: 0,
      stdout: parsedArgs.jsonOutput
        ? JSON.stringify({ ok: true, outputs: written }, null, 2)
        : parsedArgs.outPath === '-'
          ? ''
          : written.map((w) => `Wrote ${w.path} (${w.size} B)`).join('\n'),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      ...(parsedArgs.jsonOutput
        ? { stdout: JSON.stringify({ ok: false, error: { code: 'ToolFailed', message: msg } }) }
        : { stderr: msg }),
    };
  }
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  runCli(process.argv.slice(2))
    .then((res) => {
      if (res.stdout) console.log(res.stdout);
      if (res.stderr) console.error(res.stderr);
      process.exitCode = res.exitCode;
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
