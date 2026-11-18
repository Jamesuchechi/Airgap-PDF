import { useRegisterSW } from 'virtual:pwa-register/react';
import type { Asset } from '@airgap-pdf/core';
import { useEffect, useRef, useState } from 'react';
import { CommandPalette } from './components/CommandPalette.js';
import { TopBar } from './components/TopBar.js';
import { TrustModal } from './components/TrustModal.js';
import { pdfjsRenderEngine } from './engines/pdfjsRender.js';
import { HomePage } from './pages/HomePage.js';
import { RedactPage } from './pages/RedactPage.js';
import { WorkbenchPage } from './pages/WorkbenchPage.js';
import { useWorkspaceStore } from './stores/workspaceStore.js';
import { createSamplePdf, downloadAllAsZip, downloadAsset, ingestFiles } from './utils/ingest.js';
import { startMainThreadObserver } from './utils/trustObserver.js';
import { createCspWorker } from './workers/createWorker.js';
import type { PingResponse } from './workers/ping.worker.js';
import pingWorkerUrl from './workers/ping.worker.ts?worker&url';
import { estimateMemory, workerPool } from './workers/workerPool.js';

declare global {
  interface Window {
    __airgapProbeWorkerFetch?: (url: string) => Promise<{ blocked: boolean; error?: string }>;
  }
}

function useHashRoute() {
  const [route, setRoute] = useState<string>(() => window.location.hash || '#/');
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = (next: string) => {
    window.location.hash = next;
  };
  return { route, navigate };
}

