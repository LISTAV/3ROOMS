import type { Point2D, RoomFace, Wall } from '../../core/types.js';
import type { Viewport } from '../viewport/Viewport.js';
import type { Tool, ToolContext } from './Tool.js';
import { planStore } from '../../core/store/planStore.js';
import { drawCornerAngleIndicator } from '../renderer/DimensionRenderer.js';
import { projectPointOnSegment } from '../../core/math/line.js';
import { distance } from '../../core/math/vector.js';
import {
  isPointInImageBox,
  isPointInImageRotationHandle,
  getImageCornerHandleHit,
} from '../layers/ImageLayer.js';
import { transformWorldToLocal } from './FurnitureTool.js';
import {
  hitTestGizmo,
  computeTransformResize,
  computeTransformRotate,
  renderTransformGizmo,
  type GizmoHandleType,
  type TransformBounds,
} from '../gizmos/TransformGizmo.js';
import { isPointNearLine, getLineEndpointHit, pointToLineDistance } from '../layers/LineLayer.js';
import { snapTo45DegreeAngle } from './LineTool.js';
import { isPointInPolygon } from '../../core/math/polygon.js';
import { isInputElementActive } from '../input/KeyboardManager.js';

export type SelectedType =
  | 'none'
  | 'furniture'
  | 'opening'
  | 'wall'
  | 'room'
  | 'vertex'
  | 'image'
  | 'line';

export interface HitResult {
  type: SelectedType;
  id: string;
  handle?: string;
}

/**
 * Interactive CAD Selection Tool supporting multi-element hit-testing
 * (furniture with 9-handle Universal Transform Gizmo, parametric drafting lines,
 * reference images, openings, walls, rooms, vertices), drag manipulation, and deletion.
 */
export class SelectTool implements Tool {
  public readonly id: string = 'select';

  public hoveredItem: HitResult | null = null;
  public isDragging: boolean = false;
  public dragStartPoint: Point2D | null = null;
  public dragInitialPositions: Map<string, Point2D> = new Map();

  // Furniture Gizmo manipulation state
  public activeGizmoHandle: GizmoHandleType | null = null;
  public initialFurnitureTransform: TransformBounds | null = null;

