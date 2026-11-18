import type { Asset } from '@airgap-pdf/core';
import { useEffect, useState } from 'react';
import { FormFillEditor } from '../components/FormFillEditor.js';
import { OcrPanel } from '../components/OcrPanel.js';
import { SignAnnotateEditor } from '../components/SignAnnotateEditor.js';
import { TimeMachinePanel } from '../components/TimeMachinePanel.js';
import { ToolOptionsForm } from '../components/ToolOptionsForm.js';
import { XRayPanel } from '../components/XRayPanel.js';
import type { JobState } from '../stores/workspaceStore.js';
import { getTool, TOOLS } from '../tools/registry.js';

export interface PageItem {
  id: string;
  sourceIndex: number;
  rotateBy: 0 | 90 | 180 | 270;
}

interface WorkbenchPageProps {
  activeToolId: string;
  onSelectTool: (id: string) => void;
  assets: Asset[];
  primaryAsset: Asset | undefined;
  thumbnails: string[];
  canUndo: boolean;
  canRedo: boolean;
  activeJob: JobState | null;
  memoryWarning: string | null;
  onRunTool: (toolId: string, inputs: Asset[], options: Record<string, unknown>) => void;
  onReorderAssets: (next: Asset[]) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDownload: (asset: Asset) => void;
  onDownloadZip: (assets: Asset[]) => void;
  onChooseFiles: () => void;
  onSamplePdf: () => void;
  onNavigate: (route: string) => void;
}

function getDefaultOptions(toolId: string): Record<string, unknown> {
  switch (toolId) {
    case 'rotate':
      return { degrees: 90, pages: 'all' };
    case 'merge':
      return { outputName: 'merged.pdf' };
    case 'split':
      return { mode: 'every', everyN: 1, rangesText: '1-1' };
    case 'extract':
      return { pages: '1' };
    case 'delete-pages':
      return { pages: '1' };
    case 'insert-blank':
      return { afterPage: 1, count: 1 };
    case 'interleave':
      return { reverseSecond: false };
    case 'images-to-pdf':
      return { pageSize: 'a4', orientation: 'auto', marginPt: 36 };
    case 'pdf-to-images':
      return { dpi: 150, format: 'png', pages: 'all' };
    case 'pdf-to-text':
      return { format: 'markdown', pages: 'all' };
    case 'watermark':
      return {
        text: 'CONFIDENTIAL',
        opacity: 0.16,
        angle: 35,
        tile: false,
        fontSize: 42,
        colorHex: '#444444',
        pages: 'all',
      };
    case 'page-numbers':
      return {
        template: 'Page {n} of {total}',
        position: 'bottom-center',
        fontSize: 11,
        startAt: 1,
        pages: 'all',
      };
    case 'bates':
      return {
        prefix: 'CONF-',
        start: 1,
        digits: 6,
        position: 'bottom-right',
        continuous: true,
      };
    case 'crop-resize':
      return { mode: 'resize', paperSize: 'a4', marginPt: 36, pages: 'all' };
    case 'metadata':
      return { title: '', author: '', subject: '', keywords: '', creator: '', producer: '' };
    case 'protect':
      return { userPassword: '', ownerPassword: '' };
    case 'unlock':
      return { password: '' };
    case 'sanitize':
      return {
        metadata: true,
        javascript: true,
        embeddedFiles: true,
        hiddenLayers: true,
        annotations: true,
        forms: true,
      };
    case 'xray':
      return { format: 'json' };
    case 'compress':
      return { level: 'balanced' };
    case 'ocr':
      return { lang: 'eng', grayscale: true, contrast: 1.35, despeckle: true };
    default:
      return {};
  }
}

