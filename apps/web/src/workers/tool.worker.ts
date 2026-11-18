import { AirgapError, type Asset, DEFAULT_LIMITS, fail, type ToolResult } from '@airgap-pdf/core';
import * as Comlink from 'comlink';
import { cantooPdfEngine } from '../engines/cantooPdfLib.js';
import { getTool } from '../tools/registry.js';

export interface WorkerAssetInput {
  id: string;
  name: string;
  stem: string;
  mime: string;
  size: number;
  blob: Blob;
}

export type WorkerControlMessage =
  | { type: 'progress'; fraction: number; message?: string }
  | { type: 'observed'; url: string; initiator: string }
  | { type: 'abort' };

const activePorts = new Set<MessagePort>();
let workerWrapped = false;

function installWorkerRequestObserver(): void {
  if (workerWrapped) return;
  workerWrapped = true;

  const notify = (url: string, initiator: string) => {
    for (const port of activePorts) {
      port.postMessage({ type: 'observed', url, initiator } satisfies WorkerControlMessage);
    }
  };

  if (typeof self.fetch === 'function') {
    const origFetch = self.fetch.bind(self);
    self.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      notify(url, 'fetch');
      return origFetch(input, init);
    };
  }
}

const workerApi = {
  async runTool(
    toolId: string,
    inputs: WorkerAssetInput[],
    options: unknown,
    controlPort: MessagePort,
  ): Promise<ToolResult> {
    const tool = getTool(toolId);
    if (!tool) {
      return fail(
        new AirgapError(
          'EngineUnavailable',
          `Unknown tool: ${toolId}`,
          `Tool "${toolId}" not found.`,
        ),
      );
    }

    const parsed = tool.options.safeParse(options);
    if (!parsed.success) {
      return fail(
        new AirgapError('InvalidOptions', parsed.error.message, 'Invalid tool options provided.'),
      );
    }

    installWorkerRequestObserver();
    activePorts.add(controlPort);

    const controller = new AbortController();
    controlPort.onmessage = (ev: MessageEvent<WorkerControlMessage>) => {
      if (ev.data?.type === 'abort') {
        controller.abort();
      }
    };

    try {
      const assets: Asset[] = inputs;
      let lastProgress = 0;
      const result = await tool.run(
        {
          pdf: cantooPdfEngine,
          signal: controller.signal,
          limits: DEFAULT_LIMITS,
          progress(fraction, message) {
            const clamped = Math.max(lastProgress, Math.min(1, fraction));
            lastProgress = clamped;
            controlPort.postMessage({
              type: 'progress',
              fraction: clamped,
              ...(message !== undefined ? { message } : {}),
            } satisfies WorkerControlMessage);
          },
          log() {
            // Structured worker logs never contain file content
          },
        },
        assets,
        parsed.data,
      );
      return result;
    } catch (err) {
      if (err instanceof AirgapError) {
        return fail(err);
      }
      const message = err instanceof Error ? err.message : String(err);
      return fail(new AirgapError('CorruptPdf', message, 'Failed to process PDF.'));
    } finally {
      activePorts.delete(controlPort);
      controlPort.close();
    }
  },
};

export type ToolWorkerApi = typeof workerApi;

Comlink.expose(workerApi);
