import type { z } from 'zod';
import type { Capability, PdfEngine, RenderEngine } from './engines.js';

export { z } from 'zod';
export * from './engines.js';
export * from './harness.js';
export * from './magicBytes.js';
export * from './pageRange.js';

export type AssetId = string;

/** Structural Blob interface shared by browser `Blob`/`File` and Node `Blob` without DOM types. */
export interface BlobLike {
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
  slice(start?: number, end?: number, contentType?: string): BlobLike;
  text(): Promise<string>;
}

/** Canonical Blob-backed asset stored on the main thread. */
export interface Asset {
  id: AssetId;
  name: string;
  stem: string;
  mime: string;
  size: number;
  blob: BlobLike;
}

export interface Limits {
  maxInputBytesDesktop: number;
  maxInputBytesMobile: number;
  maxPages: number;
  maxSingleStreamBytes: number;
  maxTotalDecodedBytes: number;
  maxObjectDepth: number;
  maxCanvasPixels: number;
  maxRenderDpi: number;
  watchdogMs: number;
}

export const DEFAULT_LIMITS: Readonly<Limits> = {
  maxInputBytesDesktop: 500 * 1024 * 1024,
  maxInputBytesMobile: 150 * 1024 * 1024,
  maxPages: 5_000,
  maxSingleStreamBytes: 256 * 1024 * 1024,
  maxTotalDecodedBytes: 2 * 1024 * 1024 * 1024,
  maxObjectDepth: 100,
  maxCanvasPixels: 16_777_216,
  maxRenderDpi: 300,
  watchdogMs: 30_000,
};

export type AirgapErrorCode =
  | 'PasswordRequired'
  | 'CorruptPdf'
  | 'UnsupportedFeature'
  | 'LimitExceeded'
  | 'OutOfMemory'
  | 'Cancelled'
  | 'EngineUnavailable'
  | 'InvalidOptions';

export interface SerializedAirgapError {
  code: AirgapErrorCode;
  message: string;
  userMessage: string;
  action?: string;
}

export class AirgapError extends Error {
  readonly code: AirgapErrorCode;
  readonly userMessage: string;
  readonly action?: string;

  constructor(code: AirgapErrorCode, message: string, userMessage: string, action?: string) {
    super(message);
    this.name = 'AirgapError';
    this.code = code;
    this.userMessage = userMessage;
    if (action !== undefined) {
      this.action = action;
    }
  }

  toJSON(): SerializedAirgapError {
    const out: SerializedAirgapError = {
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
    };
    if (this.action !== undefined) {
      out.action = this.action;
    }
    return out;
  }

  static fromJSON(data: SerializedAirgapError): AirgapError {
    return new AirgapError(data.code, data.message, data.userMessage, data.action);
  }
}

export interface AbortSignalLike {
  readonly aborted: boolean;
}

export interface ToolContext {
  pdf: PdfEngine;
  render?: RenderEngine;
  progress(fraction: number, message?: string): void;
  signal: AbortSignalLike;
  limits: Readonly<Limits>;
  log(level: 'debug' | 'info' | 'warn', msg: string): void;
}

export type ToolResult =
  | { ok: true; outputs: Asset[] }
  | { ok: false; error: SerializedAirgapError };

export const ok = (outputs: Asset[]): ToolResult => ({ ok: true, outputs });
export const fail = (error: AirgapError): ToolResult => ({ ok: false, error: error.toJSON() });

export interface ToolDefinition<O extends z.ZodTypeAny = z.ZodTypeAny> {
  id: string;
  name: string;
  summary: string;
  category: 'organize' | 'convert' | 'edit' | 'protect' | 'inspect' | 'compare' | 'scan';
  accepts: { mime: string[]; min: number; max: number | 'many' };
  produces: 'pdf' | 'images' | 'text' | 'zip' | 'report';
  runtime: Array<'browser' | 'node'>;
  needs?: Capability[];
  memory?: { multiplier: number };
  deterministic?: boolean;
  options: O;
  run(ctx: ToolContext, input: Asset[], options: z.infer<O>): Promise<ToolResult>;
}

export const defineTool = <O extends z.ZodTypeAny>(def: ToolDefinition<O>) => def;

export function sanitizeFilename(raw: string): { name: string; stem: string } {
  const base = raw
    .replace(/[/\\:\0<>|"?*]/g, '_')
    .trim()
    .slice(0, 120);
  const name = base || 'document.pdf';
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return { name, stem };
}
