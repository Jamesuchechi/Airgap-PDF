import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool, ok } from './index.js';
import { migrateRecipe, RECIPE_PRESETS, validateRecipe } from './recipes.js';

const mockRotate = defineTool({
  id: 'rotate',
  name: 'Rotate',
  summary: 'Rotate',
  category: 'organize',
  accepts: { mime: ['application/pdf'], min: 1, max: 1 },
  produces: 'pdf',
  runtime: ['browser'],
  options: z.object({ degrees: z.union([z.literal(90), z.literal(180)]) }),
  async run() {
    return ok([]);
  },
});

describe('recipes v1', () => {
  it('migrates and validates v1 recipes', () => {
    const r = migrateRecipe({
      v: 1,
      name: 'Test',
      steps: [{ tool: 'rotate', options: { degrees: 90 } }],
    });
    expect(() =>
      validateRecipe(r, (id) => (id === 'rotate' ? mockRotate : undefined)),
    ).not.toThrow();
  });

  it('rejects unknown tools and invalid step options with precise paths', () => {
    const badTool = migrateRecipe({
      v: 1,
      name: 'Bad',
      steps: [{ tool: 'nope', options: {} }],
    });
    expect(() => validateRecipe(badTool, () => undefined)).toThrow(/steps\[0\]\.tool/);

    const badOpt = migrateRecipe({
      v: 1,
      name: 'BadOpt',
      steps: [{ tool: 'rotate', options: { degrees: 45 } }],
    });
    expect(() =>
      validateRecipe(badOpt, (id) => (id === 'rotate' ? mockRotate : undefined)),
    ).toThrow(/steps\[0\]\.options\.degrees/);
  });

  it('ships built-in presets', () => {
    expect(RECIPE_PRESETS.length).toBeGreaterThanOrEqual(5);
  });
});
