/**
 * Bootstrap an ES module worker through a 1-line `blob:` shim so that:
 * 1. The worker inherits the creating document's `<meta>` CSP (`connect-src 'self'`).
 * 2. Relative chunk imports and `import.meta.url` inside the imported worker resolve
 *    against the real HTTP origin instead of failing on a `blob:` base URL.
 */
export function createCspWorker(workerUrl: URL | string): Worker {
  const abs = new URL(workerUrl, location.href).href;
  const blob = new Blob([`import ${JSON.stringify(abs)};`], {
    type: 'application/javascript',
  });
  const blobUrl = URL.createObjectURL(blob);
  const worker = new Worker(blobUrl, { type: 'module' });
  URL.revokeObjectURL(blobUrl);
  return worker;
}
