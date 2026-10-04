import type { FloorPlanState, Point2D } from '../types.js';
import { generateWallPolygons, WallPolygon } from '../geometry/miter.js';
import { generateWallPolygonsWithOpenings, computeOpeningGeometry } from '../geometry/openings.js';
import { computeDimensionLine, formatDimension, normalizeTextAngle } from '../../engine/renderer/DimensionRenderer.js';
import { normal, scale, add, sub } from '../math/vector.js';
import { assetManager } from '../assets/AssetManager.js';

export interface DxfExportOptions {
  includeDimensions?: boolean;
  includeFurniture?: boolean;
  includeRooms?: boolean;
}

class DxfWriter {
  private lines: string[] = [];

  public write(code: number, value: string | number): void {
    this.lines.push(code.toString());
    this.lines.push(typeof value === 'number' ? (Number.isInteger(value) ? value.toString() : value.toFixed(3)) : value);
  }

  public writeLineEntity(
    layer: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): void {
    this.write(0, 'LINE');
    this.write(8, layer);
    this.write(10, x1);
    this.write(20, y1);
    this.write(30, 0.0);
    this.write(11, x2);
    this.write(21, y2);
    this.write(31, 0.0);
  }

  public writeLwPolyline(layer: string, points: Point2D[], closed: boolean = true): void {
    if (points.length === 0) return;
    this.write(0, 'LWPOLYLINE');
    this.write(8, layer);
    this.write(90, points.length);
    this.write(70, closed ? 1 : 0);
    for (const pt of points) {
      this.write(10, pt.x);
      this.write(20, pt.y);
    }
  }

  public writeArc(
    layer: string,
    cx: number,
    cy: number,
    radius: number,
    startAngleDeg: number,
    endAngleDeg: number
  ): void {
    // DXF angles are 0-360 CCW
    let a1 = startAngleDeg % 360;
    if (a1 < 0) a1 += 360;
    let a2 = endAngleDeg % 360;
    if (a2 < 0) a2 += 360;

    this.write(0, 'ARC');
    this.write(8, layer);
    this.write(10, cx);
    this.write(20, cy);
    this.write(30, 0.0);
    this.write(40, radius);
    this.write(50, a1);
    this.write(51, a2);
  }

  public writeText(
    layer: string,
    x: number,
    y: number,
    height: number,
    text: string,
    rotationDeg: number = 0,
    hAlign: number = 1, // 1 = Center
    vAlign: number = 2  // 2 = Middle
  ): void {
    this.write(0, 'TEXT');
    this.write(8, layer);
    this.write(10, x);
    this.write(20, y);
    this.write(30, 0.0);
    this.write(40, height);
    this.write(1, text);
    if (rotationDeg !== 0) {
      let rot = rotationDeg % 360;
      if (rot < 0) rot += 360;
      this.write(50, rot);
    }
    if (hAlign > 0 || vAlign > 0) {
      this.write(72, hAlign);
      this.write(11, x);
      this.write(21, y);
      this.write(31, 0.0);
      this.write(73, vAlign);
    }
  }

  public toString(): string {
    return this.lines.join('\n');
  }
}

/**
 * Generates an AutoCAD 2000 (AC1015) standard DXF text document from a FloorPlanState.
 */
