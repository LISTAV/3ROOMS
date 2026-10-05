import type { FloorPlanState } from '../types.js';
import { calculateProjectBounds } from './svgExporter.js';
import { RoomRenderer } from '../../engine/renderer/RoomRenderer.js';
import { WallRenderer } from '../../engine/renderer/WallRenderer.js';
import { OpeningRenderer } from '../../engine/renderer/OpeningRenderer.js';
import { FurnitureLayer } from '../../engine/layers/FurnitureLayer.js';
import { ImageLayer } from '../../engine/layers/ImageLayer.js';
import { LineLayer } from '../../engine/layers/LineLayer.js';
import { drawDimension, drawCornerAngleIndicator } from '../../engine/renderer/DimensionRenderer.js';
import { generateWallPolygons } from '../geometry/miter.js';
import { generateWallPolygonsWithOpenings } from '../geometry/openings.js';
import type { UnitSettings, DimensionSettings } from '../units/unitFormatter.js';
import { uiStore } from '../store/uiStore.js';

export interface PngExportOptions {
  scale?: number; // Target canvas pixels per millimeter (clamped safely by maxDimension)
  maxDimension?: number; // Maximum canvas dimension in pixels (default: 4096 to prevent memory & browser allocation failure)
  paddingMm?: number;
  backgroundColor?: string;
  includeDimensions?: boolean;
  includeCornerAngles?: boolean;
  includeLines?: boolean;
  includeRooms?: boolean;
  includeFurniture?: boolean;
  includeImages?: boolean;
  includeTitleBlock?: boolean;
  projectName?: string;
  unitSettings?: Partial<UnitSettings>;
  dimensionSettings?: Partial<DimensionSettings>;
}

/**
 * Draws a clean, subtle architectural title stamp in the bottom-right corner of the canvas.
 */
