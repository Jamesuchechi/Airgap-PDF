import type { PdfEngine } from './engines.js';
import { type Asset, DEFAULT_LIMITS, type ToolDefinition } from './index.js';

export interface HarnessParams<O> {
  tool: ToolDefinition;
  inputs: Asset[];
  validOptions: O;
  invalidOptions?: unknown;
  pdf: PdfEngine;
}

export async function assertToolInvariants<O>(params: HarnessParams<O>): Promise<Asset[]> {
  const { tool, inputs, validOptions, invalidOptions, pdf } = params;

  // 1. Reject invalid options
  if (invalidOptions !== undefined) {
    const parsed = tool.options.safeParse(invalidOptions);
    if (parsed.success) {
      throw new Error(`Expected ${tool.id} to reject invalid options`);
    }
  }

  // Snapshot input sizes to verify non-mutation
  const inputSizes = inputs.map((i) => i.blob.size);

  // 2. Run tool & check monotonic progress in [0, 1]
  const progressValues: number[] = [];
  const res1 = await tool.run(
    {
      pdf,
      signal: { aborted: false },
      limits: DEFAULT_LIMITS,
      progress: (f) => {
        if (f < 0 || f > 1) {
          throw new Error(`Progress out of [0, 1]: ${f}`);
        }
        const prev = progressValues[progressValues.length - 1];
        if (prev !== undefined && f < prev) {
          throw new Error(`Non-monotonic progress: ${prev} -> ${f}`);
        }
        progressValues.push(f);
      },
      log: () => {},
    },
    inputs,
    validOptions,
  );

  if (!res1.ok) {
    throw new Error(`Tool ${tool.id} failed unexpectedly: ${res1.error.message}`);
  }

  // 3. Input assets not mutated
  inputs.forEach((inp, idx) => {
    if (inp.blob.size !== inputSizes[idx]) {
      throw new Error(`Tool ${tool.id} mutated input[${idx}] size`);
    }
  });

  // 4. Outputs re-open cleanly
  for (const out of res1.outputs) {
    if (out.mime === 'application/pdf') {
      const opened = await pdf.open(out);
      if (opened.pageCount < 0) {
        throw new Error(`Invalid pageCount for ${out.name}`);
      }
    }
  }

  // 5. Determinism check (if claimed)
  if (tool.deterministic && res1.outputs.length > 0) {
    const res2 = await tool.run(
      {
        pdf,
        signal: { aborted: false },
        limits: DEFAULT_LIMITS,
        progress: () => {},
        log: () => {},
      },
      inputs,
      validOptions,
    );
    if (!res2.ok) {
      throw new Error(`Deterministic second run failed: ${res2.error.message}`);
    }
    const firstOut = res1.outputs[0];
    const secondOut = res2.outputs[0];
    if (!firstOut || !secondOut) {
      throw new Error('Deterministic check expected at least one output');
    }
    const b1 = new Uint8Array(await firstOut.blob.arrayBuffer());
    const b2 = new Uint8Array(await secondOut.blob.arrayBuffer());
    if (b1.byteLength !== b2.byteLength) {
      throw new Error(`Deterministic output length mismatch: ${b1.byteLength} vs ${b2.byteLength}`);
    }
  }

  // 6. Cancellation check
  let cancelled = false;
  try {
    const abortedRes = await tool.run(
      {
        pdf,
        signal: { aborted: true },
        limits: DEFAULT_LIMITS,
        progress: () => {},
        log: () => {},
      },
      inputs,
      validOptions,
    );
    if (!abortedRes.ok && abortedRes.error.code === 'Cancelled') {
      cancelled = true;
    }
  } catch {
    cancelled = true;
  }
  if (!cancelled) {
    throw new Error(`Tool ${tool.id} did not honour aborted signal`);
  }

  return res1.outputs;
}
