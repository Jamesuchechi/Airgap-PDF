import { z } from 'zod';
import type { ToolDefinition } from './index.js';

export const RecipeStepSchema = z.object({
  tool: z.string().min(1),
  options: z.record(z.unknown()).default({}),
});

export const RecipeV1Schema = z.object({
  v: z.literal(1),
  name: z.string().min(1).max(120),
  steps: z.array(RecipeStepSchema).min(1),
});

export type RecipeStep = z.infer<typeof RecipeStepSchema>;
export type RecipeV1 = z.infer<typeof RecipeV1Schema>;

export function migrateRecipe(raw: unknown): RecipeV1 {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Recipe must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.v === 1) {
    return RecipeV1Schema.parse(obj);
  }
  throw new Error(`Unsupported recipe version: ${String(obj.v)}`);
}

export function validateRecipe(
  recipe: RecipeV1,
  getTool: (id: string) => ToolDefinition | undefined,
): RecipeV1 {
  for (let i = 0; i < recipe.steps.length; i++) {
    const step = recipe.steps[i];
    if (!step) continue;
    const tool = getTool(step.tool);
    if (!tool) {
      throw new Error(`steps[${i}].tool: Unknown tool "${step.tool}"`);
    }
    const parsed = tool.options.safeParse(step.options);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path?.length ? `.${issue.path.join('.')}` : '';
      throw new Error(`steps[${i}].options${path}: ${issue?.message ?? 'Invalid options'}`);
    }
  }
  return recipe;
}

export const RECIPE_PRESETS: readonly RecipeV1[] = [
  {
    v: 1,
    name: 'Rotate all pages 90°',
    steps: [{ tool: 'rotate', options: { degrees: 90, pages: 'all' } }],
  },
  {
    v: 1,
    name: 'Extract first page',
    steps: [{ tool: 'extract', options: { pages: '1' } }],
  },
  {
    v: 1,
    name: 'Remove cover page',
    steps: [{ tool: 'delete-pages', options: { pages: '1' } }],
  },
  {
    v: 1,
    name: 'Split into single pages',
    steps: [{ tool: 'split', options: { mode: 'every', everyN: 1 } }],
  },
  {
    v: 1,
    name: 'Add blank separator & export text',
    steps: [
      { tool: 'insert-blank', options: { afterPage: 1, count: 1 } },
      { tool: 'pdf-to-text', options: { format: 'markdown', pages: 'all' } },
    ],
  },
  {
    v: 1,
    name: 'Export 150 DPI PNGs',
    steps: [{ tool: 'pdf-to-images', options: { dpi: 150, format: 'png', pages: 'all' } }],
  },
];
