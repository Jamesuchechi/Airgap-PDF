import { type Asset, DEFAULT_LIMITS, type ToolContext } from '@airgap-pdf/core';
import { useEffect, useMemo, useState } from 'react';
import { ToolOptionsForm } from '../components/ToolOptionsForm.js';
import { cantooPdfEngine } from '../engines/cantooPdfLib.js';
import { pdfjsRenderEngine } from '../engines/pdfjsRender.js';
import { getTool } from '../tools/registry.js';
import { downloadAsset, ingestFiles } from '../utils/ingest.js';

interface EmbedPageProps {
  route: string;
}

export function EmbedPage({ route }: EmbedPageProps) {
  const { toolId, allowedOrigin } = useMemo(() => {
    const [pathPart = '', queryPart = ''] = route.split('?');
    const id = pathPart.replace(/^#\/embed\/?/, '').split('/')[0] || 'rotate';
    const params = new URLSearchParams(queryPart);
    const originParam = params.get('origin');
    const resolvedOrigin =
      originParam && /^https?:\/\//i.test(originParam)
        ? new URL(originParam).origin
        : window.location.origin;
    return { toolId: id, allowedOrigin: resolvedOrigin };
  }, [route]);

  const tool = getTool(toolId);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [options, setOptions] = useState<Record<string, unknown>>({});
  const [outputs, setOutputs] = useState<Asset[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (window.parent !== window) {
      window.parent.postMessage(
        { source: 'airgap-pdf-embed', type: 'ready', tool: toolId },
        allowedOrigin,
      );
    }
  }, [toolId, allowedOrigin]);

  const executeTool = async (inputAssets: Asset[], opts: Record<string, unknown>) => {
    if (!tool) {
      const msg = `Unknown embed tool: ${toolId}`;
      setErrorMsg(msg);
      if (window.parent !== window) {
        window.parent.postMessage(
          { source: 'airgap-pdf-embed', type: 'error', error: msg },
          allowedOrigin,
        );
      }
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    setStatus('Running...');
    try {
      const parsed = tool.options.parse(opts);
      const ctx: ToolContext = {
        pdf: cantooPdfEngine,
        render: pdfjsRenderEngine,
        limits: DEFAULT_LIMITS,
        progress: (_pct, msg) => {
          if (msg) setStatus(msg);
        },
        log: () => {},
        signal: new AbortController().signal,
      };
      const res = await tool.run(ctx, inputAssets, parsed);
      if (!res.ok) throw new Error(res.error.userMessage);
      setOutputs(res.outputs);
      setStatus(`Done (${res.outputs.length} output(s))`);

      if (window.parent !== window) {
        const serialized = await Promise.all(
          res.outputs.map(async (o) => ({
            name: o.name,
            mime: o.mime,
            size: o.size,
            bytes: await o.blob.arrayBuffer(),
          })),
        );
        window.parent.postMessage(
          { source: 'airgap-pdf-embed', type: 'result', outputs: serialized },
          allowedOrigin,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      if (window.parent !== window) {
        window.parent.postMessage(
          { source: 'airgap-pdf-embed', type: 'error', error: msg },
          allowedOrigin,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== allowedOrigin) return;
      const data = event.data as
        | {
            type?: string;
            files?: Array<{ name: string; bytes: ArrayBuffer }>;
            options?: Record<string, unknown>;
          }
        | undefined;
      if (data?.type !== 'run') return;

      const incomingAssets: Asset[] = (data.files ?? []).map((f) => {
        const blob = new Blob([f.bytes], { type: 'application/pdf' });
        return {
          id: crypto.randomUUID(),
          name: f.name || 'input.pdf',
          stem: (f.name || 'input').replace(/\.[^.]+$/, ''),
          mime: 'application/pdf',
          size: blob.size,
          blob,
        };
      });
      if (incomingAssets.length > 0) setAssets(incomingAssets);
      if (data.options) setOptions(data.options);
      void executeTool(
        incomingAssets.length > 0 ? incomingAssets : assets,
        data.options ?? options,
      );
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  });

  if (!tool) {
    return (
      <main className="page" style={{ padding: 20 }}>
        <div role="alert" className="alert">
          Unknown embed tool: <code className="mono">{toolId}</code>
        </div>
      </main>
    );
  }

  return (
    <main className="page" style={{ maxWidth: 680, margin: '0 auto', padding: 16 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>{tool.name}</h1>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
            {tool.summary}
          </p>
        </div>
        <span className="mono muted" style={{ fontSize: 11 }}>
          Airgap Embed
        </span>
      </header>

      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple={
            tool.accepts.max === 'many' ||
            (typeof tool.accepts.max === 'number' && tool.accepts.max > 1)
          }
          onChange={(e) => {
            if (!e.target.files) return;
            void ingestFiles(e.target.files).then((loaded) => setAssets(loaded));
          }}
        />

        <ToolOptionsForm schema={tool.options} values={options} onChange={setOptions} />

        <button
          type="button"
          className="btn"
          disabled={busy || assets.length === 0}
          onClick={() => void executeTool(assets, options)}
        >
          {busy ? 'Running...' : `Run ${tool.name}`}
        </button>

        {status && (
          <div className="muted" style={{ fontSize: 12 }}>
            {status}
          </div>
        )}
        {errorMsg && (
          <div role="alert" className="alert">
            {errorMsg}
          </div>
        )}

        {outputs.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {outputs.map((out) => (
              <button
                key={out.id}
                type="button"
                className="btn2"
                onClick={() => downloadAsset(out)}
              >
                Download {out.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
