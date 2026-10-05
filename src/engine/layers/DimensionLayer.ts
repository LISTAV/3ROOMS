import type { Vertex, Wall, Point2D } from '../../core/types.js';
import {
  computeDimensionLine,
  normalizeTextAngle,
  drawCornerAngleIndicator,
} from '../renderer/DimensionRenderer.js';
import {
  formatLength,
  type UnitSettings,
  type DimensionSettings,
  DEFAULT_UNIT_SETTINGS,
  DEFAULT_DIMENSION_SETTINGS,
} from '../../core/units/unitFormatter.js';
import { uiStore } from '../../core/store/uiStore.js';

export interface DimensionLayerOptions {
  offsetMm?: number;
  tickLengthMm?: number;
  witnessColor?: string;
  baselineColor?: string;
  tickColor?: string;
  textColor?: string;
  textMaskColor?: string;
}

/**
 * Architectural CAD Dimension Layer rendering live parametric dimension tapes along walls.
 * Features customizable font size & placement positions (outside, centered, inside),
 * 45-degree CAD slash tick marks, upright smart text orientation, background text masking,
 * and live multi-unit formatting.
 */
export class DimensionLayer {
  public offsetMm: number;
  public tickLengthMm: number;
  public witnessColor: string;
  public baselineColor: string;
  public tickColor: string;
  public tickAngleRad: number = Math.PI / 4; // 45 degrees
  public textColor: string;
  public textMaskColor: string;

  constructor(options: DimensionLayerOptions = {}) {
    this.offsetMm = options.offsetMm ?? 350;
    this.tickLengthMm = options.tickLengthMm ?? 150;
    this.witnessColor = options.witnessColor ?? '#94a3b8'; // Slate-400
    this.baselineColor = options.baselineColor ?? '#64748b'; // Slate-500
    this.tickColor = options.tickColor ?? '#334155'; // Slate-700
    this.textColor = options.textColor ?? '#0f172a'; // Slate-900
    this.textMaskColor = options.textMaskColor ?? 'rgba(255, 255, 255, 0.92)';
  }

  /**
   * Renders dimension lines for all given walls with active or custom dimension settings.
   */
  public render(
    ctx: CanvasRenderingContext2D,
    walls: Record<string, Wall>,
    vertices: Record<string, Vertex>,
    zoom: number,
    unitSettings: UnitSettings = DEFAULT_UNIT_SETTINGS,
    dimensionSettings?: DimensionSettings
  ): void {
    const wallList = Object.values(walls);
    if (wallList.length === 0) return;

    const dimSettings = dimensionSettings || uiStore.getState().dimensionSettings || DEFAULT_DIMENSION_SETTINGS;
    const screenPixel = 1 / zoom;

    ctx.save();

    for (const wall of wallList) {
      const startV = vertices[wall.startId];
      const endV = vertices[wall.endId];
      if (!startV || !endV) continue;

      this.renderWallDimension(ctx, startV, endV, zoom, screenPixel, unitSettings, dimSettings);
    }

    // 2. Render CAD corner angle references at wall corners
    const vertexWallMap: Record<string, Wall[]> = {};
    for (const wall of wallList) {
      if (!vertexWallMap[wall.startId]) vertexWallMap[wall.startId] = [];
      if (!vertexWallMap[wall.endId]) vertexWallMap[wall.endId] = [];
      vertexWallMap[wall.startId].push(wall);
      vertexWallMap[wall.endId].push(wall);
    }

    for (const [vId, connected] of Object.entries(vertexWallMap)) {
      if (connected.length === 2) {
        const cornerV = vertices[vId];
        if (!cornerV) continue;

        const w1 = connected[0];
        const w2 = connected[1];
        const p1Id = w1.startId === vId ? w1.endId : w1.startId;
        const p2Id = w2.startId === vId ? w2.endId : w2.startId;
        const p1 = vertices[p1Id];
        const p2 = vertices[p2Id];
        if (!p1 || !p2) continue;

        drawCornerAngleIndicator(ctx, p1, cornerV, p2, zoom, true);
      }
    }

    ctx.restore();
  }

