import type { Point2D, FurnitureInstance } from '../../core/types.js';
import type { Viewport } from '../viewport/Viewport.js';
import type { Tool, ToolContext } from './Tool.js';
import { planStore } from '../../core/store/planStore.js';
import { assetManager } from '../../core/assets/AssetManager.js';
import { distance } from '../../core/math/vector.js';
import { formatLength } from '../../core/units/unitFormatter.js';
import { uiStore } from '../../core/store/uiStore.js';

export const STALK_LENGTH_MM = 300;

/**
 * Transforms a point from world coordinates into local object space
 * centered at C with rotation theta: P_local = R(-theta) * (P - C).
 */
export function transformWorldToLocal(
  point: Point2D,
  center: Point2D,
  rotation: number
): Point2D {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  return {
    x: dx * cos + dy * sin,
    y: -dx * sin + dy * cos,
  };
}

/**
 * Transforms a point from local object space into world coordinates:
 * P_world = C + R(theta) * P_local.
 */
export function transformLocalToWorld(
  localPoint: Point2D,
  center: Point2D,
  rotation: number
): Point2D {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  return {
    x: center.x + localPoint.x * cos - localPoint.y * sin,
    y: center.y + localPoint.x * sin + localPoint.y * cos,
  };
}

/**
 * Hit-tests whether a world point lies inside an oriented furniture item's bounding box.
 */
export function isPointInFurnitureBox(
  point: Point2D,
  instance: FurnitureInstance,
  toleranceMm: number = 0
): boolean {
  const local = transformWorldToLocal(point, { x: instance.x, y: instance.y }, instance.rotation);
  const halfW = instance.width / 2 + toleranceMm;
  const halfH = instance.height / 2 + toleranceMm;

  return Math.abs(local.x) <= halfW && Math.abs(local.y) <= halfH;
}

/**
 * Hit-tests whether a world point is touching the rotation handle offset above the item.
 */
export function isPointInRotationHandle(
  point: Point2D,
  instance: FurnitureInstance,
  stalkLengthMm: number = STALK_LENGTH_MM,
  handleRadiusMm: number = 30
): boolean {
  const local = transformWorldToLocal(point, { x: instance.x, y: instance.y }, instance.rotation);
  const handleLocal: Point2D = {
    x: 0,
    y: -instance.height / 2 - stalkLengthMm,
  };

  return distance(local, handleLocal) <= handleRadiusMm;
}

/**
 * Hit-tests whether a world point touches one of the 4 corner resize handles.
 * Returns corner index: 0 = TL, 1 = TR, 2 = BR, 3 = BL, or -1 if none.
 */
export function getCornerHandleHit(
  point: Point2D,
  instance: FurnitureInstance,
  handleHitRadiusMm: number = 30
): number {
  const local = transformWorldToLocal(point, { x: instance.x, y: instance.y }, instance.rotation);
  const halfW = instance.width / 2;
  const halfH = instance.height / 2;

  const corners: Point2D[] = [
    { x: -halfW, y: -halfH }, // 0: Top-Left
    { x: halfW, y: -halfH },  // 1: Top-Right
    { x: halfW, y: halfH },   // 2: Bottom-Right
    { x: -halfW, y: halfH },  // 3: Bottom-Left
  ];

  for (let i = 0; i < corners.length; i++) {
    if (distance(local, corners[i]) <= handleHitRadiusMm) {
      return i;
    }
  }

  return -1;
}

export type FurnitureToolMode = 'select' | 'place';
export type FurnitureDragMode = 'none' | 'move' | 'rotate' | 'scale';

export interface FurnitureToolOptions {
  mode?: FurnitureToolMode;
  placingDefId?: string | null;
}

/**
 * Interactive tool managing furniture asset placement, selection, translation,
 * scale gizmo, and rotation handle dragging.
 */
export class FurnitureTool implements Tool {
  public readonly id: string = 'furniture';

  public mode: FurnitureToolMode = 'select';
  public placingDefId: string | null = null;
  public cursorWorld: Point2D = { x: 0, y: 0 };

