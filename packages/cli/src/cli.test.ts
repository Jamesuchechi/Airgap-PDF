import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { NODE_TOOLS } from '../../../apps/web/src/tools/nodeRegistry.js';
import { runCli } from './cli.js';
import { describeFlags, parseFlagsForSchema } from './zodFlags.js';

async function makeTempPdf(pages = 2): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'airgap-cli-'));
  const filePath = path.join(dir, 'sample.pdf');
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([400, 300]);
    p.drawText(`Page ${i + 1}`, { x: 40, y: 240, size: 14 });
  }
  fs.writeFileSync(filePath, await doc.save());
  return filePath;
}

describe('@airgap-pdf/cli', () => {
  it('generates flags from zod schemas and parses CLI args', () => {
    const rotate = NODE_TOOLS.find((t) => t.id === 'rotate');
    expect(rotate).toBeDefined();
    if (!rotate) return;

    const specs = describeFlags(rotate.options);
    expect(specs.some((s) => s.name === 'degrees')).toBe(true);
    expect(specs.some((s) => s.name === 'pages')).toBe(true);

    const parsed = parseFlagsForSchema(rotate.options, [
      'in.pdf',
      '--degrees',
      '90',
      '--pages',
      '1',
      '--out',
      'out.pdf',
      '--json',
    ]);
    expect(parsed.positional).toEqual(['in.pdf']);
    expect(parsed.options).toEqual({ degrees: 90, pages: '1' });
    expect(parsed.outPath).toBe('out.pdf');
    expect(parsed.jsonOutput).toBe(true);
  });

  it('lists all 21 Node-capable tools via --json', async () => {
    const res = await runCli(['list', '--json']);
    expect(res.exitCode).toBe(0);
    const data = JSON.parse(res.stdout ?? '{}') as { ok: boolean; tools: Array<{ id: string }> };
    expect(data.ok).toBe(true);
    expect(data.tools.length).toBe(NODE_TOOLS.length);
    for (const t of NODE_TOOLS) {
      expect(t.runtime).toContain('node');
    }
  });

  it('runs a tool directly and writes output + JSON summary', async () => {
    const inPath = await makeTempPdf(2);
    const outPath = path.join(path.dirname(inPath), 'rotated.pdf');

    const res = await runCli([
      'rotate',
      inPath,
      '--degrees',
      '90',
      '--pages',
      '1',
      '--out',
      outPath,
      '--json',
    ]);
    expect(res.exitCode).toBe(0);
    const parsed = JSON.parse(res.stdout ?? '{}') as {
      ok: boolean;
      outputs: Array<{ path: string; size: number }>;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.outputs[0]?.path).toBe(outPath);
    expect(fs.existsSync(outPath)).toBe(true);

    const bad = await runCli(['rotate', inPath, '--degrees', '45', '--json']);
    expect(bad.exitCode).toBe(2);
  });

  it('executes a RecipeV1 JSON pipeline with airgap-pdf run', async () => {
    const inPath = await makeTempPdf(2);
    const dir = path.dirname(inPath);
    const recipePath = path.join(dir, 'recipe.json');
    const outPath = path.join(dir, 'piped.pdf');

    fs.writeFileSync(
      recipePath,
      JSON.stringify({
        v: 1,
        name: 'Rotate & Compress',
        steps: [
          { tool: 'rotate', options: { degrees: 180, pages: 'all' } },
          { tool: 'compress', options: { level: 'light' } },
        ],
      }),
    );

    const res = await runCli(['run', recipePath, inPath, '--out', outPath, '--json']);
    expect(res.exitCode).toBe(0);
    expect(fs.existsSync(outPath)).toBe(true);
  });
});
