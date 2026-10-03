import type { Opening, Wall, Vertex, Point2D } from '../../core/types.js';
import { computeOpeningGeometry, type OpeningGeometry } from '../../core/geometry/openings.js';
import { add, sub, scale, normal, distance } from '../../core/math/vector.js';

export interface OpeningRendererOptions {
  jambColor?: string;
  leafFillColor?: string;
  leafStrokeColor?: string;
  arcColor?: string;
  windowSillColor?: string;
  windowGlassColor?: string;
  selectedColor?: string;
}

/**
 * Architectural 2D CAD renderer for parametric wall openings:
 * - Single Door: 90° open leaf rectangle, quarter-circle dashed swing arc (flipH/flipV support)
 * - Double Door: Dual meeting leaves, symmetric dual dashed swing arcs
 * - Window: Perpendicular wall jamb cutouts, dual parallel outer sills, dual centered glass pane lines
 * - Selection Highlight: Glowing accent bounds and interactive flip buttons
 */
export class OpeningRenderer {
  public jambColor: string;
  public leafFillColor: string;
  public leafStrokeColor: string;
  public arcColor: string;
  public windowSillColor: string;
  public windowGlassColor: string;
  public selectedColor: string;

  constructor(options: OpeningRendererOptions = {}) {
    this.jambColor = options.jambColor ?? '#0f172a'; // slate-900
    this.leafFillColor = options.leafFillColor ?? '#ffffff';
    this.leafStrokeColor = options.leafStrokeColor ?? '#0f172a';
    this.arcColor = options.arcColor ?? '#94a3b8'; // slate-400
    this.windowSillColor = options.windowSillColor ?? '#64748b'; // slate-500
    this.windowGlassColor = options.windowGlassColor ?? '#38bdf8'; // sky-400
    this.selectedColor = options.selectedColor ?? '#3b82f6'; // blue-500
  }

  /**
   * Renders all openings anchored to walls in world coordinate space.
   */
  public render(
    ctx: CanvasRenderingContext2D,
    openings: Record<string, Opening>,
    walls: Record<string, Wall>,
    vertices: Record<string, Vertex>,
    selectedOpeningIds: string[] = [],
    zoom: number
  ): void {
    const openingList = Object.values(openings);
    if (openingList.length === 0) return;

    const screenPixel = 1 / zoom;
    const selectedSet = new Set(selectedOpeningIds);

    for (const opening of openingList) {
      const wall = walls[opening.wallId];
      if (!wall) continue;

      const geom = computeOpeningGeometry(opening, wall, vertices);
      if (!geom) continue;

      const isSelected = selectedSet.has(opening.id);

      ctx.save();

      // 1. Draw jamb end-caps across wall thickness
      this.drawJambEndCaps(ctx, geom, screenPixel);

      // 2. Draw architectural CAD symbol according to opening type
      switch (geom.type) {
        case 'single_door':
          this.drawSingleDoor(ctx, geom, screenPixel, zoom);
          break;
        case 'double_door':
          this.drawDoubleDoor(ctx, geom, screenPixel, zoom);
          break;
        case 'window':
        case 'sliding_window':
        case 'fixed_window':
          this.drawWindow(ctx, geom, screenPixel, zoom);
          break;
        case 'opening':
        default:
          // Unadorned wall opening: void with clean jamb end caps
          break;
      }

      // 3. Draw selection highlight and flip buttons if selected
      if (isSelected) {
        this.drawSelectionHighlight(ctx, geom, screenPixel, zoom);
      }

      ctx.restore();
    }
  }

