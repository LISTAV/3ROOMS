import type { Point2D } from '../types.js';

/**
 * Calculates the signed area of a polygon using the Shoelace formula (Gauss's area formula).
 * Returns area in square millimeters.
 * Returns positive for counter-clockwise orientation and negative for clockwise.
 */
export function calculateShoelaceArea(points: Point2D[]): number {
  const n = points.length;
  if (n < 3) {
    return 0;
  }

  let sum = 0;
  for (let i = 0; i < n; i++) {
    const curr = points[i];
    const next = points[(i + 1) % n];
    sum += curr.x * next.y - next.x * curr.y;
  }

  return sum / 2;
}

/**
 * Determines whether a point is inside a polygon using the Ray-Casting algorithm.
 */
export function isPointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  const n = polygon.length;
  if (n < 3) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];

    const crossesY = (pi.y > point.y) !== (pj.y > point.y);
    if (crossesY) {
      const xIntersect = pj.x + ((point.y - pj.y) * (pi.x - pj.x)) / (pi.y - pj.y);
      if (point.x < xIntersect) {
        inside = !inside;
      }
    }
  }

  return inside;
}

/**
 * Computes the geometric centroid (center of mass) of a polygon.
 * If the polygon is degenerate or area is zero, falls back to vertex arithmetic mean.
 */
export function getPolygonCentroid(points: Point2D[]): Point2D {
  const n = points.length;
  if (n === 0) {
    return { x: 0, y: 0 };
  }
  if (n === 1) {
    return { x: points[0].x, y: points[0].y };
  }
  if (n === 2) {
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
  }

  const area = calculateShoelaceArea(points);
  if (Math.abs(area) < 1e-9) {
    let sumX = 0;
    let sumY = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
    }
    return { x: sumX / n, y: sumY / n };
  }

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const curr = points[i];
    const next = points[(i + 1) % n];
    const factor = curr.x * next.y - next.x * curr.y;
    cx += (curr.x + next.x) * factor;
    cy += (curr.y + next.y) * factor;
  }

  const denom = 6 * area;
  return {
    x: cx / denom,
    y: cy / denom,
  };
}