  // Drag interaction state
  public dragMode: FurnitureDragMode = 'none';
  public activeInstanceId: string | null = null;
  public dragStartPointer: Point2D | null = null;
  public initialTransform: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  } | null = null;
  public activeCorner: number = -1;

  constructor(options: FurnitureToolOptions = {}) {
    this.mode = options.mode ?? 'select';
    this.placingDefId = options.placingDefId ?? null;
  }

  /**
   * Sets the tool into placement mode for a specific furniture definition.
   */
  public startPlacement(defId: string, ctx?: ToolContext): void {
    this.mode = 'place';
    this.placingDefId = defId;
    this.dragMode = 'none';
    this.activeInstanceId = null;
    ctx?.requestRender();
  }

  public onActivate(_ctx: ToolContext): void {
    this.reset();
  }

  public onDeactivate(_ctx: ToolContext): void {
    this.reset();
  }

  public reset(): void {
    this.dragMode = 'none';
    this.activeInstanceId = null;
    this.dragStartPointer = null;
    this.initialTransform = null;
    this.activeCorner = -1;
  }

  public onPointerMove(e: PointerEvent, worldPoint: Point2D, ctx: ToolContext): void {
    this.cursorWorld = { ...worldPoint };

    // 1. Placement Preview Mode
    if (this.mode === 'place') {
      ctx.requestRender();
      return;
    }

    // 2. Translation Dragging
    if (this.dragMode === 'move' && this.activeInstanceId && this.initialTransform && this.dragStartPointer) {
      const dx = worldPoint.x - this.dragStartPointer.x;
      const dy = worldPoint.y - this.dragStartPointer.y;

      let newX = this.initialTransform.x + dx;
      let newY = this.initialTransform.y + dy;

      if (ctx.snapEngine.gridSnapEnabled && ctx.snapEngine.gridSpacingMm > 0) {
        newX = Math.round(newX / ctx.snapEngine.gridSpacingMm) * ctx.snapEngine.gridSpacingMm;
        newY = Math.round(newY / ctx.snapEngine.gridSpacingMm) * ctx.snapEngine.gridSpacingMm;
      }

      planStore.getState().updateFurnitureTransform(this.activeInstanceId, { x: newX, y: newY });
      ctx.requestRender();
      return;
    }

    // 3. Rotation Dragging
    if (this.dragMode === 'rotate' && this.activeInstanceId && this.initialTransform) {
      const cx = this.initialTransform.x;
      const cy = this.initialTransform.y;

      let theta = Math.atan2(worldPoint.y - cy, worldPoint.x - cx) + Math.PI / 2;

      // Shift snapping (15° increments)
      if (e.shiftKey) {
        const deg = (theta * 180) / Math.PI;
        const snappedDeg = Math.round(deg / 15) * 15;
        theta = (snappedDeg * Math.PI) / 180;
      }

      planStore.getState().updateFurnitureTransform(this.activeInstanceId, { rotation: theta });
      ctx.requestRender();
      return;
    }

    // 4. Proportional Corner Scaling
    if (this.dragMode === 'scale' && this.activeInstanceId && this.initialTransform) {
      const local = transformWorldToLocal(
        worldPoint,
        { x: this.initialTransform.x, y: this.initialTransform.y },
        this.initialTransform.rotation
      );

      const newWidth = Math.max(200, Math.abs(local.x) * 2);
      const aspect = this.initialTransform.height / this.initialTransform.width;
      const newHeight = Math.max(200, newWidth * aspect);

      planStore.getState().updateFurnitureTransform(this.activeInstanceId, {
        width: Math.round(newWidth),
        height: Math.round(newHeight),
      });
      ctx.requestRender();
    }
  }

  public onPointerDown(e: PointerEvent, worldPoint: Point2D, ctx: ToolContext): void {
    // Right click cancels placement
    if (e.button === 2) {
      if (this.mode === 'place') {
        this.mode = 'select';
        this.placingDefId = null;
        ctx.requestRender();
      }
      return;
    }

    if (e.button !== 0) return; // Left click only

    const store = planStore.getState();
    const zoom = ctx.viewport.zoom;
    const handleHitRadius = Math.max(25, 14 / zoom);

    // 1. If currently in placement mode, anchor new instance
    if (this.mode === 'place' && this.placingDefId) {
      const newInst = store.addFurniture(this.placingDefId, worldPoint);
      store.selectFurniture(newInst.id);
      this.mode = 'select';
      this.placingDefId = null;
      ctx.requestRender();
      return;
    }

    // 2. If an item is already selected, hit-test gizmo handles first
    const selectedId = store.selectedFurnitureId;
    if (selectedId) {
      const selectedInst = store.furniture[selectedId];
      if (selectedInst) {
        // Rotation handle
        if (isPointInRotationHandle(worldPoint, selectedInst, STALK_LENGTH_MM, handleHitRadius)) {
          this.dragMode = 'rotate';
          this.activeInstanceId = selectedInst.id;
          this.initialTransform = { ...selectedInst };
          ctx.requestRender();
          return;
        }

        // Corner scale handles
        const cornerHit = getCornerHandleHit(worldPoint, selectedInst, handleHitRadius);
        if (cornerHit !== -1) {
          this.dragMode = 'scale';
          this.activeInstanceId = selectedInst.id;
          this.activeCorner = cornerHit;
          this.initialTransform = { ...selectedInst };
          ctx.requestRender();
          return;
        }
      }
    }

    // 3. Hit-test all furniture instances from top z-index to bottom
    const allInstances = Object.values(store.furniture).sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));

    for (const inst of allInstances) {
      if (isPointInFurnitureBox(worldPoint, inst, 8 / zoom)) {
        store.selectFurniture(inst.id);
        this.dragMode = 'move';
        this.activeInstanceId = inst.id;
        this.dragStartPointer = { ...worldPoint };
        this.initialTransform = { ...inst };
        ctx.requestRender();
        return;
      }
    }

    // 4. Clicked outside: clear selection
    if (store.selectedFurnitureId !== null) {
      store.selectFurniture(null);
      this.reset();
      ctx.requestRender();
    }
  }

  public onPointerUp(_e: PointerEvent, _worldPoint: Point2D, _ctx: ToolContext): void {
    this.reset();
  }

  public onKeyDown(e: KeyboardEvent, ctx: ToolContext): void {
    const store = planStore.getState();
    const selId = store.selectedFurnitureId;

    // Delete or Backspace: Delete selected furniture item
    if (e.code === 'Delete' || e.code === 'Backspace') {
      if (selId) {
        store.deleteFurniture(selId);
        this.reset();
        ctx.requestRender();
        e.preventDefault();
      }
      return;
    }

    // KeyR: Rotate selected item by +45° (+PI/4 radians)
    if (e.code === 'KeyR') {
      if (selId) {
        const item = store.furniture[selId];
        if (item) {
          const nextRotation = (item.rotation + Math.PI / 4) % (Math.PI * 2);
          store.updateFurnitureTransform(selId, { rotation: nextRotation });
          ctx.requestRender();
          e.preventDefault();
        }
      }
      return;
    }

    // Escape: cancel placement or deselect
    if (e.code === 'Escape') {
      if (this.mode === 'place') {
        this.mode = 'select';
        this.placingDefId = null;
      } else {
        store.selectFurniture(null);
        this.reset();
      }
      ctx.requestRender();
    }
  }

  public renderOverlay(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const zoom = viewport.zoom;
    const screenPixel = 1 / zoom;
    const store = planStore.getState();

    // 1. Placement Preview Mode
    if (this.mode === 'place' && this.placingDefId) {
      const def = assetManager.getDefinition(this.placingDefId);
      const width = def?.defaultWidthMm ?? 1000;
      const height = def?.defaultHeightMm ?? 1000;

      ctx.save();
      ctx.translate(this.cursorWorld.x, this.cursorWorld.y);

      // Semi-transparent ghost body
      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5 * screenPixel;
      ctx.setLineDash([6 * screenPixel, 4 * screenPixel]);

      ctx.beginPath();
      ctx.rect(-width / 2, -height / 2, width, height);
      ctx.fill();
      ctx.stroke();

      // Label badge
      ctx.font = `600 ${12 * screenPixel}px sans-serif`;
      ctx.fillStyle = '#1e40af';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const unitSettings = uiStore.getState().unitSettings;
      const wStr = formatLength(width, unitSettings);
      const hStr = formatLength(height, unitSettings);
      ctx.fillText(`${def?.name ?? this.placingDefId} (${wStr} × ${hStr})`, 0, 0);

      ctx.restore();
      return;
    }

    // 2. Selection & Transform Gizmo for selected item
    const selectedId = store.selectedFurnitureId;
    if (!selectedId) return;

    const inst = store.furniture[selectedId];
    if (!inst) return;

    ctx.save();
    ctx.translate(inst.x, inst.y);
    ctx.rotate(inst.rotation);

    const halfW = inst.width / 2;
    const halfH = inst.height / 2;

    // 1. Accent Bounding Box
    ctx.strokeStyle = '#2563eb'; // blue-600
    ctx.lineWidth = 1.5 * screenPixel;
    ctx.setLineDash([4 * screenPixel, 4 * screenPixel]);
    ctx.strokeRect(-halfW, -halfH, inst.width, inst.height);
    ctx.setLineDash([]);

    // 2. Rotation Stalk & Handle
    const stalkTop = -halfH - STALK_LENGTH_MM;
    const handleRadius = Math.max(10 * screenPixel, 18);

    // Stalk line
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5 * screenPixel;
    ctx.beginPath();
    ctx.moveTo(0, -halfH);
    ctx.lineTo(0, stalkTop);
    ctx.stroke();

    // Rotation circular handle
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2 * screenPixel;
    ctx.beginPath();
    ctx.arc(0, stalkTop, handleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Rotation symbol icon inside handle
    ctx.fillStyle = '#2563eb';
    ctx.font = `bold ${Math.round(handleRadius * 1.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↻', 0, stalkTop);

    // 3. Corner Scale Handles (4 squares)
    const handleSize = 8 * screenPixel;
    const corners: Point2D[] = [
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH },
    ];

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5 * screenPixel;

    for (const c of corners) {
      ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
      ctx.strokeRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
    }

    // 4. Transform HUD Info Badge below item
    const badgeY = halfH + 30 * screenPixel;
    const deg = Math.round((inst.rotation * 180) / Math.PI) % 360;
    const unitSettings = uiStore.getState().unitSettings;
    const wStr = formatLength(inst.width, unitSettings);
    const hStr = formatLength(inst.height, unitSettings);
    const infoText = `${wStr} × ${hStr} | ${deg}°`;

    ctx.font = `500 ${11 * screenPixel}px sans-serif`;
    const textWidth = ctx.measureText(infoText).width;
    const pad = 6 * screenPixel;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1 * screenPixel;
    ctx.beginPath();
    ctx.roundRect?.(-textWidth / 2 - pad, badgeY - 8 * screenPixel - pad / 2, textWidth + pad * 2, 16 * screenPixel + pad, 4 * screenPixel);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(infoText, 0, badgeY);

    ctx.restore();
  }
}
