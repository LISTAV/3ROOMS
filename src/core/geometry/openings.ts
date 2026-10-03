import type { Point2D, Wall, Vertex, Opening, OpeningType } from '../types.js';
import { distance, normalize, normal, scale, add, sub, dot, length } from '../math/vector.js';
import { computeVertexMiters, type WallEndpointMiter, type WallPolygon } from './miter.js';

export interface OpeningGeometry {
  openingId: string;
  wallId: string;
  center: Point2D;
  spanStart: Point2D;      // World point where opening begins along wall
  spanEnd: Point2D;        // World point where opening ends along wall
  unitVector: Point2D;     // Direction vector along the wall (start -> end)
  normalVector: Point2D;   // Perpendicular normal vector (inverts with flipV)
  width: number;
  wallThickness: number;
  type: OpeningType;
  flipH: boolean;          // Invert swing direction (hinge at start vs hinge at end)
  flipV: boolean;          // Invert swing side (open inside vs open outside)
}

/**
 * Calculates world coordinates, orientation vectors, and linear cutout spans
 * for an opening parametrically anchored to a parent wall.
 */
export function computeOpeningGeometry(
  opening: Opening,
  wall: Wall,
  vertices: Record<string, Vertex>
): OpeningGeometry | null {
  const startV = vertices[wall.startId];
  const endV = vertices[wall.endId];

  if (!startV || !endV) {
    return null;
  }

  const wallVec = sub(endV, startV);
  const wallLen = length(wallVec);

  if (wallLen < 1e-4) {
    return null;
  }

  const unitVector = normalize(wallVec);

  // Guard minimum wall length: opening must fit along wall
  if (wallLen < opening.width) {
    return null;
  }

  // Margin clamping: openings must maintain at least half-thickness margin from both ends
  const margin = wall.thickness / 2 + opening.width / 2;
  let centerDistance: number;

  if (wallLen >= 2 * margin) {
    centerDistance = Math.max(margin, Math.min(wallLen - margin, opening.offsetRatio * wallLen));
  } else {
    // If wall length cannot accommodate full margins but fits opening, center it
    centerDistance = wallLen / 2;
  }

  const center = add(startV, scale(unitVector, centerDistance));
  const halfWidth = opening.width / 2;

  const spanStart = sub(center, scale(unitVector, halfWidth));
  const spanEnd = add(center, scale(unitVector, halfWidth));

  // Base normal points to the left of the wall vector (-dy, dx)
  const baseNormal = normal(unitVector);
  // flipV inverts the normal vector direction (swing side)
  const normalVector = opening.flipV ? scale(baseNormal, -1) : baseNormal;

  return {
    openingId: opening.id,
    wallId: wall.id,
    center,
    spanStart,
    spanEnd,
    unitVector,
    normalVector,
    width: opening.width,
    wallThickness: wall.thickness,
    type: opening.type,
    flipH: opening.flipH,
    flipV: opening.flipV,
  };
}

/**
 * Retrieves the hinge and latch world coordinates for a door opening.
 * When flipH is false, hinge is at spanStart and latch is at spanEnd.
 * When flipH is true, hinge is at spanEnd and latch is at spanStart.
 */
export function getDoorHingeAndLatch(geom: OpeningGeometry): { hinge: Point2D; latch: Point2D } {
  if (!geom.flipH) {
    return { hinge: geom.spanStart, latch: geom.spanEnd };
  } else {
    return { hinge: geom.spanEnd, latch: geom.spanStart };
  }
}

/**
 * Cleanly slices a parent wall into solid wall polygon chunks by cutting out opening voids
 * and capping cutout boundaries with perpendicular wall jambs.
 */
