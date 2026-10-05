import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  formatDimension,
  normalizeTextAngle,
  computeDimensionLine,
  drawDimension,
} from '../src/engine/renderer/DimensionRenderer.js';
import { WallTool } from '../src/engine/tools/WallTool.js';
import { ToolManager } from '../src/engine/tools/ToolManager.js';
import type { ToolContext } from '../src/engine/tools/Tool.js';
import { Viewport } from '../src/engine/viewport/Viewport.js';
import { SnapEngine } from '../src/core/snap/SnapEngine.js';
import { SpatialIndex } from '../src/core/spatial/SpatialIndex.js';
import { planStore } from '../src/core/store/planStore.js';
import { uiStore, DEFAULT_DIMENSION_SETTINGS } from '../src/core/store/uiStore.js';
import { distance, dot } from '../src/core/math/vector.js';

describe('CAD Dimension Renderer', () => {
  describe('1. Dimension Formatting', () => {
    it('correctly formats values with commas and mm unit', () => {
      expect(formatDimension(3200)).toBe('3,200 mm');
      expect(formatDimension(1500)).toBe('1,500 mm');
      expect(formatDimension(4250)).toBe('4,250 mm');
      expect(formatDimension(0)).toBe('0 mm');
      expect(formatDimension(1000000)).toBe('1,000,000 mm');
      expect(formatDimension(1234.56)).toBe('1,235 mm');
    });
  });

  describe('2. Text Angle Normalization', () => {
    it('leaves angles in quadrants I and IV unchanged', () => {
      // 0 degrees
      const zero = normalizeTextAngle(0);
      expect(zero.flip).toBe(false);
      expect(zero.angle).toBeCloseTo(0);

      // +45 degrees (PI / 4)
      const q1 = normalizeTextAngle(Math.PI / 4);
      expect(q1.flip).toBe(false);
      expect(q1.angle).toBeCloseTo(Math.PI / 4);

      // -45 degrees (-PI / 4)
      const q4 = normalizeTextAngle(-Math.PI / 4);
      expect(q4.flip).toBe(false);
      expect(q4.angle).toBeCloseTo(-Math.PI / 4);
    });

    it('adjusts angles in quadrants II and III by +180° so text is never upside-down', () => {
      // 135 degrees (3 * PI / 4, Quadrant II)
      const q2 = normalizeTextAngle((3 * Math.PI) / 4);
      expect(q2.flip).toBe(true);
      // Adjusted by +180° (PI): 3*PI/4 + PI = 7*PI/4 or -PI/4
      expect(Math.cos(q2.angle)).toBeCloseTo(Math.cos((3 * Math.PI) / 4 + Math.PI));
      expect(Math.sin(q2.angle)).toBeCloseTo(Math.sin((3 * Math.PI) / 4 + Math.PI));

      // 180 degrees (PI, boundary)
      const q180 = normalizeTextAngle(Math.PI);
      expect(q180.flip).toBe(true);
      expect(Math.cos(q180.angle)).toBeCloseTo(Math.cos(Math.PI + Math.PI));

      // -120 degrees (-2 * PI / 3, Quadrant III)
      const q3 = normalizeTextAngle((-2 * Math.PI) / 3);
      expect(q3.flip).toBe(true);
      // Adjusted by +180° (PI): -2*PI/3 + PI = PI/3 (60 degrees)
      expect(q3.angle).toBeCloseTo(Math.PI / 3);
    });
  });

  describe('3. Dimension Offsetting', () => {
    it('verifies that the dimension line runs perfectly parallel to the wall segment at distance 300mm', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 4000, y: 0 };
      const offsetMm = 300;

      const geom = computeDimensionLine(start, end, offsetMm);

      // Segment runs along x-axis from (0,0) to (4000,0)
      // Normal is (-0, 1) = (0, 1). At 300mm offset, dimStart=(0, 300), dimEnd=(4000, 300)
      expect(geom.dimStart.x).toBeCloseTo(0);
      expect(geom.dimStart.y).toBeCloseTo(300);
      expect(geom.dimEnd.x).toBeCloseTo(4000);
      expect(geom.dimEnd.y).toBeCloseTo(300);

      // Verify distance from original segment endpoints is exactly 300mm
      expect(distance(start, geom.dimStart)).toBeCloseTo(300);
      expect(distance(end, geom.dimEnd)).toBeCloseTo(300);

      // Verify dimension line length equals original length
      expect(geom.length).toBeCloseTo(4000);
      expect(distance(geom.dimStart, geom.dimEnd)).toBeCloseTo(4000);

      // Verify parallelism: dot product of direction and normal is 0
      const wallDir = { x: end.x - start.x, y: end.y - start.y };
      const dimDir = { x: geom.dimEnd.x - geom.dimStart.x, y: geom.dimEnd.y - geom.dimStart.y };
      expect(dot(wallDir, geom.offsetVector)).toBeCloseTo(0);
      expect(dimDir.x).toBeCloseTo(wallDir.x);
      expect(dimDir.y).toBeCloseTo(wallDir.y);
    });

    it('offsets slanted wall segments by exactly 300mm', () => {
      const start = { x: 100, y: 100 };
      const end = { x: 3100, y: 4100 }; // 3-4-5 triangle: length = 5000mm
      const offsetMm = 300;

      const geom = computeDimensionLine(start, end, offsetMm);

      expect(geom.length).toBeCloseTo(5000);
      expect(distance(geom.dimStart, geom.dimEnd)).toBeCloseTo(5000);
      expect(distance(start, geom.dimStart)).toBeCloseTo(300);
      expect(distance(end, geom.dimEnd)).toBeCloseTo(300);
    });
  });
});