function drawArchitecturalStamp(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  projectName: string,
  unitLabel: string
): void {
  ctx.save();
  // Reset matrix to draw directly in absolute canvas pixel coordinates
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const margin = Math.round(Math.max(20, Math.min(40, canvasWidth * 0.015)));
  const cardW = Math.round(Math.max(260, Math.min(380, canvasWidth * 0.15)));
  const cardH = Math.round(cardW * 0.22);
  const x = canvasWidth - cardW - margin;
  const y = canvasHeight - cardH - margin;

  // Background card
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.strokeStyle = '#cbd5e1'; // slate-300
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  if ('roundRect' in ctx && typeof (ctx as any).roundRect === 'function') {
    (ctx as any).roundRect(x, y, cardW, cardH, 6);
  } else {
    ctx.rect(x, y, cardW, cardH);
  }
  ctx.fill();
  ctx.stroke();

  // Left accent bar (blueprint blue)
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(x, y, 4, cardH);

  // Title text
  const titleSize = Math.round(cardH * 0.28);
  const subtitleSize = Math.round(cardH * 0.21);

  ctx.font = `600 ${titleSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = '#0f172a'; // slate-900
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const cleanName = projectName.replace(/\.(floorplan|json)$/i, '') || 'Floor Plan';
  // Truncate if too long
  const maxTitleChars = 24;
  const displayTitle = cleanName.length > maxTitleChars ? `${cleanName.substring(0, maxTitleChars)}...` : cleanName;
  ctx.fillText(displayTitle, x + 16, y + Math.round(cardH * 0.18));

  // Metadata subtitle
  ctx.font = `500 ${subtitleSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = '#64748b'; // slate-500
  ctx.fillText(`Units: ${unitLabel} • Architectural CAD`, x + 16, y + Math.round(cardH * 0.54));

  ctx.restore();
}

/**
 * Renders the floor plan to an offscreen canvas and returns the canvas instance.
 * Automatically clamps dimensions to safe browser limits (max 4096px by default)
 * and dynamically scales measurement numbers, badges, and dimension lines so they
 * are large, bold, and crystal-clear when viewing the exported image.
 */
export function renderToOffscreenCanvas(
  state: FloorPlanState,
  options: PngExportOptions = {}
): HTMLCanvasElement | OffscreenCanvas {
  const reqScale = options.scale ?? 1.5;
  const maxDim = options.maxDimension ?? 4096;
  const bgColor = options.backgroundColor ?? '#ffffff';
  const includeDimensions = options.includeDimensions ?? true;
  const includeCornerAngles = options.includeCornerAngles ?? true;
  const includeLines = options.includeLines ?? true;
  const includeRooms = options.includeRooms ?? true;
  const includeFurniture = options.includeFurniture ?? true;
  const includeImages = options.includeImages ?? true;
  const includeTitleBlock = options.includeTitleBlock ?? true;
  const projectName = options.projectName ?? 'Floor Plan';
  const unitSettings = options.unitSettings || uiStore.getState().unitSettings;

  // 1. Initial preliminary bounding box to determine required scale
  const rawBbox = calculateProjectBounds(state, 600);
  const rawWidth = rawBbox.width * reqScale;
  const rawHeight = rawBbox.height * reqScale;
  const clampRatio = Math.min(1.0, maxDim / Math.max(rawWidth, rawHeight, 1));
  const scale = Math.max(0.001, reqScale * clampRatio);

  // 2. High-Clarity Annotation Sizing with user-configured font size and position
  const dimSettings: DimensionSettings = {
    ...uiStore.getState().dimensionSettings,
    ...options.dimensionSettings,
  };
  const userFontSize = dimSettings.fontSize || 12;
  const fontRatio = userFontSize / 12;

  const estimatedMaxCanvasDim = Math.max(rawBbox.width * scale, rawBbox.height * scale);
  const targetDimFontSizePx = Math.max(24, Math.min(96, Math.round((estimatedMaxCanvasDim / 55) * fontRatio)));
  const dimScaleMultiplier = Math.max(1.8, targetDimFontSizePx / userFontSize);
  const annotationZoom = scale / dimScaleMultiplier;

  // Dimension line clearance: honor user's chosen placement (outside, centered, inside)
  const baseOffset = Math.max(dimSettings.offsetMm || 350, Math.round(36 / annotationZoom));
  let dimOffsetMm = baseOffset;
  if (dimSettings.position === 'centered') {
    dimOffsetMm = 0;
  } else if (dimSettings.position === 'inside') {
    dimOffsetMm = -Math.abs(baseOffset);
  } else {
    dimOffsetMm = Math.abs(baseOffset);
  }
  const safePaddingMm = Math.max(options.paddingMm ?? 600, Math.abs(dimOffsetMm) + 300);

  // 3. Final Bounding Box & Canvas Dimensions
  const bbox = calculateProjectBounds(state, safePaddingMm);
  const canvasWidth = Math.max(100, Math.min(maxDim, Math.ceil(bbox.width * scale)));
  const canvasHeight = Math.max(100, Math.min(maxDim, Math.ceil(bbox.height * scale)));

  let canvas: HTMLCanvasElement | OffscreenCanvas;
  if (typeof document !== 'undefined' && document.createElement) {
    canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
  } else if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
  } else {
    throw new Error('Offscreen canvas rendering is not supported in this environment.');
  }

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) {
    throw new Error('Failed to acquire 2D rendering context for PNG export.');
  }

  // Fill background
  ctx.save();
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Set scaling transform to world millimeters
  ctx.scale(scale, scale);
  ctx.translate(-bbox.minX, -bbox.minY);

  // 4. Render Pipeline (Images -> Rooms -> Furniture -> Walls -> Openings -> Corner Angles -> Dimensions -> Lines)
  const imageLayer = new ImageLayer();
  const roomRenderer = new RoomRenderer();
  const furnitureLayer = new FurnitureLayer();
  const wallRenderer = new WallRenderer();
  const openingRenderer = new OpeningRenderer();
  const lineLayer = new LineLayer();

  // (0) Reference / Underlay Images
  if (includeImages && state.images && Object.keys(state.images).length > 0) {
    imageLayer.render(
      ctx as unknown as CanvasRenderingContext2D,
      state.images,
      scale,
      null
    );
  }

  // (a) Rooms (Room fills and scaled area badges formatted in active unit)
  if (includeRooms && Object.keys(state.rooms || {}).length > 0) {
    roomRenderer.render(
      ctx as unknown as CanvasRenderingContext2D,
      state.rooms,
      state.vertices,
      null,
      annotationZoom,
      unitSettings
    );
  }

  // (b) Furniture
  if (includeFurniture && Object.keys(state.furniture || {}).length > 0) {
    furnitureLayer.render(
      ctx as unknown as CanvasRenderingContext2D,
      state.furniture,
      scale,
      null
    );
  }

  // (c) Walls (With crisp outer boundary lines)
  const hasOpenings = Object.keys(state.openings || {}).length > 0;
  const wallPolygons = hasOpenings
    ? generateWallPolygonsWithOpenings(state.vertices, state.walls, state.openings)
    : generateWallPolygons(state.vertices, state.walls);

  const wallStrokeZoom = scale / Math.min(2.0, dimScaleMultiplier);
  wallRenderer.render(
    ctx as unknown as CanvasRenderingContext2D,
    wallPolygons,
    [],
    wallStrokeZoom,
    { vertices: state.vertices, walls: state.walls, openings: state.openings }
  );

  // (d) Openings (Doors & Windows with clean architectural line weight)
  if (hasOpenings) {
    const openingZoom = scale / Math.min(1.8, dimScaleMultiplier);
    openingRenderer.render(
      ctx as unknown as CanvasRenderingContext2D,
      state.openings,
      state.walls,
      state.vertices,
      [],
      openingZoom
    );
  }

  // (e) CAD Corner Angle References (Perpendicular 90° square & degree badges)
  if (includeCornerAngles && Object.keys(state.walls || {}).length > 0) {
    const vertexToWalls = new Map<string, string[]>();
    for (const wall of Object.values(state.walls)) {
      if (!vertexToWalls.has(wall.startId)) vertexToWalls.set(wall.startId, []);
      if (!vertexToWalls.has(wall.endId)) vertexToWalls.set(wall.endId, []);
      vertexToWalls.get(wall.startId)!.push(wall.id);
      vertexToWalls.get(wall.endId)!.push(wall.id);
    }

    for (const [vId, wallIds] of vertexToWalls.entries()) {
      if (wallIds.length !== 2) continue;
      const w1 = state.walls[wallIds[0]];
      const w2 = state.walls[wallIds[1]];
      if (!w1 || !w2) continue;

      const corner = state.vertices[vId];
      const other1Id = w1.startId === vId ? w1.endId : w1.startId;
      const other2Id = w2.startId === vId ? w2.endId : w2.startId;
      const p1 = state.vertices[other1Id];
      const p2 = state.vertices[other2Id];
      if (!corner || !p1 || !p2) continue;

      drawCornerAngleIndicator(
        ctx as unknown as CanvasRenderingContext2D,
        p1,
        corner,
        p2,
        annotationZoom,
        true
      );
    }
  }

  // (f) Dimensions (Bold, high-contrast, perfectly legible measurement numbers)
  if (includeDimensions && Object.keys(state.walls || {}).length > 0) {
    for (const wall of Object.values(state.walls)) {
      const startV = state.vertices[wall.startId];
      const endV = state.vertices[wall.endId];
      if (!startV || !endV) continue;

      drawDimension(
        ctx as unknown as CanvasRenderingContext2D,
        startV,
        endV,
        dimOffsetMm,
        annotationZoom,
        unitSettings,
        { fontSize: userFontSize, position: dimSettings.position }
      );
    }
  }

  // (g) Drafting Lines (With prominent stroke, arrowheads & clear measurement badges)
  if (includeLines && state.lines && Object.keys(state.lines).length > 0) {
    lineLayer.render(
      ctx as unknown as CanvasRenderingContext2D,
      state.lines,
      annotationZoom,
      null,
      unitSettings,
      dimSettings
    );
  }

  ctx.restore();

  // (h) Subtle Architectural Title Block Stamp
  if (includeTitleBlock) {
    const unitLabel = unitSettings.lengthUnit?.toUpperCase() || 'MM';
    drawArchitecturalStamp(ctx, canvasWidth, canvasHeight, projectName, unitLabel);
  }

  return canvas;
}