export function sliceWallIntoPolygons(
  wall: Wall,
  openings: Opening[],
  vertices: Record<string, Vertex>,
  startMiter?: WallEndpointMiter,
  endMiter?: WallEndpointMiter
): Point2D[][] {
  const startV = vertices[wall.startId];
  const endV = vertices[wall.endId];

  if (!startV || !endV) {
    return [];
  }

  const wallVec = sub(endV, startV);
  const wallLen = length(wallVec);

  if (wallLen < 1e-4) {
    return [];
  }

  const unitVector = normalize(wallVec);
  const wallNorm = normal(unitVector); // Left normal (-dy, dx)
  const halfThick = wall.thickness / 2;

  // Compute mitered or perpendicular end boundary corners at wall endpoints
  const ls = startMiter ? startMiter.leftPoint : add(startV, scale(wallNorm, halfThick));
  const rs = startMiter ? startMiter.rightPoint : sub(startV, scale(wallNorm, halfThick));
  const le = endMiter ? endMiter.leftPoint : add(endV, scale(wallNorm, halfThick));
  const re = endMiter ? endMiter.rightPoint : sub(endV, scale(wallNorm, halfThick));

  // Compute and sort opening geometries along wall
  interface OpeningSpan {
    startDist: number;
    endDist: number;
    spanStart: Point2D;
    spanEnd: Point2D;
  }

  const validSpans: OpeningSpan[] = [];

  for (const op of openings) {
    if (op.wallId !== wall.id) continue;
    const geom = computeOpeningGeometry(op, wall, vertices);
    if (!geom) continue;

    const startDist = dot(sub(geom.spanStart, startV), unitVector);
    const endDist = dot(sub(geom.spanEnd, startV), unitVector);

    validSpans.push({
      startDist: Math.max(0, Math.min(wallLen, startDist)),
      endDist: Math.max(0, Math.min(wallLen, endDist)),
      spanStart: geom.spanStart,
      spanEnd: geom.spanEnd,
    });
  }

  // Sort spans ascending by start distance from wall start
  validSpans.sort((a, b) => a.startDist - b.startDist);

  // If no openings, return single full wall polygon
  if (validSpans.length === 0) {
    const pts: Point2D[] = [ls, le];
    if (endMiter?.bevelPoints) {
      pts.push(...endMiter.bevelPoints);
    }
    pts.push(re, rs);
    if (startMiter?.bevelPoints) {
      pts.push(...startMiter.bevelPoints);
    }
    return [cleanPolygon(pts)];
  }

  // Construct solid wall chunks between openings
  interface SolidChunkInterval {
    fromDist: number;
    toDist: number;
    isStart: boolean;
    isEnd: boolean;
    startPoint: Point2D;
    endPoint: Point2D;
  }

  const chunks: SolidChunkInterval[] = [];

  // Chunk 0: from wall start (Vs) to first opening spanStart
  if (validSpans[0].startDist > 1e-3) {
    chunks.push({
      fromDist: 0,
      toDist: validSpans[0].startDist,
      isStart: true,
      isEnd: false,
      startPoint: startV,
      endPoint: validSpans[0].spanStart,
    });
  }

  // Chunk i: from opening i spanEnd to opening i+1 spanStart
  for (let i = 0; i < validSpans.length - 1; i++) {
    const fromDist = validSpans[i].endDist;
    const toDist = validSpans[i + 1].startDist;

    if (toDist - fromDist > 1e-3) {
      chunks.push({
        fromDist,
        toDist,
        isStart: false,
        isEnd: false,
        startPoint: validSpans[i].spanEnd,
        endPoint: validSpans[i + 1].spanStart,
      });
    }
  }

  // Chunk K: from last opening spanEnd to wall end (Ve)
  const lastSpan = validSpans[validSpans.length - 1];
  if (wallLen - lastSpan.endDist > 1e-3) {
    chunks.push({
      fromDist: lastSpan.endDist,
      toDist: wallLen,
      isStart: false,
      isEnd: true,
      startPoint: lastSpan.spanEnd,
      endPoint: endV,
    });
  }

  // Build boundary polygon for each solid chunk
  const resultPolygons: Point2D[][] = [];

  for (const chunk of chunks) {
    const startLeft = chunk.isStart ? ls : add(chunk.startPoint, scale(wallNorm, halfThick));
    const startRight = chunk.isStart ? rs : sub(chunk.startPoint, scale(wallNorm, halfThick));
    const endLeft = chunk.isEnd ? le : add(chunk.endPoint, scale(wallNorm, halfThick));
    const endRight = chunk.isEnd ? re : sub(chunk.endPoint, scale(wallNorm, halfThick));

    const pts: Point2D[] = [startLeft, endLeft];

    if (chunk.isEnd && endMiter?.bevelPoints) {
      pts.push(...endMiter.bevelPoints);
    }

    pts.push(endRight, startRight);

    if (chunk.isStart && startMiter?.bevelPoints) {
      pts.push(...startMiter.bevelPoints);
    }

    const cleaned = cleanPolygon(pts);
    if (cleaned.length >= 3) {
      resultPolygons.push(cleaned);
    }
  }

  return resultPolygons;
}

/**
 * Generates solid wall polygons sliced by openings for the whole floor plan graph.
 */
export function generateWallPolygonsWithOpenings(
  vertices: Record<string, Vertex>,
  walls: Record<string, Wall>,
  openings: Record<string, Opening>,
  miterLimitMultiplier: number = 2.5
): WallPolygon[] {
  // Map wallId -> { startMiter?: WallEndpointMiter, endMiter?: WallEndpointMiter }
  const wallMiters = new Map<
    string,
    { start?: WallEndpointMiter; end?: WallEndpointMiter }
  >();

  for (const wall of Object.values(walls)) {
    wallMiters.set(wall.id, {});
  }

  // 1. Group walls by vertex
  const vertexToWalls = new Map<string, Wall[]>();
  for (const vId of Object.keys(vertices)) {
    vertexToWalls.set(vId, []);
  }

  for (const wall of Object.values(walls)) {
    vertexToWalls.get(wall.startId)?.push(wall);
    vertexToWalls.get(wall.endId)?.push(wall);
  }

  // 2. Compute miters for every vertex
  for (const [vId, connected] of vertexToWalls.entries()) {
    const vertex = vertices[vId];
    if (!vertex || connected.length === 0) continue;

    const miters = computeVertexMiters(vertex, connected, vertices, miterLimitMultiplier);

    for (const m of miters) {
      const record = wallMiters.get(m.wallId);
      if (record) {
        if (m.isStart) {
          record.start = m;
        } else {
          record.end = m;
        }
      }
    }
  }

  // 3. Assemble closed polygons for each wall, sliced by openings
  const result: WallPolygon[] = [];
  const openingList = Object.values(openings);

  for (const wall of Object.values(walls)) {
    const record = wallMiters.get(wall.id);
    const wallOps = openingList.filter((op) => op.wallId === wall.id);

    const subPolys = sliceWallIntoPolygons(
      wall,
      wallOps,
      vertices,
      record?.start,
      record?.end
    );

    for (const poly of subPolys) {
      result.push({
        wallId: wall.id,
        polygon: poly,
      });
    }
  }

  return result;
}

/**
 * Removes duplicate consecutive vertices from a 2D polygon.
 */
function cleanPolygon(pts: Point2D[]): Point2D[] {
  const clean: Point2D[] = [];
  for (let i = 0; i < pts.length; i++) {
    const nextPt = pts[(i + 1) % pts.length];
    if (distance(pts[i], nextPt) > 1e-4) {
      clean.push(pts[i]);
    }
  }
  return clean.length >= 3 ? clean : pts;
}
