import type { Point2D, ImageInstance } from '../../core/types.js';
import type { Viewport } from '../viewport/Viewport.js';
import { distance } from '../../core/math/vector.js';
import { transformWorldToLocal, transformLocalToWorld } from '../tools/FurnitureTool.js';

export const IMAGE_STALK_LENGTH_MM = 300;

/**
 * Hit-tests whether a world point lies inside an oriented image instance.
 */
export function isPointInImageBox(
  point: Point2D,
  instance: ImageInstance,
  toleranceMm: number = 0
): boolean {
  const local = transformWorldToLocal(point, { x: instance.x, y: instance.y }, instance.rotation);
  const halfW = instance.width / 2 + toleranceMm;
  const halfH = instance.height / 2 + toleranceMm;

  return Math.abs(local.x) <= halfW && Math.abs(local.y) <= halfH;
}

/**
 * Hit-tests whether a world point touches the image rotation handle.
 */
export function isPointInImageRotationHandle(
  point: Point2D,
  instance: ImageInstance,
  stalkLengthMm: number = IMAGE_STALK_LENGTH_MM,
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
 * Returns 0: Top-Left, 1: Top-Right, 2: Bottom-Right, 3: Bottom-Left, or -1 if none.
 */
export function getImageCornerHandleHit(
  point: Point2D,
  instance: ImageInstance,
  handleRadiusMm: number = 30
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
    if (distance(local, corners[i]) <= handleRadiusMm) {
      return i;
    }
  }

  return -1;
}

/**
 * Immediate-mode 2D layer rendering reference/underlay images with transparency.
 */
export class ImageLayer {
  private imageCache: Map<string, HTMLImageElement> = new Map();
  public onImageLoaded?: () => void;

  constructor(onImageLoaded?: () => void) {
    this.onImageLoaded = onImageLoaded;
  }

  /**
   * Acquires or caches an HTMLImageElement for the given source.
   */
  public getImageElement(id: string, src: string): HTMLImageElement {
    let img = this.imageCache.get(id);
    if (!img || img.src !== src) {
      img = new Image();
      img.src = src;
      img.onload = () => {
        if (this.onImageLoaded) {
          this.onImageLoaded();
        }
      };
      this.imageCache.set(id, img);
    }
    return img;
  }

  /**
   * Renders all given images in world coordinate space according to their z-index and opacity.
   */
  public render(
    ctx: CanvasRenderingContext2D,
    images: Record<string, ImageInstance>,
    zoom: number,
    selectedImageId: string | null = null
  ): void {
    const list = Object.values(images);
    if (list.length === 0) return;

    // Stacking order: lower zIndex rendered first
    list.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

    const screenPixel = 1 / zoom;

    for (const inst of list) {
      const halfW = inst.width / 2;
      const halfH = inst.height / 2;

      ctx.save();
      ctx.translate(inst.x, inst.y);
      ctx.rotate(inst.rotation);

      // Apply image transparency / opacity
      const opacity = Math.max(0, Math.min(1, inst.opacity ?? 1.0));
      ctx.globalAlpha = opacity;

      // Draw cached image if available
      const img = this.getImageElement(inst.id, inst.src);
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, -halfW, -halfH, inst.width, inst.height);
      } else {
        // Loading placeholder
        ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1 * screenPixel;
        ctx.strokeRect(-halfW, -halfH, inst.width, inst.height);
        ctx.font = `${14 * screenPixel}px sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(inst.name || 'Loading Image...', 0, 0);
      }

      ctx.restore();

      // Render transform gizmo if selected
      if (selectedImageId === inst.id) {
        this.renderGizmo(ctx, inst, zoom);
      }
    }
  }

  /**
   * Renders the interactive transform gizmo (bounding box, scale handles, rotation handle).
   */
  public renderGizmo(
    ctx: CanvasRenderingContext2D,
    inst: ImageInstance,
    zoom: number
  ): void {
    const screenPixel = 1 / zoom;
    const halfW = inst.width / 2;
    const halfH = inst.height / 2;

    ctx.save();
    ctx.translate(inst.x, inst.y);
    ctx.rotate(inst.rotation);

    // 1. Accent dashed bounding box
    ctx.strokeStyle = inst.locked ? '#f59e0b' : '#38bdf8'; // Amber if locked, sky blue if editable
    ctx.lineWidth = 1.5 * screenPixel;
    ctx.setLineDash([4 * screenPixel, 4 * screenPixel]);
    ctx.strokeRect(-halfW, -halfH, inst.width, inst.height);
    ctx.setLineDash([]);

    if (inst.locked) {
      // Locked badge
      const badgeY = -halfH - 24 * screenPixel;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1 * screenPixel;
      ctx.beginPath();
      ctx.roundRect(-40 * screenPixel, badgeY, 80 * screenPixel, 18 * screenPixel, 4 * screenPixel);
      ctx.fill();
      ctx.stroke();

      ctx.font = `600 ${10 * screenPixel}px sans-serif`;
      ctx.fillStyle = '#f59e0b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔒 Locked', 0, badgeY + 9 * screenPixel);
      ctx.restore();
      return;
    }

    // 2. Rotation Stalk & Handle
    const stalkTop = -halfH - IMAGE_STALK_LENGTH_MM;
    const handleRadius = Math.max(12 * screenPixel, 18);

    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5 * screenPixel;
    ctx.beginPath();
    ctx.moveTo(0, -halfH);
    ctx.lineTo(0, stalkTop);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2 * screenPixel;
    ctx.beginPath();
    ctx.arc(0, stalkTop, handleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0284c7';
    ctx.font = `bold ${Math.round(handleRadius * 1.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↻', 0, stalkTop);

    // 3. Corner Scale Handles (4 squares)
    const handleSize = Math.max(8 * screenPixel, 14);
    const corners: Point2D[] = [
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH },
    ];

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2 * screenPixel;

    for (const c of corners) {
      ctx.beginPath();
      ctx.rect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
      ctx.fill();
      ctx.stroke();
    }

    // 4. Dimensions & Opacity Tag (bottom edge)
    const tagY = halfH + 20 * screenPixel;
    const opacityPct = Math.round((inst.opacity ?? 1.0) * 100);
    const tagText = `${Math.round(inst.width)} × ${Math.round(inst.height)} mm | Opacity: ${opacityPct}%`;
    ctx.font = `600 ${11 * screenPixel}px sans-serif`;
    const textWidth = ctx.measureText(tagText).width;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1 * screenPixel;
    ctx.beginPath();
    ctx.roundRect(
      -textWidth / 2 - 8 * screenPixel,
      tagY - 10 * screenPixel,
      textWidth + 16 * screenPixel,
      20 * screenPixel,
      4 * screenPixel
    );
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tagText, 0, tagY);

    ctx.restore();
  }
}
