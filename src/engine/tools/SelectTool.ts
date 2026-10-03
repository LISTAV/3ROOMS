import type { Point2D, RoomFace } from '../../core/types.js';
import type { Viewport } from '../viewport/Viewport.js';
import type { Tool, ToolContext } from './Tool.js';
import { planStore } from '../../core/store/planStore.js';
import { projectPointOnSegment } from '../../core/math/line.js';
import { distance } from '../../core/math/vector.js';
import { isPointInFurnitureBox } from './FurnitureTool.js';

import { isPointInPolygon } from '../../core/math/polygon.js';

export type SelectedType = 'none' | 'furniture' | 'opening' | 'wall' | 'room' | 'vertex';

export interface HitResult {
  type: SelectedType;
  id: string;
}

/**
 * Interactive CAD Selection Tool supporting multi-element hit-testing
 * (furniture, openings, walls, rooms, vertices), drag translation, and deletion.
 */
export class SelectTool implements Tool {
  public readonly id: string = 'select';

  public hoveredItem: HitResult | null = null;
  public isDragging: boolean = false;
  public dragStartPoint: Point2D | null = null;
  public dragInitialPositions: Map<string, Point2D> = new Map();

  public onActivate(_ctx: ToolContext): void {
    this.reset();
  }

  public onDeactivate(_ctx: ToolContext): void {
    this.reset();
  }

  public reset(): void {
    this.isDragging = false;
    this.dragStartPoint = null;
    this.dragInitialPositions.clear();
    this.hoveredItem = null;
  }

  public hitTest(point: Point2D, toleranceMm: number = 20): HitResult | null {
    const state = planStore.getState();

    // 1. Furniture (from topmost z-index to bottom)
    const sortedFurniture = Object.values(state.furniture).sort(
      (a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0)
    );
    for (const furn of sortedFurniture) {
      if (isPointInFurnitureBox(point, furn, toleranceMm)) {
        return { type: 'furniture', id: furn.id };
      }
    }

    // 2. Openings (doors and windows)
    for (const op of Object.values(state.openings)) {
      const wall = state.walls[op.wallId];
      if (!wall) continue;
      const startV = state.vertices[wall.startId];
      const endV = state.vertices[wall.endId];
      if (!startV || !endV) continue;

      const opCenterX = startV.x + (endV.x - startV.x) * op.offsetRatio;
      const opCenterY = startV.y + (endV.y - startV.y) * op.offsetRatio;
      if (distance(point, { x: opCenterX, y: opCenterY }) <= op.width / 2 + toleranceMm) {
        return { type: 'opening', id: op.id };
      }
    }

    // 3. Vertices
    for (const v of Object.values(state.vertices)) {
      if (distance(point, v) <= toleranceMm + 10) {
        return { type: 'vertex', id: v.id };
      }
    }

    // 4. Walls
    for (const wall of Object.values(state.walls)) {
      const startV = state.vertices[wall.startId];
      const endV = state.vertices[wall.endId];
      if (!startV || !endV) continue;

      const proj = projectPointOnSegment(point, startV, endV);
      const hitRadius = wall.thickness / 2 + toleranceMm;
      if (proj.distance <= hitRadius) {
        return { type: 'wall', id: wall.id };
      }
    }

    // 5. Rooms (closed planar regions)
    for (const room of Object.values(state.rooms)) {
      const pts = this.getRoomPoints(room, state.vertices);
      if (pts.length >= 3 && isPointInPolygon(point, pts)) {
        return { type: 'room', id: room.id };
      }
    }

    return null;
  }

  private getRoomPoints(room: RoomFace, vertices: Record<string, Point2D>): Point2D[] {
    if (room.points && room.points.length >= 3) {
      return room.points;
    }
    const pts: Point2D[] = [];
    for (const vId of room.vertexIds) {
      const v = vertices[vId];
      if (v) pts.push({ x: v.x, y: v.y });
    }
    return pts;
  }

  public onPointerDown(e: PointerEvent, worldPoint: Point2D, ctx: ToolContext): void {
    if (e.button !== 0) return; // Left click only

    const tolerance = Math.max(15, 8 / ctx.viewport.zoom);
    const hit = this.hitTest(worldPoint, tolerance);
    const store = planStore.getState();

    if (hit) {
      if (hit.type === 'furniture') {
        store.selectFurniture(hit.id);
      } else {
        store.setSelectedIds([hit.id]);
      }

      this.isDragging = true;
      this.dragStartPoint = { ...worldPoint };
      this.dragInitialPositions.clear();

      // Record start position for dragging
      if (hit.type === 'furniture') {
        const f = store.furniture[hit.id];
        if (f) this.dragInitialPositions.set(f.id, { x: f.x, y: f.y });
      } else if (hit.type === 'vertex') {
        const v = store.vertices[hit.id];
        if (v) this.dragInitialPositions.set(v.id, { x: v.x, y: v.y });
      } else if (hit.type === 'wall') {
        const w = store.walls[hit.id];
        if (w) {
          const sv = store.vertices[w.startId];
          const ev = store.vertices[w.endId];
          if (sv) this.dragInitialPositions.set(sv.id, { x: sv.x, y: sv.y });
          if (ev) this.dragInitialPositions.set(ev.id, { x: ev.x, y: ev.y });
        }
      }
    } else {
      store.setSelectedIds([]);
      store.selectFurniture(null);
      this.reset();
    }

    ctx.requestRender();
  }

