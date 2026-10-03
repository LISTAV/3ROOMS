import type { Point2D, Vertex, Wall } from '../types.js';
import { distance, normalize, normal, scale, add, sub } from '../math/vector.js';
import { getLineIntersection } from '../math/line.js';

export interface WallEndpointMiter {
  wallId: string;
  isStart: boolean;        // true if vertex is wall's startId, false if endId
  leftPoint: Point2D;      // Adjusted boundary corner on left side (relative to wall direction)
  rightPoint: Point2D;     // Adjusted boundary corner on right side
  bevelPoints?: Point2D[]; // Optional points if miter limit triggered a bevel cut
}

export interface WallPolygon {
  wallId: string;
  polygon: Point2D[];      // Ordered counter-clockwise boundary points
}

interface WallRadialData {
  wall: Wall;
  isStart: boolean;
  dirAway: Point2D; // Unit vector pointing away from vertex
  normAway: Point2D; // Perpendicular normal to dirAway (-y, x)
  angle: number; // Angle in radians (-PI to PI)
  thickness: number;
}

/**
 * Computes corner miter points for all walls meeting at a shared vertex.
 * Handles dead-ends (degree 1), L-corners, T-junctions, cross-intersections (degree 2+),
 * collinear joins, and acute angle bevel clamping.
 */
export function computeVertexMiters(
  vertex: Vertex,
  connectedWalls: Wall[],
  allVertices: Record<string, Vertex>,
  miterLimitMultiplier: number = 2.5
): WallEndpointMiter[] {
  if (connectedWalls.length === 0) {
    return [];
  }

  // -------------------------------------------------------------------------
  // 1. Degree 1: Dead-End Wall Termination (Square perpendicular cap)
  // -------------------------------------------------------------------------
  if (connectedWalls.length === 1) {
    const wall = connectedWalls[0];
    const isStart = wall.startId === vertex.id;
    const startV = allVertices[wall.startId];
    const endV = allVertices[wall.endId];

    if (!startV || !endV) return [];

    const wallDir = normalize(sub(endV, startV));
    const wallNorm = normal(wallDir); // (-dy, dx)
    const halfThick = wall.thickness / 2;

    const leftPoint = add(vertex, scale(wallNorm, halfThick));
    const rightPoint = sub(vertex, scale(wallNorm, halfThick));

    return [
      {
        wallId: wall.id,
        isStart,
        leftPoint,
        rightPoint,
      },
    ];
  }

  // -------------------------------------------------------------------------
  // 2. Degree 2+: Corners, T-Junctions, Cross-Intersections
  // -------------------------------------------------------------------------
  // Compute outward direction vectors and angles for each wall
  const radials: WallRadialData[] = [];

  for (const wall of connectedWalls) {
    const isStart = wall.startId === vertex.id;
    const otherVertexId = isStart ? wall.endId : wall.startId;
    const otherVertex = allVertices[otherVertexId];

    if (!otherVertex) continue;

    const dirAway = normalize(sub(otherVertex, vertex));
    const normAway = normal(dirAway);
    const angle = Math.atan2(dirAway.y, dirAway.x);

    radials.push({
      wall,
      isStart,
      dirAway,
      normAway,
      angle,
      thickness: wall.thickness ?? 150,
    });
  }

  // Sort connected walls counter-clockwise by radial angle
  radials.sort((a, b) => a.angle - b.angle);

  const n = radials.length;
  // Initialize result mapping
  const results = new Map<string, WallEndpointMiter>();

  for (const r of radials) {
    results.set(r.wall.id, {
      wallId: r.wall.id,
      isStart: r.isStart,
      leftPoint: { x: vertex.x, y: vertex.y },
      rightPoint: { x: vertex.x, y: vertex.y },
    });
  }

  // Iterate over consecutive wall pairs around the vertex in CCW order
  for (let i = 0; i < n; i++) {
    const curr = radials[i];
    const next = radials[(i + 1) % n];

    const halfThickCurr = curr.thickness / 2;
    const halfThickNext = next.thickness / 2;

    // Left line of curr (relative to outward direction): passes through vertex + normAway * halfThick
    const lineCurrP1 = add(vertex, scale(curr.normAway, halfThickCurr));
    const lineCurrP2 = add(lineCurrP1, curr.dirAway);

    // Right line of next (relative to outward direction): passes through vertex - normAway * halfThick
    const lineNextP1 = sub(vertex, scale(next.normAway, halfThickNext));
    const lineNextP2 = add(lineNextP1, next.dirAway);

    // Check for collinearity / parallelism
    const crossProduct = curr.dirAway.x * next.dirAway.y - curr.dirAway.y * next.dirAway.x;
    const dotProduct = curr.dirAway.x * next.dirAway.x + curr.dirAway.y * next.dirAway.y;

    let miterPt: Point2D;
    let isBevel = false;
    let bevelP1: Point2D | null = null;
    let bevelP2: Point2D | null = null;

    if (Math.abs(crossProduct) < 1e-6) {
      if (dotProduct < 0) {
        // Collinear continuous wall (180 degrees opposite directions)
        // Offset lines are coincident and parallel
        miterPt = lineCurrP1;
      } else {
        // Overlapping identical direction (0 degrees)
        miterPt = lineCurrP1;
      }
    } else {
      // Find intersection of the boundary lines
      const intersect = getLineIntersection(lineCurrP1, lineCurrP2, lineNextP1, lineNextP2);

      if (intersect) {
        miterPt = intersect;
        const miterDist = distance(vertex, miterPt);
        const maxLimit = miterLimitMultiplier * Math.max(curr.thickness, next.thickness);

        // Miter limit clamping (acute corner spike guard)
        if (miterDist > maxLimit && miterDist > 1e-4) {
          isBevel = true;
          const miterDir = normalize(sub(miterPt, vertex));
          const bevelCenter = add(vertex, scale(miterDir, maxLimit));
          const bevelNormal = normal(miterDir); // Perpendicular to bisector

          const bLineP1 = bevelCenter;
          const bLineP2 = add(bevelCenter, bevelNormal);

          const bInt1 = getLineIntersection(lineCurrP1, lineCurrP2, bLineP1, bLineP2);
          const bInt2 = getLineIntersection(lineNextP1, lineNextP2, bLineP1, bLineP2);

          if (bInt1 && bInt2) {
            bevelP1 = bInt1;
            bevelP2 = bInt2;
          }
        }
      } else {
        miterPt = lineCurrP1;
      }
    }

    // Assign miter / bevel points to each wall
    const currEntry = results.get(curr.wall.id)!;
    const nextEntry = results.get(next.wall.id)!;

    // curr outward-left corner
    const currPoint = isBevel && bevelP1 ? bevelP1 : miterPt;
    if (curr.isStart) {
      currEntry.leftPoint = currPoint;
    } else {
      currEntry.rightPoint = currPoint;
    }

    // next outward-right corner
    const nextPoint = isBevel && bevelP2 ? bevelP2 : miterPt;
    if (next.isStart) {
      nextEntry.rightPoint = nextPoint;
    } else {
      nextEntry.leftPoint = nextPoint;
    }

    // Record bevel points if clamped
    if (isBevel && bevelP1 && bevelP2) {
      currEntry.bevelPoints = currEntry.bevelPoints ? [...currEntry.bevelPoints, bevelP1] : [bevelP1];
      nextEntry.bevelPoints = nextEntry.bevelPoints ? [...nextEntry.bevelPoints, bevelP2] : [bevelP2];
    }
  }

  return Array.from(results.values());
}

