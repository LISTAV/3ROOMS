import type { Point2D } from '../../core/types.js';
import type { Viewport } from '../viewport/Viewport.js';
import { distance } from '../../core/math/vector.js';
import { uiStore } from '../../core/store/uiStore.js';
import { formatLength } from '../../core/units/unitFormatter.js';
import { transformWorldToLocal, transformLocalToWorld } from '../tools/FurnitureTool.js';

export const GIZMO_ROTATION_STALK_MM = 350;
export const GIZMO_MIN_DIMENSION_MM = 100;
export const GIZMO_HIT_RADIUS_MM = 35;

export type GizmoHandleType =
  | 'rotate'
  | 'tl'
  | 'tr'
  | 'br'
  | 'bl'
  | 't'
  | 'b'
  | 'l'
  | 'r'
  | 'body';

export interface TransformBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  aspectRatio?: number;
}

export interface GizmoHandleInfo {
  type: GizmoHandleType;
  localPos: Point2D;
  worldPos: Point2D;
}

/**
 * Calculates the local and world positions for all 9 gizmo control handles.
 */
export function computeGizmoHandles(
  center: Point2D,
  width: number,
  height: number,
  rotation: number,
  stalkLengthMm: number = GIZMO_ROTATION_STALK_MM
): Record<GizmoHandleType, GizmoHandleInfo> {
  const halfW = width / 2;
  const halfH = height / 2;

  const localCoords: Record<Exclude<GizmoHandleType, 'body'>, Point2D> = {
    tl: { x: -halfW, y: -halfH },
    tr: { x: halfW, y: -halfH },
    br: { x: halfW, y: halfH },
    bl: { x: -halfW, y: halfH },
    t: { x: 0, y: -halfH },
    b: { x: 0, y: halfH },
    l: { x: -halfW, y: 0 },
    r: { x: halfW, y: 0 },
    rotate: { x: 0, y: -halfH - stalkLengthMm },
  };

  const result = {} as Record<GizmoHandleType, GizmoHandleInfo>;

  for (const [key, localPos] of Object.entries(localCoords)) {
    const type = key as GizmoHandleType;
    result[type] = {
      type,
      localPos,
      worldPos: transformLocalToWorld(localPos, center, rotation),
    };
  }

  result.body = {
    type: 'body',
    localPos: { x: 0, y: 0 },
    worldPos: { ...center },
  };

  return result;
}

/**
 * Hit-tests whether a world point hits any gizmo handle or body.
 */
export function hitTestGizmo(
  worldPoint: Point2D,
  bounds: TransformBounds,
  stalkLengthMm: number = GIZMO_ROTATION_STALK_MM,
  hitRadiusMm: number = GIZMO_HIT_RADIUS_MM
): GizmoHandleType | null {
  const local = transformWorldToLocal(worldPoint, { x: bounds.x, y: bounds.y }, bounds.rotation);
  const halfW = bounds.width / 2;
  const halfH = bounds.height / 2;

  // 1. Rotation handle
  const rotLocal: Point2D = { x: 0, y: -halfH - stalkLengthMm };
  if (distance(local, rotLocal) <= hitRadiusMm) {
    return 'rotate';
  }

  // 2. Corner handles (TL, TR, BR, BL)
  const corners: Array<{ type: GizmoHandleType; pos: Point2D }> = [
    { type: 'tl', pos: { x: -halfW, y: -halfH } },
    { type: 'tr', pos: { x: halfW, y: -halfH } },
    { type: 'br', pos: { x: halfW, y: halfH } },
    { type: 'bl', pos: { x: -halfW, y: halfH } },
  ];
  for (const c of corners) {
    if (distance(local, c.pos) <= hitRadiusMm) {
      return c.type;
    }
  }

  // 3. Edge midpoint handles (T, B, L, R)
  const edges: Array<{ type: GizmoHandleType; pos: Point2D }> = [
    { type: 't', pos: { x: 0, y: -halfH } },
    { type: 'b', pos: { x: 0, y: halfH } },
    { type: 'l', pos: { x: -halfW, y: 0 } },
    { type: 'r', pos: { x: halfW, y: 0 } },
  ];
  for (const e of edges) {
    if (distance(local, e.pos) <= hitRadiusMm) {
      return e.type;
    }
  }

  // 4. Inside asset body
  if (Math.abs(local.x) <= halfW + 10 && Math.abs(local.y) <= halfH + 10) {
    return 'body';
  }

  return null;
}