  /**
   * Draws perpendicular jamb lines across the wall thickness at spanStart and spanEnd.
   */
  private drawJambEndCaps(
    ctx: CanvasRenderingContext2D,
    geom: OpeningGeometry,
    screenPixel: number
  ): void {
    const wallNorm = normal(geom.unitVector);
    const halfThick = geom.wallThickness / 2;

    const sLeft = add(geom.spanStart, scale(wallNorm, halfThick));
    const sRight = sub(geom.spanStart, scale(wallNorm, halfThick));
    const eLeft = add(geom.spanEnd, scale(wallNorm, halfThick));
    const eRight = sub(geom.spanEnd, scale(wallNorm, halfThick));

    ctx.save();
    ctx.strokeStyle = this.jambColor;
    ctx.lineWidth = 1.5 * screenPixel;
    ctx.lineCap = 'butt';

    // Start jamb cap
    ctx.beginPath();
    ctx.moveTo(sLeft.x, sLeft.y);
    ctx.lineTo(sRight.x, sRight.y);
    ctx.stroke();

    // End jamb cap
    ctx.beginPath();
    ctx.moveTo(eLeft.x, eLeft.y);
    ctx.lineTo(eRight.x, eRight.y);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draws a single swing door: 90° open leaf rectangle and 90° circular dashed swing arc.
   */
  public drawSingleDoor(
    ctx: CanvasRenderingContext2D,
    geom: OpeningGeometry,
    screenPixel: number,
    zoom: number
  ): void {
    const leafThickness = 35; // mm standard door leaf thickness
    const width = geom.width;

    // Determine hinge and latch endpoints
    // If !flipH: Hinge is at spanStart, swings toward spanEnd
    // If flipH: Hinge is at spanEnd, swings toward spanStart
    const hinge = geom.flipH ? geom.spanEnd : geom.spanStart;
    const latch = geom.flipH ? geom.spanStart : geom.spanEnd;

    // Unit vector along wall toward opposite latch jamb
    const dWall = geom.flipH ? scale(geom.unitVector, -1) : geom.unitVector;
    // Unit vector pointing into the swing side (determined by flipV)
    const dOpen = geom.normalVector;

    // 1. Draw Door Leaf Rectangle
    const p1 = hinge;
    const p2 = add(hinge, scale(dOpen, width));
    const p3 = add(p2, scale(dWall, leafThickness));
    const p4 = add(hinge, scale(dWall, leafThickness));

    ctx.save();
    ctx.fillStyle = this.leafFillColor;
    ctx.strokeStyle = this.leafStrokeColor;
    ctx.lineWidth = 1 * screenPixel;
    ctx.lineJoin = 'miter';

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 2. Draw 90° Quarter-Circle Dashed Swing Arc
    this.drawSwingArc(ctx, hinge, width, dWall, dOpen, screenPixel, zoom);
  }

  /**
   * Draws a double door: two meeting leaves of width/2 with dual symmetric swing arcs.
   */
  public drawDoubleDoor(
    ctx: CanvasRenderingContext2D,
    geom: OpeningGeometry,
    screenPixel: number,
    zoom: number
  ): void {
    const leafThickness = 35;
    const halfWidth = geom.width / 2;
    const dOpen = geom.normalVector;

    // Leaf 1: Hinged at spanStart, swings toward center
    const hinge1 = geom.spanStart;
    const dWall1 = geom.unitVector;

    const p1 = hinge1;
    const p2 = add(hinge1, scale(dOpen, halfWidth));
    const p3 = add(p2, scale(dWall1, leafThickness));
    const p4 = add(hinge1, scale(dWall1, leafThickness));

    // Leaf 2: Hinged at spanEnd, swings toward center
    const hinge2 = geom.spanEnd;
    const dWall2 = scale(geom.unitVector, -1);

    const q1 = hinge2;
    const q2 = add(hinge2, scale(dOpen, halfWidth));
    const q3 = add(q2, scale(dWall2, leafThickness));
    const q4 = add(hinge2, scale(dWall2, leafThickness));

    ctx.save();
    ctx.fillStyle = this.leafFillColor;
    ctx.strokeStyle = this.leafStrokeColor;
    ctx.lineWidth = 1 * screenPixel;
    ctx.lineJoin = 'miter';

    // Leaf 1
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Leaf 2
    ctx.beginPath();
    ctx.moveTo(q1.x, q1.y);
    ctx.lineTo(q2.x, q2.y);
    ctx.lineTo(q3.x, q3.y);
    ctx.lineTo(q4.x, q4.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Swing Arc 1
    this.drawSwingArc(ctx, hinge1, halfWidth, dWall1, dOpen, screenPixel, zoom);
    // Swing Arc 2
    this.drawSwingArc(ctx, hinge2, halfWidth, dWall2, dOpen, screenPixel, zoom);
  }

  /**
   * Helper to draw a clean 90° dashed swing arc connecting the open leaf tip back to the jamb.
   */
  private drawSwingArc(
    ctx: CanvasRenderingContext2D,
    hinge: Point2D,
    radius: number,
    dWall: Point2D,
    dOpen: Point2D,
    screenPixel: number,
    zoom: number
  ): void {
    const alphaClosed = Math.atan2(dWall.y, dWall.x);
    const alphaOpen = Math.atan2(dOpen.y, dOpen.x);

    let delta = (alphaOpen - alphaClosed) % (Math.PI * 2);
    if (delta < 0) delta += Math.PI * 2;

    const anticlockwise = delta > Math.PI;

    ctx.save();
    ctx.strokeStyle = this.arcColor;
    ctx.lineWidth = 1 * screenPixel;
    ctx.setLineDash([3 * screenPixel, 3 * screenPixel]);

    ctx.beginPath();
    ctx.arc(hinge.x, hinge.y, radius, alphaClosed, alphaOpen, anticlockwise);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draws a window: parallel outer sill lines across wall miter boundaries and dual centered glass lines.
   */
  public drawWindow(
    ctx: CanvasRenderingContext2D,
    geom: OpeningGeometry,
    screenPixel: number,
    _zoom: number
  ): void {
    const wallNorm = normal(geom.unitVector);
    const halfThick = geom.wallThickness / 2;

    const sLeft = add(geom.spanStart, scale(wallNorm, halfThick));
    const sRight = sub(geom.spanStart, scale(wallNorm, halfThick));
    const eLeft = add(geom.spanEnd, scale(wallNorm, halfThick));
    const eRight = sub(geom.spanEnd, scale(wallNorm, halfThick));

    ctx.save();

    // 1. Dual outer sill lines connecting exterior and interior wall faces
    ctx.strokeStyle = this.windowSillColor;
    ctx.lineWidth = 1.5 * screenPixel;

    ctx.beginPath();
    ctx.moveTo(sLeft.x, sLeft.y);
    ctx.lineTo(eLeft.x, eLeft.y);
    ctx.moveTo(sRight.x, sRight.y);
    ctx.lineTo(eRight.x, eRight.y);
    ctx.stroke();

    // 2. Dual parallel thin glass pane lines along centerline (spaced ±12mm)
    const glassOffset = Math.min(15, halfThick * 0.3);
    const g1Start = add(geom.spanStart, scale(wallNorm, glassOffset));
    const g1End = add(geom.spanEnd, scale(wallNorm, glassOffset));
    const g2Start = sub(geom.spanStart, scale(wallNorm, glassOffset));
    const g2End = sub(geom.spanEnd, scale(wallNorm, glassOffset));

    ctx.strokeStyle = this.windowGlassColor;
    ctx.lineWidth = 1.5 * screenPixel;

    ctx.beginPath();
    ctx.moveTo(g1Start.x, g1Start.y);
    ctx.lineTo(g1End.x, g1End.y);
    ctx.moveTo(g2Start.x, g2Start.y);
    ctx.lineTo(g2End.x, g2End.y);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draws a glowing blue accent box around the opening with interactive flip handle buttons.
   */
  public drawSelectionHighlight(
    ctx: CanvasRenderingContext2D,
    geom: OpeningGeometry,
    screenPixel: number,
    zoom: number
  ): void {
    const wallNorm = normal(geom.unitVector);
    const halfThick = geom.wallThickness / 2;
    const pad = 15; // mm padding around opening cutout

    const sLeft = add(sub(geom.spanStart, scale(geom.unitVector, pad)), scale(wallNorm, halfThick + pad));
    const sRight = sub(sub(geom.spanStart, scale(geom.unitVector, pad)), scale(wallNorm, halfThick + pad));
    const eLeft = add(add(geom.spanEnd, scale(geom.unitVector, pad)), scale(wallNorm, halfThick + pad));
    const eRight = sub(add(geom.spanEnd, scale(geom.unitVector, pad)), scale(wallNorm, halfThick + pad));

    ctx.save();

    // Accent boundary box
    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
    ctx.strokeStyle = this.selectedColor;
    ctx.lineWidth = 2 * screenPixel;
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(sLeft.x, sLeft.y);
    ctx.lineTo(eLeft.x, eLeft.y);
    ctx.lineTo(eRight.x, eRight.y);
    ctx.lineTo(sRight.x, sRight.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Interactive flip handle buttons
    const btnRadius = 14 * screenPixel;
    const btnOffset = halfThick + 40 * screenPixel;

    const btnHPos = add(geom.center, scale(wallNorm, btnOffset));
    const btnVPos = sub(geom.center, scale(wallNorm, btnOffset));

    this.drawFlipButton(ctx, btnHPos, '⇄', 'Flip Swing (F)', btnRadius, screenPixel);
    this.drawFlipButton(ctx, btnVPos, '⇅', 'Flip Side (V)', btnRadius, screenPixel);

    ctx.restore();
  }

  /**
   * Draws a small circular flip handle button.
   */
  private drawFlipButton(
    ctx: CanvasRenderingContext2D,
    center: Point2D,
    symbol: string,
    _tooltip: string,
    radius: number,
    screenPixel: number
  ): void {
    ctx.save();

    // Shadow & background
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5 * screenPixel;

    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Icon symbol
    ctx.fillStyle = '#1d4ed8';
    ctx.font = `bold ${Math.round(radius * 1.2)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, center.x, center.y);

    ctx.restore();
  }

  /**
   * Returns button positions for hit testing flip buttons.
   */
  public static getFlipButtonPositions(
    geom: OpeningGeometry,
    zoom: number
  ): { flipH: Point2D; flipV: Point2D; radius: number } {
    const wallNorm = normal(geom.unitVector);
    const halfThick = geom.wallThickness / 2;
    const screenPixel = 1 / zoom;
    const btnOffset = halfThick + 40 * screenPixel;

    return {
      flipH: add(geom.center, scale(wallNorm, btnOffset)),
      flipV: sub(geom.center, scale(wallNorm, btnOffset)),
      radius: 14 * screenPixel,
    };
  }

  /**
   * Hit test helper: checks if a point in world coordinates is within the opening's bounding zone.
   */
  public static isPointNearOpening(
    point: Point2D,
    geom: OpeningGeometry,
    thresholdMm: number
  ): boolean {
    const dCenter = distance(point, geom.center);
    if (dCenter <= geom.width / 2 + thresholdMm) {
      return true;
    }
    return false;
  }
}
