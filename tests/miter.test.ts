import { describe, it, expect } from 'vitest';
import type { Vertex, Wall } from '../src/core/types.js';
import {
  computeVertexMiters,
  generateWallPolygons,
} from '../src/core/geometry/miter.js';
import { distance } from '../src/core/math/vector.js';
import { calculateShoelaceArea } from '../src/core/math/polygon.js';

describe('Wall Mitering & Corner Geometry', () => {
  describe('1. Dead-End Wall (Degree 1)', () => {
    it('computes square perpendicular end caps for a single dead-end wall', () => {
      const v1: Vertex = { id: 'v1', x: 0, y: 0 };
      const v2: Vertex = { id: 'v2', x: 1000, y: 0 };
      const wall: Wall = { id: 'w1', startId: 'v1', endId: 'v2', thickness: 100 };
      const allVertices: Record<string, Vertex> = { v1, v2 };

      // Compute start miter at (0, 0)
      const startMiters = computeVertexMiters(v1, [wall], allVertices);
      expect(startMiters.length).toBe(1);
      const startM = startMiters[0];
      expect(startM.isStart).toBe(true);
      expect(startM.leftPoint.x).toBeCloseTo(0);
      expect(startM.leftPoint.y).toBeCloseTo(50);
      expect(startM.rightPoint.x).toBeCloseTo(0);
      expect(startM.rightPoint.y).toBeCloseTo(-50);

      // Compute end miter at (1000, 0)
      const endMiters = computeVertexMiters(v2, [wall], allVertices);
      expect(endMiters.length).toBe(1);
      const endM = endMiters[0];
      expect(endM.isStart).toBe(false);
      expect(endM.leftPoint.x).toBeCloseTo(1000);
      expect(endM.leftPoint.y).toBeCloseTo(50);
      expect(endM.rightPoint.x).toBeCloseTo(1000);
      expect(endM.rightPoint.y).toBeCloseTo(-50);
    });
  });

  describe('2. Orthogonal L-Corner (90°)', () => {
    it('computes exact inner and outer miter points at a 90° corner', () => {
      // Wall 1: (0, 1000) -> (0, 0)
      // Wall 2: (0, 0) -> (1000, 0)
      // Thickness: 200mm
      const v1: Vertex = { id: 'v1', x: 0, y: 1000 };
      const vCorner: Vertex = { id: 'vCorner', x: 0, y: 0 };
      const v3: Vertex = { id: 'v3', x: 1000, y: 0 };

      const w1: Wall = { id: 'w1', startId: 'v1', endId: 'vCorner', thickness: 200 };
      const w2: Wall = { id: 'w2', startId: 'vCorner', endId: 'v3', thickness: 200 };

      const allVertices = { v1, vCorner, v3 };
      const miters = computeVertexMiters(vCorner, [w1, w2], allVertices);

      expect(miters.length).toBe(2);

      const m1 = miters.find((m) => m.wallId === 'w1')!;
      const m2 = miters.find((m) => m.wallId === 'w2')!;

      // Outer corner miter at (0, 0) must intersect at (-100, -100)
      // For w1 (pointing down from (0, 1000) to (0,0)): right side is -x
      // For w2 (pointing right from (0,0) to (1000, 0)): right side is -y
      expect(m1.rightPoint.x).toBeCloseTo(-100);
      expect(m1.rightPoint.y).toBeCloseTo(-100);
      expect(m2.rightPoint.x).toBeCloseTo(-100);
      expect(m2.rightPoint.y).toBeCloseTo(-100);

      // Inner corner miter must intersect at (100, 100)
      expect(m1.leftPoint.x).toBeCloseTo(100);
      expect(m1.leftPoint.y).toBeCloseTo(100);
      expect(m2.leftPoint.x).toBeCloseTo(100);
      expect(m2.leftPoint.y).toBeCloseTo(100);
    });
  });

  describe('3. Collinear Continuous Wall (180°)', () => {
    it('maintains continuous parallel boundaries across collinear joints without distortion', () => {
      // Wall 1: (0, 0) -> (1000, 0)
      // Wall 2: (1000, 0) -> (2000, 0)
      // Thickness: 150mm
      const v1: Vertex = { id: 'v1', x: 0, y: 0 };
      const vMid: Vertex = { id: 'vMid', x: 1000, y: 0 };
      const v3: Vertex = { id: 'v3', x: 2000, y: 0 };

      const w1: Wall = { id: 'w1', startId: 'v1', endId: 'vMid', thickness: 150 };
      const w2: Wall = { id: 'w2', startId: 'vMid', endId: 'v3', thickness: 150 };

      const allVertices = { v1, vMid, v3 };
      const miters = computeVertexMiters(vMid, [w1, w2], allVertices);

      expect(miters.length).toBe(2);

      const m1 = miters.find((m) => m.wallId === 'w1')!;
      const m2 = miters.find((m) => m.wallId === 'w2')!;

      // Left boundary at y = 75
      expect(m1.leftPoint.x).toBeCloseTo(1000);
      expect(m1.leftPoint.y).toBeCloseTo(75);
      expect(m2.leftPoint.x).toBeCloseTo(1000);
      expect(m2.leftPoint.y).toBeCloseTo(75);

      // Right boundary at y = -75
      expect(m1.rightPoint.x).toBeCloseTo(1000);
      expect(m1.rightPoint.y).toBeCloseTo(-75);
      expect(m2.rightPoint.x).toBeCloseTo(1000);
      expect(m2.rightPoint.y).toBeCloseTo(-75);
    });
  });

  describe('4. Acute Angle Miter Limit Clamping', () => {
    it('clamps acute miter spikes into flat bevels when exceeding limit multiplier', () => {
      // Two walls meeting at a 20° acute angle
      const angleRad = (20 * Math.PI) / 180;
      const vCorner: Vertex = { id: 'vCorner', x: 0, y: 0 };
      const v1: Vertex = { id: 'v1', x: 2000, y: 0 };
      const v2: Vertex = {
        id: 'v2',
        x: 2000 * Math.cos(angleRad),
        y: 2000 * Math.sin(angleRad),
      };

      const thickness = 100;
      const w1: Wall = { id: 'w1', startId: 'vCorner', endId: 'v1', thickness };
      const w2: Wall = { id: 'w2', startId: 'vCorner', endId: 'v2', thickness };

      const allVertices = { vCorner, v1, v2 };
      const miterLimitMultiplier = 2.5;

      const miters = computeVertexMiters(vCorner, [w1, w2], allVertices, miterLimitMultiplier);
      expect(miters.length).toBe(2);

      const m1 = miters.find((m) => m.wallId === 'w1')!;
      const m2 = miters.find((m) => m.wallId === 'w2')!;

      // Without clamp, miter distance would be ~288mm.
      // With miterLimitMultiplier = 2.5, maximum allowed distance is 2.5 * 100 = 250mm.
      const dist1 = distance(vCorner, m1.rightPoint);
      const dist2 = distance(vCorner, m2.leftPoint);

      // Both points must be bounded by the clamp limit (+/- slight geometric margin for bevel line)
      expect(dist1).toBeLessThanOrEqual(250 * 1.06);
      expect(dist2).toBeLessThanOrEqual(250 * 1.06);

      // Bevel points must be recorded
      expect(m1.bevelPoints).toBeDefined();
      expect(m1.bevelPoints!.length).toBeGreaterThan(0);
      expect(m2.bevelPoints).toBeDefined();
      expect(m2.bevelPoints!.length).toBeGreaterThan(0);
    });
  });

  describe('5. T-Junction (3 Walls Meeting)', () => {
    it('produces bounded, non-degenerate polygons for all three walls at a T-junction', () => {
      // Continuous wall along X-axis from (0, 0) to (2000, 0) split at (1000, 0)
      // Perpendicular wall from (1000, 0) to (1000, 1500)
      const v1: Vertex = { id: 'v1', x: 0, y: 0 };
      const vMid: Vertex = { id: 'vMid', x: 1000, y: 0 };
      const v2: Vertex = { id: 'v2', x: 2000, y: 0 };
      const vStem: Vertex = { id: 'vStem', x: 1000, y: 1500 };

      const w1: Wall = { id: 'w1', startId: 'v1', endId: 'vMid', thickness: 150 };
      const w2: Wall = { id: 'w2', startId: 'vMid', endId: 'v2', thickness: 150 };
      const w3: Wall = { id: 'w3', startId: 'vMid', endId: 'vStem', thickness: 150 };

      const vertices = { v1, vMid, v2, vStem };
      const walls = { w1, w2, w3 };

      const wallPolygons = generateWallPolygons(vertices, walls);

      expect(Object.keys(wallPolygons).length).toBe(3);

      for (const [wallId, wp] of Object.entries(wallPolygons)) {
        // Every wall must have at least 4 vertices
        expect(wp.polygon.length).toBeGreaterThanOrEqual(4);

        // Every wall polygon must have positive area
        const area = Math.abs(calculateShoelaceArea(wp.polygon));
        expect(area).toBeGreaterThan(1000 * 150 * 0.8);

        // Coordinates must be finite numbers
        for (const pt of wp.polygon) {
          expect(Number.isFinite(pt.x)).toBe(true);
          expect(Number.isFinite(pt.y)).toBe(true);
        }
      }
    });
  });

  describe('6. Full Room Polygon Generation', () => {
    it('generates 4 mitered walls for a 4000x3000mm rectangular room', () => {
      const v1: Vertex = { id: 'v1', x: 0, y: 0 };
      const v2: Vertex = { id: 'v2', x: 4000, y: 0 };
      const v3: Vertex = { id: 'v3', x: 4000, y: 3000 };
      const v4: Vertex = { id: 'v4', x: 0, y: 3000 };

      const w1: Wall = { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 };
      const w2: Wall = { id: 'w2', startId: 'v2', endId: 'v3', thickness: 200 };
      const w3: Wall = { id: 'w3', startId: 'v3', endId: 'v4', thickness: 200 };
      const w4: Wall = { id: 'w4', startId: 'v4', endId: 'v1', thickness: 200 };

      const vertices = { v1, v2, v3, v4 };
      const walls = { w1, w2, w3, w4 };

      const wallPolys = generateWallPolygons(vertices, walls);

      expect(Object.keys(wallPolys).length).toBe(4);

      for (const wp of Object.values(wallPolys)) {
        expect(wp.polygon.length).toBe(4);
        const area = Math.abs(calculateShoelaceArea(wp.polygon));
        expect(area).toBeGreaterThan(0);
      }
    });
  });
});