export function exportToDxf(state: FloorPlanState, options: DxfExportOptions = {}): string {
  const includeDimensions = options.includeDimensions ?? true;
  const includeFurniture = options.includeFurniture ?? true;
  const includeRooms = options.includeRooms ?? true;

  const w = new DxfWriter();

  // 1. HEADER SECTION
  w.write(0, 'SECTION');
  w.write(2, 'HEADER');
  w.write(9, '$ACADVER');
  w.write(1, 'AC1015'); // AutoCAD 2000 format
  w.write(9, '$INSUNITS');
  w.write(70, 4); // Millimeters
  w.write(0, 'ENDSEC');

  // 2. TABLES SECTION (Layers with distinct AutoCAD Color Index ACI)
  w.write(0, 'SECTION');
  w.write(2, 'TABLES');

  // VPORT Table
  w.write(0, 'TABLE');
  w.write(2, 'VPORT');
  w.write(70, 0);
  w.write(0, 'ENDTAB');

  // LTYPE Table
  w.write(0, 'TABLE');
  w.write(2, 'LTYPE');
  w.write(70, 2);
  w.write(0, 'LTYPE');
  w.write(2, 'CONTINUOUS');
  w.write(70, 0);
  w.write(3, 'Solid line');
  w.write(72, 65);
  w.write(73, 0);
  w.write(40, 0.0);
  w.write(0, 'LTYPE');
  w.write(2, 'DASHED');
  w.write(70, 0);
  w.write(3, 'Dashed line');
  w.write(72, 65);
  w.write(73, 2);
  w.write(40, 10.0);
  w.write(49, 5.0);
  w.write(49, -5.0);
  w.write(0, 'ENDTAB');

  // LAYER Table: WALLS, DOORS, WINDOWS, ROOMS, DIMENSIONS, FURNITURE
  w.write(0, 'TABLE');
  w.write(2, 'LAYER');
  w.write(70, 6);

  const layers: Array<{ name: string; color: number }> = [
    { name: 'WALLS', color: 7 },       // 7 = White/Black
    { name: 'DOORS', color: 1 },       // 1 = Red
    { name: 'WINDOWS', color: 4 },     // 4 = Cyan
    { name: 'ROOMS', color: 8 },       // 8 = Dark Gray
    { name: 'DIMENSIONS', color: 3 },  // 3 = Green
    { name: 'FURNITURE', color: 6 },   // 6 = Magenta
  ];

  for (const layer of layers) {
    w.write(0, 'LAYER');
    w.write(2, layer.name);
    w.write(70, 0);
    w.write(62, layer.color);
    w.write(6, 'CONTINUOUS');
  }

  w.write(0, 'ENDTAB');
  w.write(0, 'ENDSEC');

  // 3. ENTITIES SECTION
  w.write(0, 'SECTION');
  w.write(2, 'ENTITIES');

  // ---------------------------------------------------------
  // WALLS (Closed LWPOLYLINE)
  // ---------------------------------------------------------
  const hasOpenings = Object.keys(state.openings || {}).length > 0;
  const wallPolygons: WallPolygon[] = hasOpenings
    ? generateWallPolygonsWithOpenings(state.vertices, state.walls, state.openings)
    : Object.values(generateWallPolygons(state.vertices, state.walls));

  for (const wp of wallPolygons) {
    if (wp.polygon.length < 3) continue;
    w.writeLwPolyline('WALLS', wp.polygon, true);
  }

  // ---------------------------------------------------------
  // OPENINGS (DOORS & WINDOWS)
  // ---------------------------------------------------------
  for (const opening of Object.values(state.openings || {})) {
    const wall = state.walls[opening.wallId];
    if (!wall) continue;

    const geom = computeOpeningGeometry(opening, wall, state.vertices);
    if (!geom) continue;

    const wallNorm = normal(geom.unitVector);
    const halfThick = geom.wallThickness / 2;

    const sLeft = add(geom.spanStart, scale(wallNorm, halfThick));
    const sRight = sub(geom.spanStart, scale(wallNorm, halfThick));
    const eLeft = add(geom.spanEnd, scale(wallNorm, halfThick));
    const eRight = sub(geom.spanEnd, scale(wallNorm, halfThick));

    if (geom.type === 'single_door') {
      const leafThickness = 35;
      const width = geom.width;
      const hinge = geom.flipH ? geom.spanEnd : geom.spanStart;
      const dWall = geom.flipH ? scale(geom.unitVector, -1) : geom.unitVector;
      const dOpen = geom.normalVector;

      // Door Leaf rectangle (LINE or LWPOLYLINE)
      const p1 = hinge;
      const p2 = add(hinge, scale(dOpen, width));
      const p3 = add(p2, scale(dWall, leafThickness));
      const p4 = add(hinge, scale(dWall, leafThickness));
      w.writeLwPolyline('DOORS', [p1, p2, p3, p4], true);

      // Swing Arc
      const alphaClosed = Math.atan2(dWall.y, dWall.x);
      const alphaOpen = Math.atan2(dOpen.y, dOpen.x);
      let degClosed = (alphaClosed * 180) / Math.PI;
      let degOpen = (alphaOpen * 180) / Math.PI;

      let delta = (alphaOpen - alphaClosed) % (Math.PI * 2);
      if (delta < 0) delta += Math.PI * 2;

      // In DXF, ARC always renders counter-clockwise from startAngle to endAngle
      if (delta > Math.PI) {
        // Clockwise in normal space -> Start at Open, End at Closed
        w.writeArc('DOORS', hinge.x, hinge.y, width, degOpen, degClosed);
      } else {
        // Counter-clockwise -> Start at Closed, End at Open
        w.writeArc('DOORS', hinge.x, hinge.y, width, degClosed, degOpen);
      }
    } else if (geom.type === 'double_door') {
      const leafThickness = 35;
      const halfWidth = geom.width / 2;
      const dOpen = geom.normalVector;

      // Leaf 1
      const hinge1 = geom.spanStart;
      const dWall1 = geom.unitVector;
      const p1 = hinge1;
      const p2 = add(hinge1, scale(dOpen, halfWidth));
      const p3 = add(p2, scale(dWall1, leafThickness));
      const p4 = add(hinge1, scale(dWall1, leafThickness));
      w.writeLwPolyline('DOORS', [p1, p2, p3, p4], true);

      // Leaf 2
      const hinge2 = geom.spanEnd;
      const dWall2 = scale(geom.unitVector, -1);
      const q1 = hinge2;
      const q2 = add(hinge2, scale(dOpen, halfWidth));
      const q3 = add(q2, scale(dWall2, leafThickness));
      const q4 = add(hinge2, scale(dWall2, leafThickness));
      w.writeLwPolyline('DOORS', [q1, q2, q3, q4], true);

      // Arcs
      const deg1Closed = (Math.atan2(dWall1.y, dWall1.x) * 180) / Math.PI;
      const deg1Open = (Math.atan2(dOpen.y, dOpen.x) * 180) / Math.PI;
      w.writeArc('DOORS', hinge1.x, hinge1.y, halfWidth, deg1Closed, deg1Open);

      const deg2Closed = (Math.atan2(dWall2.y, dWall2.x) * 180) / Math.PI;
      const deg2Open = (Math.atan2(dOpen.y, dOpen.x) * 180) / Math.PI;
      w.writeArc('DOORS', hinge2.x, hinge2.y, halfWidth, deg2Open, deg2Closed);
    } else if (
      geom.type === 'window' ||
      geom.type === 'sliding_window' ||
      geom.type === 'fixed_window'
    ) {
      // Jamb lines
      w.writeLineEntity('WINDOWS', sLeft.x, sLeft.y, sRight.x, sRight.y);
      w.writeLineEntity('WINDOWS', eLeft.x, eLeft.y, eRight.x, eRight.y);

      // Outer sills
      w.writeLineEntity('WINDOWS', sLeft.x, sLeft.y, eLeft.x, eLeft.y);
      w.writeLineEntity('WINDOWS', sRight.x, sRight.y, eRight.x, eRight.y);

      // Glass lines
      const glassOffset = Math.min(15, halfThick * 0.3);
      const g1Start = add(geom.spanStart, scale(wallNorm, glassOffset));
      const g1End = add(geom.spanEnd, scale(wallNorm, glassOffset));
      const g2Start = sub(geom.spanStart, scale(wallNorm, glassOffset));
      const g2End = sub(geom.spanEnd, scale(wallNorm, glassOffset));

      w.writeLineEntity('WINDOWS', g1Start.x, g1Start.y, g1End.x, g1End.y);
      w.writeLineEntity('WINDOWS', g2Start.x, g2Start.y, g2End.x, g2End.y);
    }
  }

  // ---------------------------------------------------------
  // ROOMS (Labels and boundaries)
  // ---------------------------------------------------------
  if (includeRooms) {
    for (const room of Object.values(state.rooms || {})) {
      let pts: Point2D[] = [];
      if (room.points && room.points.length >= 3) {
        pts = room.points;
      } else if (room.vertexIds && room.vertexIds.length >= 3) {
        pts = room.vertexIds.map((id) => state.vertices[id]).filter(Boolean);
      }

      if (pts.length >= 3) {
        w.writeLwPolyline('ROOMS', pts, true);
      }

      let centroid = room.centroid;
      if (!centroid && pts.length >= 3) {
        let cx = 0;
        let cy = 0;
        for (const p of pts) {
          cx += p.x;
          cy += p.y;
        }
        centroid = { x: cx / pts.length, y: cy / pts.length };
      }

      if (centroid) {
        const roomName = room.name || 'Room';
        const areaM2 = (room.areaMm2 / 1000000).toFixed(2);
        w.writeText('ROOMS', centroid.x, centroid.y + 100, 160, roomName, 0, 1, 2);
        w.writeText('ROOMS', centroid.x, centroid.y - 100, 120, `${areaM2} m²`, 0, 1, 2);
      }
    }
  }

  // ---------------------------------------------------------
  // FURNITURE
  // ---------------------------------------------------------
  if (includeFurniture) {
    for (const inst of Object.values(state.furniture || {})) {
      const hw = inst.width / 2;
      const hh = inst.height / 2;
      const cosR = Math.cos(inst.rotation);
      const sinR = Math.sin(inst.rotation);

      // Local 4 corners transformed
      const corners: Point2D[] = [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ].map((c) => ({
        x: inst.x + c.x * cosR - c.y * sinR,
        y: inst.y + c.x * sinR + c.y * cosR,
      }));

      w.writeLwPolyline('FURNITURE', corners, true);

      // Furniture Name
      const def = assetManager.getDefinition(inst.defId);
      const label = def?.name || inst.defId;
      const rotDeg = (inst.rotation * 180) / Math.PI;
      w.writeText('FURNITURE', inst.x, inst.y, 100, label, rotDeg, 1, 2);
    }
  }

  // ---------------------------------------------------------
  // DIMENSIONS
  // ---------------------------------------------------------
  if (includeDimensions) {
    for (const wall of Object.values(state.walls || {})) {
      const startV = state.vertices[wall.startId];
      const endV = state.vertices[wall.endId];
      if (!startV || !endV) continue;

      const geom = computeDimensionLine(startV, endV, 350);
      if (geom.length < 1e-3) continue;

      const { dimStart, dimEnd } = geom;

      // Witness extension lines
      w.writeLineEntity('DIMENSIONS', startV.x, startV.y, dimStart.x, dimStart.y);
      w.writeLineEntity('DIMENSIONS', endV.x, endV.y, dimEnd.x, dimEnd.y);

      // Baseline
      w.writeLineEntity('DIMENSIONS', dimStart.x, dimStart.y, dimEnd.x, dimEnd.y);

      // 45 degree ticks
      const dir: Point2D = { x: endV.x - startV.x, y: endV.y - startV.y };
      const baselineAngle = Math.atan2(dir.y, dir.x);
      const tickAngle = baselineAngle + Math.PI / 4;
      const tickHalfLen = 45;
      const tickDx = tickHalfLen * Math.cos(tickAngle);
      const tickDy = tickHalfLen * Math.sin(tickAngle);

      w.writeLineEntity(
        'DIMENSIONS',
        dimStart.x - tickDx,
        dimStart.y - tickDy,
        dimStart.x + tickDx,
        dimStart.y + tickDy
      );
      w.writeLineEntity(
        'DIMENSIONS',
        dimEnd.x - tickDx,
        dimEnd.y - tickDy,
        dimEnd.x + tickDx,
        dimEnd.y + tickDy
      );

      // Centered Text Label
      const mid: Point2D = {
        x: (dimStart.x + dimEnd.x) / 2,
        y: (dimStart.y + dimEnd.y) / 2,
      };
      const label = formatDimension(geom.length);
      const { angle: textAngle } = normalizeTextAngle(baselineAngle);
      const textDeg = (textAngle * 180) / Math.PI;

      w.writeText('DIMENSIONS', mid.x, mid.y, 120, label, textDeg, 1, 2);
    }
  }

  w.write(0, 'ENDSEC');
  w.write(0, 'EOF');

  return w.toString();
}
