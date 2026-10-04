import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeGizmoHandles,
  hitTestGizmo,
  computeTransformResize,
  computeTransformRotate,
} from '../src/engine/gizmos/TransformGizmo.js';
import {
  pointToLineDistance,
  isPointNearLine,
  getLineEndpointHit,
} from '../src/engine/layers/LineLayer.js';
import { snapTo45DegreeAngle } from '../src/engine/tools/LineTool.js';
import { formatLength, parseLengthToMm } from '../src/core/units/unitFormatter.js';
import { isInputElementActive } from '../src/engine/input/KeyboardManager.js';
import { createPlanStore } from '../src/core/store/planStore.js';
import { serializeProject, deserializeProject } from '../src/core/io/schema.js';
import { exportToSvg } from '../src/core/export/svgExporter.js';
import type { Point2D, LineEntity } from '../src/core/types.js';

describe('Universal Asset Transform Gizmo & Parametric Line Drawing', () => {
  describe('1. Transform Gizmo Local-to-World Math & Projections', () => {
    it('computes correct handle positions for unrotated asset', () => {
      const center: Point2D = { x: 1000, y: 1000 };
      const width = 400;
      const height = 200;
      const handles = computeGizmoHandles(center, width, height, 0, 350);

      // Half-dimensions: halfW = 200, halfH = 100
      expect(handles.tl.worldPos).toEqual({ x: 800, y: 900 });
      expect(handles.tr.worldPos).toEqual({ x: 1200, y: 900 });
      expect(handles.br.worldPos).toEqual({ x: 1200, y: 1100 });
      expect(handles.bl.worldPos).toEqual({ x: 800, y: 1100 });
      expect(handles.t.worldPos).toEqual({ x: 1000, y: 900 });
      expect(handles.b.worldPos).toEqual({ x: 1000, y: 1100 });
      expect(handles.l.worldPos).toEqual({ x: 800, y: 1000 });
      expect(handles.r.worldPos).toEqual({ x: 1200, y: 1000 });
      // Rotation stalk handle (0, -halfH - 350) => (1000, 1000 - 100 - 350) = (1000, 550)
      expect(handles.rotate.worldPos).toEqual({ x: 1000, y: 550 });
    });

    it('verifies that dragging right handle (R) on a 90° rotated box expands along world Y-axis', () => {
      const center: Point2D = { x: 0, y: 0 };
      const width = 200;
      const height = 100;
      const rotation = Math.PI / 2; // 90° clockwise

      // Handles calculation
      const handles = computeGizmoHandles(center, width, height, rotation, 350);
      // In local coords, R is at (100, 0).
      // Rotated 90°: [cos(90) -sin(90); sin(90) cos(90)] * [100; 0] = [0; 100]
      expect(Math.round(handles.r.worldPos.x)).toBe(0);
      expect(Math.round(handles.r.worldPos.y)).toBe(100);

      // Now simulate dragging the mouse along the world Y-axis from (0, 100) to (0, 200)
      const worldMouse: Point2D = { x: 0, y: 200 };
      const resized = computeTransformResize(
        'r',
        worldMouse,
        { x: 0, y: 0, width, height, rotation },
        false
      );

      // New width should be 200 * 2 = 400, while height remains unchanged at 100
      expect(resized.width).toBe(400);
      expect(resized.height).toBe(100);

      // Check the new right handle position in world space
      const newHandles = computeGizmoHandles(center, resized.width, resized.height, rotation, 350);
      expect(Math.round(newHandles.r.worldPos.x)).toBe(0);
      expect(Math.round(newHandles.r.worldPos.y)).toBe(200);
      // Successfully expanded along the world Y-axis!
    });

    it('preserves aspect ratio when corner scaling with proportional lock', () => {
      const initial = {
        x: 500,
        y: 500,
        width: 300,
        height: 150,
        rotation: 0,
        aspectRatio: 2.0, // 300 / 150 = 2.0
      };

      // Drag bottom-right corner outwards to (500 + 300, 500 + 150) => local (300, 150) => rawW = 600
      const worldMouse: Point2D = { x: 800, y: 650 };
      const resized = computeTransformResize('br', worldMouse, initial, true);

      expect(resized.width).toBe(600);
      expect(resized.height).toBe(300);
      expect(resized.width / resized.height).toBeCloseTo(2.0, 4);
    });

    it('clamps resize to minimum dimension (100mm)', () => {
      const initial = {
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        rotation: 0,
      };

      // Drag mouse very close to center
      const worldMouse: Point2D = { x: 10, y: 10 };
      const resized = computeTransformResize('br', worldMouse, initial, false, 100);

      expect(resized.width).toBe(100);
      expect(resized.height).toBe(100);
    });

    it('computes rotation and snaps to 15° increments when requested', () => {
      const center: Point2D = { x: 0, y: 0 };

      // Pointer at (100, 0) => angle is atan2(0, 100) + PI/2 = PI/2 (90°)
      const angle90 = computeTransformRotate({ x: 100, y: 0 }, center);
      expect(angle90).toBeCloseTo(Math.PI / 2, 4);

      // Pointer at angle ~33° (0.576 rad) with 15° snap (PI / 12 = 0.2618 rad)
      // 33° snaps to 30° (2 * 15° = 30° = PI / 6 rad)
      const rad33 = (33 * Math.PI) / 180;
      const mouse33: Point2D = {
        x: 100 * Math.cos(rad33 - Math.PI / 2),
        y: 100 * Math.sin(rad33 - Math.PI / 2),
      };
      const snappedAngle = computeTransformRotate(mouse33, center, Math.PI / 12);
      expect((snappedAngle * 180) / Math.PI).toBeCloseTo(30, 1);
    });

    it('hit-tests all 9 handles and body correctly', () => {
      const bounds = {
        x: 0,
        y: 0,
        width: 400,
        height: 200,
        rotation: 0,
      };

      // Top-left corner (-200, -100)
      expect(hitTestGizmo({ x: -200, y: -100 }, bounds, 350, 30)).toBe('tl');
      // Top midpoint (0, -100)
      expect(hitTestGizmo({ x: 0, y: -100 }, bounds, 350, 30)).toBe('t');
      // Rotation stalk handle (0, -100 - 350) = (0, -450)
      expect(hitTestGizmo({ x: 0, y: -450 }, bounds, 350, 30)).toBe('rotate');
      // Inside body (50, 20)
      expect(hitTestGizmo({ x: 50, y: 20 }, bounds, 350, 30)).toBe('body');
      // Far outside
      expect(hitTestGizmo({ x: 800, y: 800 }, bounds, 350, 30)).toBeNull();
    });
  });

  describe('2. Line Math, Ortho Snapping & Projection', () => {
    it('calculates point-to-line perpendicular distance correctly', () => {
      const start: Point2D = { x: 0, y: 0 };
      const end: Point2D = { x: 1000, y: 0 };

      // Point directly above midpoint at (500, 50) => distance should be 50
      expect(pointToLineDistance({ x: 500, y: 50 }, start, end)).toBeCloseTo(50, 4);

      // Point on the line at (300, 0) => distance should be 0
      expect(pointToLineDistance({ x: 300, y: 0 }, start, end)).toBeCloseTo(0, 4);

      // Point beyond end at (1200, 0) => distance should be distance to end (200)
      expect(pointToLineDistance({ x: 1200, y: 0 }, start, end)).toBeCloseTo(200, 4);
    });

    it('hit-tests line entity considering thickness threshold', () => {
      const line: LineEntity = {
        id: 'line-1',
        layerId: 'layer-dimensions',
        start: { x: 100, y: 100 },
        end: { x: 500, y: 100 },
        thickness: 50,
        color: '#334155',
        style: 'solid',
        arrows: 'none',
        showMeasurement: true,
      };

      // Point 30mm perpendicular to line:
      // threshold = max(20, 50/2 + 20) = 45mm. 30mm <= 45mm => near line
      expect(isPointNearLine({ x: 300, y: 130 }, line, 20)).toBe(true);

      // Point 60mm perpendicular to line: 60mm > 45mm => not near line
      expect(isPointNearLine({ x: 300, y: 160 }, line, 20)).toBe(false);
    });

    it('identifies start and end control handle hits', () => {
      const line: LineEntity = {
        id: 'line-2',
        layerId: 'layer-dimensions',
        start: { x: 0, y: 0 },
        end: { x: 1000, y: 1000 },
        thickness: 20,
        color: '#334155',
        style: 'solid',
        arrows: 'both',
        showMeasurement: true,
      };

      expect(getLineEndpointHit({ x: 10, y: 10 }, line, 30)).toBe('start');
      expect(getLineEndpointHit({ x: 990, y: 1005 }, line, 30)).toBe('end');
      expect(getLineEndpointHit({ x: 500, y: 500 }, line, 30)).toBeNull();
    });

    it('snaps angles to 0°, 45°, 90°, 135°, 180° when Shift is held', () => {
      const origin: Point2D = { x: 0, y: 0 };

      // Near horizontal (10° offset) -> snaps to 0°
      const pt10deg: Point2D = { x: 1000, y: 150 };
      const snapped0 = snapTo45DegreeAngle(origin, pt10deg);
      expect(snapped0.y).toBeCloseTo(0, 1);
      expect(snapped0.x).toBeGreaterThan(900);

      // Near 45° (e.g. 42°) -> snaps to exactly dx == dy
      const pt42deg: Point2D = { x: 1000, y: 900 };
      const snapped45 = snapTo45DegreeAngle(origin, pt42deg);
      expect(snapped45.x).toBeCloseTo(snapped45.y, 1);

      // Near 90° (vertical)
      const pt85deg: Point2D = { x: 100, y: 1000 };
      const snapped90 = snapTo45DegreeAngle(origin, pt85deg);
      expect(snapped90.x).toBeCloseTo(0, 1);
      expect(snapped90.y).toBeGreaterThan(900);
    });

    it('formats line length accurately across all unit systems (mm, cm, m, in, ft_in)', () => {
      const mm = 2540; // Exactly 254 cm, 2.54 m, 100 in, 8' - 4"

      // 1. Millimeters
      const formattedMm = formatLength(mm, { lengthUnit: 'mm' });
      expect(formattedMm).toBe('2,540 mm');

      // 2. Centimeters
      const formattedCm = formatLength(mm, { lengthUnit: 'cm', decimalPlaces: 1 });
      expect(formattedCm).toBe('254.0 cm');

      // 3. Meters
      const formattedM = formatLength(mm, { lengthUnit: 'm', decimalPlaces: 2 });
      expect(formattedM).toBe('2.54 m');

      // 4. Inches
      const formattedIn = formatLength(mm, { lengthUnit: 'in', decimalPlaces: 1 });
      expect(formattedIn).toBe('100.0 in');

      // 5. Feet & Inches (Architectural)
      const formattedFtIn = formatLength(mm, { lengthUnit: 'ft_in' });
      expect(formattedFtIn).toBe(`8' - 4"`);
    });
  });

  describe('3. Store Operations, Persistence & SVG Exporter', () => {
    let store: ReturnType<typeof createPlanStore>;

    beforeEach(() => {
      store = createPlanStore();
    });

    it('adds, updates, selects and deletes a drafting line in planStore', () => {
      const line = store.getState().addLine({
        start: { x: 0, y: 0 },
        end: { x: 1500, y: 0 },
        thickness: 50,
        color: '#2563eb',
        style: 'dashed',
        arrows: 'both',
        showMeasurement: true,
      });

      expect(line.id).toBeDefined();
      expect(store.getState().lines[line.id]).toBeDefined();
      expect(store.getState().selectedLineId).toBe(line.id);

      // Update line thickness & style
      store.getState().updateLine(line.id, { thickness: 100, style: 'dotted' });
      expect(store.getState().lines[line.id].thickness).toBe(100);
      expect(store.getState().lines[line.id].style).toBe('dotted');

      // Delete line
      store.getState().deleteLine(line.id);
      expect(store.getState().lines[line.id]).toBeUndefined();
      expect(store.getState().selectedLineId).toBeNull();
    });

    it('serializes and deserializes floor plans containing drafting lines', () => {
      const line = store.getState().addLine({
        start: { x: 100, y: 200 },
        end: { x: 800, y: 600 },
        thickness: 25,
        color: '#dc2626',
        style: 'dotted',
        arrows: 'end',
        showMeasurement: true,
      });

      const jsonStr = serializeProject(store.getState(), { title: 'Lines Test Plan' });
      expect(jsonStr).toContain('Lines Test Plan');
      expect(jsonStr).toContain(line.id);

      const deserialized = deserializeProject(jsonStr);
      expect(deserialized.lines).toBeDefined();
      expect(deserialized.lines![line.id]).toBeDefined();
      expect(deserialized.lines![line.id].color).toBe('#dc2626');
      expect(deserialized.lines![line.id].style).toBe('dotted');
      expect(deserialized.lines![line.id].arrows).toBe('end');
    });

    it('exports SVG with drafting lines, dashed stroke, arrowheads, and dimension tags', () => {
      store.getState().addLine({
        start: { x: 500, y: 500 },
        end: { x: 2500, y: 500 },
        thickness: 50,
        color: '#2563eb',
        style: 'dashed',
        arrows: 'both',
        showMeasurement: true,
      });

      const svg = exportToSvg(store.getState());
      expect(svg).toContain('<g id="lines">');
      expect(svg).toContain('stroke-dasharray="150,75"'); // 50 * 3, 50 * 1.5
      expect(svg).toContain('<polygon points="'); // arrowheads
      expect(svg).toMatch(/2,?000\s*mm/); // dimension measurement tag
    });
  });

  describe('4. Keyboard Event Guard & Inspector Two-Way Unit Sync', () => {
    it('detects active input, textarea, and select elements via isInputElementActive', () => {
      expect(isInputElementActive()).toBe(false);

      const originalDoc = (globalThis as any).document;
      try {
        (globalThis as any).document = {
          activeElement: null,
        };
        expect(isInputElementActive()).toBe(false);

        (globalThis as any).document.activeElement = { tagName: 'INPUT' };
        expect(isInputElementActive()).toBe(true);

        (globalThis as any).document.activeElement = { tagName: 'TEXTAREA' };
        expect(isInputElementActive()).toBe(true);

        (globalThis as any).document.activeElement = { tagName: 'SELECT' };
        expect(isInputElementActive()).toBe(true);

        (globalThis as any).document.activeElement = { tagName: 'DIV', isContentEditable: true };
        expect(isInputElementActive()).toBe(true);

        (globalThis as any).document.activeElement = { tagName: 'CANVAS', isContentEditable: false };
        expect(isInputElementActive()).toBe(false);

        (globalThis as any).document.activeElement = { tagName: 'BUTTON', isContentEditable: false };
        expect(isInputElementActive()).toBe(false);
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });

    it('parses unit values accurately across length units for two-way inspector sync', () => {
      // Metric inputs
      expect(parseLengthToMm('300cm', 'cm')).toBe(3000);
      expect(parseLengthToMm('2.5m', 'm')).toBe(2500);
      expect(parseLengthToMm('1500', 'mm')).toBe(1500);
      expect(parseLengthToMm('25 mm', 'mm')).toBe(25);

      // Imperial inputs
      expect(parseLengthToMm('10ft', 'ft')).toBeCloseTo(3048, 0);
      expect(parseLengthToMm('12in', 'in')).toBeCloseTo(304.8, 0);
      expect(parseLengthToMm(`5' 3"`, 'ft_in')).toBeCloseTo(1600.2, 0);
      expect(parseLengthToMm(`6' - 6 3/4"`, 'ft_in')).toBeCloseTo(2000.25, 0);
    });

    it('formats furniture and wall dimensions into active unit without raw mm exposure', () => {
      const cmSettings = { lengthUnit: 'cm' as const, areaUnit: 'sq_m' as const, decimalPlaces: 2, fractionPrecision: 16 as const };
      const ftInSettings = { lengthUnit: 'ft_in' as const, areaUnit: 'sq_ft' as const, decimalPlaces: 2, fractionPrecision: 16 as const };

      expect(formatLength(1600, cmSettings)).toBe('160.00 cm');
      expect(formatLength(2000, cmSettings)).toBe('200.00 cm');
      expect(formatLength(1600, ftInSettings)).toBe(`5' - 3"`);
      expect(formatLength(2000, ftInSettings)).toBe(`6' - 6 3/4"`);
    });
  });
});