/**
 * Generates solid 2D closed polygon meshes for all walls in the floor plan graph,
 * resolving all corner miters and bevel transitions.
 */
export function generateWallPolygons(
  vertices: Record<string, Vertex>,
  walls: Record<string, Wall>,
  miterLimitMultiplier: number = 2.5
): Record<string, WallPolygon> {
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

  // 3. Assemble closed polygons for each wall
  const result: Record<string, WallPolygon> = {};

  for (const wall of Object.values(walls)) {
    const record = wallMiters.get(wall.id);
    const startV = vertices[wall.startId];
    const endV = vertices[wall.endId];

    if (!startV || !endV) continue;

    const startMiter = record?.start;
    const endMiter = record?.end;

    // Fallbacks if miter not found (e.g. degenerate case)
    const wallDir = normalize(sub(endV, startV));
    const wallNorm = normal(wallDir);
    const halfThick = wall.thickness / 2;

    const ls = startMiter ? startMiter.leftPoint : add(startV, scale(wallNorm, halfThick));
    const rs = startMiter ? startMiter.rightPoint : sub(startV, scale(wallNorm, halfThick));
    const le = endMiter ? endMiter.leftPoint : add(endV, scale(wallNorm, halfThick));
    const re = endMiter ? endMiter.rightPoint : sub(endV, scale(wallNorm, halfThick));

    // Polygon ordered: [LS, LE, (optional end bevels), RE, RS, (optional start bevels)]
    const pts: Point2D[] = [ls, le];

    if (endMiter?.bevelPoints) {
      pts.push(...endMiter.bevelPoints);
    }

    pts.push(re, rs);

    if (startMiter?.bevelPoints) {
      pts.push(...startMiter.bevelPoints);
    }

    // Filter consecutive duplicate points
    const cleanPts: Point2D[] = [];
    for (let i = 0; i < pts.length; i++) {
      const nextPt = pts[(i + 1) % pts.length];
      if (distance(pts[i], nextPt) > 1e-4) {
        cleanPts.push(pts[i]);
      }
    }

    result[wall.id] = {
      wallId: wall.id,
      polygon: cleanPts.length >= 3 ? cleanPts : pts,
    };
  }

  return result;
}
