import type { ToolDefinition } from '@airgap-pdf/core';
import { annotateTool } from './annotate.js';
import { batesTool } from './bates.js';
import { compressTool } from './compress.js';
import { cropResizeTool } from './crop-resize.js';
import { deletePagesTool } from './delete-pages.js';
import { extractTool } from './extract.js';
import { formFillTool } from './form-fill.js';
import { insertBlankTool } from './insert-blank.js';
import { interleaveTool } from './interleave.js';
import { mergeTool } from './merge.js';
import { metadataTool } from './metadata.js';
import { pageNumbersTool } from './page-numbers.js';
import { protectTool } from './protect.js';
import { redactTool } from './redact.js';
import { reorderTool } from './reorder.js';
import { rotateTool } from './rotate.js';
import { sanitizeTool } from './sanitize.js';
import { splitTool } from './split.js';
import { unlockTool } from './unlock.js';
import { watermarkTool } from './watermark.js';
import { xrayTool } from './xray.js';

export const NODE_TOOLS: readonly ToolDefinition[] = [
  rotateTool,
  mergeTool,
  splitTool,
  extractTool,
  deletePagesTool,
  reorderTool,
  insertBlankTool,
  interleaveTool,
  annotateTool,
  watermarkTool,
  pageNumbersTool,
  batesTool,
  cropResizeTool,
  compressTool,
  metadataTool,
  formFillTool,
  protectTool,
  redactTool,
  unlockTool,
  sanitizeTool,
  xrayTool,
];

export function getNodeTool(id: string): ToolDefinition | undefined {
  return NODE_TOOLS.find((t) => t.id === id);
}
