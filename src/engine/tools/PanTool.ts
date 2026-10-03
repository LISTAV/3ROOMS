import type { Point2D } from '../../core/types.js';
import type { Viewport } from '../viewport/Viewport.js';
import type { Tool, ToolContext } from './Tool.js';

/**
 * Dedicated Hand/Pan tool allowing viewport panning via direct left-mouse drag.
 */
export class PanTool implements Tool {
  public readonly id: string = 'pan';

  private isDragging: boolean = false;
  private lastClientPoint: Point2D | null = null;

  public onActivate(_ctx: ToolContext): void {
    this.reset();
  }

  public onDeactivate(_ctx: ToolContext): void {
    this.reset();
  }

  public reset(): void {
    this.isDragging = false;
    this.lastClientPoint = null;
  }

  public onPointerDown(e: PointerEvent, _worldPoint: Point2D, _ctx: ToolContext): void {
    if (e.button !== 0 && e.button !== 1) return;
    this.isDragging = true;
    this.lastClientPoint = { x: e.clientX, y: e.clientY };
  }

  public onPointerMove(e: PointerEvent, _worldPoint: Point2D, ctx: ToolContext): void {
    if (!this.isDragging || !this.lastClientPoint) return;

    const deltaX = e.clientX - this.lastClientPoint.x;
    const deltaY = e.clientY - this.lastClientPoint.y;

    ctx.viewport.panBy(deltaX, deltaY);
    this.lastClientPoint = { x: e.clientX, y: e.clientY };
    ctx.requestRender();
  }

  public onPointerUp(_e: PointerEvent, _worldPoint: Point2D, _ctx: ToolContext): void {
    this.isDragging = false;
    this.lastClientPoint = null;
  }

  public onKeyDown(_e: KeyboardEvent, _ctx: ToolContext): void {
    // No keyboard shortcuts for pan tool
  }

  public renderOverlay(_ctx: CanvasRenderingContext2D, _viewport: Viewport): void {
    // No overlay needed for pan tool
  }
}
