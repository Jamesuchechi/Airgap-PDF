import {
  type Asset,
  DEFAULT_LIMITS,
  migrateRecipe,
  type RecipeV1,
  type ToolResult,
  validateRecipe,
} from '@airgap-pdf/core';
import { deflateSync, inflateSync } from 'fflate';
import { cantooPdfEngine } from '../engines/cantooPdfLib.js';
import { pdfjsRenderEngine } from '../engines/pdfjsRender.js';
import { getTool } from '../tools/registry.js';
import { workerPool } from '../workers/workerPool.js';

const MAX_FRAGMENT_CHARS = 8192;

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeRecipeFragment(recipe: RecipeV1): string {
  const json = new TextEncoder().encode(JSON.stringify(recipe));
  const compressed = deflateSync(json, { level: 6 });
  const encoded = toBase64Url(compressed);
  if (encoded.length > MAX_FRAGMENT_CHARS) {
    throw new Error('Recipe exceeds 8 KB URL limit; export as JSON file instead.');
  }
  return encoded;
}

export function decodeRecipeFragment(encoded: string): RecipeV1 {
  const bytes = fromBase64Url(encoded);
  const inflated = inflateSync(bytes);
  const json = JSON.parse(new TextDecoder().decode(inflated)) as unknown;
  const migrated = migrateRecipe(json);
  return validateRecipe(migrated, getTool);
}

export async function executeToolStep(
  toolId: string,
  inputs: Asset[],
  options: Record<string, unknown>,
  onProgress: (fraction: number, message?: string) => void,
): Promise<ToolResult> {
  const tool = getTool(toolId);
  if (!tool) {
    throw new Error(`Unknown tool: ${toolId}`);
  }
  const needsRender = tool.needs?.includes('pdf.render') || tool.needs?.includes('pdf.text');
  if (needsRender) {
    const parsed = tool.options.parse(options);
    return tool.run(
      {
        pdf: cantooPdfEngine,
        render: pdfjsRenderEngine,
        signal: new AbortController().signal,
        limits: DEFAULT_LIMITS,
        progress: onProgress,
        log: () => {},
      },
      inputs,
      parsed,
    );
  }
  const { promise } = workerPool.runJob(toolId, inputs, options, onProgress);
  return promise;
}

export async function runRecipePipeline(
  recipe: RecipeV1,
  initialInputs: Asset[],
  onStepProgress: (stepIdx: number, totalSteps: number, msg?: string) => void,
): Promise<Asset[]> {
  validateRecipe(recipe, getTool);
  let current = initialInputs;

  for (let i = 0; i < recipe.steps.length; i++) {
    const step = recipe.steps[i];
    if (!step) continue;
    const tool = getTool(step.tool);
    if (!tool) throw new Error(`Unknown tool: ${step.tool}`);

    onStepProgress(i, recipe.steps.length, `Running ${tool.name}...`);

    if (tool.accepts.max === 1 && current.length > 1) {
      const mapped: Asset[] = [];
      for (const item of current) {
        const res = await executeToolStep(step.tool, [item], step.options, () => {});
        if (!res.ok) throw new Error(res.error.userMessage);
        mapped.push(...res.outputs);
      }
      current = mapped;
    } else {
      const res = await executeToolStep(step.tool, current, step.options, () => {});
      if (!res.ok) throw new Error(res.error.userMessage);
      current = res.outputs;
    }
  }

  return current;
}