  public onPointerMove(_e: PointerEvent, worldPoint: Point2D, ctx: ToolContext): void {
    const store = planStore.getState();

    // Handle dragging
    if (this.isDragging && this.dragStartPoint) {
      const dx = worldPoint.x - this.dragStartPoint.x;
      const dy = worldPoint.y - this.dragStartPoint.y;

      const selFurnId = store.selectedFurnitureId;
      if (selFurnId && this.dragInitialPositions.has(selFurnId)) {
        const init = this.dragInitialPositions.get(selFurnId)!;
        let nx = init.x + dx;
        let ny = init.y + dy;

        if (ctx.snapEngine.gridSnapEnabled && ctx.snapEngine.gridSpacingMm > 0) {
          nx = Math.round(nx / ctx.snapEngine.gridSpacingMm) * ctx.snapEngine.gridSpacingMm;
          ny = Math.round(ny / ctx.snapEngine.gridSpacingMm) * ctx.snapEngine.gridSpacingMm;
        }

        store.updateFurnitureTransform(selFurnId, { x: nx, y: ny });
        ctx.requestRender();
        return;
      }

      // Dragging vertex or wall
      for (const [vId, initPos] of this.dragInitialPositions.entries()) {
        let nx = initPos.x + dx;
        let ny = initPos.y + dy;

        if (ctx.snapEngine.gridSnapEnabled && ctx.snapEngine.gridSpacingMm > 0) {
          nx = Math.round(nx / ctx.snapEngine.gridSpacingMm) * ctx.snapEngine.gridSpacingMm;
          ny = Math.round(ny / ctx.snapEngine.gridSpacingMm) * ctx.snapEngine.gridSpacingMm;
        }

        store.moveVertex(vId, { x: nx, y: ny });
      }

      ctx.requestRender();
      return;
    }

    // Hover detection
    const tolerance = Math.max(15, 8 / ctx.viewport.zoom);
    const prevHover = this.hoveredItem?.id;
    this.hoveredItem = this.hitTest(worldPoint, tolerance);

    if (prevHover !== this.hoveredItem?.id) {
      ctx.requestRender();
    }
  }

  public onPointerUp(_e: PointerEvent, _worldPoint: Point2D, _ctx: ToolContext): void {
    this.isDragging = false;
    this.dragStartPoint = null;
    this.dragInitialPositions.clear();
  }

  public onKeyDown(e: KeyboardEvent, ctx: ToolContext): void {
    const store = planStore.getState();

    // Delete or Backspace
    if (e.code === 'Delete' || e.code === 'Backspace') {
      if (store.selectedFurnitureId) {
        store.deleteFurniture(store.selectedFurnitureId);
        ctx.requestRender();
        e.preventDefault();
        return;
      }

      if (store.selectedIds.length > 0) {
        store.deleteElements(store.selectedIds);
        ctx.requestRender();
        e.preventDefault();
        return;
      }
    }

    // Escape clears selection
    if (e.code === 'Escape') {
      store.setSelectedIds([]);
      store.selectFurniture(null);
      this.reset();
      ctx.requestRender();
    }
  }

  public renderOverlay(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    if (!this.hoveredItem) return;

    const zoom = viewport.zoom;
    const screenPixel = 1 / zoom;
    const state = planStore.getState();

    // Don't outline if already selected
    if (
      this.hoveredItem.id === state.selectedFurnitureId ||
      state.selectedIds.includes(this.hoveredItem.id)
    ) {
      return;
    }

    ctx.save();
    ctx.strokeStyle = '#38bdf8'; // sky-400
    ctx.lineWidth = 2 * screenPixel;
    ctx.setLineDash([4 * screenPixel, 4 * screenPixel]);

    if (this.hoveredItem.type === 'wall') {
      const wall = state.walls[this.hoveredItem.id];
      if (wall) {
        const sv = state.vertices[wall.startId];
        const ev = state.vertices[wall.endId];
        if (sv && ev) {
          ctx.beginPath();
          ctx.moveTo(sv.x, sv.y);
          ctx.lineTo(ev.x, ev.y);
          ctx.stroke();
        }
      }
    } else if (this.hoveredItem.type === 'vertex') {
      const v = state.vertices[this.hoveredItem.id];
      if (v) {
        ctx.beginPath();
        ctx.arc(v.x, v.y, 8 * screenPixel, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}
