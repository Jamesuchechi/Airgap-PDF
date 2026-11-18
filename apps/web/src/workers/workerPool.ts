import { AirgapError, type Asset, DEFAULT_LIMITS, type ToolResult } from '@airgap-pdf/core';
import * as Comlink from 'comlink';
import { recordObservedRequest } from '../utils/trustObserver.js';
import { createCspWorker } from './createWorker.js';
import type { ToolWorkerApi, WorkerControlMessage } from './tool.worker.js';
import toolWorkerUrl from './tool.worker.ts?worker&url';

export interface MemoryEstimate {
  status: 'ok' | 'warn' | 'refuse';
  estimatedBytes: number;
  budgetBytes: number;
  message?: string;
}

export function estimateMemory(inputBytes: number, multiplier = 2.5): MemoryEstimate {
  const nav = navigator as Navigator & { deviceMemory?: number };
  // deviceMemory is Chromium-only; use conservative 2 GB default on Safari/Firefox
  const deviceGb = nav.deviceMemory ?? 2;
  const budgetBytes = Math.min(512 * 1024 * 1024, deviceGb * 256 * 1024 * 1024);
  const estimatedBytes = Math.round(inputBytes * multiplier);

  if (estimatedBytes > budgetBytes) {
    return {
      status: 'refuse',
      estimatedBytes,
      budgetBytes,
      message: 'File is too large for available browser memory. Split the PDF first.',
    };
  }
  if (estimatedBytes > budgetBytes * 0.7) {
    return {
      status: 'warn',
      estimatedBytes,
      budgetBytes,
      message: 'Large file: consider closing other tabs while processing.',
    };
  }
  return { status: 'ok', estimatedBytes, budgetBytes };
}

interface PooledWorker {
  raw: Worker;
  api: Comlink.Remote<ToolWorkerApi>;
  busy: boolean;
}

class WorkerPool {
  private readonly workers: PooledWorker[] = [];
  private readonly maxSize = Math.max(
    1,
    Math.min((typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2) - 1, 4),
  );

  private spawn(): PooledWorker {
    const raw = createCspWorker(toolWorkerUrl);
    const api = Comlink.wrap<ToolWorkerApi>(raw);
    return { raw, api, busy: false };
  }

  private acquire(): PooledWorker {
    const idle = this.workers.find((w) => !w.busy);
    if (idle) {
      idle.busy = true;
      return idle;
    }
    if (this.workers.length < this.maxSize) {
      const created = this.spawn();
      created.busy = true;
      this.workers.push(created);
      return created;
    }
    // Fallback: create a transient worker if pool is saturated
    const transient = this.spawn();
    transient.busy = true;
    return transient;
  }

  private terminateWorker(pw: PooledWorker): void {
    const idx = this.workers.indexOf(pw);
    if (idx !== -1) this.workers.splice(idx, 1);
    pw.api[Comlink.releaseProxy]();
    pw.raw.terminate();
  }

  runJob(
    toolId: string,
    inputs: Asset[],
    options: unknown,
    onProgress: (fraction: number, message?: string) => void,
    onWatchdogStall?: () => void,
  ): { promise: Promise<ToolResult>; cancel: () => void } {
    const pw = this.acquire();
    const channel = new MessageChannel();
    let settled = false;
    let hardKillTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdogTimer: ReturnType<typeof setTimeout> | undefined;

    const resetWatchdog = () => {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(() => {
        if (!settled) onWatchdogStall?.();
      }, DEFAULT_LIMITS.watchdogMs);
    };

    channel.port1.onmessage = (ev: MessageEvent<WorkerControlMessage>) => {
      if (ev.data?.type === 'progress') {
        if (settled) return;
        resetWatchdog();
        onProgress(ev.data.fraction, ev.data.message);
      } else if (ev.data?.type === 'observed') {
        recordObservedRequest(ev.data.url, 'worker', ev.data.initiator);
      }
    };

    resetWatchdog();

    const workerInputs = inputs.map((a) => ({
      id: a.id,
      name: a.name,
      stem: a.stem,
      mime: a.mime,
      size: a.size,
      blob: a.blob as Blob,
    }));

    const promise = (async () => {
      try {
        const res = await pw.api.runTool(
          toolId,
          workerInputs,
          options,
          Comlink.transfer(channel.port2, [channel.port2]),
        );
        return res;
      } catch (err) {
        if (settled) {
          return {
            ok: false as const,
            error: new AirgapError('Cancelled', 'Worker terminated', 'Job cancelled.').toJSON(),
          };
        }
        const msg = err instanceof Error ? err.message : String(err);
        return {
          ok: false as const,
          error: new AirgapError(
            'OutOfMemory',
            msg,
            'Worker crashed or ran out of memory.',
          ).toJSON(),
        };
      } finally {
        settled = true;
        if (watchdogTimer) clearTimeout(watchdogTimer);
        if (hardKillTimer) clearTimeout(hardKillTimer);
        channel.port1.close();
        pw.busy = false;
      }
    })();

    const cancel = () => {
      if (settled) return;
      channel.port1.postMessage({ type: 'abort' } satisfies WorkerControlMessage);
      hardKillTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.terminateWorker(pw);
        }
      }, 300);
    };

    return { promise, cancel };
  }
}

export const workerPool = new WorkerPool();
