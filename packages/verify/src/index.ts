import crypto from 'node:crypto';

export interface BuildManifest {
  version: number;
  commit: string;
  builtAt: string;
  fileCount: number;
  files: Record<string, string>;
}

export interface VerifyMismatch {
  file: string;
  reason: string;
}

export interface VerifyResult {
  ok: boolean;
  commit: string;
  fileCount: number;
  mismatches: VerifyMismatch[];
}

export async function verifyDeployment(baseUrl: string): Promise<VerifyResult> {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const manifestRes = await fetch(`${normalized}airgap.manifest.json`);
  if (!manifestRes.ok) {
    throw new Error(`Failed to fetch manifest: HTTP ${manifestRes.status}`);
  }
  const manifest = (await manifestRes.json()) as BuildManifest;
  const mismatches: VerifyMismatch[] = [];

  for (const [relPath, expectedHash] of Object.entries(manifest.files)) {
    const fileRes = await fetch(`${normalized}${relPath}`);
    if (!fileRes.ok) {
      mismatches.push({ file: relPath, reason: `HTTP ${fileRes.status}` });
      continue;
    }
    const buf = new Uint8Array(await fileRes.arrayBuffer());
    const actualHash = crypto.createHash('sha256').update(buf).digest('hex');
    if (actualHash !== expectedHash) {
      mismatches.push({
        file: relPath,
        reason: `hash mismatch (expected ${expectedHash.slice(0, 12)}..., got ${actualHash.slice(0, 12)}...)`,
      });
    }
  }

  return {
    ok: mismatches.length === 0,
    commit: manifest.commit,
    fileCount: Object.keys(manifest.files).length,
    mismatches,
  };
}
