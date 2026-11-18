import type { z } from 'zod';

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

export type ToolResult =
  | { ok: true; outputs: Asset[] }
  | { ok: false; error: SerializedAirgapError };

export const ok = (outputs: Asset[]): ToolResult => ({ ok: true, outputs });
export const fail = (error: AirgapError): ToolResult => ({ ok: false, error: error.toJSON() });

export interface ToolDefinition<O extends z.ZodTypeAny> {
  id: string;
  name: string;
  summary: string;
  category: 'organize' | 'convert' | 'edit' | 'protect' | 'inspect' | 'compare' | 'scan';
  accepts: { mime: string[]; min: number; max: number | 'many' };
  produces: 'pdf' | 'images' | 'text' | 'zip' | 'report';
  runtime: Array<'browser' | 'node'>;
  options: O;
}

export const defineTool = <O extends z.ZodTypeAny>(def: ToolDefinition<O>) => def;
