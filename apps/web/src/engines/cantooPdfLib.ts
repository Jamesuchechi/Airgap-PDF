import {
  AirgapError,
  type Asset,
  type CropResizeOptions,
  type DrawFreehandOptions,
  type DrawImageOverlayOptions,
  type DrawRectOptions,
  type DrawTextOptions,
  type DrawWatermarkOptions,
  type FormFieldInfo,
  type ImagePageOptions,
  type PdfDoc,
  type PdfEngine,
  type PdfMetadata,
  type PdfPage,
  resolvePageRange,
  type SanitizeOptions,
  type SavePdfOptions,
  sanitizeFilename,
  type XRaySummary,
} from '@airgap-pdf/core';
import {
  degrees,
  PDFArray,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFNumber,
  PDFRadioGroup,
  PDFRawStream,
  PDFTextField,
  rgb,
  StandardFonts,
} from '@cantoo/pdf-lib';

function parseHexColor(hex = '#111111') {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return rgb(0.07, 0.07, 0.07);
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

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

  async drawText(pageIndex: number, opts: DrawTextOptions): Promise<void> {
    const page = this.doc.getPage(pageIndex);
    const { width: pw, height: ph } = page.getSize();
    const font = await this.doc.embedFont(StandardFonts.Helvetica);
    const size = opts.fontSize ?? 14;
    const x = opts.xPct * pw;
    const y = Math.max(0, ph - opts.yPct * ph - size);
    page.drawText(opts.text, {
      x,
      y,
      size,
      font,
      color: parseHexColor(opts.colorHex),
      opacity: opts.opacity ?? 1,
      rotate: degrees(opts.rotateDeg ?? 0),
    });
  }

  async drawWatermark(pageIndex: number, opts: DrawWatermarkOptions): Promise<void> {
    const page = this.doc.getPage(pageIndex);
    const { width: pw, height: ph } = page.getSize();
    const font = await this.doc.embedFont(StandardFonts.HelveticaBold);
    const size = opts.fontSize ?? 42;
    const color = parseHexColor(opts.colorHex ?? '#444444');
    const opacity = opts.opacity ?? 0.16;
    const angle = opts.angle ?? 35;

    if (opts.tile) {
      const stepX = Math.max(160, size * 4.5);
      const stepY = Math.max(120, size * 3.2);
      for (let x = 20; x < pw; x += stepX) {
        for (let y = 40; y < ph; y += stepY) {
          page.drawText(opts.text, {
            x,
            y,
            size: Math.max(14, Math.round(size * 0.65)),
            font,
            color,
            opacity,
            rotate: degrees(angle),
          });
        }
      }
      return;
    }

    const textWidth = font.widthOfTextAtSize(opts.text, size);
    page.drawText(opts.text, {
      x: Math.max(20, (pw - textWidth * 0.75) / 2),
      y: ph / 2 - size / 2,
      size,
      font,
      color,
      opacity,
      rotate: degrees(angle),
    });
  }

  async drawImageOverlay(
    pageIndex: number,
    bytes: Uint8Array,
    mime: 'image/png' | 'image/jpeg',
    opts: DrawImageOverlayOptions,
  ): Promise<void> {
    const page = this.doc.getPage(pageIndex);
    const { width: pw, height: ph } = page.getSize();
    const img =
      mime === 'image/png' ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes);
    const drawW = opts.widthPct * pw;
    const drawH =
      opts.heightPct !== undefined
        ? opts.heightPct * ph
        : drawW * (img.height / Math.max(1, img.width));
    const x = opts.xPct * pw;
    const y = Math.max(0, ph - opts.yPct * ph - drawH);
    page.drawImage(img, {
      x,
      y,
      width: drawW,
      height: drawH,
      opacity: opts.opacity ?? 1,
    });
  }

  drawRect(pageIndex: number, opts: DrawRectOptions): void {
    const page = this.doc.getPage(pageIndex);
    const { width: pw, height: ph } = page.getSize();
    const w = opts.widthPct * pw;
    const h = opts.heightPct * ph;
    const x = opts.xPct * pw;
    const y = Math.max(0, ph - opts.yPct * ph - h);
    const color = parseHexColor(opts.colorHex ?? '#ffd54f');
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      ...(opts.filled
        ? { color, opacity: opts.opacity ?? 0.35 }
        : { borderColor: color, borderWidth: 1.5, opacity: 0, borderOpacity: opts.opacity ?? 1 }),
    });
  }

  drawFreehand(pageIndex: number, opts: DrawFreehandOptions): void {
    if (opts.points.length < 2) return;
    const page = this.doc.getPage(pageIndex);
    const { width: pw, height: ph } = page.getSize();
    const color = parseHexColor(opts.colorHex ?? '#111111');
    const thickness = opts.strokeWidth ?? 2;
    for (let i = 1; i < opts.points.length; i++) {
      const p1 = opts.points[i - 1];
      const p2 = opts.points[i];
      if (!p1 || !p2) continue;
      page.drawLine({
        start: { x: p1.xPct * pw, y: ph - p1.yPct * ph },
        end: { x: p2.xPct * pw, y: ph - p2.yPct * ph },
        thickness,
        color,
      });
    }
  }

  cropOrResize(pageIndex: number, opts: CropResizeOptions): void {
    const page = this.doc.getPage(pageIndex);
    const { width: pw, height: ph } = page.getSize();
    if (opts.mode === 'crop') {
      const m = opts.marginPt ?? 36;
      const cw = Math.max(36, pw - m * 2);
      const ch = Math.max(36, ph - m * 2);
      page.setCropBox(m, m, cw, ch);
      return;
    }
    const target: [number, number] = opts.paperSize === 'letter' ? [612, 792] : [595.28, 841.89];
    const [tw, th] = target;
    const sx = tw / Math.max(1, pw);
    const sy = th / Math.max(1, ph);
    const scale = Math.min(sx, sy);
    page.scaleContent(scale, scale);
    page.setSize(tw, th);
  }

  getMetadata(): PdfMetadata {
    const out: PdfMetadata = {};
    const title = this.doc.getTitle();
    const author = this.doc.getAuthor();
    const subject = this.doc.getSubject();
    const kw = this.doc.getKeywords();
    const creator = this.doc.getCreator();
    const producer = this.doc.getProducer();
    if (title !== undefined) out.title = title;
    if (author !== undefined) out.author = author;
    if (subject !== undefined) out.subject = subject;
    if (kw) {
      out.keywords = kw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (creator !== undefined) out.creator = creator;
    if (producer !== undefined) out.producer = producer;
    return out;
  }

  private assertNoXfa(): void {
    const acro = this.doc.catalog.lookup(PDFName.of('AcroForm'));
    if (acro instanceof PDFDict && acro.has(PDFName.of('XFA'))) {
      throw new AirgapError(
        'UnsupportedFeature',
        'XFA form detected',
        'XFA forms are not supported. Only standard AcroForms can be filled.',
      );
    }
  }

  getFormFields(): FormFieldInfo[] {
    this.assertNoXfa();
    const form = this.doc.getForm();
    return form.getFields().map((field) => {
      const name = field.getName();
      if (field instanceof PDFTextField) {
        return { name, type: 'text', value: field.getText() ?? '' };
      }
      if (field instanceof PDFCheckBox) {
        return { name, type: 'checkbox', value: field.isChecked() };
      }
      if (field instanceof PDFDropdown) {
        return {
          name,
          type: 'dropdown',
          value: field.getSelected()[0] ?? '',
          options: field.getOptions(),
        };
      }
      if (field instanceof PDFRadioGroup) {
        return {
          name,
          type: 'radio',
          value: field.getSelected() ?? '',
          options: field.getOptions(),
        };
      }
      return { name, type: 'unknown', value: '' };
    });
  }

  fillFormFields(values: Record<string, string | boolean>, flatten: boolean): void {
    this.assertNoXfa();
    const form = this.doc.getForm();
    for (const [name, val] of Object.entries(values)) {
      const field = form.getFieldMaybe(name);
      if (!field) continue;
      if (field instanceof PDFTextField && typeof val === 'string') {
        field.setText(val);
      } else if (field instanceof PDFCheckBox && typeof val === 'boolean') {
        if (val) field.check();
        else field.uncheck();
      } else if (field instanceof PDFDropdown && typeof val === 'string') {
        field.select(val);
      } else if (field instanceof PDFRadioGroup && typeof val === 'string') {
        field.select(val);
      }
    }
    if (flatten) {
      form.flatten();
    }
  }

  sanitize(opts: SanitizeOptions): void {
    const catalog = this.doc.catalog;
    if (opts.metadata) {
      this.doc.setTitle('');
      this.doc.setAuthor('');
      this.doc.setSubject('');
      this.doc.setKeywords([]);
      this.doc.setCreator('');
      this.doc.setProducer('');
      catalog.delete(PDFName.of('Metadata'));
      catalog.delete(PDFName.of('PieceInfo'));
    }

    if (opts.javascript) {
      catalog.delete(PDFName.of('OpenAction'));
      catalog.delete(PDFName.of('AA'));
      const names = catalog.lookup(PDFName.of('Names'));
      if (names instanceof PDFDict) {
        names.delete(PDFName.of('JavaScript'));
      }
      for (const page of this.doc.getPages()) {
        page.node.delete(PDFName.of('AA'));
      }
    }

    if (opts.embeddedFiles) {
      catalog.delete(PDFName.of('AF'));
      const names = catalog.lookup(PDFName.of('Names'));
      if (names instanceof PDFDict) {
        names.delete(PDFName.of('EmbeddedFiles'));
      }
    }

    if (opts.hiddenLayers) {
      catalog.delete(PDFName.of('OCProperties'));
    }

    if (opts.annotations) {
      for (const page of this.doc.getPages()) {
        page.node.delete(PDFName.of('Annots'));
      }
    }

    if (opts.forms) {
      try {
        this.doc.getForm().flatten();
      } catch {
        // Ignore if no form or XFA; remove AcroForm dict directly
      }
      catalog.delete(PDFName.of('AcroForm'));
    }
  }

  inspect(): XRaySummary {
    const catalog = this.doc.catalog;
    const names = catalog.lookup(PDFName.of('Names'));
    const hasJavaScript = names instanceof PDFDict ? names.has(PDFName.of('JavaScript')) : false;
    let embeddedFileCount = 0;
    if (names instanceof PDFDict && names.has(PDFName.of('EmbeddedFiles'))) {
      const ef = names.lookup(PDFName.of('EmbeddedFiles'));
      if (ef instanceof PDFDict) {
        const arr = ef.lookup(PDFName.of('Names'));
        if (arr instanceof PDFArray) {
          embeddedFileCount = Math.floor(arr.size() / 2);
        }
      }
      if (embeddedFileCount === 0) embeddedFileCount = 1;
    }

    let annotationCount = 0;
    for (const page of this.doc.getPages()) {
      const annots = page.node.lookup(PDFName.of('Annots'));
      if (annots instanceof PDFArray) {
        annotationCount += annots.size();
      }
    }

    let formFieldCount = 0;
    try {
      formFieldCount = this.doc.getForm().getFields().length;
    } catch {
      formFieldCount = 0;
    }

    return {
      metadata: this.getMetadata(),
      hasXmpMetadata: catalog.has(PDFName.of('Metadata')),
      hasJavaScript,
      hasOpenAction: catalog.has(PDFName.of('OpenAction')) || catalog.has(PDFName.of('AA')),
      hasEmbeddedFiles: embeddedFileCount > 0 || catalog.has(PDFName.of('AF')),
      embeddedFileCount,
      hasHiddenLayers: catalog.has(PDFName.of('OCProperties')),
      annotationCount,
      formFieldCount,
      hasPieceInfo: catalog.has(PDFName.of('PieceInfo')),
      hasStructTree: catalog.has(PDFName.of('StructTreeRoot')),
    };
  }

  async recompressImages(opts: { maxDim: number; quality: number }): Promise<number> {
    if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      return 0;
    }
    let replaced = 0;
    for (const [, obj] of this.doc.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      const dict = obj.dict;
      if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
      if (dict.has(PDFName.of('SMask')) || dict.has(PDFName.of('Mask'))) continue;
      if (dict.get(PDFName.of('Filter')) !== PDFName.of('DCTDecode')) continue;
      const raw = obj.contents;
      if (raw.byteLength < 16_384) continue;

      try {
        const copy = new Uint8Array(raw.byteLength);
        copy.set(raw);
        const bmp = await createImageBitmap(new Blob([copy], { type: 'image/jpeg' }));
        const scale = Math.min(1, opts.maxDim / Math.max(bmp.width, bmp.height));
        const tw = Math.max(1, Math.round(bmp.width * scale));
        const th = Math.max(1, Math.round(bmp.height * scale));

        const canvas = new OffscreenCanvas(tw, th);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          bmp.close();
          continue;
        }
        ctx.drawImage(bmp, 0, 0, tw, th);
        bmp.close();

        const jpegBlob = await canvas.convertToBlob({
          type: 'image/jpeg',
          quality: opts.quality,
        });
        const nextBytes = new Uint8Array(await jpegBlob.arrayBuffer());
        if (nextBytes.byteLength < raw.byteLength) {
          // Mutate raw stream contents & dimensions in place
          (obj as unknown as { contents: Uint8Array }).contents = nextBytes;
          dict.set(PDFName.of('Width'), PDFNumber.of(tw));
          dict.set(PDFName.of('Height'), PDFNumber.of(th));
          dict.set(PDFName.of('Length'), PDFNumber.of(nextBytes.byteLength));
          replaced++;
        }
      } catch {
        // Skip image if browser cannot decode
      }
    }
    return replaced;
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
      // Eagerly validate page tree so malformed /Pages dicts fail cleanly inside open()
      doc.getPageCount();
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
