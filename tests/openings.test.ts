import { describe, it, expect, beforeEach } from 'vitest';
import type { Vertex, Wall, Opening } from '../src/core/types.js';
import {
  computeOpeningGeometry,
  getDoorHingeAndLatch,
  sliceWallIntoPolygons,
  generateWallPolygonsWithOpenings,
} from '../src/core/geometry/openings.js';
import { createPlanStore, planStore } from '../src/core/store/planStore.js';
import { calculateShoelaceArea } from '../src/core/math/polygon.js';
import { OpeningTool } from '../src/engine/tools/OpeningTool.js';
import { OpeningRenderer } from '../src/engine/renderer/OpeningRenderer.js';
import { Viewport } from '../src/engine/viewport/Viewport.js';
import { SnapEngine } from '../src/core/snap/SnapEngine.js';
import { SpatialIndex } from '../src/core/spatial/SpatialIndex.js';
import type { ToolContext } from '../src/engine/tools/Tool.js';

describe('Parametric Openings Pipeline (Doors & Windows)', () => {
  describe('1. Offset Projection & Clamping', () => {
    it('clamps opening center distance to safe margins on a 4000mm wall', () => {
      // 4000mm wall along x-axis from (0, 0) to (4000, 0), thickness = 200mm
      const v1: Vertex = { id: 'v1', x: 0, y: 0 };
      const v2: Vertex = { id: 'v2', x: 4000, y: 0 };
      const wall: Wall = { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 };
      const vertices = { v1, v2 };

      // Opening width = 900mm
      // Safe margin = thickness / 2 + width / 2 = 100 + 450 = 550mm
      const openingNearStart: Opening = {
        id: 'op1',
        wallId: 'w1',
        offsetRatio: 0.05, // 0.05 * 4000 = 200mm (below 550mm margin)
        width: 900,
        type: 'single_door',
        flipH: false,
        flipV: false,
      };

      const geomClamped = computeOpeningGeometry(openingNearStart, wall, vertices);
      expect(geomClamped).not.toBeNull();
      // Center distance clamped to margin = 550mm, effective t = 550 / 4000 = 0.1375
      expect(geomClamped!.center.x).toBeCloseTo(550, 4);
      expect(geomClamped!.center.y).toBeCloseTo(0, 4);

      // Cursor placed at center (t = 0.5)
      const openingAtCenter: Opening = {
        id: 'op2',
        wallId: 'w1',
        offsetRatio: 0.5,
        width: 900,
        type: 'single_door',
        flipH: false,
        flipV: false,
      };

      const geomCenter = computeOpeningGeometry(openingAtCenter, wall, vertices);
      expect(geomCenter).not.toBeNull();
      // Center maintained at 2000mm
      expect(geomCenter!.center.x).toBeCloseTo(2000, 4);
      expect(geomCenter!.center.y).toBeCloseTo(0, 4);

      // Cursor placed near end (t = 0.98 -> 3920mm)
      // Clamped to L - margin = 4000 - 550 = 3450mm
      const openingNearEnd: Opening = {
        id: 'op3',
        wallId: 'w1',
        offsetRatio: 0.98,
        width: 900,
        type: 'single_door',
        flipH: false,
        flipV: false,
      };

      const geomClampedEnd = computeOpeningGeometry(openingNearEnd, wall, vertices);
      expect(geomClampedEnd).not.toBeNull();
      expect(geomClampedEnd!.center.x).toBeCloseTo(3450, 4);
    });
  });

  describe('2. Span Calculations', () => {
    it('calculates correct spanStart and spanEnd points along the wall centerline', () => {
      const v1: Vertex = { id: 'v1', x: 0, y: 0 };
      const v2: Vertex = { id: 'v2', x: 4000, y: 0 };
      const wall: Wall = { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 };
      const vertices = { v1, v2 };

      // Center at 2000mm with width 900mm
      const opening: Opening = {
        id: 'op1',
        wallId: 'w1',
        offsetRatio: 0.5,
        width: 900,
        type: 'single_door',
        flipH: false,
        flipV: false,
      };

      const geom = computeOpeningGeometry(opening, wall, vertices);
      expect(geom).not.toBeNull();

      // spanStart = center - (width / 2) = 2000 - 450 = 1550mm
      expect(geom!.spanStart.x).toBeCloseTo(1550, 4);
      expect(geom!.spanStart.y).toBeCloseTo(0, 4);

      // spanEnd = center + (width / 2) = 2000 + 450 = 2450mm
      expect(geom!.spanEnd.x).toBeCloseTo(2450, 4);
      expect(geom!.spanEnd.y).toBeCloseTo(0, 4);

      // Total span distance equals opening width
      const spanDistance = Math.hypot(
        geom!.spanEnd.x - geom!.spanStart.x,
        geom!.spanEnd.y - geom!.spanStart.y
      );
      expect(spanDistance).toBeCloseTo(900, 4);
    });

    it('handles angled walls correctly', () => {
      // 45-degree wall of length 1000 * sqrt(2) ≈ 1414.21mm
      const v1: Vertex = { id: 'v1', x: 0, y: 0 };
      const v2: Vertex = { id: 'v2', x: 2000, y: 2000 };
      const wall: Wall = { id: 'w1', startId: 'v1', endId: 'v2', thickness: 150 };
      const vertices = { v1, v2 };

      const opening: Opening = {
        id: 'op1',
        wallId: 'w1',
        offsetRatio: 0.5,
        width: 800,
        type: 'window',
        flipH: false,
        flipV: false,
      };

      const geom = computeOpeningGeometry(opening, wall, vertices);
      expect(geom).not.toBeNull();
      expect(geom!.center.x).toBeCloseTo(1000, 3);
      expect(geom!.center.y).toBeCloseTo(1000, 3);

      const spanLen = Math.hypot(
        geom!.spanEnd.x - geom!.spanStart.x,
        geom!.spanEnd.y - geom!.spanStart.y
      );
      expect(spanLen).toBeCloseTo(800, 3);
    });
  });

  describe('3. Wall Segment Slicing', () => {
    it('slices a 5000mm wall with two doors into 3 distinct solid wall polygons with correct gaps', () => {
      // A 5000mm wall from (0, 0) to (5000, 0), thickness = 200mm
      const v1: Vertex = { id: 'v1', x: 0, y: 0 };
      const v2: Vertex = { id: 'v2', x: 5000, y: 0 };
      const wall: Wall = { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 };
      const vertices = { v1, v2 };
      const walls = { w1: wall };

      // Two doors (900mm each) at t = 0.25 (center 1250mm) and t = 0.75 (center 3750mm)
      // Door 1 span: [1250 - 450, 1250 + 450] = [800, 1700]
      // Door 2 span: [3750 - 450, 3750 + 450] = [3300, 4200]
      const door1: Opening = {
        id: 'd1',
        wallId: 'w1',
        offsetRatio: 0.25,
        width: 900,
        type: 'single_door',
        flipH: false,
        flipV: false,
      };

      const door2: Opening = {
        id: 'd2',
        wallId: 'w1',
        offsetRatio: 0.75,
        width: 900,
        type: 'single_door',
        flipH: false,
        flipV: false,
      };

      const openings = { d1: door1, d2: door2 };

      // Slicing via sliceWallIntoPolygons
      const slicedPolygons = sliceWallIntoPolygons(wall, [door1, door2], vertices);
      expect(slicedPolygons.length).toBe(3);

      // Slicing via generateWallPolygonsWithOpenings
      const wallPolys = generateWallPolygonsWithOpenings(vertices, walls, openings);
      expect(wallPolys.length).toBe(3);

      // Verify each solid chunk has valid 4 vertices (rectangular sub-polygon) and positive area
      for (const poly of slicedPolygons) {
        expect(poly.length).toBeGreaterThanOrEqual(4);
        const area = Math.abs(calculateShoelaceArea(poly));
        expect(area).toBeGreaterThan(0);
      }

      // Chunk 0: from x = 0 to x = 800 (length = 800mm, thickness = 200mm, area = 160,000 mm²)
      const area0 = Math.abs(calculateShoelaceArea(slicedPolygons[0]));
      expect(area0).toBeCloseTo(800 * 200, 1);

      // Chunk 1: from x = 1700 to x = 3300 (length = 1600mm, thickness = 200mm, area = 320,000 mm²)
      const area1 = Math.abs(calculateShoelaceArea(slicedPolygons[1]));
      expect(area1).toBeCloseTo(1600 * 200, 1);

      // Chunk 2: from x = 4200 to x = 5000 (length = 800mm, thickness = 200mm, area = 160,000 mm²)
      const area2 = Math.abs(calculateShoelaceArea(slicedPolygons[2]));
      expect(area2).toBeCloseTo(800 * 200, 1);

      // Verify gap widths:
      // Gap 1 between Chunk 0 end and Chunk 1 start: 1700 - 800 = 900mm (Door 1 void)
      // Gap 2 between Chunk 1 end and Chunk 2 start: 4200 - 3300 = 900mm (Door 2 void)
      const chunk0MaxX = Math.max(...slicedPolygons[0].map((p) => p.x));
      const chunk1MinX = Math.min(...slicedPolygons[1].map((p) => p.x));
      const gap1 = chunk1MinX - chunk0MaxX;
      expect(gap1).toBeCloseTo(900, 3);

      const chunk1MaxX = Math.max(...slicedPolygons[1].map((p) => p.x));
      const chunk2MinX = Math.min(...slicedPolygons[2].map((p) => p.x));
      const gap2 = chunk2MinX - chunk1MaxX;
      expect(gap2).toBeCloseTo(900, 3);
    });
  });

  describe('4. Flip State Logic', () => {
    it('swaps hinge and latch coordinates when flipH changes', () => {
      const v1: Vertex = { id: 'v1', x: 0, y: 0 };
      const v2: Vertex = { id: 'v2', x: 4000, y: 0 };
      const wall: Wall = { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 };
      const vertices = { v1, v2 };

      // Normal door (!flipH): hinge at spanStart, latch at spanEnd
      const doorNormal: Opening = {
        id: 'd1',
        wallId: 'w1',
        offsetRatio: 0.5,
        width: 900,
        type: 'single_door',
        flipH: false,
        flipV: false,
      };

      const geomNormal = computeOpeningGeometry(doorNormal, wall, vertices);
      expect(geomNormal).not.toBeNull();
      const hlNormal = getDoorHingeAndLatch(geomNormal!);

      expect(hlNormal.hinge.x).toBeCloseTo(1550, 4); // spanStart
      expect(hlNormal.latch.x).toBeCloseTo(2450, 4); // spanEnd

      // Flipped door (flipH = true): hinge at spanEnd, latch at spanStart
      const doorFlippedH: Opening = {
        ...doorNormal,
        flipH: true,
      };

      const geomFlippedH = computeOpeningGeometry(doorFlippedH, wall, vertices);
      expect(geomFlippedH).not.toBeNull();
      const hlFlipped = getDoorHingeAndLatch(geomFlippedH!);

      expect(hlFlipped.hinge.x).toBeCloseTo(2450, 4); // spanEnd
      expect(hlFlipped.latch.x).toBeCloseTo(1550, 4); // spanStart

      // Coordinates swap cleanly
      expect(hlFlipped.hinge).toEqual(hlNormal.latch);
      expect(hlFlipped.latch).toEqual(hlNormal.hinge);
    });

    it('negates normal vector direction when flipV changes', () => {
      const v1: Vertex = { id: 'v1', x: 0, y: 0 };
      const v2: Vertex = { id: 'v2', x: 4000, y: 0 };
      const wall: Wall = { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 };
      const vertices = { v1, v2 };

      const doorV0: Opening = {
        id: 'd1',
        wallId: 'w1',
        offsetRatio: 0.5,
        width: 900,
        type: 'single_door',
        flipH: false,
        flipV: false,
      };

      const geomV0 = computeOpeningGeometry(doorV0, wall, vertices);
      expect(geomV0).not.toBeNull();

      const doorV1: Opening = {
        ...doorV0,
        flipV: true,
      };

      const geomV1 = computeOpeningGeometry(doorV1, wall, vertices);
      expect(geomV1).not.toBeNull();

      // Normal vector inverts exactly
      expect(geomV1!.normalVector.x).toBeCloseTo(-geomV0!.normalVector.x, 5);
      expect(geomV1!.normalVector.y).toBeCloseTo(-geomV0!.normalVector.y, 5);

      // Dot product between inverted normal vectors is -1
      const dotProduct =
        geomV0!.normalVector.x * geomV1!.normalVector.x +
        geomV0!.normalVector.y * geomV1!.normalVector.y;
      expect(dotProduct).toBeCloseTo(-1, 5);
    });
  });

  describe('5. PlanStore Opening State & CRUD Actions', () => {
    it('supports addOpening, moveOpening, updateOpening, and toggle flip actions', () => {
      const store = createPlanStore();

      // Add a wall
      const wall = store.getState().addWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 150)!;
      expect(wall).toBeDefined();

      // Add opening
      const opening = store.getState().addOpening({
        wallId: wall.id,
        offsetRatio: 0.5,
        width: 900,
        type: 'single_door',
        flipH: false,
        flipV: false,
      });

      expect(opening.id).toBeDefined();
      expect(store.getState().openings[opening.id]).toBeDefined();

      // Toggle flipH
      store.getState().toggleOpeningFlipH(opening.id);
      expect(store.getState().openings[opening.id].flipH).toBe(true);

      // Toggle flipV
      store.getState().toggleOpeningFlipV(opening.id);
      expect(store.getState().openings[opening.id].flipV).toBe(true);

      // Move opening
      store.getState().moveOpening(opening.id, 0.7);
      expect(store.getState().openings[opening.id].offsetRatio).toBeCloseTo(0.7, 4);

      // Update opening type to window
      store.getState().updateOpening(opening.id, { type: 'window', width: 1200 });
      expect(store.getState().openings[opening.id].type).toBe('window');
      expect(store.getState().openings[opening.id].width).toBe(1200);

      // Delete opening
      store.getState().deleteElements([opening.id]);
      expect(store.getState().openings[opening.id]).toBeUndefined();
    });

    it('automatically removes openings when parent wall is deleted', () => {
      const store = createPlanStore();
      const wall = store.getState().addWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 150)!;

      const opening = store.getState().addOpening({
        wallId: wall.id,
        offsetRatio: 0.5,
        width: 900,
        type: 'single_door',
        flipH: false,
        flipV: false,
      });

      expect(store.getState().openings[opening.id]).toBeDefined();

      // Delete wall
      store.getState().deleteElements([wall.id]);

      // Opening on that wall must be purged
      expect(store.getState().openings[opening.id]).toBeUndefined();
    });
  });

  describe('6. Interactive OpeningTool Operations', () => {
    it('projects cursor onto wall centerline and commits opening on pointer down', () => {
      planStore.getState().clear();
      const wall = planStore.getState().addWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 200)!;

      const viewport = new Viewport({ zoom: 1 });
      const spatialIndex = new SpatialIndex();
      spatialIndex.rebuild(planStore.getState().vertices, planStore.getState().walls);
      const snapEngine = new SnapEngine({ spatialIndex });

      const toolCtx: ToolContext = {
        viewport,
        snapEngine,
        spatialIndex,
        requestRender: () => {},
      };

      const tool = new OpeningTool({ openingType: 'single_door', defaultWidth: 900 });

      // Move cursor near wall at world coordinates (2000, 5)
      const moveEvent = { clientX: 2000, clientY: 5 } as PointerEvent;
      tool.onPointerMove(moveEvent, { x: 2000, y: 5 }, toolCtx);

      expect(tool.hoverWallId).toBe(wall.id);
      expect(tool.previewOffsetRatio).toBeCloseTo(0.5, 3);

      // Pointer down commits opening
      const downEvent = { button: 0 } as PointerEvent;
      tool.onPointerDown(downEvent, { x: 2000, y: 5 }, toolCtx);

      const placedOpenings = Object.values(planStore.getState().openings);
      expect(placedOpenings.length).toBe(1);
      expect(placedOpenings[0].wallId).toBe(wall.id);
      expect(placedOpenings[0].width).toBe(900);
      expect(placedOpenings[0].offsetRatio).toBeCloseTo(0.5, 3);
    });

    it('toggles flipH with F key and flipV with V key', () => {
      const tool = new OpeningTool({ openingType: 'single_door' });
      const viewport = new Viewport();
      const toolCtx: ToolContext = {
        viewport,
        snapEngine: new SnapEngine(),
        spatialIndex: new SpatialIndex(),
        requestRender: () => {},
      };

      expect(tool.flipH).toBe(false);
      expect(tool.flipV).toBe(false);

      tool.onKeyDown({ code: 'KeyF', preventDefault: () => {} } as unknown as KeyboardEvent, toolCtx);
      expect(tool.flipH).toBe(true);

      tool.onKeyDown({ code: 'KeyV', preventDefault: () => {} } as unknown as KeyboardEvent, toolCtx);
      expect(tool.flipV).toBe(true);

      tool.onKeyDown({ code: 'Space', preventDefault: () => {} } as unknown as KeyboardEvent, toolCtx);
      expect(tool.flipH).toBe(false);
    });
  });

  describe('7. Edge Cases & Boundary Guards', () => {
    it('returns null if wall length is smaller than opening width', () => {
      const v1: Vertex = { id: 'v1', x: 0, y: 0 };
      const v2: Vertex = { id: 'v2', x: 500, y: 0 }; // 500mm wall
      const wall: Wall = { id: 'w1', startId: 'v1', endId: 'v2', thickness: 150 };
      const vertices = { v1, v2 };

      // 900mm door cannot fit on 500mm wall
      const opening: Opening = {
        id: 'op1',
        wallId: 'w1',
        offsetRatio: 0.5,
        width: 900,
        type: 'single_door',
        flipH: false,
        flipV: false,
      };

      const geom = computeOpeningGeometry(opening, wall, vertices);
      expect(geom).toBeNull();
    });

    it('returns null if wall endpoints do not exist in vertex record', () => {
      const wall: Wall = { id: 'w1', startId: 'missing1', endId: 'missing2', thickness: 150 };
      const opening: Opening = {
        id: 'op1',
        wallId: 'w1',
        offsetRatio: 0.5,
        width: 900,
        type: 'single_door',
        flipH: false,
        flipV: false,
      };

      const geom = computeOpeningGeometry(opening, wall, {});
      expect(geom).toBeNull();
    });
  });
});