export function WorkbenchPage({
  activeToolId,
  onSelectTool,
  assets,
  primaryAsset,
  thumbnails,
  canUndo,
  canRedo,
  activeJob,
  memoryWarning,
  onRunTool,
  onReorderAssets,
  onUndo,
  onRedo,
  onDownload,
  onDownloadZip,
  onChooseFiles,
  onSamplePdf,
  onNavigate,
}: WorkbenchPageProps) {
  const [selectedPage, setSelectedPage] = useState<number>(0);
  const [formValues, setFormValues] = useState<Record<string, unknown>>(() =>
    getDefaultOptions(activeToolId),
  );
  const [pageSequence, setPageSequence] = useState<PageItem[]>([]);

  useEffect(() => {
    setFormValues(getDefaultOptions(activeToolId));
  }, [activeToolId]);

  useEffect(() => {
    setPageSequence(
      thumbnails.map((_, idx) => ({
        id: `p-${idx}`,
        sourceIndex: idx,
        rotateBy: 0,
      })),
    );
    setSelectedPage(0);
  }, [thumbnails]);

  const activeTool = getTool(activeToolId) ?? TOOLS[0];

  if (!primaryAsset || !activeTool) {
    return (
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 32,
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: 0, font: '400 34px var(--font-serif)' }}>No PDF open yet</h1>
        <p style={{ margin: 0, color: 'var(--muted)', maxWidth: 420 }}>
          Drop a PDF from your device or load the built-in sample contract to organize, merge,
          split, or rotate pages.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={onChooseFiles}>
            Choose PDFs
          </button>
          <button type="button" className="btn2" onClick={onSamplePdf}>
            Try sample PDF
          </button>
        </div>
      </main>
    );
  }

  const movePage = (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= pageSequence.length) return;
    const next = [...pageSequence];
    const a = next[idx];
    const b = next[target];
    if (!a || !b) return;
    next[idx] = b;
    next[target] = a;
    setPageSequence(next);
    setSelectedPage(target);
  };

  const rotatePageItem = (idx: number) => {
    setPageSequence((prev) =>
      prev.map((item, i) =>
        i === idx
          ? { ...item, rotateBy: ((item.rotateBy + 90) % 360) as 0 | 90 | 180 | 270 }
          : item,
      ),
    );
  };

  const duplicatePageItem = (idx: number) => {
    const item = pageSequence[idx];
    if (!item) return;
    const next = [...pageSequence];
    next.splice(idx + 1, 0, {
      id: `${item.id}-dup-${Date.now()}`,
      sourceIndex: item.sourceIndex,
      rotateBy: item.rotateBy,
    });
    setPageSequence(next);
  };

  const deletePageItem = (idx: number) => {
    if (pageSequence.length <= 1) return;
    setPageSequence((prev) => prev.filter((_, i) => i !== idx));
    setSelectedPage((prev) => Math.max(0, Math.min(prev, pageSequence.length - 2)));
  };

  const moveAsset = (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= assets.length) return;
    const next = [...assets];
    const a = next[idx];
    const b = next[target];
    if (!a || !b) return;
    next[idx] = b;
    next[target] = a;
    onReorderAssets(next);
  };

  const isMultiFileTool = activeTool.accepts.min > 1;
  const needsMoreFiles = isMultiFileTool && assets.length < activeTool.accepts.min;

  const handleRun = () => {
    if (activeTool.id === 'reorder') {
      onRunTool('reorder', [primaryAsset], {
        sequence: pageSequence.map(({ sourceIndex, rotateBy }) => ({ sourceIndex, rotateBy })),
      });
      return;
    }
    const inputs = isMultiFileTool ? assets : [primaryAsset];
    onRunTool(activeTool.id, inputs, formValues);
  };

  return (
    <>
      <section className="recipe-bar" aria-label="Active pipeline">
        <span className="mono">Pipeline</span>
        <span className="panel" style={{ padding: '6px 12px', borderRadius: 8 }}>
          {assets.length > 1 ? `${assets.length} PDFs` : primaryAsset.name}
        </span>
        <span aria-hidden="true">→</span>
        <span
          className="panel"
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            borderColor: 'var(--accent-border)',
            color: 'var(--accent)',
          }}
        >
          {activeTool.name}
          {activeJob ? ' · running' : ''}
        </span>
        <button
          type="button"
          className="btn2"
          style={{ marginLeft: 'auto', minHeight: 36, padding: '6px 12px', fontSize: 12 }}
          onClick={onChooseFiles}
        >
          + Add PDFs
        </button>
      </section>

      <div className="wb">
        <nav className="side" aria-label="Tools">
          <span className="mono" style={{ padding: '4px 12px' }}>
            Organize
          </span>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="ghost"
              aria-current={t.id === activeTool.id ? 'page' : undefined}
              onClick={() => onSelectTool(t.id)}
            >
              {t.name}
            </button>
          ))}

          <span className="mono" style={{ padding: '10px 12px 4px' }}>
            Protect &amp; Inspect
          </span>
          <button
            type="button"
            className="ghost"
            aria-current={activeToolId === 'time-machine' ? 'page' : undefined}
            onClick={() => onSelectTool('time-machine')}
          >
            Time Machine
          </button>
          <button type="button" className="ghost" onClick={() => onNavigate('#/redact')}>
            Redact &amp; Verify
          </button>
          <button type="button" className="ghost" onClick={() => onNavigate('#/compare')}>
            Compare PDFs
          </button>
          <button type="button" className="ghost" onClick={() => onNavigate('#/scan')}>
            Document Scanner
          </button>
        </nav>

        <main className="canvas">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <h1 style={{ margin: 0, font: '400 30px var(--font-serif)' }}>
              {primaryAsset.name}{' '}
              <span className="mono">
                {assets.length > 1 ? `+ ${assets.length - 1} more · ` : ''}
                {Math.ceil(primaryAsset.size / 1024)} KB
              </span>
            </h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn2" disabled={!canUndo} onClick={onUndo}>
                Undo
              </button>
              <button type="button" className="btn2" disabled={!canRedo} onClick={onRedo}>
                Redo
              </button>
              <button type="button" className="btn2" onClick={() => onDownload(primaryAsset)}>
                Download
              </button>
              {assets.length > 1 && (
                <button type="button" className="btn2" onClick={() => onDownloadZip(assets)}>
                  Download ZIP
                </button>
              )}
            </div>
          </div>

          {memoryWarning && <div className="alert">{memoryWarning}</div>}

          {activeTool.id === 'annotate' && (
            <SignAnnotateEditor
              asset={primaryAsset}
              pageIndex={selectedPage}
              disabled={activeJob !== null}
              onApply={(operations) => onRunTool('annotate', [primaryAsset], { operations })}
            />
          )}

          {activeToolId === 'xray' && (
            <XRayPanel
              asset={primaryAsset}
              disabled={activeJob !== null}
              onFixWithSanitize={(opts) =>
                onRunTool('sanitize', [primaryAsset], opts as unknown as Record<string, unknown>)
              }
            />
          )}

          {activeToolId === 'time-machine' && <TimeMachinePanel asset={primaryAsset} />}

          {activeToolId === 'ocr' && (
            <OcrPanel
              selectedLang={typeof formValues.lang === 'string' ? formValues.lang : 'eng'}
              onSelectLang={(code) => setFormValues((prev) => ({ ...prev, lang: code }))}
            />
          )}

          <ul
            className="thumb-grid"
            aria-label="Page previews"
            style={{ listStyle: 'none', padding: 0, margin: 0 }}
          >
            {pageSequence.map((item, i) => {
              const src = thumbnails[item.sourceIndex];
              if (!src) return null;
              const isSelected = selectedPage === i;
              return (
                <li key={item.id} className="thumb-card">
                  <button
                    type="button"
                    onClick={() => setSelectedPage(i)}
                    aria-pressed={isSelected}
                    style={{
                      padding: 0,
                      border: 0,
                      background: 'none',
                      borderRadius: 6,
                      outline: isSelected ? '2px solid var(--accent)' : undefined,
                      outlineOffset: isSelected ? 4 : undefined,
                    }}
                  >
                    <img
                      src={src}
                      alt={`Page ${i + 1} preview`}
                      className="thumb-img"
                      style={
                        item.rotateBy ? { transform: `rotate(${item.rotateBy}deg)` } : undefined
                      }
                    />
                  </button>
                  <span
                    className="mono"
                    style={isSelected ? { color: 'var(--accent)' } : undefined}
                  >
                    {String(i + 1).padStart(2, '0')}
                    {isSelected ? ' · selected' : ''}
                  </span>
                  {activeTool.id === 'reorder' && isSelected && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className="btn2"
                        style={{ minHeight: 32, padding: '2px 8px', fontSize: 12 }}
                        aria-label={`Move page ${i + 1} left`}
                        onClick={() => movePage(i, -1)}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        className="btn2"
                        style={{ minHeight: 32, padding: '2px 8px', fontSize: 12 }}
                        aria-label={`Move page ${i + 1} right`}
                        onClick={() => movePage(i, 1)}
                      >
                        →
                      </button>
                      <button
                        type="button"
                        className="btn2"
                        style={{ minHeight: 32, padding: '2px 8px', fontSize: 12 }}
                        aria-label={`Rotate page ${i + 1}`}
                        onClick={() => rotatePageItem(i)}
                      >
                        ↻
                      </button>
                      <button
                        type="button"
                        className="btn2"
                        style={{ minHeight: 32, padding: '2px 8px', fontSize: 12 }}
                        aria-label={`Duplicate page ${i + 1}`}
                        onClick={() => duplicatePageItem(i)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="btn2"
                        style={{ minHeight: 32, padding: '2px 8px', fontSize: 12 }}
                        aria-label={`Delete page ${i + 1}`}
                        onClick={() => deletePageItem(i)}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </main>

        <aside className="panel opts" aria-label="Tool options">
          <h2 style={{ margin: 0, font: '400 26px var(--font-serif)' }}>{activeTool.name}</h2>

          {isMultiFileTool && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="mono">File order ({assets.length})</div>
              {assets.map((a, idx) => (
                <div
                  key={a.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="btn2"
                      style={{ minHeight: 30, padding: '2px 6px', fontSize: 11 }}
                      onClick={() => moveAsset(idx, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn2"
                      style={{ minHeight: 30, padding: '2px 6px', fontSize: 11 }}
                      onClick={() => moveAsset(idx, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
              {needsMoreFiles && (
                <div className="alert">
                  Select at least {activeTool.accepts.min} PDFs using &ldquo;+ Add PDFs&rdquo;.
                </div>
              )}
            </div>
          )}

          {activeTool.id === 'reorder' ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              Select any page thumbnail to move (←/→), rotate (↻), duplicate (+), or delete (✕),
              then click Apply.
            </p>
          ) : activeTool.id === 'annotate' ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              Use the interactive editor to type new text, sign, highlight, or draw on page{' '}
              {selectedPage + 1}. Click any thumbnail below to switch pages.
            </p>
          ) : activeTool.id === 'form-fill' ? (
            <FormFillEditor
              asset={primaryAsset}
              disabled={activeJob !== null}
              onApply={(values, flatten) =>
                onRunTool('form-fill', [primaryAsset], { values, flatten })
              }
            />
          ) : (
            <ToolOptionsForm
              schema={activeTool.options}
              values={formValues}
              onChange={setFormValues}
            />
          )}

          {activeTool.id !== 'annotate' && activeTool.id !== 'form-fill' && (
            <button
              type="button"
              className="btn"
              disabled={activeJob !== null || needsMoreFiles}
              onClick={handleRun}
            >
              {activeJob ? 'Running...' : `Run ${activeTool.name.toLowerCase()}`}
            </button>
          )}
        </aside>
      </div>

      {activeJob && (
        <footer className="jobbar" aria-live="polite">
          <span style={{ color: 'var(--accent)' }}>● worker running</span>
          <div
            style={{
              flex: 1,
              minWidth: 120,
              height: 6,
              background: '#252b28',
              borderRadius: 3,
            }}
            role="progressbar"
            aria-valuenow={Math.round(activeJob.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              style={{
                width: `${Math.round(activeJob.progress * 100)}%`,
                height: 6,
                background: 'var(--accent)',
                borderRadius: 3,
              }}
            />
          </div>
          <span>{Math.round(activeJob.progress * 100)}%</span>
          <button type="button" className="btn2" onClick={() => activeJob.cancel?.()}>
            Cancel
          </button>
          <span style={{ color: 'var(--muted)' }}>observed: 0 requests</span>
        </footer>
      )}
    </>
  );
}
