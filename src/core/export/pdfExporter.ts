import { jsPDF } from 'jspdf';
import type { FloorPlanState } from '../types.js';
import { calculateProjectBounds } from './svgExporter.js';
import { renderToOffscreenCanvas } from './pngExporter.js';
import type { UnitSettings } from '../units/unitFormatter.js';
import { uiStore } from '../store/uiStore.js';

export type PaperSize = 'A4' | 'A3' | 'A2' | 'A1' | 'A0' | 'Letter' | 'Legal' | 'Tabloid' | 'ArchD' | 'ArchE';

export interface PaperDimensions {
  name: string;
  widthMm: number;
  heightMm: number;
  category: 'iso' | 'ansi' | 'arch';
  description: string;
}

export const STANDARD_PAPER_SIZES: Record<PaperSize, PaperDimensions> = {
  A4: { name: 'A4', widthMm: 210, heightMm: 297, category: 'iso', description: '210 × 297 mm (Office Standard)' },
  A3: { name: 'A3', widthMm: 297, heightMm: 420, category: 'iso', description: '297 × 420 mm (Presentation Sheet)' },
  A2: { name: 'A2', widthMm: 420, heightMm: 594, category: 'iso', description: '420 × 594 mm (Working Drawing)' },
  A1: { name: 'A1', widthMm: 594, heightMm: 841, category: 'iso', description: '594 × 841 mm (Construction Sheet)' },
  A0: { name: 'A0', widthMm: 841, heightMm: 1189, category: 'iso', description: '841 × 1189 mm (Full Master Plan)' },
  Letter: { name: 'Letter', widthMm: 215.9, heightMm: 279.4, category: 'ansi', description: '8.5 × 11 in (US Standard)' },
  Legal: { name: 'Legal', widthMm: 215.9, heightMm: 355.6, category: 'ansi', description: '8.5 × 14 in (US Legal)' },
  Tabloid: { name: 'Tabloid / ANSI B', widthMm: 279.4, heightMm: 431.8, category: 'ansi', description: '11 × 17 in (US Presentation)' },
  ArchD: { name: 'Arch D', widthMm: 609.6, heightMm: 914.4, category: 'arch', description: '24 × 36 in (US Construction Sheet)' },
  ArchE: { name: 'Arch E', widthMm: 914.4, heightMm: 1219.2, category: 'arch', description: '36 × 48 in (US Large Format)' },
};

export type SheetOrientation = 'landscape' | 'portrait' | 'auto';

export interface PdfExportOptions {
  paperSize?: PaperSize;
  orientation?: SheetOrientation;
  marginMm?: number;
  includeBorder?: boolean;
  includeTitleBlock?: boolean;
  includeDimensions?: boolean;
  includeCornerAngles?: boolean;
  includeLines?: boolean;
  includeRooms?: boolean;
  includeFurniture?: boolean;
  includeImages?: boolean;
  projectName?: string;
  designerName?: string;
  sheetNumber?: string;
  scaleDescription?: string;
  unitSettings?: Partial<UnitSettings>;
}

export interface ResolvedSheetLayout {
  pageWidthMm: number;
  pageHeightMm: number;
  isLandscape: boolean;
  marginMm: number;
  drawAreaX: number;
  drawAreaY: number;
  drawAreaWidth: number;
  drawAreaHeight: number;
  titleBlockX: number;
  titleBlockY: number;
  titleBlockWidth: number;
  titleBlockHeight: number;
  planRenderX: number;
  planRenderY: number;
  planRenderWidth: number;
  planRenderHeight: number;
}

/**
 * Computes exact physical sheet layout dimensions in millimeters.
 */
