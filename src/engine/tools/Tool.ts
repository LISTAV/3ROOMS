import type { Point2D } from '../../core/types.js';
import type { Viewport } from '../viewport/Viewport.js';
import type { SnapEngine } from '../../core/snap/SnapEngine.js';
import type { SpatialIndex } from '../../core/spatial/SpatialIndex.js';

export interface ToolContext {
  viewport: Viewport;
  snapEngine: SnapEngine;
  spatialIndex: SpatialIndex;
  requestRender: () => void;
}

export interface Tool {
  readonly id: string;
  onActivate(ctx: ToolContext): void;
  onDeactivate(ctx: ToolContext): void;
  onPointerDown(e: PointerEvent, worldPoint: Point2D, ctx: ToolContext): void;
  onPointerMove(e: PointerEvent, worldPoint: Point2D, ctx: ToolContext): void;
  onPointerUp(e: PointerEvent, worldPoint: Point2D, ctx: ToolContext): void;
  onKeyDown(e: KeyboardEvent, ctx: ToolContext): void;
  renderOverlay(ctx: CanvasRenderingContext2D, viewport: Viewport): void;
}
