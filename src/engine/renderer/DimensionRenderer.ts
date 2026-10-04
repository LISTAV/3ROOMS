import type { Point2D } from '../../core/types.js';
import { distance, normalize, normal, scale, add } from '../../core/math/vector.js';
import { formatLength, type UnitSettings } from '../../core/units/unitFormatter.js';
import { uiStore } from '../../core/store/uiStore.js';

export interface DimensionLineGeometry {
  dimStart: Point2D;
  dimEnd: Point2D;
  offsetVector: Point2D;
  length: number;
}

/**
 * Formats a millimeter distance into a clean CAD string in the active preferred unit.
 */
export function formatDimension(
  lengthMm: number,
  unitSettings?: Partial<UnitSettings>
): string {
  const settings = unitSettings || uiStore.getState().unitSettings;
  return formatLength(lengthMm, settings);
}

/**
 * Normalizes text orientation so annotations are always legible from the bottom or right side.
 * If angle lies in Quadrants II or III (> 90° or <= -90°), it is adjusted by +180°.
 */
export function normalizeTextAngle(angleRad: number): { angle: number; flip: boolean } {
  let a = angleRad;
  // Normalize into (-PI, PI]
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;

  if (a > Math.PI / 2 || a <= -Math.PI / 2) {
    return {
      angle: a + Math.PI,
      flip: true,
    };
  }

  return {
    angle: a,
    flip: false,
  };
}

/**
 * Computes the parallel dimension geometry offset outward by offsetMm.
 */
export function computeDimensionLine(
  start: Point2D,
  end: Point2D,
  offsetMm: number = 300
): DimensionLineGeometry {
  const dir: Point2D = { x: end.x - start.x, y: end.y - start.y };
  const len = distance(start, end);

  if (len < 1e-4) {
    return {
      dimStart: { ...start },
      dimEnd: { ...end },
      offsetVector: { x: 0, y: 0 },
      length: 0,
    };
  }

  const u = normalize(dir);
  const n = normal(u); // (-u.y, u.x)
  const offsetVector = scale(n, offsetMm);

  const dimStart = add(start, offsetVector);
  const dimEnd = add(end, offsetVector);

  return {
    dimStart,
    dimEnd,
    offsetVector,
    length: len,
  };
}

/**
 * Draws CAD dimension lines, extension witness lines, 45-degree architectural slash ticks,
 * and normalized upright text label.
 */
export function drawDimension(
  ctx: CanvasRenderingContext2D,
  start: Point2D,
  end: Point2D,
  offsetMm: number = 300,
  zoom: number,
  unitSettings?: Partial<UnitSettings>
): void {
  const geom = computeDimensionLine(start, end, offsetMm);
  if (geom.length < 1e-3) return;

  const { dimStart, dimEnd } = geom;
  const screenPixel = 1 / zoom;

  ctx.save();

  // 1. Extension witness lines (thin lines connecting wall endpoints to dimension baseline)
  ctx.strokeStyle = '#94a3b8'; // slate-400
  ctx.lineWidth = 1 * screenPixel;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(dimStart.x, dimStart.y);
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(dimEnd.x, dimEnd.y);
  ctx.stroke();

  // 2. Dimension baseline
  ctx.strokeStyle = '#64748b'; // slate-500
  ctx.lineWidth = 1 * screenPixel;
  ctx.beginPath();
  ctx.moveTo(dimStart.x, dimStart.y);
  ctx.lineTo(dimEnd.x, dimEnd.y);
  ctx.stroke();

  // 3. 45-degree architectural slash ticks (8px screen length)
  const dir: Point2D = { x: end.x - start.x, y: end.y - start.y };
  const baselineAngle = Math.atan2(dir.y, dir.x);
  const tickAngle = baselineAngle + Math.PI / 4;
  const tickHalfLen = 4 * screenPixel;
  const tickDx = tickHalfLen * Math.cos(tickAngle);
  const tickDy = tickHalfLen * Math.sin(tickAngle);

  ctx.strokeStyle = '#334155'; // slate-700
  ctx.lineWidth = 1.5 * screenPixel;
  ctx.beginPath();
  // Start tick
  ctx.moveTo(dimStart.x - tickDx, dimStart.y - tickDy);
  ctx.lineTo(dimStart.x + tickDx, dimStart.y + tickDy);
  // End tick
  ctx.moveTo(dimEnd.x - tickDx, dimEnd.y - tickDy);
  ctx.lineTo(dimEnd.x + tickDx, dimEnd.y + tickDy);
  ctx.stroke();

  // 4. Centered upright text label with background mask
  const mid: Point2D = {
    x: (dimStart.x + dimEnd.x) / 2,
    y: (dimStart.y + dimEnd.y) / 2,
  };

  const label = formatDimension(geom.length, unitSettings);
  const { angle: textAngle } = normalizeTextAngle(baselineAngle);

  ctx.font = `${Math.round(12 * screenPixel)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  const textMetrics = ctx.measureText(label);
  const textWidth = textMetrics.width || label.length * 7 * screenPixel;
  const textHeight = 14 * screenPixel;

  ctx.save();
  ctx.translate(mid.x, mid.y);
  ctx.rotate(textAngle);

  // Background pill/mask to prevent baseline from cutting through text
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(
    -textWidth / 2 - 4 * screenPixel,
    -textHeight / 2,
    textWidth + 8 * screenPixel,
    textHeight
  );

  // Label text
  ctx.fillStyle = '#0f172a'; // slate-900
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 0);

  ctx.restore();
  ctx.restore();
}
