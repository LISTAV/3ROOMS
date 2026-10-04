import type { Point2D } from '../../core/types.js';
import type { Viewport } from '../viewport/Viewport.js';
import type { Tool, ToolContext } from './Tool.js';
import { planStore } from '../../core/store/planStore.js';
import { uiStore } from '../../core/store/uiStore.js';
import { distance } from '../../core/math/vector.js';
import { formatLength } from '../../core/units/unitFormatter.js';
import { normalizeTextAngle } from '../renderer/DimensionRenderer.js';

/**
 * Snaps a 2D vector to the nearest 45-degree angle (0°, 45°, 90°, 135°, 180°, etc.).
 */
export function snapTo45DegreeAngle(start: Point2D, target: Point2D): Point2D {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-4) return target;

  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4; // 45 degrees
  const snappedAngle = Math.round(angle / step) * step;

  return {
    x: Math.round(start.x + len * Math.cos(snappedAngle)),
    y: Math.round(start.y + len * Math.sin(snappedAngle)),
  };
}

/**
 * Parametric Line Drawing Tool with live dimension HUD and 45° ortho snapping.
 */
export class LineTool implements Tool {
  public readonly id = 'line';
  public readonly cursor = 'crosshair';

  private isDrawing: boolean = false;
  private startPoint: Point2D | null = null;
  private currentPoint: Point2D | null = null;

  public onActivate(ctx: ToolContext): void {
    this.reset();
    ctx.requestRender();
  }

  public onDeactivate(ctx: ToolContext): void {
    this.reset();
    ctx.requestRender();
  }

  public reset(): void {
    this.isDrawing = false;
    this.startPoint = null;
    this.currentPoint = null;
  }

  public onPointerDown(e: PointerEvent, worldPoint: Point2D, ctx: ToolContext): void {
    if (e.button !== 0) return; // Only primary button

    // 1. First Click: Start line
    if (!this.isDrawing || !this.startPoint) {
      const snapResult = ctx.snapEngine.resolveSnap(
        { cursorWorld: worldPoint, zoom: ctx.viewport.zoom },
        planStore.getState().vertices,
        planStore.getState().walls
      );

      this.startPoint = snapResult.point;
      this.currentPoint = snapResult.point;
      this.isDrawing = true;
      ctx.requestRender();
      return;
    }

    // 2. Second Click: Commit line
    let endPt = this.currentPoint ?? worldPoint;
    const len = distance(this.startPoint, endPt);

    if (len >= 20) {
      const uiState = uiStore.getState();
      const defaults = uiState.lineDefaults;

      const newLine = planStore.getState().addLine({
        start: this.startPoint,
        end: endPt,
        thickness: defaults.thickness,
        color: defaults.color,
        style: defaults.style,
        arrows: defaults.arrows,
        showMeasurement: defaults.showMeasurement,
      });

      // Auto-select line and switch to select tool
      planStore.getState().selectLine(newLine.id);
      uiStore.getState().setActiveTool('select');
      uiStore.getState().setInspectorVisible(true);
    }

    this.reset();
    ctx.requestRender();
  }

  public onPointerMove(e: PointerEvent, worldPoint: Point2D, ctx: ToolContext): void {
    if (!this.isDrawing || !this.startPoint) {
      // Show cursor snapping preview
      ctx.snapEngine.resolveSnap(
        { cursorWorld: worldPoint, zoom: ctx.viewport.zoom },
        planStore.getState().vertices,
        planStore.getState().walls
      );
      ctx.requestRender();
      return;
    }

    // Snap target position
    const snapResult = ctx.snapEngine.resolveSnap(
      {
        cursorWorld: worldPoint,
        zoom: ctx.viewport.zoom,
        orthoOrigin: this.startPoint,
        isShiftPressed: e.shiftKey || uiStore.getState().orthoLock,
      },
      planStore.getState().vertices,
      planStore.getState().walls
    );
    let target = snapResult.point;

    // Ortho lock or Shift key: constrain to 45° angle increments
    if (e.shiftKey || uiStore.getState().orthoLock) {
      target = snapTo45DegreeAngle(this.startPoint, target);
    }

    this.currentPoint = target;
    ctx.requestRender();
  }

  public onPointerUp(_e: PointerEvent, _worldPoint: Point2D, _ctx: ToolContext): void {
    // Kept active between clicks
  }

  public onKeyDown(e: KeyboardEvent, ctx: ToolContext): void {
    if (e.code === 'Escape') {
      this.reset();
      ctx.requestRender();
    }
  }

  /**
   * Renders the dynamic drafting line preview and live measurement HUD.
   */
  public renderOverlay(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    if (!this.isDrawing || !this.startPoint || !this.currentPoint) return;

    const zoom = viewport.zoom;
    const screenPixel = 1 / zoom;
    const p1 = this.startPoint;
    const p2 = this.currentPoint;
    const len = distance(p1, p2);

    const uiState = uiStore.getState();
    const defaults = uiState.lineDefaults;
    const unitSettings = uiState.unitSettings;

    ctx.save();

    // 1. Dynamic Drafting Line Preview
    ctx.lineWidth = Math.max(1.5 * screenPixel, defaults.thickness);
    ctx.strokeStyle = '#2563eb'; // blue-600 active drafting color
    ctx.lineCap = 'round';

    if (defaults.style === 'dashed') {
      ctx.setLineDash([defaults.thickness * 3, defaults.thickness * 1.5]);
    } else if (defaults.style === 'dotted') {
      ctx.setLineDash([defaults.thickness, defaults.thickness]);
    } else {
      ctx.setLineDash([6 * screenPixel, 4 * screenPixel]);
    }

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Start & End Endpoint Dots
    const dotR = 5 * screenPixel;
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, dotR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2 * screenPixel;
    ctx.beginPath();
    ctx.arc(p2.x, p2.y, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 3. Live Length Dimension Badge
    if (len > 30) {
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      const dirX = (p2.x - p1.x) / len;
      const dirY = (p2.y - p1.y) / len;
      const normX = -dirY;
      const normY = dirX;

      const badgeDist = Math.max(25 * screenPixel, 150);
      const badgeX = midX + normX * badgeDist;
      const badgeY = midY + normY * badgeDist;

      let angle = Math.atan2(dirY, dirX);
      angle = normalizeTextAngle(angle).angle;

      const lengthText = formatLength(len, unitSettings);

      ctx.save();
      ctx.translate(badgeX, badgeY);
      ctx.rotate(angle);

      ctx.font = `600 ${11 * screenPixel}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      const textWidth = ctx.measureText(lengthText).width;
      const padX = 7 * screenPixel;
      const padY = 3.5 * screenPixel;
      const pillW = textWidth + padX * 2;
      const pillH = 14 * screenPixel + padY * 2;
      const radius = 4 * screenPixel;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1 * screenPixel;

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, radius);
      } else {
        ctx.rect(-pillW / 2, -pillH / 2, pillW, pillH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lengthText, 0, 0);

      ctx.restore();
    }

    ctx.restore();
  }
}
