import type { Point2D } from '../../core/types.js';
import type { SnapResult } from '../../core/snap/SnapEngine.js';
import { computeParallelOffset } from '../../core/math/line.js';
import { distance } from '../../core/math/vector.js';
import {
  drawDimension,
  normalizeTextAngle,
  computeLineAngleDeg,
  drawCornerAngleIndicator,
  drawAngleReferenceArc,
} from './DimensionRenderer.js';
import { formatLength } from '../../core/units/unitFormatter.js';
import { uiStore } from '../../core/store/uiStore.js';

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
   * Renders a live preview of the wall being drawn with thickness, angle references,
   * corner indicators, and live dimension annotation.
   */
  public static renderWallPreview(
    ctx: CanvasRenderingContext2D,
    start: Point2D,
    end: Point2D,
    thickness: number,
    zoom: number,
    previousPoint?: Point2D | null
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

    // 4. Angle & Corner Reference
    if (previousPoint) {
      // Continuing chain or attached to corner: show live corner angle
      drawCornerAngleIndicator(ctx, previousPoint, start, end, zoom, true, 'Corner: ');
    } else {
      // Standalone wall: show polar baseline and angle arc
      drawAngleReferenceArc(ctx, start, end, zoom);
    }

    // 5. Centered live measurement tape badge with angle in preferred unit
    if (len > 10) {
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      const dirX = (end.x - start.x) / len;
      const dirY = (end.y - start.y) / len;
      const normX = -dirY;
      const normY = dirX;

      const badgeDist = Math.max(28 * screenPixel, thickness / 2 + 25 * screenPixel);
      const badgeX = midX + normX * badgeDist;
      const badgeY = midY + normY * badgeDist;

      let angle = Math.atan2(dirY, dirX);
      angle = normalizeTextAngle(angle).angle;

      const unitSettings = uiStore.getState().unitSettings;
      const lengthText = formatLength(len, unitSettings);

      const { deg, isCardinal, is45, cardinalAngle } = computeLineAngleDeg(start, end);
      const angleLabel = isCardinal ? `${cardinalAngle}° [ORTHO]` : `${deg.toFixed(is45 ? 0 : 1)}°`;
      const badgeText = `${lengthText}   |   ${angleLabel}`;

      ctx.save();
      ctx.translate(badgeX, badgeY);
      ctx.rotate(angle);

      ctx.font = `600 ${11 * screenPixel}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      const textWidth = ctx.measureText(badgeText).width;
      const padX = 8 * screenPixel;
      const padY = 4 * screenPixel;
      const pillW = textWidth + padX * 2;
      const pillH = 14 * screenPixel + padY * 2;
      const radius = 4 * screenPixel;

      const borderColor = isCardinal ? '#10b981' : is45 ? '#38bdf8' : '#64748b';
      const textColor = isCardinal ? '#10b981' : is45 ? '#38bdf8' : '#f8fafc';

      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = (isCardinal ? 1.5 : 1) * screenPixel;

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, radius);
      } else {
        ctx.rect(-pillW / 2, -pillH / 2, pillW, pillH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, 0, 0);
      ctx.restore();
    }
  }
}
