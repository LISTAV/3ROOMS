import { describe, it, expect } from 'vitest';
import type { FloorPlanState, Point2D, Vertex, Wall, Opening, RoomFace } from '../src/core/types.js';
import {
  add,
  sub,
  scale,
  dot,
  cross,
  length,
  distance,
  normalize,
  normal,
  angleBetween,
  signedAngleBetween,
} from '../src/core/math/vector.js';
import {
  getLineIntersection,
  getSegmentIntersection,
  projectPointOnSegment,
  computeParallelOffset,
} from '../src/core/math/line.js';
import {
  calculateShoelaceArea,
  isPointInPolygon,
  getPolygonCentroid,
} from '../src/core/math/polygon.js';

describe('1. Vector Math', () => {
  it('computes distance and length on simple 3-4-5 triangles', () => {
    const v: Point2D = { x: 300, y: 400 };
    expect(length(v)).toBe(500);

    const a: Point2D = { x: 100, y: 100 };
    const b: Point2D = { x: 400, y: 500 };
    expect(distance(a, b)).toBe(500);
  });

  it('performs basic vector operations: add, sub, scale, dot, cross', () => {
    const a: Point2D = { x: 10, y: 20 };
    const b: Point2D = { x: 30, y: -5 };

    expect(add(a, b)).toEqual({ x: 40, y: 15 });
    expect(sub(a, b)).toEqual({ x: -20, y: 25 });
    expect(scale(a, 2.5)).toEqual({ x: 25, y: 50 });
    expect(dot(a, b)).toBe(10 * 30 + 20 * -5); // 300 - 100 = 200
    expect(cross(a, b)).toBe(10 * -5 - 20 * 30); // -50 - 600 = -650
  });

  it('normalizes vectors and handles zero vectors safely', () => {
    const v: Point2D = { x: 0, y: 500 };
    const unit = normalize(v);
    expect(unit.x).toBeCloseTo(0);
    expect(unit.y).toBeCloseTo(1);
    expect(length(unit)).toBeCloseTo(1);

    const zero = normalize({ x: 0, y: 0 });
    expect(zero).toEqual({ x: 0, y: 0 });
  });

  it('computes perpendicular normal vector (-y, x)', () => {
    const v: Point2D = { x: 100, y: 0 };
    const n = normal(v);
    expect(n).toEqual({ x: -0, y: 100 });
    expect(dot(v, n)).toBe(0);

    const v2: Point2D = { x: 30, y: 40 };
    const n2 = normal(v2);
    expect(n2).toEqual({ x: -40, y: 30 });
    expect(dot(v2, n2)).toBe(0);
  });

  it('computes angleBetween for acute angles, orthogonal, and parallel lines', () => {
    const xUnit: Point2D = { x: 100, y: 0 };
    const yUnit: Point2D = { x: 0, y: 100 };
    expect(angleBetween(xUnit, yUnit)).toBeCloseTo(Math.PI / 2);

    // Parallel
    expect(angleBetween(xUnit, { x: 500, y: 0 })).toBeCloseTo(0);

    // Opposite (collinear reverse)
    expect(angleBetween(xUnit, { x: -200, y: 0 })).toBeCloseTo(Math.PI);

    // Acute angle: 45 degrees (PI / 4)
    const acute45: Point2D = { x: 100, y: 100 };
    expect(angleBetween(xUnit, acute45)).toBeCloseTo(Math.PI / 4);

    // Acute angle: 30 degrees (PI / 6)
    const acute30: Point2D = { x: Math.sqrt(3) * 100, y: 100 };
    expect(angleBetween(xUnit, acute30)).toBeCloseTo(Math.PI / 6);

    // Symmetry
    expect(angleBetween(acute45, xUnit)).toBeCloseTo(Math.PI / 4);

    // Zero vector returns 0
    expect(angleBetween({ x: 0, y: 0 }, xUnit)).toBe(0);
  });

  it('computes signedAngleBetween with CCW positive and CW negative', () => {
    const a: Point2D = { x: 1, y: 0 };
    const b: Point2D = { x: 0, y: 1 };
    expect(signedAngleBetween(a, b)).toBeCloseTo(Math.PI / 2);
    expect(signedAngleBetween(b, a)).toBeCloseTo(-Math.PI / 2);
  });
});

