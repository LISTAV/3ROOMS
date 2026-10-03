import type { Point2D } from '../../core/types.js';
import type { SnapResult } from '../../core/snap/SnapEngine.js';
import { computeParallelOffset } from '../../core/math/line.js';
import { distance } from '../../core/math/vector.js';
import { drawDimension } from './DimensionRenderer.js';

/**
 * Dynamic overlay renderer handling CAD snap markers, alignment rays,
 * and active wall creation previews.
 */
export class OverlayRenderer {
  /**
   * Renders dynamic dashed alignment and orthogonal guide rays.
   */
  public static renderSnapGuides(
    ctx: CanvasRenderingContext2D,
    snapResult: SnapResult,
    zoom: number
  ): void {
    if (!snapResult.guidelines || snapResult.guidelines.length === 0) return;

    const screenPixel = 1 / zoom;
    const rayExtent = 100000; // Far extent in millimeters

    ctx.save();
    ctx.strokeStyle = '#3b82f6'; // blue-500
    ctx.lineWidth = 1 * screenPixel;
    ctx.setLineDash([4 * screenPixel, 4 * screenPixel]);

    ctx.beginPath();
    for (const guide of snapResult.guidelines) {
      if (guide.axis === 'x') {
        // Vertical guideline (x = constant)
        ctx.moveTo(guide.position, -rayExtent);
        ctx.lineTo(guide.position, rayExtent);
      } else if (guide.axis === 'y') {
        // Horizontal guideline (y = constant)
        ctx.moveTo(-rayExtent, guide.position);
        ctx.lineTo(rayExtent, guide.position);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Renders magnetic snap markers (circles/squares around snapped points).
   */
  public static renderSnapMarker(
    ctx: CanvasRenderingContext2D,
    snapResult: SnapResult,
    zoom: number
  ): void {
    if (snapResult.snapType === 'none') return;

    const screenPixel = 1 / zoom;
    const pt = snapResult.point;

    ctx.save();
    ctx.strokeStyle = '#2563eb'; // blue-600
    ctx.lineWidth = 1.5 * screenPixel;

    if (snapResult.snapType === 'vertex') {
      // Hollow square with subtle fill
      const size = 6 * screenPixel;
      ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
      ctx.beginPath();
      ctx.rect(pt.x - size, pt.y - size, size * 2, size * 2);
      ctx.fill();
      ctx.stroke();
    } else if (snapResult.snapType === 'edge') {
      // Small diamond / circle sliding indicator along edge
      const r = 4.5 * screenPixel;
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (snapResult.snapType === 'ortho') {
      // Crosshair indicator
      const arm = 6 * screenPixel;
      ctx.beginPath();
      ctx.moveTo(pt.x - arm, pt.y);
      ctx.lineTo(pt.x + arm, pt.y);
      ctx.moveTo(pt.x, pt.y - arm);
      ctx.lineTo(pt.x, pt.y + arm);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Renders a live preview of the wall being drawn with thickness and dimension annotation.
   */
  public static renderWallPreview(
    ctx: CanvasRenderingContext2D,
    start: Point2D,
    end: Point2D,
    thickness: number,
    zoom: number
  ): void {
    const len = distance(start, end);
    if (len < 1e-3) return;

    const screenPixel = 1 / zoom;
    const halfThick = thickness / 2;

    const [topStart, topEnd] = computeParallelOffset(start, end, halfThick);
    const [botStart, botEnd] = computeParallelOffset(start, end, -halfThick);

    ctx.save();

    // 1. Semi-transparent preview polygon representing wall thickness
    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'; // blue-500 @ 20%
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.8)'; // blue-600
    ctx.lineWidth = 1.5 * screenPixel;

    ctx.beginPath();
    ctx.moveTo(topStart.x, topStart.y);
    ctx.lineTo(topEnd.x, topEnd.y);
    ctx.lineTo(botEnd.x, botEnd.y);
    ctx.lineTo(botStart.x, botStart.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 2. Centerline guide
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1 * screenPixel;
    ctx.setLineDash([6 * screenPixel, 4 * screenPixel]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.restore();

    // 3. Live CAD dimension annotation offset 300mm outward
    drawDimension(ctx, start, end, 300, zoom);
  }
}
