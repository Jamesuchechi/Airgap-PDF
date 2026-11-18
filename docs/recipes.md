# Recipe Cookbook (`RecipeV1`)

Recipes are portable JSON pipelines (`version: 1`) that chain Airgap PDF tools in the browser (`#/recipes`) or in `@airgap-pdf/cli` (`airgap-pdf run recipe.json`).

## Example 1: Rotate, Compress & Strip Metadata

```json
{
  "v": 1,
  "name": "Clean & Compress",
  "steps": [
    { "tool": "rotate", "options": { "degrees": 90, "pages": "all" } },
    { "tool": "sanitize", "options": { "metadata": true, "javascript": true } },
    { "tool": "compress", "options": { "level": "balanced" } }
  ]
}
```

## Example 2: Bates Stamp & Watermark

```json
{
  "v": 1,
  "name": "Legal Bates + Draft Stamp",
  "steps": [
    { "tool": "bates", "options": { "prefix": "EX-", "start": 1, "digits": 4 } },
    { "tool": "watermark", "options": { "text": "CONFIDENTIAL", "opacity": 0.18 } }
  ]
}
```