describe('2. Line and Segment Math', () => {
  it('computes getLineIntersection for orthogonal crossing lines at (50, 50)', () => {
    const p1: Point2D = { x: 0, y: 50 };
    const p2: Point2D = { x: 100, y: 50 };
    const p3: Point2D = { x: 50, y: 0 };
    const p4: Point2D = { x: 50, y: 100 };

    const intersection = getLineIntersection(p1, p2, p3, p4);
    expect(intersection).not.toBeNull();
    expect(intersection!.x).toBeCloseTo(50);
    expect(intersection!.y).toBeCloseTo(50);
  });

  it('returns null for parallel lines in getLineIntersection', () => {
    const p1: Point2D = { x: 0, y: 0 };
    const p2: Point2D = { x: 100, y: 0 };
    const p3: Point2D = { x: 0, y: 50 };
    const p4: Point2D = { x: 100, y: 50 };

    expect(getLineIntersection(p1, p2, p3, p4)).toBeNull();
  });

  it('returns null for collinear overlapping lines in getLineIntersection', () => {
    const p1: Point2D = { x: 0, y: 0 };
    const p2: Point2D = { x: 100, y: 0 };
    const p3: Point2D = { x: 50, y: 0 };
    const p4: Point2D = { x: 200, y: 0 };

    expect(getLineIntersection(p1, p2, p3, p4)).toBeNull();
  });

  it('computes line intersection for acute angle crossings', () => {
    const p1: Point2D = { x: 0, y: 0 };
    const p2: Point2D = { x: 1000, y: 0 };
    const p3: Point2D = { x: 0, y: -100 };
    const p4: Point2D = { x: 500, y: 100 }; // crosses y=0 at x=250

    const pt = getLineIntersection(p1, p2, p3, p4);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeCloseTo(250);
    expect(pt!.y).toBeCloseTo(0);
  });

  it('computes getSegmentIntersection for strictly intersecting segments', () => {
    const p1: Point2D = { x: 0, y: 50 };
    const p2: Point2D = { x: 100, y: 50 };
    const p3: Point2D = { x: 50, y: 0 };
    const p4: Point2D = { x: 50, y: 100 };

    const pt = getSegmentIntersection(p1, p2, p3, p4);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeCloseTo(50);
    expect(pt!.y).toBeCloseTo(50);
  });

  it('returns null for segments whose infinite lines intersect outside segments', () => {
    const p1: Point2D = { x: 0, y: 0 };
    const p2: Point2D = { x: 50, y: 0 };
    const p3: Point2D = { x: 100, y: 10 };
    const p4: Point2D = { x: 100, y: 100 };

    expect(getSegmentIntersection(p1, p2, p3, p4)).toBeNull();
  });

  it('handles T-junction intersections in getSegmentIntersection', () => {
    // Wall 1: horizontal from (0, 1000) to (2000, 1000)
    // Wall 2: perpendicular wall meeting at T-junction (1000, 1000) to (1000, 2000)
    const p1: Point2D = { x: 0, y: 1000 };
    const p2: Point2D = { x: 2000, y: 1000 };
    const p3: Point2D = { x: 1000, y: 1000 };
    const p4: Point2D = { x: 1000, y: 2000 };

    const pt = getSegmentIntersection(p1, p2, p3, p4);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeCloseTo(1000);
    expect(pt!.y).toBeCloseTo(1000);
  });

  it('handles corner junctions sharing an endpoint at acute angles', () => {
    const p1: Point2D = { x: 0, y: 0 };
    const p2: Point2D = { x: 1000, y: 0 };
    const p3: Point2D = { x: 0, y: 0 };
    const p4: Point2D = { x: 800, y: 600 };

    const pt = getSegmentIntersection(p1, p2, p3, p4);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeCloseTo(0);
    expect(pt!.y).toBeCloseTo(0);
  });

  it('handles collinear segments: null for overlap, shared point when touching', () => {
    // Overlapping collinear segments
    const s1: Point2D = { x: 0, y: 0 };
    const s2: Point2D = { x: 1000, y: 0 };
    const s3: Point2D = { x: 500, y: 0 };
    const s4: Point2D = { x: 1500, y: 0 };
    expect(getSegmentIntersection(s1, s2, s3, s4)).toBeNull();

    // Collinear segments touching at single endpoint
    const t1: Point2D = { x: 0, y: 0 };
    const t2: Point2D = { x: 1000, y: 0 };
    const t3: Point2D = { x: 1000, y: 0 };
    const t4: Point2D = { x: 2000, y: 0 };
    const touchPt = getSegmentIntersection(t1, t2, t3, t4);
    expect(touchPt).not.toBeNull();
    expect(touchPt!.x).toBeCloseTo(1000);
    expect(touchPt!.y).toBeCloseTo(0);

    // Separated collinear segments
    const sep3: Point2D = { x: 1500, y: 0 };
    const sep4: Point2D = { x: 2500, y: 0 };
    expect(getSegmentIntersection(t1, t2, sep3, sep4)).toBeNull();
  });

  it('projects points on segment correctly: midpoint, beyond endpoints clamping', () => {
    const a: Point2D = { x: 0, y: 0 };
    const b: Point2D = { x: 1000, y: 0 };

    // Point exactly on segment (t = 0.5)
    const midProj = projectPointOnSegment({ x: 500, y: 0 }, a, b);
    expect(midProj.t).toBeCloseTo(0.5);
    expect(midProj.point.x).toBeCloseTo(500);
    expect(midProj.point.y).toBeCloseTo(0);
    expect(midProj.distance).toBeCloseTo(0);

    // Point perpendicular to midpoint
    const offMidProj = projectPointOnSegment({ x: 500, y: 250 }, a, b);
    expect(offMidProj.t).toBeCloseTo(0.5);
    expect(offMidProj.point.x).toBeCloseTo(500);
    expect(offMidProj.point.y).toBeCloseTo(0);
    expect(offMidProj.distance).toBeCloseTo(250);

    // Point beyond start clamping to t = 0
    const beforeProj = projectPointOnSegment({ x: -200, y: 50 }, a, b);
    expect(beforeProj.t).toBe(0);
    expect(beforeProj.point.x).toBe(0);
    expect(beforeProj.point.y).toBe(0);
    expect(beforeProj.distance).toBeCloseTo(Math.hypot(-200, 50));

    // Point beyond end clamping to t = 1
    const afterProj = projectPointOnSegment({ x: 1400, y: 300 }, a, b);
    expect(afterProj.t).toBe(1);
    expect(afterProj.point.x).toBe(1000);
    expect(afterProj.point.y).toBe(0);
    expect(afterProj.distance).toBeCloseTo(Math.hypot(400, 300));
  });

  it('offsets a line segment outward along its normal by distance', () => {
    const start: Point2D = { x: 0, y: 0 };
    const end: Point2D = { x: 1000, y: 0 };
    const offsetDist = 150; // wall half-thickness or offset

    const [offStart, offEnd] = computeParallelOffset(start, end, offsetDist);

    // Segment direction is (1, 0), normal is (0, 1)
    expect(offStart.x).toBeCloseTo(0);
    expect(offStart.y).toBeCloseTo(150);
    expect(offEnd.x).toBeCloseTo(1000);
    expect(offEnd.y).toBeCloseTo(150);

    // Check segment length is preserved
    expect(distance(offStart, offEnd)).toBeCloseTo(1000);
    // Check distance between parallel lines is exactly offsetDist
    expect(distance(start, offStart)).toBeCloseTo(150);
  });
});