/**
 * Resizes an asset from a gizmo handle drag, preserving center and aspect ratio if requested.
 */
export function computeTransformResize(
  handle: GizmoHandleType,
  worldMouse: Point2D,
  initial: TransformBounds,
  lockAspectRatio: boolean = false,
  minSize: number = GIZMO_MIN_DIMENSION_MM
): { width: number; height: number } {
  // Project world mouse into local asset coordinates
  const localMouse = transformWorldToLocal(
    worldMouse,
    { x: initial.x, y: initial.y },
    initial.rotation
  );

  let newWidth = initial.width;
  let newHeight = initial.height;
  const initialAspect = initial.aspectRatio || (initial.width / Math.max(1, initial.height));

  switch (handle) {
    case 'r':
    case 'l': {
      newWidth = Math.max(minSize, Math.abs(localMouse.x) * 2);
      if (lockAspectRatio) {
        newHeight = Math.max(minSize, newWidth / initialAspect);
      }
      break;
    }
    case 't':
    case 'b': {
      newHeight = Math.max(minSize, Math.abs(localMouse.y) * 2);
      if (lockAspectRatio) {
        newWidth = Math.max(minSize, newHeight * initialAspect);
      }
      break;
    }
    case 'tl':
    case 'tr':
    case 'br':
    case 'bl': {
      let rawW = Math.max(minSize, Math.abs(localMouse.x) * 2);
      let rawH = Math.max(minSize, Math.abs(localMouse.y) * 2);

      if (lockAspectRatio) {
        // Choose scale factor from the larger coordinate delta
        const scaleX = rawW / Math.max(1, initial.width);
        const scaleY = rawH / Math.max(1, initial.height);
        const dominantScale = Math.max(scaleX, scaleY);
        newWidth = Math.max(minSize, initial.width * dominantScale);
        newHeight = Math.max(minSize, newWidth / initialAspect);
      } else {
        newWidth = rawW;
        newHeight = rawH;
      }
      break;
    }
    default:
      break;
  }

  return { width: Math.round(newWidth), height: Math.round(newHeight) };
}

/**
 * Computes updated rotation angle (in radians) from rotation handle drag.
 * Snaps to 15° increments if snapAngleIncrementRad is passed (e.g. holding Shift).
 */
export function computeTransformRotate(
  worldMouse: Point2D,
  center: Point2D,
  snapAngleIncrementRad?: number
): number {
  let angle = Math.atan2(worldMouse.y - center.y, worldMouse.x - center.x) + Math.PI / 2;

  // Normalize angle to [0, 2pi)
  angle = (angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);

  if (snapAngleIncrementRad && snapAngleIncrementRad > 0) {
    angle = Math.round(angle / snapAngleIncrementRad) * snapAngleIncrementRad;
  }

  return angle;
}

/**
 * Renders the Universal 9-point Transform Gizmo, control handles, and Live Dimension HUD badges.
 */