describe('Wall Tool State Machine & Chaining', () => {
  let wallTool: WallTool;
  let toolManager: ToolManager;
  let context: ToolContext;
  let mockRequestRender: () => void;

  beforeEach(() => {
    planStore.getState().clear();
    const spatialIndex = new SpatialIndex();
    const snapEngine = new SnapEngine({ spatialIndex });
    const viewport = new Viewport({ zoom: 0.1 });
    mockRequestRender = vi.fn();

    context = {
      viewport,
      snapEngine,
      spatialIndex,
      requestRender: mockRequestRender,
    };

    wallTool = new WallTool();
    toolManager = new ToolManager();
    toolManager.registerTool(wallTool);
    toolManager.setActiveTool('wall', context);
  });

  it('first click switches tool status from idle to drawing', () => {
    expect(wallTool.status).toBe('idle');

    // First click at (0, 0)
    const pointerDownEvent = { button: 0 } as PointerEvent;
    wallTool.onPointerDown(pointerDownEvent, { x: 0, y: 0 }, context);

    expect(wallTool.status).toBe('drawing');
    expect(wallTool.startPoint).toEqual({ x: 0, y: 0 });
    expect(mockRequestRender).toHaveBeenCalled();
  });

  it('second click adds a wall to store, advances chain startPoint, and preserves drawing status', () => {
    // 1. First click at (0, 0)
    wallTool.onPointerDown({ button: 0 } as PointerEvent, { x: 0, y: 0 }, context);
    expect(wallTool.status).toBe('drawing');

    // 2. Move pointer to (3000, 0)
    wallTool.onPointerMove({ shiftKey: false } as PointerEvent, { x: 3000, y: 0 }, context);
    expect(wallTool.currentPoint).toEqual({ x: 3000, y: 0 });

    // 3. Second click commits wall
    wallTool.onPointerDown({ button: 0 } as PointerEvent, { x: 3000, y: 0 }, context);

    // Verify wall was created in store
    const state = planStore.getState();
    const walls = Object.values(state.walls);
    expect(walls.length).toBe(1);
    expect(walls[0].thickness).toBe(150);

    // Verify chain advanced: startPoint is now at (3000, 0) and status remains 'drawing'
    expect(wallTool.status).toBe('drawing');
    expect(wallTool.startPoint).toEqual({ x: 3000, y: 0 });
  });

  it('pressing Escape resets tool to idle', () => {
    // Start drawing
    wallTool.onPointerDown({ button: 0 } as PointerEvent, { x: 0, y: 0 }, context);
    expect(wallTool.status).toBe('drawing');

    // Press Escape
    wallTool.onKeyDown({ key: 'Escape' } as KeyboardEvent, context);

    expect(wallTool.status).toBe('idle');
    expect(wallTool.startPoint).toBeNull();
    expect(wallTool.currentPoint).toBeNull();
  });

  it('right-click cancels drawing and resets tool to idle', () => {
    wallTool.onPointerDown({ button: 0 } as PointerEvent, { x: 0, y: 0 }, context);
    expect(wallTool.status).toBe('drawing');

    // Right-click (button 2)
    wallTool.onPointerDown({ button: 2 } as PointerEvent, { x: 1000, y: 1000 }, context);

    expect(wallTool.status).toBe('idle');
    expect(wallTool.startPoint).toBeNull();
  });

  it('snap-to-origin loop closure cleanly finishes the chain', () => {
    // Click 1: Start at (0, 0)
    wallTool.onPointerDown({ button: 0 } as PointerEvent, { x: 0, y: 0 }, context);

    // Move to (4000, 0) and Click 2
    wallTool.onPointerMove({ shiftKey: false } as PointerEvent, { x: 4000, y: 0 }, context);
    wallTool.onPointerDown({ button: 0 } as PointerEvent, { x: 4000, y: 0 }, context);
    expect(wallTool.status).toBe('drawing');

    // Move to (4000, 3000) and Click 3
    wallTool.onPointerMove({ shiftKey: false } as PointerEvent, { x: 4000, y: 3000 }, context);
    wallTool.onPointerDown({ button: 0 } as PointerEvent, { x: 4000, y: 3000 }, context);
    expect(wallTool.status).toBe('drawing');

    // Move back to origin (0, 0)
    // Snap engine will snap to the starting vertex!
    wallTool.onPointerMove({ shiftKey: false } as PointerEvent, { x: 10, y: 10 }, context);
    expect(wallTool.activeSnapResult?.snapType).toBe('vertex');
    expect(wallTool.activeSnapResult?.targetId).toBe(wallTool.firstVertexId);

    // Click 4 to close the loop!
    wallTool.onPointerDown({ button: 0 } as PointerEvent, { x: 10, y: 10 }, context);

    // Verify 3 walls formed a closed triangle in store
    const walls = Object.values(planStore.getState().walls);
    expect(walls.length).toBe(3);

    // Loop closure should cleanly reset tool to idle!
    expect(wallTool.status).toBe('idle');
    expect(wallTool.startPoint).toBeNull();
    expect(wallTool.firstVertexId).toBeNull();
  });
});

