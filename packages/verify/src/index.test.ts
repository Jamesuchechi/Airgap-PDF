import crypto from 'node:crypto';
import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { verifyDeployment } from './index.js';

describe('@airgap-pdf/verify', () => {
  it('passes when all files match manifest and fails when any file is altered', async () => {
    const indexBytes = Buffer.from('<html>hello</html>');
    const appBytes = Buffer.from('console.log(1);');
    let tampered = false;

    const manifest = {
      version: 1,
      commit: 'abc1234',
      builtAt: '2026-11-18T00:00:00.000Z',
      fileCount: 2,
      files: {
        'index.html': crypto.createHash('sha256').update(indexBytes).digest('hex'),
        'app.js': crypto.createHash('sha256').update(appBytes).digest('hex'),
      },
    };

    const server = http.createServer((req, res) => {
      if (req.url === '/airgap.manifest.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(manifest));
        return;
      }
      if (req.url === '/index.html') {
        res.writeHead(200);
        res.end(indexBytes);
        return;
      }
      if (req.url === '/app.js') {
        res.writeHead(200);
        res.end(tampered ? Buffer.from('console.log(2);') : appBytes);
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('Bind failed');
    const url = `http://127.0.0.1:${addr.port}/`;

    try {
      const okRes = await verifyDeployment(url);
      expect(okRes.ok).toBe(true);
      expect(okRes.fileCount).toBe(2);

      tampered = true;
      const failRes = await verifyDeployment(url);
      expect(failRes.ok).toBe(false);
      expect(failRes.mismatches).toHaveLength(1);
      expect(failRes.mismatches[0]?.file).toBe('app.js');
    } finally {
      server.close();
    }
  });
});
