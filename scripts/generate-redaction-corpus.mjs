import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const { PDFDocument, PDFName, PDFString, StandardFonts, rgb } = webRequire('@cantoo/pdf-lib');

const outDir = path.join(root, 'corpus/redaction-fails');
fs.mkdirSync(outDir, { recursive: true });

// 1. Black box drawn over text without removing text operator
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 300]);
  page.drawText('SECRET_SSN_123-45-6789', { x: 50, y: 200, size: 14, font });
  page.drawRectangle({ x: 45, y: 195, width: 200, height: 22, color: rgb(0, 0, 0) });
  fs.writeFileSync(path.join(outDir, '01-black-box-over-text.pdf'), await doc.save());
}

// 2. Incremental revision (multiple %%EOF) retaining secret in earlier revision
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 300]);
  page.drawText('SECRET_TOKEN_XYZ', { x: 50, y: 200, size: 14, font });
  const rev1 = await doc.save({ useObjectStreams: false });

  const doc2 = await PDFDocument.create();
  doc2.addPage([400, 300]);
  const rev2 = await doc2.save({ useObjectStreams: false });

  const combined = new Uint8Array(rev1.byteLength + 1 + rev2.byteLength);
  combined.set(rev1, 0);
  combined[rev1.byteLength] = 10;
  combined.set(rev2, rev1.byteLength + 1);
  fs.writeFileSync(path.join(outDir, '02-incremental-revision.pdf'), combined);
}

// 3. Metadata leak
{
  const doc = await PDFDocument.create();
  doc.addPage([400, 300]);
  doc.setTitle('CONFIDENTIAL_PROJECT_ORION');
  fs.writeFileSync(path.join(outDir, '03-metadata-leak.pdf'), await doc.save());
}

// 4. Annotation leak
{
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [50, 200, 70, 220],
    Contents: PDFString.of('SECRET_NOTE_999'),
  });
  const ref = doc.context.register(annot);
  page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
  fs.writeFileSync(path.join(outDir, '04-annotation-leak.pdf'), await doc.save());
}

// 5. Form field leak
{
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const form = doc.getForm();
  const field = form.createTextField('account_secret');
  field.setText('SECRET_ACCOUNT_42');
  field.addToPage(page, { x: 50, y: 200, width: 150, height: 24 });
  fs.writeFileSync(path.join(outDir, '05-form-field-leak.pdf'), await doc.save());
}

// 6. Bookmark / Outlines leak
{
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const outlineItem = doc.context.obj({
    Title: PDFString.of('SECRET_CHAPTER_7'),
    Dest: [page.ref, PDFName.of('Fit')],
  });
  const itemRef = doc.context.register(outlineItem);
  const outlines = doc.context.obj({
    Type: 'Outlines',
    First: itemRef,
    Last: itemRef,
    Count: 1,
  });
  const outlinesRef = doc.context.register(outlines);
  outlineItem.set(PDFName.of('Parent'), outlinesRef);
  doc.catalog.set(PDFName.of('Outlines'), outlinesRef);
  fs.writeFileSync(path.join(outDir, '06-bookmark-leak.pdf'), await doc.save());
}

console.log(`Generated 6 redaction-fail corpus PDFs in ${outDir}`);
