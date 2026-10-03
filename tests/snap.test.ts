import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialIndex } from '../src/core/spatial/SpatialIndex.js';
import { SnapEngine } from '../src/core/snap/SnapEngine.js';
import type { Point2D, Vertex, Wall } from '../src/core/types.js';

describe('Spatial Indexing (R-Tree)', () => {
  let index: SpatialIndex;

  beforeEach(() => {
    index = new SpatialIndex();
  });

  it('indexes and queries items within bounding box', () => {
    index.insert({
      id: 'v1',
      type: 'vertex',
      minX: 100,
      minY: 100,
      maxX: 102,
      maxY: 102,
    });

    index.insert({
      id: 'v2',
      type: 'vertex',
      minX: 1000,
      minY: 1000,
      maxX: 1002,
      maxY: 1002,
    });

    const results = index.search({
      minX: 50,
      minY: 50,
      maxX: 200,
      maxY: 200,
    });

    expect(results.length).toBe(1);
    expect(results[0].id).toBe('v1');
  });

  it('queries items within a radius', () => {
    index.insert({
      id: 'v1',
      type: 'vertex',
      minX: 500,
      minY: 500,
      maxX: 500,
      maxY: 500,
    });

    const found = index.queryRadius({ x: 520, y: 510 }, 50);
    expect(found.length).toBe(1);
    expect(found[0].id).toBe('v1');

    const notFound = index.queryRadius({ x: 700, y: 700 }, 50);
    expect(notFound.length).toBe(0);
  });

  it('syncs correctly from floor plan graph state', () => {
    const vertices: Record<string, Vertex> = {
      v1: { id: 'v1', x: 0, y: 0 },
      v2: { id: 'v2', x: 4000, y: 0 },
    };
    const walls: Record<string, Wall> = {
      w1: { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 },
    };

    index.syncFromGraph(vertices, walls);

    // 2 vertices + 1 wall = 3 spatial items
    expect(index.all().length).toBe(3);

    // Search around wall midpoint
    const midWallItems = index.queryRadius({ x: 2000, y: 0 }, 50);
    const wallItem = midWallItems.find((i) => i.id === 'w1');
    expect(wallItem).toBeDefined();
    expect(wallItem?.type).toBe('wall');
  });
});

