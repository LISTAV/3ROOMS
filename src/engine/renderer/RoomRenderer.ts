import type { Vertex, RoomFace, Point2D } from '../../core/types.js';
import type { DetectedRoom } from '../../core/geometry/roomDetector.js';

export interface RoomRendererOptions {
  floorFillColor?: string;
  floorSelectedColor?: string;
  badgeBackgroundColor?: string;
}

/**
 * Renders floor plan room faces with subtle architectural tints,
 * selection highlights, and centered dimension badges (Name + Area in m²).
 */
export class RoomRenderer {
  public floorFillColor: string;
  public floorSelectedColor: string;
  public badgeBackgroundColor: string;

  constructor(options: RoomRendererOptions = {}) {
    this.floorFillColor = options.floorFillColor ?? 'rgba(241, 245, 249, 0.75)'; // slate-100
    this.floorSelectedColor = options.floorSelectedColor ?? 'rgba(59, 130, 246, 0.15)'; // blue-500 @ 15%
    this.badgeBackgroundColor = options.badgeBackgroundColor ?? 'rgba(255, 255, 255, 0.92)';
  }

  /**
   * Renders room floor polygons and centered area badges.
   */
  public render(
    ctx: CanvasRenderingContext2D,
    rooms: Record<string, RoomFace | DetectedRoom>,
    vertices: Record<string, Vertex>,
    selectedRoomId: string | null = null,
    zoom: number
  ): void {
    const roomList = Object.values(rooms);
    if (roomList.length === 0) return;

    const screenPixel = 1 / zoom;

    ctx.save();

    // -----------------------------------------------------------------
    // PASS 1: Floor Fills
    // -----------------------------------------------------------------
    for (const room of roomList) {
      const pts = this.getRoomPoints(room, vertices);
      if (pts.length < 3) continue;

      const isSelected = room.id === selectedRoomId;

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();

      // Floor tint
      const customColor = (room as RoomFace).color;
      ctx.fillStyle = isSelected
        ? this.floorSelectedColor
        : (customColor || this.floorFillColor);
      ctx.fill();

      // Selected inner contour dashed outline
      if (isSelected) {
        ctx.save();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5 * screenPixel;
        ctx.setLineDash([4 * screenPixel, 4 * screenPixel]);
        ctx.stroke();
        ctx.restore();
      }
    }

    // -----------------------------------------------------------------
    // PASS 2: Centered Architectural Badges (Name & Area in m²)
    // -----------------------------------------------------------------
    for (const room of roomList) {
      const centroid = this.getRoomCentroid(room, vertices);
      if (!centroid) continue;

      const areaM2 = (room.areaMm2 / 1000000).toFixed(2);
      const nameText = room.name || 'Room';
      const areaText = `${areaM2} m²`;

      this.renderBadge(ctx, centroid, nameText, areaText, screenPixel);
    }

    ctx.restore();
  }

  /**
   * Draws a crisp architectural badge at the room centroid.
   */
  private renderBadge(
    ctx: CanvasRenderingContext2D,
    centroid: Point2D,
    name: string,
    area: string,
    screenPixel: number
  ): void {
    ctx.save();
    ctx.translate(centroid.x, centroid.y);

    // Font definitions scaled by screenPixel
    const nameFontSize = Math.round(13 * screenPixel);
    const areaFontSize = Math.round(11 * screenPixel);

    ctx.font = `bold ${nameFontSize}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const nameWidth = ctx.measureText(name).width;

    ctx.font = `normal ${areaFontSize}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const areaWidth = ctx.measureText(area).width;

    const contentWidth = Math.max(nameWidth, areaWidth);
    const paddingX = 14 * screenPixel;
    const paddingY = 8 * screenPixel;
    const badgeWidth = contentWidth + paddingX * 2;
    const badgeHeight = 40 * screenPixel;
    const radius = 8 * screenPixel;

    // Draw pill/badge background
    ctx.fillStyle = this.badgeBackgroundColor;
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.9)'; // slate-300
    ctx.lineWidth = 1 * screenPixel;

    ctx.beginPath();
    this.roundRect(
      ctx,
      -badgeWidth / 2,
      -badgeHeight / 2,
      badgeWidth,
      badgeHeight,
      radius
    );
    ctx.fill();
    ctx.stroke();

    // Render Room Name (bold, slate-800)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1e293b';
    ctx.font = `bold ${nameFontSize}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(name, 0, -6 * screenPixel);

    // Render Area (regular, slate-500)
    ctx.fillStyle = '#64748b';
    ctx.font = `normal ${areaFontSize}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(area, 0, 9 * screenPixel);

    ctx.restore();
  }

  /**
   * Helper drawing rounded rectangle path.
   */
  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private getRoomPoints(
    room: RoomFace | DetectedRoom,
    vertices: Record<string, Vertex>
  ): Point2D[] {
    if ('points' in room && room.points && room.points.length > 0) {
      return room.points;
    }

    const pts: Point2D[] = [];
    for (const vId of room.vertexIds) {
      const v = vertices[vId];
      if (v) {
        pts.push({ x: v.x, y: v.y });
      }
    }
    return pts;
  }

  private getRoomCentroid(
    room: RoomFace | DetectedRoom,
    vertices: Record<string, Vertex>
  ): Point2D | null {
    if ('centroid' in room && room.centroid) {
      return room.centroid;
    }

    const pts = this.getRoomPoints(room, vertices);
    if (pts.length === 0) return null;

    let sx = 0;
    let sy = 0;
    for (const p of pts) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / pts.length, y: sy / pts.length };
  }
}
