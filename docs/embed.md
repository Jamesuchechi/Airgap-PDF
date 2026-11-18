# Embed Guide (`#/embed/<tool>`)

Embed any Airgap PDF tool inside an `<iframe>` with minimal chrome and a strict origin-checked `postMessage` API.

## Route Format

```
https://<your-origin>/airgap-pdf/#/embed/<toolId>?origin=https://app.example.com
```

Replace `<toolId>` with any tool ID (e.g. `rotate`, `compress`, `merge`, `redact`).

## Origin Security

Always pass `?origin=<parent-origin>` in the iframe URL. The embed page validates `event.origin === allowedOrigin` on every incoming `postMessage` and targets `allowedOrigin` on outgoing messages (defaulting to `window.location.origin` if omitted).

## `postMessage` Protocol

1. **Ready (Embed -> Parent):**
   `{ source: 'airgap-pdf-embed', type: 'ready', tool: '<toolId>' }`
2. **Run (Parent -> Embed):**
   `{ type: 'run', files: [{ name: 'doc.pdf', bytes: ArrayBuffer }], options: { degrees: 90 } }`
3. **Result (Embed -> Parent):**
   `{ source: 'airgap-pdf-embed', type: 'result', outputs: [{ name, mime, size, bytes }] }`
4. **Error (Embed -> Parent):**
   `{ source: 'airgap-pdf-embed', type: 'error', error: 'Error message' }`
