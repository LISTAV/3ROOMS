import type { Point2D, LineEntity } from '../../core/types.js';
import type { Viewport } from '../viewport/Viewport.js';
import { distance, sub, scale, add } from '../../core/math/vector.js';
import { projectPointOnSegment } from '../../core/math/line.js';
import { normalizeTextAngle } from '../renderer/DimensionRenderer.js';
import { uiStore } from '../../core/store/uiStore.js';
import { formatLength } from '../../core/units/unitFormatter.js';

export interface LineLayerOptions {
  selectionColor?: string;
}

/**
 * Calculates perpendicular distance from a point to a line segment.
 */
export function pointToLineDistance(point: Point2D, start: Point2D, end: Point2D): number {
  return projectPointOnSegment(point, start, end).distance;
}

/**
 * Hit-tests whether a world point lies near or on a line entity taking into account thickness.
 */
export function isPointNearLine(
  point: Point2D,
  line: LineEntity,
  toleranceMm: number = 20
): boolean {
  const dist = pointToLineDistance(point, line.start, line.end);
  const threshold = Math.max(toleranceMm, line.thickness / 2 + toleranceMm);
  return dist <= threshold;
}

/**
 * Tests whether a point touches the start or end endpoint handle of a line.
 */
export function getLineEndpointHit(
  point: Point2D,
  line: LineEntity,
  hitRadiusMm: number = 30
): 'start' | 'end' | null {
  if (distance(point, line.start) <= hitRadiusMm) return 'start';
  if (distance(point, line.end) <= hitRadiusMm) return 'end';
  return null;
}

/**
 * Immediate-mode 2D layer rendering parametric drafting lines, arrowheads,
 * and live measurement annotations on the CAD canvas.
 */
export class LineLayer {
  public selectionColor: string;

  constructor(options: LineLayerOptions = {}) {
    this.selectionColor = options.selectionColor ?? '#2563eb';
  }

