import { DEFAULT_LIMITS } from '@airgap-pdf/core';

export type PingRequest = { type: 'ping' } | { type: 'probe-fetch'; url: string };

export type PingResponse =
  | { type: 'pong'; maxCanvasPixels: number }
  | { type: 'probe-result'; blocked: boolean; error?: string };

self.onmessage = async (event: MessageEvent<PingRequest>) => {
  const msg = event.data;
  if (msg.type === 'ping') {
    self.postMessage({
      type: 'pong',
      maxCanvasPixels: DEFAULT_LIMITS.maxCanvasPixels,
    } satisfies PingResponse);
    return;
  }

  if (msg.type === 'probe-fetch') {
    try {
      await fetch(msg.url);
      self.postMessage({ type: 'probe-result', blocked: false } satisfies PingResponse);
    } catch (err) {
      self.postMessage({
        type: 'probe-result',
        blocked: true,
        error: String(err),
      } satisfies PingResponse);
    }
  }
};
