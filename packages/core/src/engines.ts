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

export interface PdfDoc {
  readonly pageCount: number;
  resolveRange(expr: string): number[];
  page(index: number): PdfPage;
  copyPagesFrom(src: PdfDoc, indices: number[], at?: number): Promise<void>;
  insertBlankPage(atIndex: number, size?: [number, number]): void;
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
  readonly blob: BlobLike;
}

export interface RenderEngine {
  readonly id: string;
  getPageCount(asset: Asset, opts?: { password?: string }): Promise<number>;
  renderPage(
    asset: Asset,
    pageIndex: number,
    opts?: { dpi?: number; maxPixels?: number; password?: string },
  ): Promise<RenderedPage>;
  extractText(asset: Asset, pageIndex: number, opts?: { password?: string }): Promise<string>;
}
