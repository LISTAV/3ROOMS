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
import type { UnitSettings } from '../units/unitFormatter.js';
import { uiStore } from '../store/uiStore.js';

export interface PngExportOptions {
  scale?: number; // Canvas pixels per millimeter
  maxDimension?: number; // Maximum canvas dimension in pixels (default: 4096 to prevent memory & browser allocation failure)
  paddingMm?: number;
  backgroundColor?: string;
  includeDimensions?: boolean;
  includeCornerAngles?: boolean;
  includeLines?: boolean;
  includeRooms?: boolean;
  includeFurniture?: boolean;
  includeImages?: boolean;
  unitSettings?: Partial<UnitSettings>;
}

/**
 * Renders the floor plan to an offscreen canvas and returns the canvas instance.
 * Automatically clamps dimensions to safe browser limits (max 4096px by default)
 * so canvas allocation and toBlob never fail.
 */
export function renderToOffscreenCanvas(
  state: FloorPlanState,
  options: PngExportOptions = {}
): HTMLCanvasElement | OffscreenCanvas {
  const reqScale = options.scale ?? 1.0;
  const maxDim = options.maxDimension ?? 4096;
  const paddingMm = options.paddingMm ?? 500;
  const bgColor = options.backgroundColor ?? '#ffffff';
  const includeDimensions = options.includeDimensions ?? true;
  const includeCornerAngles = options.includeCornerAngles ?? true;
  const includeLines = options.includeLines ?? true;
  const includeRooms = options.includeRooms ?? true;
  const includeFurniture = options.includeFurniture ?? true;
  const includeImages = options.includeImages ?? true;
  const unitSettings = options.unitSettings || uiStore.getState().unitSettings;

  const bbox = calculateProjectBounds(state, paddingMm);

  // Calculate safe effective scale so canvas size doesn't exceed browser limits
  const rawWidth = bbox.width * reqScale;
  const rawHeight = bbox.height * reqScale;
  const clampRatio = Math.min(1.0, maxDim / Math.max(rawWidth, rawHeight, 1));
  const scale = Math.max(0.001, reqScale * clampRatio);

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

  // 1. Fill background
  ctx.save();
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2. Set scaling transform to world millimeters
  ctx.scale(scale, scale);
  ctx.translate(-bbox.minX, -bbox.minY);

  // 3. Render Pipeline (Images -> Rooms -> Furniture -> Walls -> Openings -> Corner Angles -> Dimensions -> Lines)
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

  // (a) Rooms
  if (includeRooms && Object.keys(state.rooms || {}).length > 0) {
    roomRenderer.render(
      ctx as unknown as CanvasRenderingContext2D,
      state.rooms,
      state.vertices,
      null,
      scale
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

  // (c) Walls
  const hasOpenings = Object.keys(state.openings || {}).length > 0;
  const wallPolygons = hasOpenings
    ? generateWallPolygonsWithOpenings(state.vertices, state.walls, state.openings)
    : generateWallPolygons(state.vertices, state.walls);

  wallRenderer.render(
    ctx as unknown as CanvasRenderingContext2D,
    wallPolygons,
    [],
    scale,
    { vertices: state.vertices, walls: state.walls, openings: state.openings }
  );

  // (d) Openings
  if (hasOpenings) {
    openingRenderer.render(
      ctx as unknown as CanvasRenderingContext2D,
      state.openings,
      state.walls,
      state.vertices,
      [],
      scale
    );
  }

  // (e) CAD Corner Angle References
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
        scale,
        true
      );
    }
  }

  // (f) Dimensions
  if (includeDimensions && Object.keys(state.walls || {}).length > 0) {
    for (const wall of Object.values(state.walls)) {
      const startV = state.vertices[wall.startId];
      const endV = state.vertices[wall.endId];
      if (!startV || !endV) continue;

      drawDimension(
        ctx as unknown as CanvasRenderingContext2D,
        startV,
        endV,
        350,
        scale,
        unitSettings
      );
    }
  }

  // (g) Drafting Lines
  if (includeLines && state.lines && Object.keys(state.lines).length > 0) {
    lineLayer.render(
      ctx as unknown as CanvasRenderingContext2D,
      state.lines,
      scale,
      null,
      unitSettings
    );
  }

  ctx.restore();
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
 * Exports the floor plan as a high-resolution PNG Blob with fail-safe fallbacks.
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
