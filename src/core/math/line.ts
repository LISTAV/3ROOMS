import type { Point2D } from '../types.js';
import { distance, length, normal, normalize, scale, add } from './vector.js';

const EPSILON = 1e-9;

/**
 * Computes the intersection point of infinite lines passing through p1-p2 and p3-p4.
 * Returns null if the lines are parallel or collinear, or if either line is degenerate.
 */
export function getLineIntersection(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D
): Point2D | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;

  // Cross product of directions gives determinant
  const det = d1x * d2y - d1y * d2x;

  // Parallel or collinear if determinant is near zero
  if (Math.abs(det) < EPSILON) {
    return null;
  }

  const dx31 = p3.x - p1.x;
  const dy31 = p3.y - p1.y;

  const t = (dx31 * d2y - dy31 * d2x) / det;

  return {
    x: p1.x + t * d1x,
    y: p1.y + t * d1y,
  };
}

/**
 * Computes intersection restricted strictly to the line segments p1-p2 and p3-p4.
 * Returns null if the segments do not intersect, or if they overlap collinearly over an interval.
 * Returns the contact point if segments meet at a T-junction, corner, or single touching point.
 */
export function getSegmentIntersection(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D
): Point2D | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;

  const det = d1x * d2y - d1y * d2x;

  if (Math.abs(det) > EPSILON) {
    const dx31 = p3.x - p1.x;
    const dy31 = p3.y - p1.y;

    const t = (dx31 * d2y - dy31 * d2x) / det;
    const u = (dx31 * d1y - dy31 * d1x) / det;

    if (t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) {
      const clampedT = Math.max(0, Math.min(1, t));
      return {
        x: p1.x + clampedT * d1x,
        y: p1.y + clampedT * d1y,
      };
    }

    return null;
  }

  // Lines are parallel or collinear
  const len1Sq = d1x * d1x + d1y * d1y;
  const len2Sq = d2x * d2x + d2y * d2y;

  // Degenerate segments (points)
  if (len1Sq < EPSILON * EPSILON && len2Sq < EPSILON * EPSILON) {
    if (distance(p1, p3) < EPSILON) {
      return { x: p1.x, y: p1.y };
    }
    return null;
  }

  // Check collinearity
  const dx31 = p3.x - p1.x;
  const dy31 = p3.y - p1.y;
  const crossVal = dx31 * d1y - dy31 * d1x;

  if (Math.abs(crossVal) > EPSILON * Math.sqrt(Math.max(len1Sq, 1))) {
    // Parallel and non-collinear
    return null;
  }

  // Collinear: project segment 2 onto segment 1
  if (len1Sq >= EPSILON * EPSILON) {
    const t3 = (dx31 * d1x + dy31 * d1y) / len1Sq;
    const t4 = ((p4.x - p1.x) * d1x + (p4.y - p1.y) * d1y) / len1Sq;
    const tMin = Math.min(t3, t4);
    const tMax = Math.max(t3, t4);

    const overlapStart = Math.max(0, tMin);
    const overlapEnd = Math.min(1, tMax);

    if (overlapStart > overlapEnd + EPSILON) {
      return null;
    }

    if (Math.abs(overlapStart - overlapEnd) <= EPSILON) {
      const t = Math.max(0, Math.min(1, overlapStart));
      return {
        x: p1.x + t * d1x,
        y: p1.y + t * d1y,
      };
    }

    // Overlaps over a segment of length > 0
    return null;
  }

  // Segment 1 is a point, segment 2 has length
  const proj = projectPointOnSegment(p1, p3, p4);
  if (proj.distance < EPSILON) {
    return { x: p1.x, y: p1.y };
  }

  return null;
}

/**
 * Projects a point onto a line segment a-b.
 * Clamps t to [0.0, 1.0] representing offset ratio along segment.
 */
export function projectPointOnSegment(
  p: Point2D,
  a: Point2D,
  b: Point2D
): { point: Point2D; t: number; distance: number } {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lenSq = vx * vx + vy * vy;

  if (lenSq < EPSILON * EPSILON) {
    return {
      point: { x: a.x, y: a.y },
      t: 0,
      distance: distance(p, a),
    };
  }

  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const rawT = (apx * vx + apy * vy) / lenSq;
  const t = Math.max(0, Math.min(1, rawT));

  const projPoint: Point2D = {
    x: a.x + t * vx,
    y: a.y + t * vy,
  };

  return {
    point: projPoint,
    t,
    distance: distance(p, projPoint),
  };
}

/**
 * Offsets a line segment outward along its normal by distance.
 * The normal is defined as (-y, x) relative to direction vector end - start.
 */
export function computeParallelOffset(
  start: Point2D,
  end: Point2D,
  dist: number
): [Point2D, Point2D] {
  const dir: Point2D = { x: end.x - start.x, y: end.y - start.y };
  const len = length(dir);

  if (len < EPSILON) {
    return [{ ...start }, { ...end }];
  }

  const unitDir = normalize(dir);
  const norm = normal(unitDir);
  const offsetVec = scale(norm, dist);

  return [add(start, offsetVec), add(end, offsetVec)];
}
