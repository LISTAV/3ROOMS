import type { Point2D } from '../../core/types.js';

export interface ViewportOptions {
  panX?: number;
  panY?: number;
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
}

export interface ViewportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Headless Viewport managing 2D affine transformations, pan/zoom mechanics,
 * and coordinate conversions between screen pixels and world millimeters.
 */
export class Viewport {
  public panX: number;
  public panY: number;
  public zoom: number;
  public readonly minZoom: number;
  public readonly maxZoom: number;

  constructor(options: ViewportOptions = {}) {
    this.panX = options.panX ?? 0;
    this.panY = options.panY ?? 0;
    // Default zoom of 0.1 fits ~10m x 10m (10000mm x 10000mm) within a 1000px window
    this.zoom = options.zoom ?? 0.1;
    this.minZoom = options.minZoom ?? 0.005; // ~50m view
    this.maxZoom = options.maxZoom ?? 5.0;   // ~1mm detailed view

    // Clamp initial zoom to bounds
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
  }

  /**
   * Converts screen pixel coordinates to world millimeter coordinates.
   * Formula: worldX = (screenX - panX) / zoom, worldY = (screenY - panY) / zoom
   */
  public screenToWorld(screenPoint: Point2D): Point2D {
    return {
      x: (screenPoint.x - this.panX) / this.zoom,
      y: (screenPoint.y - this.panY) / this.zoom,
    };
  }

  /**
   * Converts world millimeter coordinates to screen pixel coordinates.
   * Formula: screenX = (worldX * zoom) + panX, screenY = (worldY * zoom) + panY
   */
  public worldToScreen(worldPoint: Point2D): Point2D {
    return {
      x: worldPoint.x * this.zoom + this.panX,
      y: worldPoint.y * this.zoom + this.panY,
    };
  }

  /**
   * Translates the viewport by screen pixel deltas.
   */
  public panBy(deltaScreenX: number, deltaScreenY: number): void {
    this.panX += deltaScreenX;
    this.panY += deltaScreenY;
  }

  /**
   * Zooms at a specified screen anchor point (e.g. mouse cursor position),
   * ensuring the world coordinate under the anchor remains stationary on screen.
   */
  public zoomAt(screenAnchor: Point2D, zoomFactor: number): void {
    const worldAnchor = this.screenToWorld(screenAnchor);
    const targetZoom = this.zoom * zoomFactor;
    const clampedZoom = Math.max(this.minZoom, Math.min(this.maxZoom, targetZoom));

    this.zoom = clampedZoom;
    this.panX = screenAnchor.x - worldAnchor.x * clampedZoom;
    this.panY = screenAnchor.y - worldAnchor.y * clampedZoom;
  }

  /**
   * Returns affine 2D transform components [a, b, c, d, e, f] suitable for ctx.setTransform().
   */
  public getTransformComponents(): [number, number, number, number, number, number] {
    return [this.zoom, 0, 0, this.zoom, this.panX, this.panY];
  }

  /**
   * Returns a standard 2D DOMMatrix or matrix representation representing the viewport transform.
   */
  public getTransform(): DOMMatrix {
    if (typeof DOMMatrix !== 'undefined') {
      return new DOMMatrix([this.zoom, 0, 0, this.zoom, this.panX, this.panY]);
    }

    // Node.js or environments without DOMMatrix polyfill
    return {
      a: this.zoom,
      b: 0,
      c: 0,
      d: this.zoom,
      e: this.panX,
      f: this.panY,
      is2D: true,
      isIdentity: this.zoom === 1 && this.panX === 0 && this.panY === 0,
    } as unknown as DOMMatrix;
  }

  /**
   * Calculates the visible bounding box in world coordinates (essential for culling offscreen geometry).
   */
  public getViewportBounds(canvasWidth: number, canvasHeight: number): ViewportBounds {
    const tl = this.screenToWorld({ x: 0, y: 0 });
    const br = this.screenToWorld({ x: canvasWidth, y: canvasHeight });

    return {
      minX: Math.min(tl.x, br.x),
      minY: Math.min(tl.y, br.y),
      maxX: Math.max(tl.x, br.x),
      maxY: Math.max(tl.y, br.y),
    };
  }

  /**
   * Resets viewport to standard scale centered at origin.
   */
  public resetZoom(screenWidth: number = 800, screenHeight: number = 600, targetZoom: number = 0.1): void {
    this.zoom = targetZoom;
    this.panX = screenWidth / 2;
    this.panY = screenHeight / 2;
  }

  /**
   * Scales and pans the viewport to encompass a world bounding box with 10% padding.
   */
  public zoomToFit(
    bounds: ViewportBounds,
    screenWidth: number,
    screenHeight: number,
    paddingRatio: number = 0.1
  ): void {
    const worldW = bounds.maxX - bounds.minX;
    const worldH = bounds.maxY - bounds.minY;
    if (worldW <= 0 || worldH <= 0 || screenWidth <= 0 || screenHeight <= 0) {
      this.resetZoom(screenWidth, screenHeight);
      return;
    }

    const availW = screenWidth * (1 - paddingRatio * 2);
    const availH = screenHeight * (1 - paddingRatio * 2);

    const fitZoom = Math.min(availW / worldW, availH / worldH);
    const clampedZoom = Math.max(this.minZoom, Math.min(this.maxZoom, fitZoom));

    this.zoom = clampedZoom;
    const worldCenterX = (bounds.minX + bounds.maxX) / 2;
    const worldCenterY = (bounds.minY + bounds.maxY) / 2;

    this.panX = screenWidth / 2 - worldCenterX * clampedZoom;
    this.panY = screenHeight / 2 - worldCenterY * clampedZoom;
  }
}