/**
 * Converts a data URL to a binary Blob using Uint8Array decoding.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
  const binaryStr = atob(parts[1]);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Exports the floor plan as a high-resolution, print-ready PNG Blob with fail-safe fallbacks.
 */
export async function exportToPngBlob(
  state: FloorPlanState,
  options: PngExportOptions = {}
): Promise<Blob> {
  const canvas = renderToOffscreenCanvas(state, options);

  // Strategy 1: OffscreenCanvas.convertToBlob
  if ('convertToBlob' in canvas && typeof (canvas as OffscreenCanvas).convertToBlob === 'function') {
    try {
      const blob = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
      if (blob && blob.size > 0) return blob;
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 2: HTMLCanvasElement.toBlob
  if ('toBlob' in canvas && typeof (canvas as HTMLCanvasElement).toBlob === 'function') {
    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        (canvas as HTMLCanvasElement).toBlob((b) => resolve(b), 'image/png');
      });
      if (blob && blob.size > 0) return blob;
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 3: canvas.toDataURL fallback (universally supported across browsers)
  if ('toDataURL' in canvas && typeof (canvas as HTMLCanvasElement).toDataURL === 'function') {
    try {
      const dataUrl = (canvas as HTMLCanvasElement).toDataURL('image/png');
      if (dataUrl && dataUrl.startsWith('data:image/png')) {
        return dataUrlToBlob(dataUrl);
      }
    } catch (err: any) {
      throw new Error(`Failed to convert canvas to PNG data URL: ${err.message || String(err)}`);
    }
  }

  throw new Error('Unable to convert canvas to Blob: no supported conversion method succeeded.');
}
