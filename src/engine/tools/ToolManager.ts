import type { Point2D } from '../../core/types.js';
import type { Viewport } from '../viewport/Viewport.js';
import type { Tool, ToolContext } from './Tool.js';

/**
 * Manages tool registration, active tool state, and event routing.
 */
export class ToolManager {
  private tools: Map<string, Tool> = new Map();
  private activeTool: Tool | null = null;

  /**
   * Registers a tool in the manager.
   */
  public registerTool(tool: Tool): void {
    this.tools.set(tool.id, tool);
  }

  /**
   * Retrieves a registered tool by its ID.
   */
  public getTool(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  /**
   * Returns the currently active tool.
   */
  public getActiveTool(): Tool | null {
    return this.activeTool;
  }

  /**
   * Switches the active tool, triggering onDeactivate / onActivate hooks and requesting a render.
   */
  public setActiveTool(toolId: string, ctx: ToolContext): void {
    if (this.activeTool?.id === toolId) return;

    if (this.activeTool) {
      this.activeTool.onDeactivate(ctx);
    }

    const nextTool = this.tools.get(toolId) ?? null;
    this.activeTool = nextTool;

    if (this.activeTool) {
      this.activeTool.onActivate(ctx);
    }

    ctx.requestRender();
  }

  /**
   * Routes pointerdown events to the active tool.
   */
  public onPointerDown(e: PointerEvent, worldPoint: Point2D, ctx: ToolContext): void {
    this.activeTool?.onPointerDown(e, worldPoint, ctx);
  }

  /**
   * Routes pointermove events to the active tool.
   */
  public onPointerMove(e: PointerEvent, worldPoint: Point2D, ctx: ToolContext): void {
    this.activeTool?.onPointerMove(e, worldPoint, ctx);
  }

  /**
   * Routes pointerup events to the active tool.
   */
  public onPointerUp(e: PointerEvent, worldPoint: Point2D, ctx: ToolContext): void {
    this.activeTool?.onPointerUp(e, worldPoint, ctx);
  }

  /**
   * Routes keydown events to the active tool.
   */
  public onKeyDown(e: KeyboardEvent, ctx: ToolContext): void {
    this.activeTool?.onKeyDown(e, ctx);
  }

  /**
   * Renders transient overlays for the active tool.
   */
  public renderOverlay(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    this.activeTool?.renderOverlay(ctx, viewport);
  }
}
