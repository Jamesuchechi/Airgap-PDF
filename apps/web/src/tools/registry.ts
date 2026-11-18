import type { ToolDefinition } from '@airgap-pdf/core';
import { annotateTool } from './annotate.js';
import { batesTool } from './bates.js';
import { compressTool } from './compress.js';
import { cropResizeTool } from './crop-resize.js';
import { deletePagesTool } from './delete-pages.js';
import { extractTool } from './extract.js';
import { formFillTool } from './form-fill.js';
import { imagesToPdfTool } from './images-to-pdf.js';
import { insertBlankTool } from './insert-blank.js';
import { interleaveTool } from './interleave.js';
import { mergeTool } from './merge.js';
import { metadataTool } from './metadata.js';
import { ocrTool } from './ocr.js';
import { pageNumbersTool } from './page-numbers.js';
import { pdfToImagesTool } from './pdf-to-images.js';
import { pdfToTextTool } from './pdf-to-text.js';
import { protectTool } from './protect.js';
import { reorderTool } from './reorder.js';
import { rotateTool } from './rotate.js';
import { sanitizeTool } from './sanitize.js';
import { splitTool } from './split.js';
import { unlockTool } from './unlock.js';
import { watermarkTool } from './watermark.js';
import { xrayTool } from './xray.js';

export const TOOLS: readonly ToolDefinition[] = [
  rotateTool,
  mergeTool,
  splitTool,
  extractTool,
  deletePagesTool,
  reorderTool,
  insertBlankTool,
  interleaveTool,
  imagesToPdfTool,
  pdfToImagesTool,
  pdfToTextTool,
  annotateTool,
  watermarkTool,
  pageNumbersTool,
  batesTool,
  cropResizeTool,
  compressTool,
  ocrTool,
  metadataTool,
  formFillTool,
  protectTool,
  unlockTool,
  sanitizeTool,
  xrayTool,
];

export function getTool(id: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.id === id);
}
