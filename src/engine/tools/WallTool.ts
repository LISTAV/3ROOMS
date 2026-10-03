import type { Point2D } from '../../core/types.js';
import type { Viewport } from '../viewport/Viewport.js';
import type { SnapResult } from '../../core/snap/SnapEngine.js';
import { distance } from '../../core/math/vector.js';
import { planStore } from '../../core/store/planStore.js';
import { OverlayRenderer } from '../renderer/OverlayRenderer.js';
import { uiStore } from '../../core/store/uiStore.js';
import type { Tool, ToolContext } from './Tool.js';

export type WallToolStatus = 'idle' | 'drawing';

/**
 * Interactive Wall Tool supporting point-and-click placement,
 * continuous wall chaining, snap-to-origin loop closure, live dimensioning,
 * and Escape/right-click termination.
 */
export class WallTool implements Tool {
  public readonly id: string = 'wall';

  public status: WallToolStatus = 'idle';
  public startPoint: Point2D | null = null;
  public currentPoint: Point2D | null = null;
  public firstVertexId: string | null = null;
  public activeSnapResult: SnapResult | null = null;
  public defaultThickness: number = 150; // mm

  public onActivate(_ctx: ToolContext): void {
    this.reset();
  }

  public onDeactivate(_ctx: ToolContext): void {
    this.reset();
  }

  /**
   * Resets the tool to idle state.
   */
  public reset(): void {
    this.status = 'idle';
    this.startPoint = null;
    this.currentPoint = null;
    this.firstVertexId = null;
    this.activeSnapResult = null;
  }

  public onPointerMove(e: PointerEvent, worldPoint: Point2D, ctx: ToolContext): void {
    const store = planStore.getState();

    // Resolve snapping against current graph state
    this.activeSnapResult = ctx.snapEngine.resolveSnap(
      {
        cursorWorld: worldPoint,
        zoom: ctx.viewport.zoom,
        orthoOrigin: this.status === 'drawing' && this.startPoint ? this.startPoint : undefined,
        isShiftPressed: e.shiftKey || uiStore.getState().orthoLock,
      },
      store.vertices,
      store.walls
    );

    this.currentPoint = { ...this.activeSnapResult.point };
    ctx.requestRender();
  }

  public onPointerDown(e: PointerEvent, worldPoint: Point2D, ctx: ToolContext): void {
    // Right click cancels/finishes chain
    if (e.button === 2) {
      if (this.status === 'drawing') {
        this.reset();
        ctx.requestRender();
      }
      return;
    }

    // Only accept primary button (Left Click)
    if (e.button !== 0) return;

    const clickPoint = this.activeSnapResult ? this.activeSnapResult.point : worldPoint;

    if (this.status === 'idle') {
      // 1. Begin wall drawing
      this.startPoint = { ...clickPoint };
      this.currentPoint = { ...clickPoint };

      // Record first vertex ID if clicking an existing vertex
      const snapTargetId =
        this.activeSnapResult?.snapType === 'vertex'
          ? (this.activeSnapResult.snappedVertexId ?? this.activeSnapResult.targetId ?? null)
          : null;
      this.firstVertexId = snapTargetId;

      this.status = 'drawing';
      ctx.requestRender();
      return;
    }

    if (this.status === 'drawing') {
      if (!this.startPoint || !this.currentPoint) return;

      const len = distance(this.startPoint, this.currentPoint);
      // Discard accidental double-clicks (< 50mm)
      if (len < 50) return;

      // Commit wall to graph store
      const wall = planStore.getState().addWall(
        this.startPoint,
        this.currentPoint,
        this.defaultThickness
      );

      // Rebuild spatial index with updated graph
      const updatedStore = planStore.getState();
      ctx.spatialIndex.rebuild(updatedStore.vertices, updatedStore.walls);

      // If chain started in empty space, record starting vertex ID from newly created wall
      if (!this.firstVertexId && wall) {
        this.firstVertexId = wall.startId;
      }

      // Check for Loop Closure
      const currentSnapTargetId =
        this.activeSnapResult?.snapType === 'vertex'
          ? (this.activeSnapResult.snappedVertexId ?? this.activeSnapResult.targetId ?? null)
          : null;

      const isLoopClosure =
        this.firstVertexId !== null &&
        currentSnapTargetId !== null &&
        currentSnapTargetId === this.firstVertexId;

      if (isLoopClosure) {
        // Closed loop completed! Cleanly finish chain.
        this.reset();
      } else {
        // Continue chain from the endpoint
        this.startPoint = { ...this.currentPoint };
      }

      ctx.requestRender();
    }
  }

  public onPointerUp(_e: PointerEvent, _worldPoint: Point2D, _ctx: ToolContext): void {
    // No-op for point-and-click wall creation
  }

  public onKeyDown(e: KeyboardEvent, ctx: ToolContext): void {
    if (e.key === 'Escape') {
      this.reset();
      ctx.requestRender();
    }
  }

  public renderOverlay(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    // 1. Render transient snap guides and markers
    if (this.activeSnapResult) {
      OverlayRenderer.renderSnapGuides(ctx, this.activeSnapResult, viewport.zoom);
      OverlayRenderer.renderSnapMarker(ctx, this.activeSnapResult, viewport.zoom);
    }

    // 2. Render live preview of wall being drawn with dimension annotation
    if (this.status === 'drawing' && this.startPoint && this.currentPoint) {
      OverlayRenderer.renderWallPreview(
        ctx,
        this.startPoint,
        this.currentPoint,
        this.defaultThickness,
        viewport.zoom
      );
    }
  }
}
