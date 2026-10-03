import type { Viewport } from '../viewport/Viewport.js';

export interface GridRendererOptions {
  majorSpacing?: number;   // In millimeters (default: 1000mm = 1m)
  minorSpacing?: number;   // In millimeters (default: 100mm = 10cm)
  majorColor?: string;     // default: #cbd5e1 (slate-300)
  minorColor?: string;     // default: #f1f5f9 (slate-100)
  axisColor?: string;      // default: #94a3b8 (slate-400)
  minScreenDistance?: number; // Minimum pixel spacing before hiding minor lines (default: 10px)
}

/**
 * Renders an adaptive, infinite CAD millimeter grid in world coordinates.
 * Features automatic level-of-detail subdivision and anti-moiré fading.
 */
export class GridRenderer {
  public majorSpacing: number;
  public minorSpacing: number;
  public majorColor: string;
  public minorColor: string;
  public axisColor: string;
  public minScreenDistance: number;

  constructor(options: GridRendererOptions = {}) {
    this.majorSpacing = options.majorSpacing ?? 1000;
    this.minorSpacing = options.minorSpacing ?? 100;
    this.majorColor = options.majorColor ?? '#cbd5e1';
    this.minorColor = options.minorColor ?? '#f1f5f9';
    this.axisColor = options.axisColor ?? '#94a3b8';
    this.minScreenDistance = options.minScreenDistance ?? 10;
  }

  /**
   * Renders the grid directly in world coordinates.
   * Assumes the CanvasRenderingContext2D has the viewport affine transformation applied.
   */
  public render(
    ctx: CanvasRenderingContext2D,
    viewport: Viewport,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    const bounds = viewport.getViewportBounds(canvasWidth, canvasHeight);
    const zoom = viewport.zoom;
    const screenPixelInWorld = 1 / zoom;

    // 1. Determine adaptive spacing based on zoom level
    let currentMajor = this.majorSpacing;
    let currentMinor = this.minorSpacing;

    // If major grid lines get too dense (< 20px on screen), step up major/minor by factors of 10
    while (currentMajor * zoom < 20) {
      currentMinor = currentMajor;
      currentMajor *= 10;
    }

    const minorPixelDist = currentMinor * zoom;

    // 2. Render Minor Grid Lines if spacing >= minScreenDistance
    if (minorPixelDist >= this.minScreenDistance) {
      // Fade opacity smoothly between 10px and 20px screen distance to avoid jarring popping
      const minorOpacity = Math.min(1.0, (minorPixelDist - this.minScreenDistance) / 10);

      ctx.save();
      ctx.strokeStyle = this.minorColor;
      ctx.globalAlpha = minorOpacity;
      ctx.lineWidth = screenPixelInWorld; // 1px in screen space

      ctx.beginPath();

      const startX = Math.floor(bounds.minX / currentMinor) * currentMinor;
      const endX = Math.ceil(bounds.maxX / currentMinor) * currentMinor;
      const startY = Math.floor(bounds.minY / currentMinor) * currentMinor;
      const endY = Math.ceil(bounds.maxY / currentMinor) * currentMinor;

      // Vertical minor lines (skip lines where major lines will be drawn)
      for (let x = startX; x <= endX; x += currentMinor) {
        if (Math.abs(x % currentMajor) > 0.001) {
          ctx.moveTo(x, bounds.minY);
          ctx.lineTo(x, bounds.maxY);
        }
      }

      // Horizontal minor lines
      for (let y = startY; y <= endY; y += currentMinor) {
        if (Math.abs(y % currentMajor) > 0.001) {
          ctx.moveTo(bounds.minX, y);
          ctx.lineTo(bounds.maxX, y);
        }
      }

      ctx.stroke();
      ctx.restore();
    }

    // 3. Render Major Grid Lines (every 1000mm / adaptive)
    const majorPixelDist = currentMajor * zoom;
    if (majorPixelDist >= 5) {
      ctx.save();
      ctx.strokeStyle = this.majorColor;
      ctx.lineWidth = screenPixelInWorld; // 1px in screen space

      ctx.beginPath();

      const startX = Math.floor(bounds.minX / currentMajor) * currentMajor;
      const endX = Math.ceil(bounds.maxX / currentMajor) * currentMajor;
      const startY = Math.floor(bounds.minY / currentMajor) * currentMajor;
      const endY = Math.ceil(bounds.maxY / currentMajor) * currentMajor;

      // Vertical major lines (skip origin x=0, drawn separately with accent)
      for (let x = startX; x <= endX; x += currentMajor) {
        if (Math.abs(x) > 0.001) {
          ctx.moveTo(x, bounds.minY);
          ctx.lineTo(x, bounds.maxY);
        }
      }

      // Horizontal major lines (skip origin y=0)
      for (let y = startY; y <= endY; y += currentMajor) {
        if (Math.abs(y) > 0.001) {
          ctx.moveTo(bounds.minX, y);
          ctx.lineTo(bounds.maxX, y);
        }
      }

      ctx.stroke();
      ctx.restore();
    }

    // 4. Render World Origin Axes (0, 0)
    ctx.save();
    ctx.strokeStyle = this.axisColor;
    ctx.lineWidth = 1.5 * screenPixelInWorld; // 1.5px screen thickness

    ctx.beginPath();
    // X-Axis (y = 0)
    if (bounds.minY <= 0 && bounds.maxY >= 0) {
      ctx.moveTo(bounds.minX, 0);
      ctx.lineTo(bounds.maxX, 0);
    }
    // Y-Axis (x = 0)
    if (bounds.minX <= 0 && bounds.maxX >= 0) {
      ctx.moveTo(0, bounds.minY);
      ctx.lineTo(0, bounds.maxY);
    }
    ctx.stroke();

    // Subtle origin indicator circle
    if (
      bounds.minX <= 0 &&
      bounds.maxX >= 0 &&
      bounds.minY <= 0 &&
      bounds.maxY >= 0
    ) {
      ctx.fillStyle = this.axisColor;
      ctx.beginPath();
      ctx.arc(0, 0, 4 * screenPixelInWorld, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
