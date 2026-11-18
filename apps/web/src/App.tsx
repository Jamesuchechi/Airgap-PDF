import { useEffect, useState } from 'react';
import { createCspWorker } from './workers/createWorker.js';
import type { PingResponse } from './workers/ping.worker.js';
import pingWorkerUrl from './workers/ping.worker.ts?worker&url';

declare global {
  interface Window {
    __airgapProbeWorkerFetch?: (url: string) => Promise<{ blocked: boolean; error?: string }>;
  }
}

export function App() {
  const [workerStatus, setWorkerStatus] = useState<string>('initializing...');
  const [swStatus, setSwStatus] = useState<string>('checking...');

  useEffect(() => {
    const worker = createCspWorker(pingWorkerUrl);

    worker.onmessage = (event: MessageEvent<PingResponse>) => {
      if (event.data.type === 'pong') {
        setWorkerStatus(`ready (maxCanvasPixels=${event.data.maxCanvasPixels})`);
      }
    };
    worker.onerror = () => {
      setWorkerStatus('error');
    };
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
      worker.terminate();
      delete window.__airgapProbeWorkerFetch;
    };
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            stroke="#6BFFB0"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M20.5 6.5A10 10 0 1 0 24 14" />
          </svg>
          Airgap PDF
        </div>
        <div className="pill" data-testid="trust-pill">
          <span className="dot" aria-hidden="true" />0 OBSERVED REQUESTS · CSP ACTIVE
        </div>
      </header>

      <main className="main">
        <span className="mono" style={{ color: 'var(--accent)' }}>
          M0 Foundation
        </span>
        <h1 className="hero-title">Hello Airgap.</h1>
        <p style={{ margin: 0, color: '#B4BEB8' }}>
          Static-only PDF workbench. Your files never leave this device.
        </p>

        <section className="panel" aria-label="Runtime diagnostics">
          <div className="row">
            <span className="mono">CSP policy</span>
            <span style={{ color: 'var(--accent)' }}>connect-src &apos;self&apos;</span>
          </div>
          <div className="row">
            <span className="mono">Shimmed worker</span>
            <span data-testid="worker-status">{workerStatus}</span>
          </div>
          <div className="row">
            <span className="mono">Service worker</span>
            <span data-testid="sw-status">{swStatus}</span>
          </div>
        </section>
      </main>
    </div>
  );
}
