import type { ToolDefinition } from '@airgap-pdf/core';
import { deletePagesTool } from './delete-pages.js';
import { extractTool } from './extract.js';
import { imagesToPdfTool } from './images-to-pdf.js';
import { insertBlankTool } from './insert-blank.js';
import { interleaveTool } from './interleave.js';
import { mergeTool } from './merge.js';
import { pdfToImagesTool } from './pdf-to-images.js';
import { pdfToTextTool } from './pdf-to-text.js';
import { reorderTool } from './reorder.js';
import { rotateTool } from './rotate.js';
import { splitTool } from './split.js';

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
];

export function getTool(id: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.id === id);
}
