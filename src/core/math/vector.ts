import type { Point2D } from '../types.js';

/**
 * Adds two 2D points/vectors.
 */
export function add(a: Point2D, b: Point2D): Point2D {
  return { x: a.x + b.x, y: a.y + b.y };
}

/**
 * Subtracts vector b from vector a (a - b).
 */
export function sub(a: Point2D, b: Point2D): Point2D {
  return { x: a.x - b.x, y: a.y - b.y };
}

/**
 * Scales a 2D vector by a scalar factor.
 */
export function scale(v: Point2D, s: number): Point2D {
  return { x: v.x * s, y: v.y * s };
}

/**
 * Computes the 2D dot product of two vectors.
 */
export function dot(a: Point2D, b: Point2D): number {
  return a.x * b.x + a.y * b.y;
}

/**
 * Computes the 2D cross product (perp dot product) of two vectors: a.x * b.y - a.y * b.x.
 * Positive if b is counter-clockwise from a; negative if clockwise.
 */
export function cross(a: Point2D, b: Point2D): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Computes the Euclidean length (magnitude) of a 2D vector.
 */
export function length(v: Point2D): number {
  return Math.hypot(v.x, v.y);
}

/**
 * Computes the Euclidean distance between two 2D points.
 */
export function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Normalizes a 2D vector to unit length.
 * Returns { x: 0, y: 0 } if the vector has zero length.
 */
export function normalize(v: Point2D): Point2D {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / len, y: v.y / len };
}

/**
 * Computes the perpendicular normal vector (-y, x).
 * Rotates the vector 90 degrees counter-clockwise.
 */
export function normal(v: Point2D): Point2D {
  return { x: -v.y, y: v.x };
}

/**
 * Computes the angle in radians between two 2D vectors [0, PI].
 * Returns 0 if either vector has zero length.
 */
export function angleBetween(a: Point2D, b: Point2D): number {
  const lenA = Math.hypot(a.x, a.y);
  const lenB = Math.hypot(b.x, b.y);
  if (lenA === 0 || lenB === 0) {
    return 0;
  }
  const d = dot(a, b);
  const c = cross(a, b);
  return Math.atan2(Math.abs(c), d);
}

/**
 * Computes the signed angle in radians from vector a to vector b (-PI, PI].
 * Positive counter-clockwise, negative clockwise.
 */
export function signedAngleBetween(a: Point2D, b: Point2D): number {
  const lenA = Math.hypot(a.x, a.y);
  const lenB = Math.hypot(b.x, b.y);
  if (lenA === 0 || lenB === 0) {
    return 0;
  }
  return Math.atan2(cross(a, b), dot(a, b));
}