export function renderTransformGizmo(
  ctx: CanvasRenderingContext2D,
  bounds: TransformBounds,
  viewport: Viewport,
  isRotating: boolean = false,
  activeHandle: GizmoHandleType | null = null
): void {
  const zoom = viewport.zoom;
  const screenPixel = 1 / zoom;
  const unitSettings = uiStore.getState().unitSettings;

  const halfW = bounds.width / 2;
  const halfH = bounds.height / 2;

  ctx.save();
  ctx.translate(bounds.x, bounds.y);
  ctx.rotate(bounds.rotation);

  // 1. Accent Bounding Box
  ctx.strokeStyle = '#2563eb'; // blue-600
  ctx.lineWidth = 1.5 * screenPixel;
  ctx.setLineDash([5 * screenPixel, 4 * screenPixel]);
  ctx.strokeRect(-halfW, -halfH, bounds.width, bounds.height);
  ctx.setLineDash([]);

  // 2. Rotation Stalk & Circular Handle
  const stalkTop = -halfH - GIZMO_ROTATION_STALK_MM;
  const handleRadius = Math.max(9 * screenPixel, 18 * screenPixel);

  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5 * screenPixel;
  ctx.beginPath();
  ctx.moveTo(0, -halfH);
  ctx.lineTo(0, stalkTop);
  ctx.stroke();

  // Rotation Handle Circle
  const isRotActive = activeHandle === 'rotate';
  ctx.fillStyle = isRotActive ? '#2563eb' : '#ffffff';
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2 * screenPixel;
  ctx.beginPath();
  ctx.arc(0, stalkTop, handleRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Rotation symbol icon inside handle
  ctx.fillStyle = isRotActive ? '#ffffff' : '#2563eb';
  ctx.font = `bold ${Math.round(handleRadius * 1.05)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('↻', 0, stalkTop);

  // 3. 8 Scale Handles (4 Corners + 4 Edge Midpoints)
  const handleSize = 9 * screenPixel;
  const handles: Array<{ type: GizmoHandleType; x: number; y: number }> = [
    // Corners
    { type: 'tl', x: -halfW, y: -halfH },
    { type: 'tr', x: halfW, y: -halfH },
    { type: 'br', x: halfW, y: halfH },
    { type: 'bl', x: -halfW, y: halfH },
    // Edges
    { type: 't', x: 0, y: -halfH },
    { type: 'b', x: 0, y: halfH },
    { type: 'l', x: -halfW, y: 0 },
    { type: 'r', x: halfW, y: 0 },
  ];

  for (const h of handles) {
    const isActive = activeHandle === h.type;
    ctx.fillStyle = isActive ? '#2563eb' : '#ffffff';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5 * screenPixel;

    ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
    ctx.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
  }

  // 4. Live Metric Dimension Badges (HUD)
  // (a) Width badge along top edge
  const widthLabel = formatLength(bounds.width, unitSettings);
  renderPillBadge(
    ctx,
    0,
    -halfH - 22 * screenPixel,
    widthLabel,
    screenPixel
  );

  // (b) Height badge along right edge
  const heightLabel = formatLength(bounds.height, unitSettings);
  ctx.save();
  ctx.translate(halfW + 22 * screenPixel, 0);
  ctx.rotate(Math.PI / 2);
  renderPillBadge(ctx, 0, 0, heightLabel, screenPixel);
  ctx.restore();

  // (c) Live Rotation readout tag if actively rotating
  if (isRotating) {
    const deg = ((((bounds.rotation * 180) / Math.PI) % 360) + 360) % 360;
    const angleText = `${deg.toFixed(1)}°`;
    renderPillBadge(
      ctx,
      0,
      stalkTop - handleRadius - 16 * screenPixel,
      angleText,
      screenPixel,
      '#2563eb',
      '#ffffff'
    );
  }

  ctx.restore();
}

/**
 * Helper to render a high-contrast floating pill badge for HUD dimensions and angle readouts.
 */
function renderPillBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  screenPixel: number,
  bgColor: string = 'rgba(15, 23, 42, 0.88)',
  textColor: string = '#f8fafc'
): void {
  ctx.font = `600 ${11 * screenPixel}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  const textWidth = ctx.measureText(text).width;
  const padX = 6 * screenPixel;
  const padY = 3 * screenPixel;
  const pillW = textWidth + padX * 2;
  const pillH = 14 * screenPixel + padY * 2;
  const radius = 4 * screenPixel;

  ctx.fillStyle = bgColor;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1 * screenPixel;

  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x - pillW / 2, y - pillH / 2, pillW, pillH, radius);
  } else {
    ctx.rect(x - pillW / 2, y - pillH / 2, pillW, pillH);
  }
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}
