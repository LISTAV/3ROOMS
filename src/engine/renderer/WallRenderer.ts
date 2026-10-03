import type { WallPolygon } from '../../core/geometry/miter.js';
import type { Vertex, Wall, Opening } from '../../core/types.js';
import { generateWallPolygonsWithOpenings } from '../../core/geometry/openings.js';

export interface WallRendererOptions {
  fillColor?: string;
  strokeColor?: string;
  selectedColor?: string;
}

/**
 * Renders solid 2D polygonal walls, eliminating interior joint seams,
 * drawing crisp outer contour strokes, and applying selection highlights.
 */
export class WallRenderer {
  public fillColor: string;
  public strokeColor: string;
  public selectedColor: string;

  constructor(options: WallRendererOptions = {}) {
    this.fillColor = options.fillColor ?? '#475569'; // slate-600
    this.strokeColor = options.strokeColor ?? '#0f172a'; // slate-900
    this.selectedColor = options.selectedColor ?? '#3b82f6'; // blue-500
  }

  /**
   * Renders wall polygons with two-pass joint seam elimination:
   * Pass 1: All solid body fills
   * Pass 2: Selection highlights
   * Pass 3: Outer contour boundary strokes
   */
  public render(
    ctx: CanvasRenderingContext2D,
    wallPolygons: Record<string, WallPolygon> | WallPolygon[],
    selectedWallIds: string[] = [],
    zoom: number,
    storeData?: {
      vertices: Record<string, Vertex>;
      walls: Record<string, Wall>;
      openings?: Record<string, Opening>;
    }
  ): void {
    let polygons: WallPolygon[];

    if (Array.isArray(wallPolygons)) {
      polygons = wallPolygons;
    } else if (storeData?.openings && Object.keys(storeData.openings).length > 0) {
      polygons = generateWallPolygonsWithOpenings(
        storeData.vertices,
        storeData.walls,
        storeData.openings
      );
    } else {
      polygons = Object.values(wallPolygons);
    }

    if (polygons.length === 0) return;

    const screenPixel = 1 / zoom;
    const selectedSet = new Set(selectedWallIds);

    ctx.save();

    // -----------------------------------------------------------------
    // PASS 1: Solid Wall Body Fills (Seamless joint integration)
    // -----------------------------------------------------------------
    ctx.fillStyle = this.fillColor;
    ctx.beginPath();
    for (const wp of polygons) {
      const pts = wp.polygon;
      if (pts.length < 3) continue;

      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();
    }
    ctx.fill();

    // -----------------------------------------------------------------
    // PASS 2: Selection Highlights (Blue accent stroke & glow)
    // -----------------------------------------------------------------
    if (selectedSet.size > 0) {
      ctx.save();
      ctx.strokeStyle = this.selectedColor;
      ctx.lineWidth = 3.5 * screenPixel;
      ctx.lineJoin = 'miter';

      for (const wp of polygons) {
        if (!selectedSet.has(wp.wallId)) continue;
        const pts = wp.polygon;
        if (pts.length < 3) continue;

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }

    // -----------------------------------------------------------------
    // PASS 3: Crisp Outer Contour Lines (1.5px screen width)
    // -----------------------------------------------------------------
    ctx.strokeStyle = this.strokeColor;
    ctx.lineWidth = 1.5 * screenPixel;
    ctx.lineJoin = 'miter';

    for (const wp of polygons) {
      const pts = wp.polygon;
      if (pts.length < 3) continue;

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // -----------------------------------------------------------------
    // PASS 4: Centerline Gizmos & Handles for selected walls
    // -----------------------------------------------------------------
    if (selectedSet.size > 0 && storeData) {
      const { vertices, walls } = storeData;
      ctx.save();
      ctx.strokeStyle = '#94a3b8'; // slate-400
      ctx.lineWidth = 1 * screenPixel;
      ctx.setLineDash([4 * screenPixel, 4 * screenPixel]);

      for (const wallId of selectedSet) {
        const wall = walls[wallId];
        if (!wall) continue;
        const startV = vertices[wall.startId];
        const endV = vertices[wall.endId];
        if (!startV || !endV) continue;

        // Centerline
        ctx.beginPath();
        ctx.moveTo(startV.x, startV.y);
        ctx.lineTo(endV.x, endV.y);
        ctx.stroke();

        // Endpoint circular handles
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = this.selectedColor;
        ctx.lineWidth = 1.5 * screenPixel;

        ctx.beginPath();
        ctx.arc(startV.x, startV.y, 4 * screenPixel, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(endV.x, endV.y, 4 * screenPixel, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  }
}
