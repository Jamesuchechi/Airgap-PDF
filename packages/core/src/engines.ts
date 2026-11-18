import type { Asset, BlobLike } from './index.js';

export type Capability =
  | 'pdf.edit'
  | 'pdf.render'
  | 'pdf.text'
  | 'pdf.crypto'
  | 'pdf.repair'
  | 'ocr'
  | 'image.codec';

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  creator?: string;
  producer?: string;
}

export interface PdfPage {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  rotateBy(degrees: 90 | 180 | 270): void;
}

export interface SavePdfOptions {
  name?: string;
  objectStreams?: boolean;
  encrypt?: {
    userPassword: string;
    ownerPassword?: string;
  };
}

export interface ImagePageOptions {
  pageSize: 'fit' | 'a4' | 'letter';
  orientation: 'auto' | 'portrait' | 'landscape';
  marginPt: number;
}

export interface DrawTextOptions {
  text: string;
  xPct: number;
  yPct: number;
  fontSize?: number;
  colorHex?: string;
  opacity?: number;
  rotateDeg?: number;
}

export interface DrawWatermarkOptions {
  text: string;
  opacity?: number;
  angle?: number;
  tile?: boolean;
  fontSize?: number;
  colorHex?: string;
}

export interface DrawImageOverlayOptions {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct?: number;
  opacity?: number;
}

export interface DrawRectOptions {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  colorHex?: string;
  opacity?: number;
  filled?: boolean;
}

export interface DrawFreehandOptions {
  points: Array<{ xPct: number; yPct: number }>;
  colorHex?: string;
  strokeWidth?: number;
}

export interface CropResizeOptions {
  mode: 'crop' | 'resize';
  paperSize?: 'a4' | 'letter';
  marginPt?: number;
}

export interface FormFieldInfo {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'radio' | 'unknown';
  value: string | boolean;
  options?: string[];
}

export interface SanitizeOptions {
  metadata: boolean;
  javascript: boolean;
  embeddedFiles: boolean;
  hiddenLayers: boolean;
  annotations: boolean;
  forms: boolean;
}

export interface XRaySummary {
  metadata: PdfMetadata;
  hasXmpMetadata: boolean;
  hasJavaScript: boolean;
  hasOpenAction: boolean;
  hasEmbeddedFiles: boolean;
  embeddedFileCount: number;
  hasHiddenLayers: boolean;
  annotationCount: number;
  formFieldCount: number;
  hasPieceInfo: boolean;
  hasStructTree: boolean;
}

export interface PdfDoc {
  readonly pageCount: number;
  resolveRange(expr: string): number[];
  page(index: number): PdfPage;
  copyPagesFrom(src: PdfDoc, indices: number[], at?: number): Promise<void>;
  insertBlankPage(atIndex: number, size?: [number, number]): void;
  addImagePage(
    bytes: Uint8Array,
    mime: 'image/png' | 'image/jpeg',
    opts: ImagePageOptions,
  ): Promise<void>;
  drawText(pageIndex: number, opts: DrawTextOptions): Promise<void>;
  drawWatermark(pageIndex: number, opts: DrawWatermarkOptions): Promise<void>;
  drawImageOverlay(
    pageIndex: number,
    bytes: Uint8Array,
    mime: 'image/png' | 'image/jpeg',
    opts: DrawImageOverlayOptions,
  ): Promise<void>;
  drawRect(pageIndex: number, opts: DrawRectOptions): void;
  drawFreehand(pageIndex: number, opts: DrawFreehandOptions): void;
  cropOrResize(pageIndex: number, opts: CropResizeOptions): void;
  getMetadata(): PdfMetadata;
  getFormFields(): FormFieldInfo[];
  fillFormFields(values: Record<string, string | boolean>, flatten: boolean): void;
  sanitize(opts: SanitizeOptions): void;
  inspect(): XRaySummary;
  recompressImages(opts: { maxDim: number; quality: number }): Promise<number>;
  removePage(index: number): void;
  setMetadata(meta: Partial<PdfMetadata>): void;
  save(opts?: SavePdfOptions): Promise<Asset>;
}

export interface PdfEngine {
  readonly id: string;
  open(asset: Asset, opts?: { password?: string }): Promise<PdfDoc>;
  create(): Promise<PdfDoc>;
}

export interface RenderedPage {
  readonly pageIndex: number;
  readonly width: number;
  readonly height: number;
  readonly downscaled: boolean;
  readonly blob: BlobLike;
}

export interface RenderEngine {
  readonly id: string;
  getPageCount(asset: Asset, opts?: { password?: string }): Promise<number>;
  renderPage(
    asset: Asset,
    pageIndex: number,
    opts?: { dpi?: number; maxPixels?: number; format?: 'png' | 'jpeg'; password?: string },
  ): Promise<RenderedPage>;
  extractText(asset: Asset, pageIndex: number, opts?: { password?: string }): Promise<string>;
}
