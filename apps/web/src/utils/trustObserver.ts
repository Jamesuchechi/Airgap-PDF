import { useEffect, useState } from 'react';

export interface ObservedRequest {
  url: string;
  source: 'main' | 'worker';
  initiator: string;
  sameOrigin: boolean;
  timestamp: number;
}

const listeners = new Set<() => void>();
const observedLog: ObservedRequest[] = [];

function isSameOriginUrl(rawUrl: string): boolean {
  if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) return true;
  try {
    return new URL(rawUrl, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

export function recordObservedRequest(
  url: string,
  source: 'main' | 'worker',
  initiator: string,
): void {
  observedLog.push({
    url,
    source,
    initiator,
    sameOrigin: isSameOriginUrl(url),
    timestamp: Date.now(),
  });
  if (observedLog.length > 200) observedLog.shift();
  for (const fn of listeners) fn();
}

export function startMainThreadObserver(): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {};

  const seen = new Set<string>();
  const recordEntry = (entry: PerformanceResourceTiming) => {
    const key = `${entry.name}@${entry.startTime}`;
    if (seen.has(key)) return;
    seen.add(key);
    recordObservedRequest(entry.name, 'main', entry.initiatorType || 'resource');
  };

  for (const entry of performance.getEntriesByType('resource')) {
    recordEntry(entry as PerformanceResourceTiming);
  }

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      recordEntry(entry as PerformanceResourceTiming);
    }
  });
  observer.observe({ type: 'resource', buffered: true });
  return () => observer.disconnect();
}

export function useObservedRequests(): readonly ObservedRequest[] {
  const [, setTick] = useState(0);
  useEffect(() => {
    const cb = () => setTick((t) => t + 1);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return observedLog;
}
