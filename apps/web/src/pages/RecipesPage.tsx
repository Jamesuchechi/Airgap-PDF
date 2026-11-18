import { type Asset, RECIPE_PRESETS, type RecipeV1 } from '@airgap-pdf/core';
import { useEffect, useState } from 'react';
import { ToolOptionsForm } from '../components/ToolOptionsForm.js';
import { getTool, TOOLS } from '../tools/registry.js';
import {
  decodeRecipeFragment,
  encodeRecipeFragment,
  runRecipePipeline,
} from '../utils/recipeCodec.js';

interface RecipesPageProps {
  fragmentParam: string | null;
  assets: Asset[];
  onCompleteOutputs: (outputs: Asset[]) => void;
  onChooseFiles: () => void;
  onSamplePdf: () => void;
}

export function RecipesPage({
  fragmentParam,
  assets,
  onCompleteOutputs,
  onChooseFiles,
  onSamplePdf,
}: RecipesPageProps) {
  const [recipe, setRecipe] = useState<RecipeV1>(() => RECIPE_PRESETS[0]!);
  const [status, setStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!fragmentParam) return;
    try {
      const decoded = decodeRecipeFragment(fragmentParam);
      setRecipe(decoded);
      setStatus(`Loaded shared recipe "${decoded.name}".`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Invalid recipe link.');
    }
  }, [fragmentParam]);

  const addStep = (toolId: string) => {
    setRecipe((prev) => ({
      ...prev,
      steps: [...prev.steps, { tool: toolId, options: {} }],
    }));
  };

  const removeStep = (idx: number) => {
    if (recipe.steps.length <= 1) return;
    setRecipe((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== idx),
    }));
  };

  const moveStep = (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= recipe.steps.length) return;
    const next = [...recipe.steps];
    const a = next[idx];
    const b = next[target];
    if (!a || !b) return;
    next[idx] = b;
    next[target] = a;
    setRecipe((prev) => ({ ...prev, steps: next }));
  };

  const handleShare = async () => {
    try {
      const encoded = encodeRecipeFragment(recipe);
      const url = `${location.origin}${location.pathname}#/recipe?r=${encoded}`;
      window.location.hash = `#/recipe?r=${encoded}`;
      await navigator.clipboard?.writeText(url);
      setStatus('Recipe link copied to clipboard (encoded in URL fragment).');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not encode recipe.');
    }
  };

  const handleDownloadJson = () => {
    const blob = new Blob([`${JSON.stringify(recipe, null, 2)}\n`], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${recipe.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'recipe'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleRun = async () => {
    if (assets.length === 0) {
      setStatus('Load a PDF (or Sample PDF) first.');
      return;
    }
    setRunning(true);
    try {
      const outputs = await runRecipePipeline(recipe, assets, (idx, total, msg) => {
        setStatus(`Step ${idx + 1}/${total}: ${msg ?? ''}`);
      });
      onCompleteOutputs(outputs);
      setStatus(`Recipe "${recipe.name}" finished (${outputs.length} output).`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Recipe failed.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="redact-layout">
      <section
        className="redact-stage"
        style={{ alignItems: 'stretch' }}
        aria-label="Recipe builder"
      >
        <div
          style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}
        >
          <h1 style={{ margin: 0, font: '400 34px var(--font-serif)' }}>Recipes</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn2" onClick={() => void handleShare()}>
              Share as link ↗
            </button>
            <button type="button" className="btn2" onClick={handleDownloadJson}>
              Export JSON
            </button>
          </div>
        </div>

        {status && (
          <div role="status" className="alert">
            {status}
          </div>
        )}

        <label style={{ display: 'grid', gap: 6 }}>
          <span className="mono">Recipe name</span>
          <input
            className="text-input"
            value={recipe.name}
            onChange={(e) => setRecipe((p) => ({ ...p, name: e.target.value }))}
          />
        </label>

        <div style={{ display: 'grid', gap: 12 }}>
          {recipe.steps.map((step, idx) => {
            const tool = getTool(step.tool);
            return (
              <div
                key={`${step.tool}-${JSON.stringify(step.options)}-${recipe.steps.length}`}
                className="panel"
                style={{ padding: 16 }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <strong>
                    {idx + 1}. {tool?.name ?? step.tool}
                  </strong>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn2" onClick={() => moveStep(idx, -1)}>
                      ↑
                    </button>
                    <button type="button" className="btn2" onClick={() => moveStep(idx, 1)}>
                      ↓
                    </button>
                    <button type="button" className="btn2" onClick={() => removeStep(idx)}>
                      ✕
                    </button>
                  </div>
                </div>
                {tool && (
                  <ToolOptionsForm
                    schema={tool.options}
                    values={step.options}
                    onChange={(nextOpts) =>
                      setRecipe((prev) => ({
                        ...prev,
                        steps: prev.steps.map((s, i) =>
                          i === idx ? { ...s, options: nextOpts } : s,
                        ),
                      }))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select
            aria-label="Add step"
            className="text-input"
            style={{ width: 'auto', minWidth: 200 }}
            value=""
            onChange={(e) => {
              if (e.target.value) addStep(e.target.value);
            }}
          >
            <option value="">+ Add step...</option>
            {TOOLS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <button type="button" className="btn" disabled={running} onClick={() => void handleRun()}>
            {running ? 'Running recipe...' : 'Run recipe'}
          </button>

          {assets.length === 0 && (
            <>
              <button type="button" className="btn2" onClick={onChooseFiles}>
                Choose PDFs
              </button>
              <button type="button" className="btn2" onClick={onSamplePdf}>
                Load sample PDF
              </button>
            </>
          )}
        </div>
      </section>

      <aside className="redact-verify" aria-label="Recipe gallery">
        <h2 style={{ margin: 0, font: '400 28px var(--font-serif)' }}>Preset gallery</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {RECIPE_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              className="panel tool-tile"
              onClick={() => {
                setRecipe(preset);
                setStatus(`Loaded preset "${preset.name}".`);
              }}
            >
              <div>{preset.name}</div>
              <div className="mono" style={{ marginTop: 4 }}>
                {preset.steps.map((s) => s.tool).join(' → ')}
              </div>
            </button>
          ))}
        </div>
      </aside>
    </main>
  );
}
