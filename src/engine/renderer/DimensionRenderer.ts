import type { Point2D } from '../../core/types.js';
import { distance, normalize, normal, scale, add, angleBetween } from '../../core/math/vector.js';
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

export interface LineAngleResult {
  deg: number;
  isCardinal: boolean;
  is45: boolean;
  cardinalAngle: number | null;
}

/**
 * Computes standard CAD polar angle (0° East, 90° North, 180° West, 270° South).
 * Accurately detects orthogonal straight angles (0°, 90°, 180°, 270°) and 45° multiples.
 */
export function computeLineAngleDeg(start: Point2D, end: Point2D): LineAngleResult {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.hypot(dx, dy) < 1e-4) {
    return { deg: 0, isCardinal: true, is45: false, cardinalAngle: 0 };
  }

  // In 2D canvas, screen Y goes downwards. In architectural CAD conventions:
  // 0° = East (+X), 90° = North (-Y), 180° = West (-X), 270° = South (+Y).
  const rawDeg = (Math.atan2(-dy, dx) * 180) / Math.PI;
  const deg = (rawDeg % 360 + 360) % 360;

  // Cardinal alignment (0°, 90°, 180°, 270°) with 0.75° tolerance
  let cardinalAngle: number | null = null;
  if (Math.abs(deg) < 0.75 || Math.abs(deg - 360) < 0.75) {
    cardinalAngle = 0;
  } else if (Math.abs(deg - 90) < 0.75) {
    cardinalAngle = 90;
  } else if (Math.abs(deg - 180) < 0.75) {
    cardinalAngle = 180;
  } else if (Math.abs(deg - 270) < 0.75) {
    cardinalAngle = 270;
  }

  const isCardinal = cardinalAngle !== null;
  const is45 = [45, 135, 225, 315].some((a) => Math.abs(deg - a) < 0.75);

  return {
    deg: isCardinal ? cardinalAngle! : deg,
    isCardinal,
    is45,
    cardinalAngle,
  };
}

export interface CornerAngleResult {
  angleDeg: number;
  isRightAngle: boolean;
  isStraight: boolean;
  is45Multiple: boolean;
}

/**
 * Computes the interior corner angle formed by p1 -> corner -> p2 in degrees.
 */
export function computeCornerAngleDeg(
  p1: Point2D,
  corner: Point2D,
  p2: Point2D
): CornerAngleResult {
  const v1 = { x: p1.x - corner.x, y: p1.y - corner.y };
  const v2 = { x: p2.x - corner.x, y: p2.y - corner.y };
  const rad = angleBetween(v1, v2);
  const rawDeg = (rad * 180) / Math.PI;

  const isRightAngle = Math.abs(rawDeg - 90) < 0.75;
  const isStraight = Math.abs(rawDeg - 180) < 0.75;
  const is45Multiple = [45, 135].some((a) => Math.abs(rawDeg - a) < 0.75);

  return {
    angleDeg: isRightAngle ? 90 : rawDeg,
    isRightAngle,
    isStraight,
    is45Multiple,
  };
}

/**
 * Renders a high-contrast HUD pill badge for angles.
 */