describe('Multi-Target Snap Engine', () => {
  let snapEngine: SnapEngine;
  let spatialIndex: SpatialIndex;
  let vertices: Record<string, Vertex>;
  let walls: Record<string, Wall>;

  beforeEach(() => {
    spatialIndex = new SpatialIndex();
    snapEngine = new SnapEngine({
      spatialIndex,
      vertexSnapRadiusPixels: 12,
      edgeSnapRadiusPixels: 10,
      alignmentThresholdPixels: 8,
      gridSpacingMm: 100,
    });

    vertices = {
      v1: { id: 'v1', x: 0, y: 0 },
      v2: { id: 'v2', x: 4000, y: 0 },
      v3: { id: 'v3', x: 4000, y: 3000 },
    };

    walls = {
      w1: { id: 'w1', startId: 'v1', endId: 'v2', thickness: 150 },
      w2: { id: 'w2', startId: 'v2', endId: 'v3', thickness: 150 },
    };

    spatialIndex.syncFromGraph(vertices, walls);
  });

  describe('1. Screen-Radius-Aware Vertex Snapping (Magnetic Corners)', () => {
    it('snaps to corner vertex within screen radius at zoom 0.1 (12px = 120mm)', () => {
      // At zoom 0.1: threshold = 12 / 0.1 = 120mm
      // Cursor is at (4050, 40) -> distance to v2 (4000, 0) is ~64mm <= 120mm
      const result = snapEngine.snap(
        {
          rawPoint: { x: 4050, y: 40 },
          zoom: 0.1,
        },
        vertices,
        walls
      );

      expect(result.snapType).toBe('vertex');
      expect(result.snappedVertexId).toBe('v2');
      expect(result.point.x).toBe(4000);
      expect(result.point.y).toBe(0);
    });

    it('adapts snap threshold when zoomed in to 1.0 (12px = 12mm)', () => {
      // At zoom 1.0: threshold = 12 / 1.0 = 12mm
      // Cursor at (4050, 40) has dist 64mm > 12mm -> should NOT snap to vertex
      const noSnap = snapEngine.snap(
        {
          rawPoint: { x: 4050, y: 40 },
          zoom: 1.0,
        },
        vertices,
        walls
      );
      expect(noSnap.snapType).not.toBe('vertex');

      // Cursor at (4006, 4005) -> distance = ~7.8mm <= 12mm -> SHOULD snap
      const snap = snapEngine.snap(
        {
          rawPoint: { x: 4006, y: 5 },
          zoom: 1.0,
        },
        vertices,
        walls
      );
      expect(snap.snapType).toBe('vertex');
      expect(snap.point.x).toBe(4000);
      expect(snap.point.y).toBe(0);
    });
  });

  describe('2. Edge/Wall Projection Snapping', () => {
    it('slides along wall edge when near a wall segment', () => {
      // Wall w1 connects (0, 0) to (4000, 0)
      // Cursor at (2500, 40) with zoom 0.1 (edge threshold 10px = 100mm)
      // Distance to wall line y=0 is 40mm <= 100mm
      const result = snapEngine.snap(
        {
          rawPoint: { x: 2500, y: 40 },
          zoom: 0.1,
        },
        vertices,
        walls
      );

      expect(result.snapType).toBe('edge');
      expect(result.snappedWallId).toBe('w1');
      expect(result.point.x).toBeCloseTo(2500);
      expect(result.point.y).toBeCloseTo(0);
    });
  });

  describe('3. Dynamic Alignment Guidelines (Figma-Style Smart Guides)', () => {
    it('snaps X coordinate to a nearby vertex and creates a vertical guideline', () => {
      // v3 is at (4000, 3000)
      // Cursor is at (4030, 8000) -> X diff is 30mm <= 80mm (8px / 0.1)
      const result = snapEngine.snap(
        {
          rawPoint: { x: 4030, y: 8000 },
          zoom: 0.1,
        },
        vertices,
        walls
      );

      expect(result.snapType).toBe('alignment');
      expect(result.point.x).toBe(4000);
      expect(result.point.y).toBe(8000);
      expect(result.guidelines.some((g) => g.axis === 'x' && g.position === 4000)).toBe(true);
    });

    it('snaps Y coordinate to a nearby vertex and creates a horizontal guideline', () => {
      // v3 is at (4000, 3000)
      // Cursor is at (8000, 3020) -> Y diff is 20mm <= 80mm
      const result = snapEngine.snap(
        {
          rawPoint: { x: 8000, y: 3020 },
          zoom: 0.1,
        },
        vertices,
        walls
      );

      expect(result.snapType).toBe('alignment');
      expect(result.point.x).toBe(8000);
      expect(result.point.y).toBe(3000);
      expect(result.guidelines.some((g) => g.axis === 'y' && g.position === 3000)).toBe(true);
    });
  });

  describe('4. Orthogonal Axis Lock (Shift Key)', () => {
    it('snaps to 0 degrees when Shift is held and angle is near horizontal', () => {
      const ref: Point2D = { x: 0, y: 0 };
      // Raw angle ~4.5 degrees
      const result = snapEngine.snap(
        {
          rawPoint: { x: 2000, y: 160 },
          zoom: 0.1,
          shiftKey: true,
          referencePoint: ref,
        },
        vertices,
        walls
      );

      expect(result.snapType).toBe('ortho');
      expect(result.orthoAngle).toBe(0);
      expect(result.point.y).toBeCloseTo(0);
      expect(result.point.x).toBeGreaterThan(1900);
    });

    it('snaps to 45 degrees when Shift is held and angle is near 45°', () => {
      const ref: Point2D = { x: 0, y: 0 };
      // Raw point at (1000, 1050) -> angle ~46.4 degrees
      const result = snapEngine.snap(
        {
          rawPoint: { x: 1000, y: 1050 },
          zoom: 0.1,
          shiftKey: true,
          referencePoint: ref,
        },
        vertices,
        walls
      );

      expect(result.snapType).toBe('ortho');
      expect(result.orthoAngle).toBe(45);
      // At 45 degrees, x and y must be identical
      expect(result.point.x).toBeCloseTo(result.point.y);
    });

    it('snaps to 90 degrees when Shift is held and angle is near vertical', () => {
      const ref: Point2D = { x: 0, y: 0 };
      // Raw point at (60, 2000) -> angle ~88.3 degrees
      const result = snapEngine.snap(
        {
          rawPoint: { x: 60, y: 2000 },
          zoom: 0.1,
          shiftKey: true,
          referencePoint: ref,
        },
        vertices,
        walls
      );

      expect(result.snapType).toBe('ortho');
      expect(result.orthoAngle).toBe(90);
      expect(result.point.x).toBeCloseTo(0);
      expect(result.point.y).toBeGreaterThan(1900);
    });
  });

  describe('5. Millimeter Grid Snapping', () => {
    it('snaps to configured millimeter grid when grid snapping is enabled', () => {
      snapEngine.gridSnapEnabled = true;
      snapEngine.gridSpacingMm = 100;

      // Far from any vertex, edge, or guideline
      const result = snapEngine.snap(
        {
          rawPoint: { x: 7142, y: 8389 },
          zoom: 0.1,
        },
        vertices,
        walls
      );

      expect(result.snapType).toBe('grid');
      expect(result.point.x).toBe(7100);
      expect(result.point.y).toBe(8400);
    });
  });

  describe('6. Snapping Precedence Order', () => {
    it('prioritizes vertex snap over edge snap and grid snap', () => {
      snapEngine.gridSnapEnabled = true;
      snapEngine.gridSpacingMm = 100;

      // Point (4020, 20) is near edge w1 (y=0) and near vertex v2 (4000, 0)
      const result = snapEngine.snap(
        {
          rawPoint: { x: 4020, y: 20 },
          zoom: 0.1,
        },
        vertices,
        walls
      );

      // Vertex snap MUST win over edge snap
      expect(result.snapType).toBe('vertex');
      expect(result.point.x).toBe(4000);
      expect(result.point.y).toBe(0);
    });

    it('prioritizes edge snap over grid snap', () => {
      snapEngine.gridSnapEnabled = true;
      snapEngine.gridSpacingMm = 100;

      // Point at (2542, 30) is near edge w1 (y=0) but grid would round to (2500, 0)
      const result = snapEngine.snap(
        {
          rawPoint: { x: 2542, y: 30 },
          zoom: 0.1,
        },
        vertices,
        walls
      );

      // Edge snap MUST win over grid snap
      expect(result.snapType).toBe('edge');
      expect(result.point.x).toBeCloseTo(2542);
      expect(result.point.y).toBeCloseTo(0);
    });
  });
});