export function computeSheetLayout(
  state: FloorPlanState,
  options: PdfExportOptions = {}
): ResolvedSheetLayout {
  const paperKey = options.paperSize || 'A3';
  const paper = STANDARD_PAPER_SIZES[paperKey] || STANDARD_PAPER_SIZES.A3;
  const orientationSetting = options.orientation || 'landscape';
  const marginMm = options.marginMm ?? 12;
  const includeBorder = options.includeBorder ?? true;
  const includeTitleBlock = options.includeTitleBlock ?? true;

  // Determine plan aspect ratio
  const bbox = calculateProjectBounds(state, 600);
  const planAspect = bbox.width / Math.max(1, bbox.height);

  let isLandscape = true;
  if (orientationSetting === 'landscape') {
    isLandscape = true;
  } else if (orientationSetting === 'portrait') {
    isLandscape = false;
  } else {
    // Auto: landscape if plan is wider than tall, otherwise portrait
    isLandscape = planAspect >= 1.0;
  }

  const shortDim = Math.min(paper.widthMm, paper.heightMm);
  const longDim = Math.max(paper.widthMm, paper.heightMm);
  const pageWidthMm = isLandscape ? longDim : shortDim;
  const pageHeightMm = isLandscape ? shortDim : longDim;

  // Title block / bottom footer removed so drawing is never obscured and uses full sheet height
  const titleBlockHeight = 0;

  // Drawing boundaries inside margins
  const drawAreaX = marginMm;
  const drawAreaY = marginMm;
  const drawAreaWidth = Math.max(50, pageWidthMm - marginMm * 2);
  const drawAreaHeight = Math.max(50, pageHeightMm - marginMm * 2);

  // Scale plan to fit drawing area preserving aspect ratio
  const fitRatio = Math.min(drawAreaWidth / bbox.width, drawAreaHeight / bbox.height);
  const planRenderWidth = bbox.width * fitRatio;
  const planRenderHeight = bbox.height * fitRatio;
  const planRenderX = drawAreaX + (drawAreaWidth - planRenderWidth) / 2;
  const planRenderY = drawAreaY + (drawAreaHeight - planRenderHeight) / 2;

  // Title block coordinates across bottom (zero height)
  const titleBlockX = marginMm;
  const titleBlockY = pageHeightMm - marginMm;
  const titleBlockWidth = drawAreaWidth;

  return {
    pageWidthMm,
    pageHeightMm,
    isLandscape,
    marginMm,
    drawAreaX,
    drawAreaY,
    drawAreaWidth,
    drawAreaHeight,
    titleBlockX,
    titleBlockY,
    titleBlockWidth,
    titleBlockHeight,
    planRenderX,
    planRenderY,
    planRenderWidth,
    planRenderHeight,
  };
}

/**
 * Draws the vector architectural border on the jsPDF document.
 */
function drawPdfSheetElements(
  doc: jsPDF,
  layout: ResolvedSheetLayout,
  options: PdfExportOptions
): void {
  const { pageWidthMm, pageHeightMm, marginMm } = layout;
  const includeBorder = options.includeBorder ?? true;

  // 1. Classical Architectural Sheet Border
  if (includeBorder) {
    const outerMargin = marginMm * 0.5;
    const innerMargin = marginMm;

    // Heavy Outer Frame
    doc.setDrawColor(15, 23, 42); // slate-900
    doc.setLineWidth(0.7);
    doc.rect(outerMargin, outerMargin, pageWidthMm - outerMargin * 2, pageHeightMm - outerMargin * 2);

    // Fine Inner Trim Line
    doc.setDrawColor(148, 163, 184); // slate-400
    doc.setLineWidth(0.25);
    doc.rect(innerMargin, innerMargin, pageWidthMm - innerMargin * 2, pageHeightMm - innerMargin * 2);
  }
}

/**
 * Generates an architectural PDF Blob with paper sheet setup.
 */
export async function exportToPdfBlob(
  state: FloorPlanState,
  options: PdfExportOptions = {}
): Promise<Blob> {
  const layout = computeSheetLayout(state, options);
  const { pageWidthMm, pageHeightMm, isLandscape, planRenderX, planRenderY, planRenderWidth, planRenderHeight } = layout;

  // 1. Render high-res architectural canvas for the plan portion
  // Target 300 DPI (approx 11.8 pixels per millimeter on the physical sheet)
  const dpi300Scale = (300 / 25.4) * (planRenderWidth / calculateProjectBounds(state, 600).width);
  const safeScale = Math.max(1.0, Math.min(3.5, dpi300Scale));

  const offscreenCanvas = renderToOffscreenCanvas(state, {
    scale: safeScale,
    maxDimension: 4096,
    paddingMm: 600,
    includeDimensions: options.includeDimensions ?? true,
    includeCornerAngles: options.includeCornerAngles ?? true,
    includeLines: options.includeLines ?? true,
    includeRooms: options.includeRooms ?? true,
    includeFurniture: options.includeFurniture ?? true,
    includeImages: options.includeImages ?? true,
    includeTitleBlock: false,
    unitSettings: options.unitSettings,
    projectName: options.projectName,
  });

  let dataUrl: string;
  if ('toDataURL' in offscreenCanvas && typeof (offscreenCanvas as HTMLCanvasElement).toDataURL === 'function') {
    dataUrl = (offscreenCanvas as HTMLCanvasElement).toDataURL('image/png');
  } else if ('convertToBlob' in offscreenCanvas) {
    const blob = await (offscreenCanvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    dataUrl = `data:image/png;base64,${btoa(binary)}`;
  } else {
    throw new Error('Canvas conversion to image data URL failed.');
  }

  // 2. Initialize jsPDF document with exact physical sheet dimensions
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [pageWidthMm, pageHeightMm],
    compress: true,
  });

  // 3. Draw white sheet background
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidthMm, pageHeightMm, 'F');

  // 4. Place floor plan raster drawing centered on the sheet
  doc.addImage(
    dataUrl,
    'PNG',
    planRenderX,
    planRenderY,
    planRenderWidth,
    planRenderHeight,
    undefined,
    'FAST'
  );

  // 5. Draw vector architectural border and title block
  drawPdfSheetElements(doc, layout, options);

  // 6. Return PDF Blob
  return doc.output('blob');
}