  // Image manipulation state
  public activeImageHandle: string | null = null;
  public initialImageTransform: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    aspectRatio: number;
  } | null = null;

  // Line manipulation state
  public activeLineHandle: 'start' | 'end' | 'body' | null = null;
  public initialLineCoords: { start: Point2D; end: Point2D } | null = null;

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
    this.activeGizmoHandle = null;
    this.initialFurnitureTransform = null;
    this.activeImageHandle = null;
    this.initialImageTransform = null;
    this.activeLineHandle = null;
    this.initialLineCoords = null;
    this.hoveredItem = null;
  }

  public hitTest(point: Point2D, toleranceMm: number = 20): HitResult | null {
    const state = planStore.getState();
    const layers = state.layers;

    const isSelectable = (layerId: string | undefined, defaultLayerId: string): boolean => {
      if (!layers) return true;
      const effectiveId = layerId || defaultLayerId;
      const layer = layers[effectiveId];
      if (!layer) return true;
      return layer.visible && !layer.locked;
    };

    // 0. Test handles of currently selected furniture with highest priority (Universal Gizmo)
    if (state.selectedFurnitureId) {
      const selFurn = state.furniture[state.selectedFurnitureId];
      if (selFurn && isSelectable(selFurn.layerId, 'layer-furniture')) {
        const gizmoHit = hitTestGizmo(
          point,
          {
            x: selFurn.x,
            y: selFurn.y,
            width: selFurn.width,
            height: selFurn.height,
            rotation: selFurn.rotation,
          },
          350,
          toleranceMm + 15
        );
        if (gizmoHit && gizmoHit !== 'body') {
          return { type: 'furniture', id: selFurn.id, handle: gizmoHit };
        }
      }
    }

    // 1. Test handles of currently selected image with high priority
    if (state.selectedImageId) {
      const selImg = state.images?.[state.selectedImageId];
      if (selImg && !selImg.locked && isSelectable(selImg.layerId, 'layer-rooms')) {
        if (isPointInImageRotationHandle(point, selImg)) {
          return { type: 'image', id: selImg.id, handle: 'rotate' };
        }
        const cornerHit = getImageCornerHandleHit(point, selImg);
        if (cornerHit !== -1) {
          return { type: 'image', id: selImg.id, handle: `corner-${cornerHit}` };
        }
      }
    }

    // 2. Test endpoint handles of currently selected line
    if (state.selectedLineId) {
      const selLine = state.lines?.[state.selectedLineId];
      if (selLine && isSelectable(selLine.layerId, 'layer-dimensions')) {
        const endpointHit = getLineEndpointHit(point, selLine, toleranceMm + 15);
        if (endpointHit) {
          return { type: 'line', id: selLine.id, handle: endpointHit };
        }
      }
    }

    const layerOrder = state.layerOrder || ['layer-rooms', 'layer-walls', 'layer-furniture', 'layer-dimensions'];
    const activeLayerId = state.activeLayerId;

    const getLayerIndex = (layerId: string | undefined, defaultLayerId: string): number => {
      const id = layerId || defaultLayerId;
      const idx = layerOrder.indexOf(id);
      return idx >= 0 ? idx : 0;
    };

    const isLayerActive = (layerId: string | undefined, defaultLayerId: string): boolean => {
      const id = layerId || defaultLayerId;
      return id === activeLayerId;
    };

    const isCurrentlySelected = (type: SelectedType, id: string): boolean => {
      if (type === 'furniture' && state.selectedFurnitureId === id) return true;
      if (type === 'image' && state.selectedImageId === id) return true;
      if (type === 'line' && state.selectedLineId === id) return true;
      if (state.selectedIds.includes(id)) return true;
      return false;
    };

    interface HitCandidate {
      hit: HitResult;
      layerIndex: number;
      isActiveLayer: boolean;
      isAlreadySelected: boolean;
      distance: number;
      priority: number; // 5: Furniture, 4: Lines, 3: Openings, 2.5: Vertices, 2: Walls, 1: Rooms, 0: Images
    }

    const candidates: HitCandidate[] = [];

    // 3. Furniture (from topmost z-index to bottom)
    const sortedFurniture = Object.values(state.furniture).sort(
      (a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0)
    );
    for (const furn of sortedFurniture) {
      if (!isSelectable(furn.layerId, 'layer-furniture')) continue;
      const hitHandle = hitTestGizmo(
        point,
        {
          x: furn.x,
          y: furn.y,
          width: furn.width,
          height: furn.height,
          rotation: furn.rotation,
        },
        350,
        toleranceMm
      );
      if (hitHandle) {
        const d = distance(point, { x: furn.x, y: furn.y });
        candidates.push({
          hit: { type: 'furniture', id: furn.id, handle: hitHandle },
          layerIndex: getLayerIndex(furn.layerId, 'layer-furniture'),
          isActiveLayer: isLayerActive(furn.layerId, 'layer-furniture'),
          isAlreadySelected: isCurrentlySelected('furniture', furn.id),
          distance: d,
          priority: 5,
        });
      }
    }

    // 4. Parametric Drafting Lines
    const lines = Object.values(state.lines || {});
    for (const line of lines) {
      if (!isSelectable(line.layerId, 'layer-dimensions')) continue;
      if (isPointNearLine(point, line, toleranceMm)) {
        const d = pointToLineDistance(point, line.start, line.end);
        candidates.push({
          hit: { type: 'line', id: line.id, handle: 'body' },
          layerIndex: getLayerIndex(line.layerId, 'layer-dimensions'),
          isActiveLayer: isLayerActive(line.layerId, 'layer-dimensions'),
          isAlreadySelected: isCurrentlySelected('line', line.id),
          distance: d,
          priority: 4,
        });
      }
    }

    // 5. Openings (doors and windows)
    for (const op of Object.values(state.openings)) {
      if (!isSelectable(op.layerId, 'layer-walls')) continue;
      const wall = state.walls[op.wallId];
      if (!wall || !isSelectable(wall.layerId, 'layer-walls')) continue;
      const startV = state.vertices[wall.startId];
      const endV = state.vertices[wall.endId];
      if (!startV || !endV) continue;

      const opCenterX = startV.x + (endV.x - startV.x) * op.offsetRatio;
      const opCenterY = startV.y + (endV.y - startV.y) * op.offsetRatio;
      const d = distance(point, { x: opCenterX, y: opCenterY });
      if (d <= op.width / 2 + toleranceMm) {
        candidates.push({
          hit: { type: 'opening', id: op.id },
          layerIndex: getLayerIndex(op.layerId || wall.layerId, 'layer-walls'),
          isActiveLayer: isLayerActive(op.layerId || wall.layerId, 'layer-walls'),
          isAlreadySelected: isCurrentlySelected('opening', op.id),
          distance: d,
          priority: 3,
        });
      }
    }

    // 6. Vertices
    for (const v of Object.values(state.vertices)) {
      const connectedWalls = Object.values(state.walls).filter(
        (w) => w.startId === v.id || w.endId === v.id
      );
      if (
        connectedWalls.length > 0 &&
        !connectedWalls.some((w) => isSelectable(w.layerId, 'layer-walls'))
      ) {
        continue;
      }
      const d = distance(point, v);
      if (d <= toleranceMm + 10) {
        const topWall = connectedWalls[0];
        candidates.push({
          hit: { type: 'vertex', id: v.id },
          layerIndex: getLayerIndex(topWall?.layerId, 'layer-walls'),
          isActiveLayer: isLayerActive(topWall?.layerId, 'layer-walls'),
          isAlreadySelected: isCurrentlySelected('vertex', v.id),
          distance: d,
          priority: 2.5,
        });
      }
    }

    // 7. Walls
    for (const wall of Object.values(state.walls)) {
      if (!isSelectable(wall.layerId, 'layer-walls')) continue;
      const startV = state.vertices[wall.startId];
      const endV = state.vertices[wall.endId];
      if (!startV || !endV) continue;

      const proj = projectPointOnSegment(point, startV, endV);
      const hitRadius = wall.thickness / 2 + toleranceMm;
      if (proj.distance <= hitRadius) {
        candidates.push({
          hit: { type: 'wall', id: wall.id },
          layerIndex: getLayerIndex(wall.layerId, 'layer-walls'),
          isActiveLayer: isLayerActive(wall.layerId, 'layer-walls'),
          isAlreadySelected: isCurrentlySelected('wall', wall.id),
          distance: proj.distance,
          priority: 2,
        });
      }
    }

    // 8. Rooms (closed planar regions)
    for (const room of Object.values(state.rooms)) {
      if (!isSelectable(room.layerId, 'layer-rooms')) continue;
      const pts = this.getRoomPoints(room, state.vertices);
      if (pts.length >= 3 && isPointInPolygon(point, pts)) {
        candidates.push({
          hit: { type: 'room', id: room.id },
          layerIndex: getLayerIndex(room.layerId, 'layer-rooms'),
          isActiveLayer: isLayerActive(room.layerId, 'layer-rooms'),
          isAlreadySelected: isCurrentlySelected('room', room.id),
          distance: 100,
          priority: 1,
        });
      }
    }

    // 9. Reference / Underlay Images (unlocked and on visible/unlocked layers)
    const sortedImages = Object.values(state.images || {}).sort(
      (a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0)
    );
    for (const img of sortedImages) {
      if (img.locked) continue; // Locked images ignore selection clicks
      if (!isSelectable(img.layerId, 'layer-rooms')) continue;
      if (isPointInImageBox(point, img, toleranceMm)) {
        const d = distance(point, { x: img.x, y: img.y });
        candidates.push({
          hit: { type: 'image', id: img.id, handle: 'body' },
          layerIndex: getLayerIndex(img.layerId, 'layer-rooms'),
          isActiveLayer: isLayerActive(img.layerId, 'layer-rooms'),
          isAlreadySelected: isCurrentlySelected('image', img.id),
          distance: d,
          priority: 0,
        });
      }
    }

    if (candidates.length === 0) return null;

    // Check if one candidate is already selected and others are not (cycle overlapping selection)
    const hasAlreadySelected = candidates.some((c) => c.isAlreadySelected);
    const hasUnselected = candidates.some((c) => !c.isAlreadySelected);

    candidates.sort((a, b) => {
      // If user clicks on an overlapping spot where an item is ALREADY selected:
      // cycle to the unselected item underneath on subsequent click!
      if (hasAlreadySelected && hasUnselected) {
        if (a.isAlreadySelected !== b.isAlreadySelected) {
          return a.isAlreadySelected ? 1 : -1;
        }
      }

      // 1. Active layer gets top priority: if user is working on activeLayerId, select its object first!
      if (a.isActiveLayer !== b.isActiveLayer) {
        return a.isActiveLayer ? -1 : 1;
      }

      // 2. Layer stacking order: higher layer index (drawn on top) beats lower layer index (drawn underneath)
      if (a.layerIndex !== b.layerIndex) {
        return b.layerIndex - a.layerIndex;
      }

      // 3. Entity priority (Furniture > Lines > Openings > Vertices > Walls > Rooms > Images)
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }

      // 4. Closer distance to cursor
      return a.distance - b.distance;
    });

    return candidates[0].hit;
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
        const f = store.furniture[hit.id];
        if (f) {
          this.activeGizmoHandle = (hit.handle as GizmoHandleType) || 'body';
          this.initialFurnitureTransform = {
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            rotation: f.rotation,
            aspectRatio: f.width / Math.max(1, f.height),
          };
          this.dragInitialPositions.set(f.id, { x: f.x, y: f.y });
        }
      } else if (hit.type === 'line') {
        store.selectLine(hit.id);
        const l = store.lines?.[hit.id];
        if (l) {
          this.activeLineHandle = (hit.handle as 'start' | 'end' | 'body') || 'body';
          this.initialLineCoords = {
            start: { ...l.start },
            end: { ...l.end },
          };
        }
      } else if (hit.type === 'image') {
        store.selectImage(hit.id);
        this.activeImageHandle = hit.handle || 'body';
        const img = store.images?.[hit.id];
        if (img) {
          this.initialImageTransform = {
            x: img.x,
            y: img.y,
            width: img.width,
            height: img.height,
            rotation: img.rotation,
            aspectRatio: img.aspectRatio || img.width / (img.height || 1),
          };
        }
      } else {
        store.setSelectedIds([hit.id]);
      }

      this.isDragging = true;
      this.dragStartPoint = { ...worldPoint };
      this.dragInitialPositions.clear();

      if (hit.type === 'vertex') {
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
      store.selectImage(null);
      store.selectLine(null);
      this.reset();
    }

    ctx.requestRender();
  }

  public onPointerMove(e: PointerEvent, worldPoint: Point2D, ctx: ToolContext): void {
    const store = planStore.getState();

    // Handle dragging
    if (this.isDragging && this.dragStartPoint) {
      const dx = worldPoint.x - this.dragStartPoint.x;
      const dy = worldPoint.y - this.dragStartPoint.y;

      // 1. Dragging furniture with Universal Transform Gizmo
      const selFurnId = store.selectedFurnitureId;
      if (selFurnId && this.initialFurnitureTransform) {
        const init = this.initialFurnitureTransform;
        const furn = store.furniture[selFurnId];
        if (!furn) return;

        if (this.activeGizmoHandle === 'rotate') {
          // Snap angle in 15° increments if Shift is held
          const snapAngle = e.shiftKey ? Math.PI / 12 : undefined;
          const angle = computeTransformRotate(
            worldPoint,
            { x: init.x, y: init.y },
            snapAngle
          );
          store.updateFurnitureTransform(selFurnId, { rotation: angle });
          ctx.requestRender();
          return;
        } else if (this.activeGizmoHandle && this.activeGizmoHandle !== 'body') {
          // 8-point scaling
          const newSize = computeTransformResize(
            this.activeGizmoHandle,
            worldPoint,
            init,
            e.shiftKey || !!furn.aspectRatioLocked
          );
          store.updateFurnitureTransform(selFurnId, {
            width: newSize.width,
            height: newSize.height,
          });
          ctx.requestRender();
          return;
        } else if (this.activeGizmoHandle === 'body') {
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
      }

      // 2. Dragging parametric drafting line (endpoints or body)
      const selLineId = store.selectedLineId;
      if (selLineId && this.initialLineCoords) {
        const init = this.initialLineCoords;
        const line = store.lines?.[selLineId];
        if (!line) return;

        if (this.activeLineHandle === 'start') {
          const snapRes = ctx.snapEngine.resolveSnap(
            { cursorWorld: worldPoint, zoom: ctx.viewport.zoom },
            store.vertices,
            store.walls
          );
          let target = snapRes.point;
          if (e.shiftKey) target = snapTo45DegreeAngle(init.end, target);
          store.updateLine(selLineId, { start: target });
          ctx.requestRender();
          return;
        } else if (this.activeLineHandle === 'end') {
          const snapRes = ctx.snapEngine.resolveSnap(
            { cursorWorld: worldPoint, zoom: ctx.viewport.zoom },
            store.vertices,
            store.walls
          );
          let target = snapRes.point;
          if (e.shiftKey) target = snapTo45DegreeAngle(init.start, target);
          store.updateLine(selLineId, { end: target });
          ctx.requestRender();
          return;
        } else if (this.activeLineHandle === 'body') {
          let sx = init.start.x + dx;
          let sy = init.start.y + dy;
          let ex = init.end.x + dx;
          let ey = init.end.y + dy;
          if (ctx.snapEngine.gridSnapEnabled && ctx.snapEngine.gridSpacingMm > 0) {
            sx = Math.round(sx / ctx.snapEngine.gridSpacingMm) * ctx.snapEngine.gridSpacingMm;
            sy = Math.round(sy / ctx.snapEngine.gridSpacingMm) * ctx.snapEngine.gridSpacingMm;
            ex = Math.round(ex / ctx.snapEngine.gridSpacingMm) * ctx.snapEngine.gridSpacingMm;
            ey = Math.round(ey / ctx.snapEngine.gridSpacingMm) * ctx.snapEngine.gridSpacingMm;
          }
          store.updateLine(selLineId, {
            start: { x: sx, y: sy },
            end: { x: ex, y: ey },
          });
          ctx.requestRender();
          return;
        }
      }

      // 3. Dragging selected image (move, rotate, scale)
      const selImgId = store.selectedImageId;
      if (selImgId && this.initialImageTransform) {
        const init = this.initialImageTransform;
        const img = store.images?.[selImgId];
        if (!img || img.locked) return;

        if (this.activeImageHandle === 'body') {
          let nx = init.x + dx;
          let ny = init.y + dy;
          if (ctx.snapEngine.gridSnapEnabled && ctx.snapEngine.gridSpacingMm > 0) {
            nx = Math.round(nx / ctx.snapEngine.gridSpacingMm) * ctx.snapEngine.gridSpacingMm;
            ny = Math.round(ny / ctx.snapEngine.gridSpacingMm) * ctx.snapEngine.gridSpacingMm;
          }
          store.updateImage(selImgId, { x: nx, y: ny });
          ctx.requestRender();
          return;
        } else if (this.activeImageHandle === 'rotate') {
          const angle = Math.atan2(worldPoint.y - init.y, worldPoint.x - init.x) + Math.PI / 2;
          store.updateImage(selImgId, { rotation: angle });
          ctx.requestRender();
          return;
        } else if (this.activeImageHandle?.startsWith('corner-')) {
          const localPt = transformWorldToLocal(
            worldPoint,
            { x: init.x, y: init.y },
            init.rotation
          );
          let newW = Math.max(100, Math.abs(localPt.x) * 2);
          let newH = newW / (init.aspectRatio || 1);
          store.updateImage(selImgId, { width: newW, height: newH });
          ctx.requestRender();
          return;
        }
      }

      // 4. Dragging vertex or wall
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
    this.activeGizmoHandle = null;
    this.initialFurnitureTransform = null;
    this.activeImageHandle = null;
    this.initialImageTransform = null;
    this.activeLineHandle = null;
    this.initialLineCoords = null;
  }

  public onKeyDown(e: KeyboardEvent, ctx: ToolContext): void {
    if (isInputElementActive()) return;
    const store = planStore.getState();

    // Delete or Backspace
    if (e.code === 'Delete' || e.code === 'Backspace') {
      if (store.selectedLineId) {
        store.deleteLine(store.selectedLineId);
        ctx.requestRender();
        e.preventDefault();
        return;
      }

      if (store.selectedImageId) {
        store.deleteImage(store.selectedImageId);
        ctx.requestRender();
        e.preventDefault();
        return;
      }

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
      store.selectImage(null);
      store.selectLine(null);
      this.reset();
      ctx.requestRender();
    }
  }

  public renderOverlay(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const state = planStore.getState();

    // 1. Render Universal Transform Gizmo for selected furniture item
    if (state.selectedFurnitureId) {
      const furn = state.furniture[state.selectedFurnitureId];
      if (furn) {
        renderTransformGizmo(
          ctx,
          {
            x: furn.x,
            y: furn.y,
            width: furn.width,
            height: furn.height,
            rotation: furn.rotation,
          },
          viewport,
          this.isDragging && this.activeGizmoHandle === 'rotate',
          this.activeGizmoHandle
        );
      }
    }

    // 2. Render Hover Outline
    if (!this.hoveredItem) return;

    const zoom = viewport.zoom;
    const screenPixel = 1 / zoom;

    // Don't outline if already selected
    if (
      this.hoveredItem.id === state.selectedFurnitureId ||
      this.hoveredItem.id === state.selectedImageId ||
      this.hoveredItem.id === state.selectedLineId ||
      state.selectedIds.includes(this.hoveredItem.id)
    ) {
      return;
    }

    ctx.save();
    ctx.strokeStyle = '#38bdf8'; // sky-400
    ctx.lineWidth = 2 * screenPixel;
    ctx.setLineDash([4 * screenPixel, 4 * screenPixel]);

    if (this.hoveredItem.type === 'line') {
      const line = state.lines?.[this.hoveredItem.id];
      if (line) {
        ctx.beginPath();
        ctx.moveTo(line.start.x, line.start.y);
        ctx.lineTo(line.end.x, line.end.y);
        ctx.stroke();
      }
    } else if (this.hoveredItem.type === 'wall') {
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

    // 3. Render Corner Angle Reference for Selected Walls and Vertices
    if (state.selectedIds && state.selectedIds.length > 0) {
      const selectedWalls = state.selectedIds
        .map((id) => state.walls[id])
        .filter((w): w is Wall => Boolean(w));

      for (const wall of selectedWalls) {
        for (const vId of [wall.startId, wall.endId]) {
          const cornerV = state.vertices[vId];
          if (!cornerV) continue;
          const otherWalls = Object.values(state.walls).filter(
            (w) => w.id !== wall.id && (w.startId === vId || w.endId === vId)
          );
          for (const ow of otherWalls) {
            const p1Id = wall.startId === vId ? wall.endId : wall.startId;
            const p2Id = ow.startId === vId ? ow.endId : ow.startId;
            const p1 = state.vertices[p1Id];
            const p2 = state.vertices[p2Id];
            if (p1 && p2) {
              drawCornerAngleIndicator(ctx, p1, cornerV, p2, viewport.zoom, true);
            }
          }
        }
      }
    }
  }
}