  /**
   * Draws a single wall dimension tape.
   */
  public renderWallDimension(
    ctx: CanvasRenderingContext2D,
    start: Point2D,
    end: Point2D,
    zoom: number,
    screenPixel: number,
    unitSettings: UnitSettings = DEFAULT_UNIT_SETTINGS,
    dimensionSettings?: DimensionSettings
  ): void {
    const dimSettings = dimensionSettings || uiStore.getState().dimensionSettings || DEFAULT_DIMENSION_SETTINGS;

    let effectiveOffset = dimSettings.offsetMm ?? this.offsetMm;
    if (dimSettings.position === 'centered') {
      effectiveOffset = 0;
    } else if (dimSettings.position === 'inside') {
      effectiveOffset = -Math.abs(effectiveOffset);
    } else if (dimSettings.position === 'outside') {
      effectiveOffset = Math.abs(effectiveOffset);
    }

    const geom = computeDimensionLine(start, end, effectiveOffset);
    if (geom.length < 1e-3) return;

    const { dimStart, dimEnd } = geom;

    ctx.save();

    // 1. Extension Witness Lines (connecting wall endpoints to dimension line, only if offset)
    if (Math.abs(effectiveOffset) > 1e-2) {
      ctx.strokeStyle = this.witnessColor;
      ctx.lineWidth = Math.max(0.75 * screenPixel, 1);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(dimStart.x, dimStart.y);
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(dimEnd.x, dimEnd.y);
      ctx.stroke();
    }

    // 2. Dimension Baseline
    ctx.strokeStyle = this.baselineColor;
    ctx.lineWidth = Math.max(1 * screenPixel, 1);
    ctx.beginPath();
    ctx.moveTo(dimStart.x, dimStart.y);
    ctx.lineTo(dimEnd.x, dimEnd.y);
    ctx.stroke();

    // 3. 45-degree CAD Slash Tick Marks
    const dir: Point2D = { x: end.x - start.x, y: end.y - start.y };
    const baselineAngle = Math.atan2(dir.y, dir.x);
    const tickAngle = baselineAngle + Math.PI / 4;
    // Scale tick marks: between 6px screen size and 100mm world size
    const tickHalfLen = Math.max(6 * screenPixel, Math.min(this.tickLengthMm / 2, 10 * screenPixel));
    const tickDx = tickHalfLen * Math.cos(tickAngle);
    const tickDy = tickHalfLen * Math.sin(tickAngle);

    ctx.strokeStyle = this.tickColor;
    ctx.lineWidth = Math.max(1.5 * screenPixel, 2);
    ctx.beginPath();
    // Start tick
    ctx.moveTo(dimStart.x - tickDx, dimStart.y - tickDy);
    ctx.lineTo(dimStart.x + tickDx, dimStart.y + tickDy);
    // End tick
    ctx.moveTo(dimEnd.x - tickDx, dimEnd.y - tickDy);
    ctx.lineTo(dimEnd.x + tickDx, dimEnd.y + tickDy);
    ctx.stroke();

    // 4. Smart Upright Centered Text Label
    const mid: Point2D = {
      x: (dimStart.x + dimEnd.x) / 2,
      y: (dimStart.y + dimEnd.y) / 2,
    };

    const label = formatLength(geom.length, unitSettings);
    const { angle: textAngle } = normalizeTextAngle(baselineAngle);

    const baseFont = dimSettings.fontSize || 12;
    const fontSizePx = Math.max(baseFont * screenPixel, 7 * screenPixel);
    ctx.font = `600 ${Math.round(fontSizePx)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width || label.length * (baseFont * 0.6) * screenPixel;
    const textHeight = Math.round((baseFont + 4) * screenPixel);
    const padX = Math.round(5 * screenPixel);

    ctx.save();
    ctx.translate(mid.x, mid.y);
    ctx.rotate(textAngle);

    // Background mask rectangle so baseline does not intersect text
    ctx.fillStyle = this.textMaskColor;
    ctx.fillRect(
      -textWidth / 2 - padX,
      -textHeight / 2,
      textWidth + padX * 2,
      textHeight
    );

    // Text Label
    ctx.fillStyle = this.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);

    ctx.restore();
    ctx.restore();
  }
}

export const dimensionLayer = new DimensionLayer();