  /**
   * Renders all lines in world coordinate space.
   */
  public render(
    ctx: CanvasRenderingContext2D,
    lines: Record<string, LineEntity>,
    zoom: number,
    selectedLineId: string | null = null,
    unitSettings?: Partial<import('../../core/units/unitFormatter.js').UnitSettings>,
    dimensionSettings?: import('../../core/units/unitFormatter.js').DimensionSettings
  ): void {
    const list = Object.values(lines);
    if (list.length === 0) return;

    const screenPixel = 1 / zoom;
    const activeUnitSettings = unitSettings || uiStore.getState().unitSettings;
    const activeDimSettings = dimensionSettings || uiStore.getState().dimensionSettings;

    for (const line of list) {
      const isSelected = selectedLineId === line.id;
      const len = distance(line.start, line.end);
      if (len < 1e-3) continue;

      const dirX = (line.end.x - line.start.x) / len;
      const dirY = (line.end.y - line.start.y) / len;

      ctx.save();

      // 1. Line Stroke Style Mapping
      if (line.style === 'dashed') {
        const dashLen = Math.max(8 * screenPixel, line.thickness * 3);
        const gapLen = Math.max(4 * screenPixel, line.thickness * 1.5);
        ctx.setLineDash([dashLen, gapLen]);
      } else if (line.style === 'dotted') {
        const dotLen = Math.max(3 * screenPixel, line.thickness);
        ctx.setLineDash([dotLen, dotLen]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.lineWidth = Math.max(1 * screenPixel, line.thickness);
      ctx.strokeStyle = line.color || '#334155';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 2. Stroke Main Line Path
      ctx.beginPath();
      ctx.moveTo(line.start.x, line.start.y);
      ctx.lineTo(line.end.x, line.end.y);
      ctx.stroke();

      // 3. Arrowheads
      const arrowL = Math.max(12 * screenPixel, line.thickness * 3);
      const arrowW = Math.max(8 * screenPixel, line.thickness * 2);

      if (line.arrows === 'start' || line.arrows === 'both') {
        this.renderArrowhead(ctx, line.start, { x: -dirX, y: -dirY }, arrowL, arrowW, line.color);
      }
      if (line.arrows === 'end' || line.arrows === 'both') {
        this.renderArrowhead(ctx, line.end, { x: dirX, y: dirY }, arrowL, arrowW, line.color);
      }

      // 4. Dimension Measurement Tag
      if (line.showMeasurement) {
        this.renderMeasurementTag(
          ctx,
          line,
          len,
          dirX,
          dirY,
          screenPixel,
          activeUnitSettings,
          activeDimSettings
        );
      }

      // 5. Selection Overlay (Endpoint Handles & Accent Bounding Box)
      if (isSelected) {
        ctx.setLineDash([]);
        ctx.strokeStyle = this.selectionColor;
        ctx.lineWidth = 2 * screenPixel;

        // Selection highlight glow
        ctx.save();
        ctx.strokeStyle = 'rgba(37, 99, 235, 0.35)';
        ctx.lineWidth = Math.max(line.thickness + 12 * screenPixel, 16 * screenPixel);
        ctx.beginPath();
        ctx.moveTo(line.start.x, line.start.y);
        ctx.lineTo(line.end.x, line.end.y);
        ctx.stroke();
        ctx.restore();

        // Endpoint handles
        const handleR = Math.max(5 * screenPixel, 7);
        this.renderEndpointHandle(ctx, line.start, handleR, screenPixel);
        this.renderEndpointHandle(ctx, line.end, handleR, screenPixel);
      }

      ctx.restore();
    }
  }

  /**
   * Renders an arrowhead at the given tip position pointing in the given direction.
   */
  private renderArrowhead(
    ctx: CanvasRenderingContext2D,
    tip: Point2D,
    dir: Point2D,
    arrowLength: number,
    arrowWidth: number,
    color: string
  ): void {
    const normX = -dir.y;
    const normY = dir.x;

    const baseX = tip.x - dir.x * arrowLength;
    const baseY = tip.y - dir.y * arrowLength;

    const leftX = baseX + normX * (arrowWidth / 2);
    const leftY = baseY + normY * (arrowWidth / 2);

    const rightX = baseX - normX * (arrowWidth / 2);
    const rightY = baseY - normY * (arrowWidth / 2);

    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = color || '#334155';
    ctx.strokeStyle = color || '#334155';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Renders a live measurement tag along the line with normal offset and background pill.
   */
  private renderMeasurementTag(
    ctx: CanvasRenderingContext2D,
    line: LineEntity,
    length: number,
    dirX: number,
    dirY: number,
    screenPixel: number,
    unitSettings: any,
    activeDimSettings?: import('../../core/units/unitFormatter.js').DimensionSettings
  ): void {
    const dimSettings = activeDimSettings || uiStore.getState().dimensionSettings;
    const midX = (line.start.x + line.end.x) / 2;
    const midY = (line.start.y + line.end.y) / 2;

    // Normal offset with dynamic clearance based on position & offset setting
    const baseOffset = Math.max(180, 22 * screenPixel) * ((dimSettings?.offsetMm ?? 350) / 350);
    let normalOffset = baseOffset;
    if (dimSettings?.position === 'centered') {
      normalOffset = 0;
    } else if (dimSettings?.position === 'inside') {
      normalOffset = -baseOffset;
    }

    const normX = -dirY;
    const normY = dirX;

    const posX = midX + normX * normalOffset;
    const posY = midY + normY * normalOffset;

    let angle = Math.atan2(dirY, dirX);
    angle = normalizeTextAngle(angle).angle;

    const lengthText = formatLength(length, unitSettings);

    ctx.save();
    ctx.translate(posX, posY);
    ctx.rotate(angle);

    const baseFont = dimSettings?.fontSize ?? 12;
    const fontSizePx = Math.max(baseFont * screenPixel, 7 * screenPixel);
    ctx.font = `600 ${Math.round(fontSizePx)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const textWidth = ctx.measureText(lengthText).width;
    const padX = 6 * screenPixel;
    const padY = 3 * screenPixel;
    const pillW = textWidth + padX * 2;
    const pillH = Math.round((baseFont + 4) * screenPixel + padY * 2);
    const radius = 4 * screenPixel;

    // Background pill
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
    ctx.lineWidth = 1 * screenPixel;
    ctx.setLineDash([]);

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, radius);
    } else {
      ctx.rect(-pillW / 2, -pillH / 2, pillW, pillH);
    }
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lengthText, 0, 0);

    ctx.restore();
  }

  /**
   * Renders a circular endpoint control handle.
   */
  private renderEndpointHandle(
    ctx: CanvasRenderingContext2D,
    pos: Point2D,
    radius: number,
    screenPixel: number
  ): void {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = this.selectionColor;
    ctx.lineWidth = 2 * screenPixel;

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