describe('3. Polygon Math', () => {
  it('calculates Shoelace area for a 4000 x 3000 mm rectangle producing 12,000,000 mm2', () => {
    // Counter-clockwise rectangle
    const ccwRect: Point2D[] = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const ccwArea = calculateShoelaceArea(ccwRect);
    expect(ccwArea).toBe(12000000);

    // Clockwise rectangle
    const cwRect: Point2D[] = [
      { x: 0, y: 0 },
      { x: 0, y: 3000 },
      { x: 4000, y: 3000 },
      { x: 4000, y: 0 },
    ];
    const cwArea = calculateShoelaceArea(cwRect);
    expect(cwArea).toBe(-12000000);
  });

  it('handles degenerate polygons in calculateShoelaceArea', () => {
    expect(calculateShoelaceArea([])).toBe(0);
    expect(calculateShoelaceArea([{ x: 0, y: 0 }])).toBe(0);
    expect(calculateShoelaceArea([{ x: 0, y: 0 }, { x: 100, y: 100 }])).toBe(0);
  });

  it('determines point-in-polygon correctly using ray-casting', () => {
    const polygon: Point2D[] = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ];

    // Inside points
    expect(isPointInPolygon({ x: 2000, y: 1500 }, polygon)).toBe(true);
    expect(isPointInPolygon({ x: 100, y: 100 }, polygon)).toBe(true);

    // Outside points
    expect(isPointInPolygon({ x: 5000, y: 1500 }, polygon)).toBe(false);
    expect(isPointInPolygon({ x: -100, y: 1500 }, polygon)).toBe(false);
    expect(isPointInPolygon({ x: 2000, y: 3500 }, polygon)).toBe(false);
    expect(isPointInPolygon({ x: 2000, y: -500 }, polygon)).toBe(false);

    // Non-convex / L-shaped room
    const lShapedRoom: Point2D[] = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 2000 },
      { x: 2000, y: 2000 },
      { x: 2000, y: 4000 },
      { x: 0, y: 4000 },
    ];
    expect(isPointInPolygon({ x: 1000, y: 1000 }, lShapedRoom)).toBe(true);
    expect(isPointInPolygon({ x: 1000, y: 3000 }, lShapedRoom)).toBe(true);
    expect(isPointInPolygon({ x: 3000, y: 1000 }, lShapedRoom)).toBe(true);
    // In the cutout corner
    expect(isPointInPolygon({ x: 3000, y: 3000 }, lShapedRoom)).toBe(false);
  });

  it('calculates polygon centroid accurately', () => {
    // Rectangle centroid
    const rect: Point2D[] = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const rectCentroid = getPolygonCentroid(rect);
    expect(rectCentroid.x).toBeCloseTo(2000);
    expect(rectCentroid.y).toBeCloseTo(1500);

    // Triangle centroid: average of vertices (0,0), (600,0), (0,600) -> (200, 200)
    const triangle: Point2D[] = [
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      { x: 0, y: 600 },
    ];
    const triCentroid = getPolygonCentroid(triangle);
    expect(triCentroid.x).toBeCloseTo(200);
    expect(triCentroid.y).toBeCloseTo(200);

    // CW rectangle still produces correct centroid
    const cwRect: Point2D[] = [
      { x: 0, y: 0 },
      { x: 0, y: 3000 },
      { x: 4000, y: 3000 },
      { x: 4000, y: 0 },
    ];
    const cwCentroid = getPolygonCentroid(cwRect);
    expect(cwCentroid.x).toBeCloseTo(2000);
    expect(cwCentroid.y).toBeCloseTo(1500);
  });
});