/**
 * Renders a live real-time sheet preview onto a visual canvas element in the UI modal.
 */
export function renderSheetPreview(
  canvas: HTMLCanvasElement,
  state: FloorPlanState,
  options: PdfExportOptions = {}
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const layout = computeSheetLayout(state, options);
  const { pageWidthMm, pageHeightMm, isLandscape, planRenderX, planRenderY, planRenderWidth, planRenderHeight, titleBlockX, titleBlockY, titleBlockWidth, titleBlockHeight } = layout;

  const previewWidth = canvas.width;
  const previewHeight = canvas.height;

  // Clear preview canvas
  ctx.save();
  ctx.fillStyle = '#0f172a'; // Dark CAD slate background around the paper sheet
  ctx.fillRect(0, 0, previewWidth, previewHeight);

  // Scale sheet mm to preview canvas pixels
  const paddingPx = 24;
  const availW = previewWidth - paddingPx * 2;
  const availH = previewHeight - paddingPx * 2;
  const pxPerMm = Math.min(availW / pageWidthMm, availH / pageHeightMm);

  const sheetW = pageWidthMm * pxPerMm;
  const sheetH = pageHeightMm * pxPerMm;
  const sheetX = (previewWidth - sheetW) / 2;
  const sheetY = (previewHeight - sheetH) / 2;

  // Paper Shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 6;

  // Paper Sheet (pure white)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(sheetX, sheetY, sheetW, sheetH);

  ctx.restore(); // remove shadow
  ctx.save();

  // Draw Outer and Inner Sheet Border
  if (options.includeBorder ?? true) {
    const outerM = layout.marginMm * 0.5 * pxPerMm;
    const innerM = layout.marginMm * pxPerMm;

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = Math.max(1, 0.7 * pxPerMm);
    ctx.strokeRect(sheetX + outerM, sheetY + outerM, sheetW - outerM * 2, sheetH - outerM * 2);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = Math.max(1, 0.25 * pxPerMm);
    ctx.strokeRect(sheetX + innerM, sheetY + innerM, sheetW - innerM * 2, sheetH - innerM * 2);
  }

  // Draw Simplified Floor Plan Preview on Sheet
  const bbox = calculateProjectBounds(state, 600);
  const px = sheetX + planRenderX * pxPerMm;
  const py = sheetY + planRenderY * pxPerMm;
  const pw = planRenderWidth * pxPerMm;
  const ph = planRenderHeight * pxPerMm;

  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();

  // Transform to plan coordinates
  ctx.translate(px, py);
  const planScale = pw / bbox.width;
  ctx.scale(planScale, planScale);
  ctx.translate(-bbox.minX, -bbox.minY);

  // Render rooms
  if (options.includeRooms ?? true) {
    for (const room of Object.values(state.rooms || {})) {
      const vIds = room.vertexIds || [];
      if (vIds.length < 3) continue;
      ctx.beginPath();
      const first = state.vertices[vIds[0]];
      if (!first) continue;
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < vIds.length; i++) {
        const v = state.vertices[vIds[i]];
        if (v) ctx.lineTo(v.x, v.y);
      }
      ctx.closePath();
      ctx.fillStyle = room.color || 'rgba(241, 245, 249, 0.85)';
      ctx.fill();
    }
  }

  // Render walls
  ctx.strokeStyle = '#1e293b';
  ctx.fillStyle = '#334155';
  for (const wall of Object.values(state.walls || {})) {
    const v1 = state.vertices[wall.startId];
    const v2 = state.vertices[wall.endId];
    if (!v1 || !v2) continue;

    ctx.lineWidth = Math.max(120, wall.thickness || 200);
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(v1.x, v1.y);
    ctx.lineTo(v2.x, v2.y);
    ctx.stroke();
  }

  // Render drafting lines
  if (options.includeLines ?? true) {
    for (const line of Object.values(state.lines || {})) {
      ctx.strokeStyle = line.color || '#2563eb';
      ctx.lineWidth = Math.max(80, line.thickness * 4);
      ctx.beginPath();
      ctx.moveTo(line.start.x, line.start.y);
      ctx.lineTo(line.end.x, line.end.y);
      ctx.stroke();
    }
  }

  ctx.restore();
  ctx.restore();
}
