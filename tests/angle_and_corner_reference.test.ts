import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeLineAngleDeg,
  computeCornerAngleDeg,
  drawCornerAngleIndicator,
  drawAngleReferenceArc,
} from '../src/engine/renderer/DimensionRenderer.js';
import { WallTool } from '../src/engine/tools/WallTool.js';
import { LineTool } from '../src/engine/tools/LineTool.js';
import { DimensionLayer } from '../src/engine/layers/DimensionLayer.js';
import { planStore } from '../src/core/store/planStore.js';
import { Viewport } from '../src/engine/viewport/Viewport.js';
import { SnapEngine } from '../src/core/snap/SnapEngine.js';
import { SpatialIndex } from '../src/core/spatial/SpatialIndex.js';
import type { ToolContext } from '../src/engine/tools/Tool.js';

describe('CAD Angle and Corner References', () => {
  beforeEach(() => {
    planStore.getState().clear();
  });

  describe('1. computeLineAngleDeg', () => {
    it('accurately computes East horizontal direction (0°)', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 500, y: 0 };
      const res = computeLineAngleDeg(start, end);
      expect(res.deg).toBe(0);
      expect(res.isCardinal).toBe(true);
      expect(res.cardinalAngle).toBe(0);
      expect(res.is45).toBe(false);
    });

    it('accurately computes North vertical direction (90°, dy < 0)', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 0, y: -500 };
      const res = computeLineAngleDeg(start, end);
      expect(res.deg).toBe(90);
      expect(res.isCardinal).toBe(true);
      expect(res.cardinalAngle).toBe(90);
      expect(res.is45).toBe(false);
    });

    it('accurately computes West horizontal direction (180°, dx < 0)', () => {
      const start = { x: 0, y: 0 };
      const end = { x: -500, y: 0 };
      const res = computeLineAngleDeg(start, end);
      expect(res.deg).toBe(180);
      expect(res.isCardinal).toBe(true);
      expect(res.cardinalAngle).toBe(180);
      expect(res.is45).toBe(false);
    });

    it('accurately computes South vertical direction (270°, dy > 0)', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 0, y: 500 };
      const res = computeLineAngleDeg(start, end);
      expect(res.deg).toBe(270);
      expect(res.isCardinal).toBe(true);
      expect(res.cardinalAngle).toBe(270);
      expect(res.is45).toBe(false);
    });

    it('detects 45° diagonal angle multiples', () => {
      const start = { x: 0, y: 0 };
      const end45 = { x: 500, y: -500 }; // 45° (North-East)
      const res45 = computeLineAngleDeg(start, end45);
      expect(res45.deg).toBeCloseTo(45, 1);
      expect(res45.isCardinal).toBe(false);
      expect(res45.is45).toBe(true);

      const end135 = { x: -500, y: -500 }; // 135° (North-West)
      const res135 = computeLineAngleDeg(start, end135);
      expect(res135.deg).toBeCloseTo(135, 1);
      expect(res135.is45).toBe(true);
    });

    it('handles zero-length vector gracefully', () => {
      const pt = { x: 100, y: 100 };
      const res = computeLineAngleDeg(pt, pt);
      expect(res.deg).toBe(0);
      expect(res.isCardinal).toBe(true);
    });
  });

  describe('2. computeCornerAngleDeg', () => {
    it('detects 90.0° perpendicular right angles', () => {
      const p1 = { x: 1000, y: 0 };
      const corner = { x: 0, y: 0 };
      const p2 = { x: 0, y: 1000 };

      const res = computeCornerAngleDeg(p1, corner, p2);
      expect(res.angleDeg).toBe(90);
      expect(res.isRightAngle).toBe(true);
      expect(res.isStraight).toBe(false);
    });

    it('detects 45° acute corners', () => {
      const p1 = { x: 1000, y: 0 };
      const corner = { x: 0, y: 0 };
      const p2 = { x: 1000, y: 1000 };

      const res = computeCornerAngleDeg(p1, corner, p2);
      expect(res.angleDeg).toBeCloseTo(45, 1);
      expect(res.isRightAngle).toBe(false);
      expect(res.is45Multiple).toBe(true);
    });

    it('detects 135° obtuse corners', () => {
      const p1 = { x: 1000, y: 0 };
      const corner = { x: 0, y: 0 };
      const p2 = { x: -1000, y: 1000 };

      const res = computeCornerAngleDeg(p1, corner, p2);
      expect(res.angleDeg).toBeCloseTo(135, 1);
      expect(res.isRightAngle).toBe(false);
      expect(res.is45Multiple).toBe(true);
    });

    it('detects 180° collinear/straight segments', () => {
      const p1 = { x: -1000, y: 0 };
      const corner = { x: 0, y: 0 };
      const p2 = { x: 1000, y: 0 };

      const res = computeCornerAngleDeg(p1, corner, p2);
      expect(res.angleDeg).toBeCloseTo(180, 1);
      expect(res.isStraight).toBe(true);
      expect(res.isRightAngle).toBe(false);
    });
  });

  describe('3. WallTool Corner & Angle Tracking', () => {
    it('tracks previousPoint when chaining consecutive walls to compute corner angles', () => {
      const tool = new WallTool();
      const viewport = new Viewport();
      const snapEngine = new SnapEngine();
      const spatialIndex = new SpatialIndex();
      let renderRequested = false;

      const ctx: ToolContext = {
        viewport,
        snapEngine,
        spatialIndex,
        requestRender: () => {
          renderRequested = true;
        },
      };

      tool.onActivate(ctx);
      expect(tool.status).toBe('idle');
      expect(tool.previousPoint).toBeNull();

      // Click 1: Start wall at (0, 0)
      tool.onPointerDown(
        { button: 0 } as PointerEvent,
        { x: 0, y: 0 },
        ctx
      );
      expect(tool.status).toBe('drawing');
      expect(tool.startPoint).toEqual({ x: 0, y: 0 });
      expect(tool.previousPoint).toBeNull();

      // Move to (4000, 0)
      tool.onPointerMove(
        { shiftKey: false } as PointerEvent,
        { x: 4000, y: 0 },
        ctx
      );
      expect(tool.currentPoint).toEqual({ x: 4000, y: 0 });

      // Click 2: Commit wall 1 (0,0 -> 4000,0) and begin wall 2
      tool.onPointerDown(
        { button: 0 } as PointerEvent,
        { x: 4000, y: 0 },
        ctx
      );

      // Previous point must now be (0, 0) and startPoint is (4000, 0)
      expect(tool.status).toBe('drawing');
      expect(tool.startPoint).toEqual({ x: 4000, y: 0 });
      expect(tool.previousPoint).toEqual({ x: 0, y: 0 });

      // Move to (4000, 3000) (perpendicular 90° corner)
      tool.onPointerMove(
        { shiftKey: false } as PointerEvent,
        { x: 4000, y: 3000 },
        ctx
      );

      // Verify that corner angle between (0,0) -> (4000,0) -> (4000,3000) is 90°
      const cornerAngle = computeCornerAngleDeg(
        tool.previousPoint!,
        tool.startPoint!,
        tool.currentPoint!
      );
      expect(cornerAngle.isRightAngle).toBe(true);
      expect(cornerAngle.angleDeg).toBe(90);

      // Reset tool clears previousPoint
      tool.reset();
      expect(tool.previousPoint).toBeNull();
      expect(tool.status).toBe('idle');
    });

    it('populates previousPoint when starting from an existing vertex with connected wall', () => {
      // Create a wall in planStore first: (0, 0) to (3000, 0)
      const wall1 = planStore.getState().addWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 150);
      expect(wall1).toBeDefined();

      const tool = new WallTool();
      const viewport = new Viewport({ zoom: 1 });
      const spatialIndex = new SpatialIndex();
      spatialIndex.syncFromGraph(planStore.getState().vertices, planStore.getState().walls);
      const snapEngine = new SnapEngine({ spatialIndex });

      const ctx: ToolContext = {
        viewport,
        snapEngine,
        spatialIndex,
        requestRender: () => {},
      };

      tool.onActivate(ctx);

      // Snapping to (3000, 0) vertex
      tool.onPointerMove(
        { shiftKey: false } as PointerEvent,
        { x: 3000, y: 0 },
        ctx
      );
      expect(tool.activeSnapResult?.snapType).toBe('vertex');

      // Click to start drawing from vertex (3000, 0)
      tool.onPointerDown(
        { button: 0 } as PointerEvent,
        { x: 3000, y: 0 },
        ctx
      );

      // previousPoint should be found as (0, 0) from connected wall
      expect(tool.status).toBe('drawing');
      expect(tool.previousPoint).toEqual({ x: 0, y: 0 });
    });
  });

  describe('4. DimensionLayer Corner Angle Rendering', () => {
    it('executes corner angle rendering on enclosed rooms without errors', () => {
      // Add 4 walls creating a 4000x3000 room
      const w1 = planStore.getState().addWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 150);
      const w2 = planStore.getState().addWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, 150);
      const w3 = planStore.getState().addWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }, 150);
      const w4 = planStore.getState().addWall({ x: 0, y: 3000 }, { x: 0, y: 0 }, 150);

      expect(w1 && w2 && w3 && w4).toBeTruthy();

      const layer = new DimensionLayer();
      const mockCtx = {
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        arc: () => {},
        rect: () => {},
        fillRect: () => {},
        roundRect: () => {},
        stroke: () => {},
        fill: () => {},
        fillText: () => {},
        translate: () => {},
        rotate: () => {},
        measureText: (txt: string) => ({ width: txt.length * 7 }),
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 1,
        setLineDash: () => {},
        font: '',
        textAlign: '',
        textBaseline: '',
      } as unknown as CanvasRenderingContext2D;

      const state = planStore.getState();
      expect(() => {
        layer.render(mockCtx, state.walls, state.vertices, 0.2);
      }).not.toThrow();
    });
  });
});