describe('4. Data Contract Integrity', () => {
  it('validates construction of normalized floor plan state', () => {
    const v1: Vertex = { id: 'v1', x: 0, y: 0 };
    const v2: Vertex = { id: 'v2', x: 4000, y: 0 };
    const v3: Vertex = { id: 'v3', x: 4000, y: 3000 };
    const v4: Vertex = { id: 'v4', x: 0, y: 3000 };

    const w1: Wall = { id: 'w1', startId: 'v1', endId: 'v2', thickness: 150 };
    const w2: Wall = { id: 'w2', startId: 'v2', endId: 'v3', thickness: 150 };
    const w3: Wall = { id: 'w3', startId: 'v3', endId: 'v4', thickness: 150 };
    const w4: Wall = { id: 'w4', startId: 'v4', endId: 'v1', thickness: 150 };

    const opening: Opening = {
      id: 'o1',
      wallId: 'w1',
      offsetRatio: 0.5,
      width: 900,
      type: 'single_door',
      flipH: false,
      flipV: false,
    };

    const room: RoomFace = {
      id: 'r1',
      vertexIds: ['v1', 'v2', 'v3', 'v4'],
      wallIds: ['w1', 'w2', 'w3', 'w4'],
      areaMm2: 12000000,
    };

    const state: FloorPlanState = {
      vertices: { [v1.id]: v1, [v2.id]: v2, [v3.id]: v3, [v4.id]: v4 },
      walls: { [w1.id]: w1, [w2.id]: w2, [w3.id]: w3, [w4.id]: w4 },
      openings: { [opening.id]: opening },
      rooms: { [room.id]: room },
      furniture: {},
      selectedFurnitureId: null,
    };

    expect(state.vertices['v1'].x).toBe(0);
    expect(state.walls['w1'].thickness).toBe(150);
    expect(state.openings['o1'].type).toBe('single_door');
    expect(state.rooms['r1'].areaMm2).toBe(12000000);
  });
});