export function App() {
  const { route, navigate } = useHashRoute();
  const [workerStatus, setWorkerStatus] = useState('initializing...');
  const [swStatus, setSwStatus] = useState('checking...');
  const [trustOpen, setTrustOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeToolId, setActiveToolId] = useState('rotate');
  const [toast, setToast] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const {
    history,
    cursor,
    activeJob,
    memoryWarning,
    setInitialAssets,
    pushResult,
    undo,
    redo,
    setActiveJob,
    setMemoryWarning,
  } = useWorkspaceStore();

  const assets = cursor >= 0 && cursor < history.length ? (history[cursor] ?? []) : [];
  const primaryAsset: Asset | undefined = assets[0];

  useEffect(() => {
    const stopObserver = startMainThreadObserver();
    const worker = createCspWorker(pingWorkerUrl);
    worker.onmessage = (event: MessageEvent<PingResponse>) => {
      if (event.data.type === 'pong') {
        setWorkerStatus(`ready (maxCanvasPixels=${event.data.maxCanvasPixels})`);
      }
    };
    worker.onerror = () => setWorkerStatus('error');
    worker.postMessage({ type: 'ping' });

    window.__airgapProbeWorkerFetch = (url: string) =>
      new Promise((resolve) => {
        const probeWorker = createCspWorker(pingWorkerUrl);
        probeWorker.onmessage = (ev: MessageEvent<PingResponse>) => {
          if (ev.data.type === 'probe-result') {
            probeWorker.terminate();
            resolve({
              blocked: ev.data.blocked,
              ...(ev.data.error !== undefined ? { error: ev.data.error } : {}),
            });
          }
        };
        probeWorker.onerror = (ev) => {
          probeWorker.terminate();
          resolve({ blocked: true, error: ev.message || 'worker error' });
        };
        probeWorker.postMessage({ type: 'probe-fetch', url });
      });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(() => setSwStatus('ready (offline capable)'))
        .catch(() => setSwStatus('unavailable'));
    } else {
      setSwStatus('unsupported');
    }

    return () => {
      stopObserver();
      worker.terminate();
      delete window.__airgapProbeWorkerFetch;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!primaryAsset) {
      setThumbnails([]);
      return;
    }
    let cancelled = false;
    const urls: string[] = [];

    (async () => {
      try {
        const count = Math.min(await pdfjsRenderEngine.getPageCount(primaryAsset), 24);
        for (let i = 0; i < count; i++) {
          if (cancelled) break;
          const rendered = await pdfjsRenderEngine.renderPage(primaryAsset, i, { dpi: 72 });
          if (cancelled) break;
          const url = URL.createObjectURL(rendered.blob as Blob);
          urls.push(url);
          setThumbnails([...urls]);
        }
      } catch (err) {
        if (!cancelled) {
          setToast(err instanceof Error ? err.message : 'Could not render PDF preview.');
        }
      }
    })();

    return () => {
      cancelled = true;
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [primaryAsset]);

  const handleFiles = async (files: FileList | File[]) => {
    try {
      setToast(null);
      const ingested = await ingestFiles(files);
      if (ingested.length === 0) return;
      if (route.startsWith('#/workbench') && assets.length > 0) {
        pushResult([...assets, ...ingested]);
      } else {
        setInitialAssets(ingested);
      }
      if (!route.startsWith('#/redact')) {
        navigate('#/workbench');
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to open file.');
    }
  };

  const handleSamplePdf = async () => {
    try {
      setToast(null);
      const sample = await createSamplePdf();
      setInitialAssets([sample]);
      if (!route.startsWith('#/redact')) {
        navigate('#/workbench');
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not generate sample PDF.');
    }
  };

  const handleRunTool = async (
    toolId: string,
    inputs: Asset[],
    options: Record<string, unknown>,
  ) => {
    const totalBytes = inputs.reduce((sum, a) => sum + a.size, 0);
    const mem = estimateMemory(totalBytes, 2.5);
    if (mem.status === 'refuse') {
      setMemoryWarning(mem.message ?? 'File too large.');
      return;
    }
    setMemoryWarning(mem.status === 'warn' ? (mem.message ?? null) : null);

    const jobId = crypto.randomUUID();
    const { promise, cancel } = workerPool.runJob(
      toolId,
      inputs,
      options,
      (fraction, message) => {
        setActiveJob({
          id: jobId,
          toolId,
          status: 'running',
          progress: fraction,
          ...(message !== undefined ? { message } : {}),
          cancel,
        });
      },
      () => {
        setToast('Job is taking longer than expected. You can cancel anytime.');
      },
    );

    setActiveJob({
      id: jobId,
      toolId,
      status: 'running',
      progress: 0.02,
      message: 'Starting worker...',
      cancel,
    });

    const result = await promise;
    if (result.ok) {
      pushResult(result.outputs);
      setActiveJob(null);
      setToast(`${toolId} finished (${result.outputs.length} output).`);
    } else {
      setActiveJob(null);
      setToast(result.error.userMessage);
    }
  };

  return (
    <div className="app">
      <TopBar
        onHome={() => navigate('#/')}
        onOpenTrust={() => setTrustOpen(true)}
        swReady={swStatus.startsWith('ready')}
      />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="application/pdf,.pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {needRefresh && activeJob === null && (
        <div
          role="status"
          className="alert"
          style={{
            margin: '12px 40px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span>Update ready. Reload when idle to switch to the latest build.</span>
          <button type="button" className="btn2" onClick={() => void updateServiceWorker(true)}>
            Reload now
          </button>
        </div>
      )}

      {toast && (
        <div role="status" className="alert" style={{ margin: '12px 40px 0' }}>
          {toast}
        </div>
      )}

      {route.startsWith('#/redact') ? (
        <RedactPage
          primaryAsset={primaryAsset}
          onChooseFiles={() => fileInputRef.current?.click()}
          onSamplePdf={() => void handleSamplePdf()}
          onBackToWorkbench={() => navigate('#/workbench')}
        />
      ) : route.startsWith('#/workbench') ? (
        <WorkbenchPage
          activeToolId={activeToolId}
          onSelectTool={setActiveToolId}
          assets={assets}
          primaryAsset={primaryAsset}
          thumbnails={thumbnails}
          canUndo={cursor > 0}
          canRedo={cursor < history.length - 1}
          activeJob={activeJob}
          memoryWarning={memoryWarning}
          onRunTool={(id, inputs, opts) => void handleRunTool(id, inputs, opts)}
          onReorderAssets={(next) => pushResult(next)}
          onUndo={undo}
          onRedo={redo}
          onDownload={downloadAsset}
          onDownloadZip={(list) => void downloadAllAsZip(list)}
          onChooseFiles={() => fileInputRef.current?.click()}
          onSamplePdf={() => void handleSamplePdf()}
          onNavigate={navigate}
        />
      ) : (
        <HomePage
          workerStatus={workerStatus}
          swStatus={swStatus}
          onChooseFiles={() => fileInputRef.current?.click()}
          onSamplePdf={() => void handleSamplePdf()}
          onDropFiles={(files) => void handleFiles(files)}
          onOpenTrust={() => setTrustOpen(true)}
          onNavigate={(target) => {
            if (target === '#/workbench') setActiveToolId('rotate');
            navigate(target);
          }}
        />
      )}

      <TrustModal
        open={trustOpen}
        onClose={() => setTrustOpen(false)}
        workerStatus={workerStatus}
        swStatus={swStatus}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelectTool={(id) => {
          setActiveToolId(id);
          navigate('#/workbench');
        }}
      />
    </div>
  );
}
