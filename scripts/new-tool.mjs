import fs from 'node:fs';
import path from 'node:path';

const rawId = process.argv[2];
if (!rawId || !/^[a-z][a-z0-9-]*$/.test(rawId)) {
  console.error('Usage: pnpm new:tool <kebab-case-id>');
  process.exit(1);
}

const camel = rawId.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const toolDir = path.resolve('apps/web/src/tools');
const toolPath = path.join(toolDir, `${rawId}.ts`);
const testPath = path.join(toolDir, `${rawId}.test.ts`);

if (fs.existsSync(toolPath)) {
  console.error(`Tool already exists: ${toolPath}`);
  process.exit(1);
}

fs.writeFileSync(
  toolPath,
  `import { AirgapError, defineTool, ok, z } from '@airgap-pdf/core';

export const ${camel}Options = z.object({});

export const ${camel}Tool = defineTool({
  id: '${rawId}',
  name: '${rawId}',
  summary: 'TODO: describe ${rawId}.',
  category: 'organize',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser', 'node'],
  needs: ['pdf.edit'],
  memory: { multiplier: 2.5 },
  deterministic: true,
  options: ${camel}Options,

  async run(ctx, [input]) {
    if (!input) {
      throw new AirgapError('InvalidOptions', 'Missing input PDF', 'Choose a PDF file first.');
    }
    if (ctx.signal.aborted) {
      throw new AirgapError('Cancelled', 'Cancelled', 'Operation cancelled.');
    }
    ctx.progress(0.5, 'Processing...');
    const doc = await ctx.pdf.open(input);
    const out = await doc.save({ name: \`\${input.stem}-${rawId}.pdf\`, objectStreams: true });
    ctx.progress(1, 'Done');
    return ok([out]);
  },
});

export default ${camel}Tool;
`,
);

fs.writeFileSync(
  testPath,
  `import { assertToolInvariants, type Asset } from '@airgap-pdf/core';
import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, it } from 'vitest';
import { cantooPdfEngine } from '../engines/cantooPdfLib.js';
import { ${camel}Tool } from './${rawId}.js';

describe('${camel}Tool invariants', () => {
  it('passes universal tool harness invariants', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    const bytes = await doc.save();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy], { type: 'application/pdf' });
    const input: Asset = {
      id: 'seed',
      name: 'seed.pdf',
      stem: 'seed',
      mime: 'application/pdf',
      size: blob.size,
      blob,
    };

    await assertToolInvariants({
      tool: ${camel}Tool,
      inputs: [input],
      validOptions: {},
      pdf: cantooPdfEngine,
    });
  });
});
`,
);

console.log(`Scaffolded ${toolPath} and ${testPath}`);
