import {
  AirgapError,
  type Asset,
  type ImagePageOptions,
  type PdfDoc,
  type PdfEngine,
  type PdfMetadata,
  type PdfPage,
  resolvePageRange,
  type SavePdfOptions,
  sanitizeFilename,
} from '@airgap-pdf/core';
import { degrees, PDFDocument } from '@cantoo/pdf-lib';

class CantooPdfDoc implements PdfDoc {
  constructor(private readonly doc: PDFDocument) {}

  get pageCount(): number {
    return this.doc.getPageCount();
  }

  resolveRange(expr: string): number[] {
    return resolvePageRange(expr, this.pageCount);
  }

  page(index: number): PdfPage {
    const p = this.doc.getPage(index);
    return {
      index,
      get width() {
        return p.getWidth();
      },
      get height() {
        return p.getHeight();
      },
      get rotation() {
        return p.getRotation().angle;
      },
      rotateBy(deg: 90 | 180 | 270) {
        const next = (p.getRotation().angle + deg) % 360;
        p.setRotation(degrees(next));
      },
    };
  }

  async copyPagesFrom(src: PdfDoc, indices: number[], at?: number): Promise<void> {
    if (!(src instanceof CantooPdfDoc)) {
      throw new AirgapError(
        'UnsupportedFeature',
        'Cross-engine copy not supported',
        'Cannot copy pages from a different PDF engine.',
      );
    }
    const copied = await this.doc.copyPages(src.doc, indices);
    copied.forEach((p, offset) => {
      if (at !== undefined) {
        this.doc.insertPage(at + offset, p);
      } else {
        this.doc.addPage(p);
      }
    });
  }

  insertBlankPage(atIndex: number, size: [number, number] = [595.28, 841.89]): void {
    this.doc.insertPage(atIndex, size);
  }

  async addImagePage(
    bytes: Uint8Array,
    mime: 'image/png' | 'image/jpeg',
    opts: ImagePageOptions,
  ): Promise<void> {
    const img =
      mime === 'image/png' ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes);
    const { width: iw, height: ih } = img;
    let pw = iw;
    let ph = ih;

    if (opts.pageSize === 'a4') {
      pw = 595.28;
      ph = 841.89;
    } else if (opts.pageSize === 'letter') {
      pw = 612;
      ph = 792;
    }

    const wantLandscape =
      opts.orientation === 'landscape' || (opts.orientation === 'auto' && iw > ih);
    if (opts.pageSize !== 'fit' && wantLandscape && pw < ph) {
      [pw, ph] = [ph, pw];
    } else if (opts.pageSize !== 'fit' && opts.orientation === 'portrait' && pw > ph) {
      [pw, ph] = [ph, pw];
    }

    const page = this.doc.addPage([pw, ph]);
    const availW = Math.max(1, pw - opts.marginPt * 2);
    const availH = Math.max(1, ph - opts.marginPt * 2);
    const scale = opts.pageSize === 'fit' ? 1 : Math.min(availW / iw, availH / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    page.drawImage(img, {
      x: (pw - dw) / 2,
      y: (ph - dh) / 2,
      width: dw,
      height: dh,
    });
  }

  removePage(index: number): void {
    this.doc.removePage(index);
  }

  setMetadata(meta: Partial<PdfMetadata>): void {
    if (meta.title !== undefined) this.doc.setTitle(meta.title);
    if (meta.author !== undefined) this.doc.setAuthor(meta.author);
    if (meta.subject !== undefined) this.doc.setSubject(meta.subject);
    if (meta.keywords !== undefined) this.doc.setKeywords(meta.keywords);
    if (meta.creator !== undefined) this.doc.setCreator(meta.creator);
    if (meta.producer !== undefined) this.doc.setProducer(meta.producer);
  }

  async save(opts?: SavePdfOptions): Promise<Asset> {
    if (opts?.encrypt) {
      await this.doc.encrypt({
        userPassword: opts.encrypt.userPassword,
        ownerPassword: opts.encrypt.ownerPassword ?? opts.encrypt.userPassword,
      });
    }
    const bytes = await this.doc.save({
      useObjectStreams: opts?.objectStreams ?? true,
    });
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy], { type: 'application/pdf' });
    const { name, stem } = sanitizeFilename(opts?.name ?? 'output.pdf');
    return {
      id: crypto.randomUUID(),
      name,
      stem,
      mime: 'application/pdf',
      size: blob.size,
      blob,
    };
  }
}

export const cantooPdfEngine: PdfEngine = {
  id: '@cantoo/pdf-lib',

  async open(asset: Asset, opts?: { password?: string }): Promise<PdfDoc> {
    const bytes = new Uint8Array(await asset.blob.arrayBuffer());
    try {
      const doc = await PDFDocument.load(bytes, {
        ...(opts?.password !== undefined ? { password: opts.password } : {}),
        ignoreEncryption: false,
      });
      return new CantooPdfDoc(doc);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/encrypt|password/i.test(msg)) {
        throw new AirgapError(
          'PasswordRequired',
          msg,
          'This PDF is password-protected.',
          'Enter password',
        );
      }
      throw new AirgapError('CorruptPdf', msg, 'Could not parse this PDF file.');
    }
  },

  async create(): Promise<PdfDoc> {
    return new CantooPdfDoc(await PDFDocument.create());
  },
};