describe('Dimension Font Size and Position Customization', () => {
  it('has DEFAULT_DIMENSION_SETTINGS with fontSize 12, outside position, and 350mm offset', () => {
    expect(DEFAULT_DIMENSION_SETTINGS.fontSize).toBe(12);
    expect(DEFAULT_DIMENSION_SETTINGS.position).toBe('outside');
    expect(DEFAULT_DIMENSION_SETTINGS.offsetMm).toBe(350);
  });

  it('updates dimension settings in uiStore via setters', () => {
    uiStore.getState().setDimensionFontSize(18);
    expect(uiStore.getState().dimensionSettings.fontSize).toBe(18);

    uiStore.getState().setDimensionPosition('centered');
    expect(uiStore.getState().dimensionSettings.position).toBe('centered');

    uiStore.getState().setDimensionPosition('inside');
    expect(uiStore.getState().dimensionSettings.position).toBe('inside');

    uiStore.getState().setDimensionOffset(500);
    expect(uiStore.getState().dimensionSettings.offsetMm).toBe(500);

    uiStore.getState().setDimensionSettings({ fontSize: 15, position: 'outside', offsetMm: 250 });
    expect(uiStore.getState().dimensionSettings.fontSize).toBe(15);
    expect(uiStore.getState().dimensionSettings.position).toBe('outside');
    expect(uiStore.getState().dimensionSettings.offsetMm).toBe(250);
  });

  it('drawDimension renders without throwing for centered, inside, and outside positions and custom font sizes', () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      setLineDash: vi.fn(),
      measureText: vi.fn(() => ({ width: 60 })),
      fillText: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      roundRect: vi.fn(),
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      textAlign: '',
      textBaseline: '',
    } as unknown as CanvasRenderingContext2D;

    const start = { x: 0, y: 0 };
    const end = { x: 3000, y: 0 };

    // 1. Outside position with 16px font
    expect(() => {
      drawDimension(mockCtx, start, end, 300, 1.0, undefined, { fontSize: 16, position: 'outside' });
    }).not.toThrow();
    expect(mockCtx.font).toContain('16px');

    // 2. Centered position with 20px font
    expect(() => {
      drawDimension(mockCtx, start, end, 300, 1.0, undefined, { fontSize: 20, position: 'centered' });
    }).not.toThrow();
    expect(mockCtx.font).toContain('20px');

    // 3. Inside position with 10px font
    expect(() => {
      drawDimension(mockCtx, start, end, 300, 1.0, undefined, { fontSize: 10, position: 'inside' });
    }).not.toThrow();
    expect(mockCtx.font).toContain('10px');
  });
});

