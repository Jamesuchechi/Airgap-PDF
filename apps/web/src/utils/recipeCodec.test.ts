import { RECIPE_PRESETS } from '@airgap-pdf/core';
import { describe, expect, it } from 'vitest';
import { decodeRecipeFragment, encodeRecipeFragment } from './recipeCodec.js';

describe('recipeCodec', () => {
  it('round-trips every preset through deflate + base64url URL fragment', () => {
    for (const preset of RECIPE_PRESETS) {
      const encoded = encodeRecipeFragment(preset);
      const decoded = decodeRecipeFragment(encoded);
      expect(decoded).toEqual(preset);
    }
  });
});
