import type { FloorPlanState } from '../types.js';
import { calculateProjectBounds } from './svgExporter.js';
import { RoomRenderer } from '../../engine/renderer/RoomRenderer.js';
import { WallRenderer } from '../../engine/renderer/WallRenderer.js';
import { OpeningRenderer } from '../../engine/renderer/OpeningRenderer.js';
import { FurnitureLayer } from '../../engine/layers/FurnitureLayer.js';
import { ImageLayer } from '../../engine/layers/ImageLayer.js';
import { LineLayer } from '../../engine/layers/LineLayer.js';
import { drawDimension } from '../../engine/renderer/DimensionRenderer.js';
import { generateWallPolygons } from '../geometry/miter.js';
import { generateWallPolygonsWithOpenings } from '../geometry/openings.js';

export interface PngExportOptions {
  scale?: number; // Canvas pixels per millimeter (e.g., 1.5 to 2.0 for high-DPI print)
  paddingMm?: number;
  backgroundColor?: string;
  includeDimensions?: boolean;
}

/**
 * Renders the floor plan to an offscreen canvas and returns the canvas instance.
 */
export function renderToOffscreenCanvas(
  state: FloorPlanState,
  options: PngExportOptions = {}
): HTMLCanvasElement | OffscreenCanvas {
  const scale = options.scale ?? 1.5;
  const paddingMm = options.paddingMm ?? 500;
  const bgColor = options.backgroundColor ?? '#ffffff';
  const includeDimensions = options.includeDimensions ?? true;

  const bbox = calculateProjectBounds(state, paddingMm);
  const canvasWidth = Math.max(100, Math.ceil(bbox.width * scale));
  const canvasHeight = Math.max(100, Math.ceil(bbox.height * scale));

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

  // 3. Render Pipeline (Images -> Rooms -> Furniture -> Walls -> Openings -> Dimensions)
  const imageLayer = new ImageLayer();
  const roomRenderer = new RoomRenderer();
  const furnitureLayer = new FurnitureLayer();
  const wallRenderer = new WallRenderer();
  const openingRenderer = new OpeningRenderer();

  // (0) Reference / Underlay Images
  if (state.images && Object.keys(state.images).length > 0) {
    imageLayer.render(
      ctx as unknown as CanvasRenderingContext2D,
      state.images,
      scale,
      null
    );
  }

  // (a) Rooms
  if (Object.keys(state.rooms || {}).length > 0) {
    roomRenderer.render(
      ctx as unknown as CanvasRenderingContext2D,
      state.rooms,
      state.vertices,
      null,
      scale
    );
  }

  // (b) Furniture
  if (Object.keys(state.furniture || {}).length > 0) {
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

  // (e) Dimensions
  if (includeDimensions && Object.keys(state.walls || {}).length > 0) {
    for (const wall of Object.values(state.walls)) {
      const startV = state.vertices[wall.startId];
      const endV = state.vertices[wall.endId];
      if (!startV || !endV) continue;

      drawDimension(ctx as unknown as CanvasRenderingContext2D, startV, endV, 350, scale);
    }
  }

  // (f) Drafting Lines
  if (state.lines && Object.keys(state.lines).length > 0) {
    const lineLayer = new LineLayer();
    lineLayer.render(
      ctx as unknown as CanvasRenderingContext2D,
      state.lines,
      scale,
      null
    );
  }

  ctx.restore();
  return canvas;
}

/**
 * Exports the floor plan as a high-resolution PNG Blob.
 */
export async function exportToPngBlob(
  state: FloorPlanState,
  options: PngExportOptions = {}
): Promise<Blob> {
  const canvas = renderToOffscreenCanvas(state, options);

  if ('convertToBlob' in canvas) {
    return (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
  } else if ('toBlob' in canvas) {
    return new Promise<Blob>((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas toBlob returned null'));
          }
        },
        'image/png'
      );
    });
  }

  throw new Error('Unable to convert canvas to Blob.');
}