export function drawAnglePillBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
  screenPixel: number,
  bg: string = 'rgba(15, 23, 42, 0.92)'
): void {
  ctx.save();
  ctx.font = `600 ${Math.round(10.5 * screenPixel)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  const textMetrics = ctx.measureText(text);
  const textWidth = textMetrics.width || text.length * 6.5 * screenPixel;
  const padX = 6 * screenPixel;
  const padY = 3 * screenPixel;
  const pillW = textWidth + padX * 2;
  const pillH = 13 * screenPixel + padY * 2;
  const radius = 3.5 * screenPixel;

  ctx.fillStyle = bg;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1 * screenPixel;

  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x - pillW / 2, y - pillH / 2, pillW, pillH, radius);
  } else {
    ctx.rect(x - pillW / 2, y - pillH / 2, pillW, pillH);
  }
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Renders a CAD corner angle indicator at a corner vertex.
 * For 90° right angles: draws classic CAD square corner symbol ∟ in emerald green.
 * For other angles: draws circular degree arc and degree badge.
 */
export function drawCornerAngleIndicator(
  ctx: CanvasRenderingContext2D,
  p1: Point2D,
  corner: Point2D,
  p2: Point2D,
  zoom: number,
  showLabel: boolean = true,
  labelPrefix: string = ''
): void {
  const d1 = distance(p1, corner);
  const d2 = distance(p2, corner);
  if (d1 < 10 || d2 < 10) return;

  const screenPixel = 1 / zoom;
  const u1 = { x: (p1.x - corner.x) / d1, y: (p1.y - corner.y) / d1 };
  const u2 = { x: (p2.x - corner.x) / d2, y: (p2.y - corner.y) / d2 };

  const { angleDeg, isRightAngle, isStraight, is45Multiple } = computeCornerAngleDeg(p1, corner, p2);

  // If segments are collinear (straight 180° wall), no corner indicator needed
  if (isStraight) return;

  const maxArm = Math.min(d1, d2) * 0.35;
  const targetSize = isRightAngle ? 16 * screenPixel : 20 * screenPixel;
  const size = Math.max(8 * screenPixel, Math.min(targetSize, maxArm));

  ctx.save();

  if (isRightAngle) {
    // Classic CAD right-angle perpendicular square ∟
    const c1 = { x: corner.x + u1.x * size, y: corner.y + u1.y * size };
    const c2 = { x: corner.x + (u1.x + u2.x) * size, y: corner.y + (u1.y + u2.y) * size };
    const c3 = { x: corner.x + u2.x * size, y: corner.y + u2.y * size };

    // Fill square with translucent emerald
    ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
    ctx.beginPath();
    ctx.moveTo(corner.x, corner.y);
    ctx.lineTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.lineTo(c3.x, c3.y);
    ctx.closePath();
    ctx.fill();

    // Stroke square arms
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5 * screenPixel;
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.lineTo(c3.x, c3.y);
    ctx.stroke();

    if (showLabel) {
      const bisectorLen = Math.hypot(u1.x + u2.x, u1.y + u2.y);
      const bisector = bisectorLen > 1e-4
        ? { x: (u1.x + u2.x) / bisectorLen, y: (u1.y + u2.y) / bisectorLen }
        : { x: -u1.y, y: u1.x };
      const badgeDist = size * 1.5 + 8 * screenPixel;
      const bx = corner.x + bisector.x * badgeDist;
      const by = corner.y + bisector.y * badgeDist;
      drawAnglePillBadge(ctx, bx, by, `${labelPrefix}90.0°`, '#10b981', screenPixel);
    }
  } else {
    // Non-right angle: draw degree arc and degree badge
    const a1 = Math.atan2(u1.y, u1.x);
    const a2 = Math.atan2(u2.y, u2.x);
    let sweep = a2 - a1;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    const anticlockwise = sweep < 0;

    const strokeColor = is45Multiple ? '#38bdf8' : '#94a3b8';
    const fillColor = is45Multiple ? 'rgba(56, 189, 248, 0.15)' : 'rgba(148, 163, 184, 0.12)';

    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(corner.x, corner.y);
    ctx.arc(corner.x, corner.y, size, a1, a2, anticlockwise);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5 * screenPixel;
    ctx.beginPath();
    ctx.arc(corner.x, corner.y, size, a1, a2, anticlockwise);
    ctx.stroke();

    if (showLabel) {
      const midAngle = a1 + sweep / 2;
      const badgeDist = size + 11 * screenPixel;
      const bx = corner.x + Math.cos(midAngle) * badgeDist;
      const by = corner.y + Math.sin(midAngle) * badgeDist;
      const degText = `${labelPrefix}${angleDeg.toFixed(Math.abs(angleDeg - Math.round(angleDeg)) < 0.05 ? 0 : 1)}°`;
      drawAnglePillBadge(ctx, bx, by, degText, strokeColor, screenPixel);
    }
  }

  ctx.restore();
}

/**
 * Draws CAD angle reference arc and 0° baseline from start to end while actively drawing.
 */
export function drawAngleReferenceArc(
  ctx: CanvasRenderingContext2D,
  start: Point2D,
  end: Point2D,
  zoom: number
): void {
  const len = distance(start, end);
  const screenPixel = 1 / zoom;
  if (len < 15 * screenPixel) return;

  const { deg, isCardinal, is45, cardinalAngle } = computeLineAngleDeg(start, end);
  const arcR = Math.max(18 * screenPixel, Math.min(len * 0.35, 42 * screenPixel));
  const lineAngle = Math.atan2(end.y - start.y, end.x - start.x);

  ctx.save();

  // 1. Horizontal 0° Reference Axis (dashed line to the right)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.7)'; // Slate-400
  ctx.lineWidth = 1 * screenPixel;
  ctx.setLineDash([3 * screenPixel, 3 * screenPixel]);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(start.x + arcR * 1.4, start.y);
  ctx.stroke();

  // 2. Vertex center crosshair tick
  const tick = 4 * screenPixel;
  ctx.beginPath();
  ctx.moveTo(start.x - tick, start.y);
  ctx.lineTo(start.x + tick, start.y);
  ctx.moveTo(start.x, start.y - tick);
  ctx.lineTo(start.x, start.y + tick);
  ctx.stroke();

  // 3. Polar Arc from 0° East to current vector angle
  const anticlockwise = lineAngle < 0;
  const strokeColor = isCardinal ? '#10b981' : is45 ? '#38bdf8' : 'rgba(56, 189, 248, 0.85)';
  const fillColor = isCardinal ? 'rgba(16, 185, 129, 0.18)' : 'rgba(56, 189, 248, 0.12)';

  ctx.setLineDash([]);
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.arc(start.x, start.y, arcR, 0, lineAngle, anticlockwise);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = (isCardinal ? 1.75 : 1.25) * screenPixel;
  ctx.beginPath();
  ctx.arc(start.x, start.y, arcR, 0, lineAngle, anticlockwise);
  ctx.stroke();

  // 4. Arc midpoint angle pill badge
  const midAngle = lineAngle / 2;
  const badgeDist = arcR + 10 * screenPixel;
  const bx = start.x + Math.cos(midAngle) * badgeDist;
  const by = start.y + Math.sin(midAngle) * badgeDist;

  const badgeText = isCardinal
    ? `${cardinalAngle}°`
    : `${deg.toFixed(is45 ? 0 : 1)}°`;

  drawAnglePillBadge(ctx, bx, by, badgeText, strokeColor, screenPixel);

  ctx.restore();
}

