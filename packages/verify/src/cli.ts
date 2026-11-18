#!/usr/bin/env node
import { verifyDeployment } from './index.js';

const target = process.argv[2];
if (!target) {
  console.error('Usage: airgap-verify <deployed-url>');
  process.exit(1);
}

const result = await verifyDeployment(target);
if (!result.ok) {
  console.error(`Verification FAILED (${result.mismatches.length} mismatches):`);
  for (const m of result.mismatches) {
    console.error(`  - ${m.file}: ${m.reason}`);
  }
  process.exit(1);
}

console.log(`Verified ${result.fileCount} files (commit ${result.commit}).`);
