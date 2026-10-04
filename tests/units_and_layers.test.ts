import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatLength,
  formatArea,
  parseLengthToMm,
  type UnitSettings,
  DEFAULT_UNIT_SETTINGS,
} from '../src/core/units/unitFormatter.js';
import { createPlanStore, planStore } from '../src/core/store/planStore.js';
import { SelectTool } from '../src/engine/tools/SelectTool.js';
import { DimensionLayer } from '../src/engine/layers/DimensionLayer.js';

describe('Unit Formatter & Parser Engine', () => {
  describe('1. formatLength', () => {
    it('formats 25.4 mm to 1.00 in and 0\' - 1"', () => {
      expect(formatLength(25.4, { lengthUnit: 'in', decimalPlaces: 2 })).toBe('1.00 in');
      expect(formatLength(25.4, { lengthUnit: 'ft_in' })).toBe(`0' - 1"`);
    });

    it('formats 3048 mm to 10\' - 0"', () => {
      expect(formatLength(3048, { lengthUnit: 'ft_in' })).toBe(`10' - 0"`);
    });

    it('formats 2400 mm with fraction precision 16 to 7\' - 10 1/2"', () => {
      expect(formatLength(2400, { lengthUnit: 'ft_in', fractionPrecision: 16 })).toBe(`7' - 10 1/2"`);
    });

    it('formats metric units mm, cm, m correctly', () => {
      expect(formatLength(2500, { lengthUnit: 'mm' })).toBe('2,500 mm');
      expect(formatLength(2500, { lengthUnit: 'cm', decimalPlaces: 1 })).toBe('250.0 cm');
      expect(formatLength(2500, { lengthUnit: 'm', decimalPlaces: 2 })).toBe('2.50 m');
      expect(formatLength(0, { lengthUnit: 'm', decimalPlaces: 2 })).toBe('0.00 m');
    });

    it('formats decimal feet correctly', () => {
      expect(formatLength(3048, { lengthUnit: 'ft', decimalPlaces: 2 })).toBe('10.00 ft');
    });

    it('handles negative lengths and zero lengths in ft_in format', () => {
      expect(formatLength(0, { lengthUnit: 'ft_in' })).toBe(`0' - 0"`);
      expect(formatLength(-3048, { lengthUnit: 'ft_in' })).toBe(`-10' - 0"`);
    });

    it('simplifies fractions correctly for different precisions', () => {
      // 1/4 inch = 6.35 mm
      expect(formatLength(6.35, { lengthUnit: 'ft_in', fractionPrecision: 16 })).toBe(`0' - 1/4"`);
      // 3/4 inch = 19.05 mm
      expect(formatLength(19.05, { lengthUnit: 'ft_in', fractionPrecision: 16 })).toBe(`0' - 3/4"`);
      // 1/8 inch = 3.175 mm
      expect(formatLength(3.175, { lengthUnit: 'ft_in', fractionPrecision: 8 })).toBe(`0' - 1/8"`);
    });
  });

  describe('2. parseLengthToMm', () => {
    it('parses 10\' 6" to 3200.4 mm', () => {
      expect(parseLengthToMm('10\' 6"')).toBe(3200.4);
      expect(parseLengthToMm('10\' - 6"')).toBe(3200.4);
    });

    it('parses 2.5m to 2500 mm', () => {
      expect(parseLengthToMm('2.5m')).toBe(2500);
      expect(parseLengthToMm('2.5 m')).toBe(2500);
    });

    it('parses 150cm to 1500 mm', () => {
      expect(parseLengthToMm('150cm')).toBe(1500);
      expect(parseLengthToMm('150 cm')).toBe(1500);
    });

    it('parses complex architectural fractions and units', () => {
      // 12' 4 1/2" = (12 * 12 + 4.5) * 25.4 = 148.5 * 25.4 = 3771.9 mm
      expect(parseLengthToMm('12\' 4 1/2"')).toBe(3771.9);
      expect(parseLengthToMm('7\' - 10 1/2"')).toBeCloseTo(2400.3, 1);

      // Explicit millimeter strings
      expect(parseLengthToMm('3048mm')).toBe(3048);
      expect(parseLengthToMm('5000 mm')).toBe(5000);

      // Inches and feet
      expect(parseLengthToMm('10 in')).toBe(254);
      expect(parseLengthToMm('10ft')).toBe(3048);
    });

    it('falls back to provided fallback unit when no unit is specified', () => {
      expect(parseLengthToMm('100', 'mm')).toBe(100);
      expect(parseLengthToMm('10', 'cm')).toBe(100);
      expect(parseLengthToMm('2', 'm')).toBe(2000);
      expect(parseLengthToMm('10', 'in')).toBe(254);
      expect(parseLengthToMm('1', 'ft')).toBe(304.8);
    });

    it('returns null on invalid inputs', () => {
      expect(parseLengthToMm('')).toBeNull();
      expect(parseLengthToMm('   ')).toBeNull();
      expect(parseLengthToMm('abc')).toBeNull();
    });
  });

  describe('3. formatArea', () => {
    it('formats metric square millimeters, square centimeters, and square meters', () => {
      const area = 12_000_000; // 12 m²
      expect(formatArea(area, { areaUnit: 'sq_m', decimalPlaces: 2 })).toBe('12.00 m²');
      expect(formatArea(area, { areaUnit: 'sq_mm', decimalPlaces: 0 })).toBe('12,000,000 mm²');
      expect(formatArea(10_000, { areaUnit: 'sq_cm', decimalPlaces: 1 })).toBe('100.0 cm²');
    });

    it('formats imperial square feet and square inches', () => {
      // 12 m² ~ 129.17 sq ft
      const area = 12_000_000;
      expect(formatArea(area, { areaUnit: 'sq_ft', decimalPlaces: 1 })).toBe('129.2 sq ft');
      // 1 sq inch = 645.16 mm²
      expect(formatArea(645.16, { areaUnit: 'sq_in', decimalPlaces: 2 })).toBe('1.00 sq in');
    });
  });
});

describe('Photoshop-Style Layer System & Store Management', () => {
  let store: ReturnType<typeof createPlanStore>;

  beforeEach(() => {
    store = createPlanStore();
  });

  it('initializes with the 4 standard CAD layers seeded', () => {
    const state = store.getState();
    expect(state.layers).toBeDefined();
    expect(state.layers['layer-rooms']).toBeDefined();
    expect(state.layers['layer-furniture']).toBeDefined();
    expect(state.layers['layer-walls']).toBeDefined();
    expect(state.layers['layer-dimensions']).toBeDefined();

    expect(state.activeLayerId).toBe('layer-walls');
    expect(state.layerOrder).toEqual([
      'layer-rooms',
      'layer-furniture',
      'layer-walls',
      'layer-dimensions',
    ]);
  });

  it('allows creating, updating, and deleting layers', () => {
    // 1. Create custom layer
    const newLayer = store.getState().createLayer({
      name: 'Electrical Layer',
      colorTag: '#f59e0b',
    });
    expect(newLayer.name).toBe('Electrical Layer');
    expect(newLayer.colorTag).toBe('#f59e0b');
    expect(store.getState().layers[newLayer.id]).toBeDefined();
    expect(store.getState().layerOrder).toContain(newLayer.id);

    // 2. Update layer properties
    store.getState().updateLayer(newLayer.id, {
      name: 'Lighting & Power',
      opacity: 0.8,
    });
    expect(store.getState().layers[newLayer.id].name).toBe('Lighting & Power');
    expect(store.getState().layers[newLayer.id].opacity).toBe(0.8);

    // 3. Delete layer
    store.getState().deleteLayer(newLayer.id);
    expect(store.getState().layers[newLayer.id]).toBeUndefined();
    expect(store.getState().layerOrder).not.toContain(newLayer.id);
  });

  it('toggles layer visibility and lock state', () => {
    expect(store.getState().layers['layer-walls'].visible).toBe(true);
    store.getState().toggleLayerVisibility('layer-walls');
    expect(store.getState().layers['layer-walls'].visible).toBe(false);
    store.getState().toggleLayerVisibility('layer-walls');
    expect(store.getState().layers['layer-walls'].visible).toBe(true);

    expect(store.getState().layers['layer-walls'].locked).toBe(false);
    store.getState().toggleLayerLock('layer-walls');
    expect(store.getState().layers['layer-walls'].locked).toBe(true);
    store.getState().toggleLayerLock('layer-walls');
    expect(store.getState().layers['layer-walls'].locked).toBe(false);
  });

  it('clamps layer opacity between 0 and 1', () => {
    store.getState().setLayerOpacity('layer-furniture', 0.5);
    expect(store.getState().layers['layer-furniture'].opacity).toBe(0.5);

    store.getState().setLayerOpacity('layer-furniture', 1.5);
    expect(store.getState().layers['layer-furniture'].opacity).toBe(1);

    store.getState().setLayerOpacity('layer-furniture', -0.5);
    expect(store.getState().layers['layer-furniture'].opacity).toBe(0);
  });

  it('reorders layers correctly', () => {
    // Initial order: ['layer-rooms', 'layer-furniture', 'layer-walls', 'layer-dimensions']
    store.getState().reorderLayers(0, 2);
    // After moving index 0 ('layer-rooms') to index 2:
    const newOrder = store.getState().layerOrder;
    expect(newOrder[2]).toBe('layer-rooms');
  });

  it('assigns new entities to activeLayerId upon creation', () => {
    store.getState().setActiveLayer('layer-furniture');
    const furn = store.getState().addFurniture('bed_queen', { x: 1000, y: 1000 });
    expect(furn.layerId).toBe('layer-furniture');

    store.getState().setActiveLayer('layer-walls');
    const wall = store.getState().addWall({ x: 0, y: 0 }, { x: 3000, y: 0 });
    expect(wall?.layerId).toBe('layer-walls');
  });

  it('moves selected elements to the target layer', () => {
    const wall = store.getState().addWall({ x: 0, y: 0 }, { x: 3000, y: 0 });
    expect(wall).not.toBeNull();
    if (!wall) return;

    const furn = store.getState().addFurniture('toilet', { x: 500, y: 500 });
    store.getState().setSelectedIds([wall.id, furn.id]);

    const customLayer = store.getState().createLayer({ name: 'Plumbing & Structure' });
    store.getState().moveSelectedToLayer(customLayer.id);

    expect(store.getState().walls[wall.id].layerId).toBe(customLayer.id);
    expect(store.getState().furniture[furn.id].layerId).toBe(customLayer.id);
  });
});

describe('Layer Culling & Selection Hit-Testing Guard', () => {
  let selectTool: SelectTool;

  beforeEach(() => {
    planStore.getState().clear();
    selectTool = new SelectTool();
  });

  it('prevents selection hit-tests when a layer is hidden (visible = false)', () => {
    const activeWall = planStore.getState().addWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 200);
    expect(activeWall).not.toBeNull();
    if (!activeWall) return;

    const testPoint = { x: 1500, y: 0 };

    // Visible: hitTest should find the wall
    let hit = selectTool.hitTest(testPoint);
    expect(hit).not.toBeNull();
    expect(hit?.type).toBe('wall');
    expect(hit?.id).toBe(activeWall.id);

    // Hide walls layer: hitTest should reject
    planStore.getState().toggleLayerVisibility('layer-walls');
    hit = selectTool.hitTest(testPoint);
    expect(hit).toBeNull();
  });

  it('blocks selection hit-tests when a layer is locked (locked = true)', () => {
    const activeWall = planStore.getState().addWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 200);
    expect(activeWall).not.toBeNull();
    if (!activeWall) return;

    const testPoint = { x: 1500, y: 0 };

    // Lock walls layer
    planStore.getState().toggleLayerLock('layer-walls');
    expect(planStore.getState().layers['layer-walls'].locked).toBe(true);

    // Hit-test must be rejected
    const hit = selectTool.hitTest(testPoint);
    expect(hit).toBeNull();

    // Unlock: hit-test succeeds
    planStore.getState().toggleLayerLock('layer-walls');
    const unlockedHit = selectTool.hitTest(testPoint);
    expect(unlockedHit).not.toBeNull();
    expect(unlockedHit?.id).toBe(activeWall.id);
  });

  it('blocks furniture selection hit-tests when furniture layer is hidden or locked', () => {
    const furn = planStore.getState().addFurniture('toilet', { x: 500, y: 500 });
    const centerPoint = { x: 500, y: 500 };

    // Selectable initially
    let hit = selectTool.hitTest(centerPoint);
    expect(hit).not.toBeNull();
    expect(hit?.type).toBe('furniture');
    expect(hit?.id).toBe(furn.id);

    // Hidden
    planStore.getState().toggleLayerVisibility('layer-furniture');
    expect(selectTool.hitTest(centerPoint)).toBeNull();

    // Unhide but lock
    planStore.getState().toggleLayerVisibility('layer-furniture');
    planStore.getState().toggleLayerLock('layer-furniture');
    expect(selectTool.hitTest(centerPoint)).toBeNull();

    // Unlock
    planStore.getState().toggleLayerLock('layer-furniture');
    expect(selectTool.hitTest(centerPoint)?.id).toBe(furn.id);
  });

  it('prioritizes top/active layer object when overlapping, and cycles to lower layer object when clicked again', () => {
    // 1. Clear and create Layer 1 object
    planStore.getState().clear();
    const wall1 = planStore.getState().addWall({ x: 0, y: 0 }, { x: 2000, y: 0 }, 200);
    expect(wall1).not.toBeNull();

    // 2. Add Layer 2 on top and make it active
    const l2 = planStore.getState().createLayer({ name: 'Interior Layer 2' });
    expect(l2).toBeDefined();
    planStore.getState().setActiveLayer(l2.id);

    // 3. Draw an overlapping line on Layer 2 at the exact same location
    const line2 = planStore.getState().addLine({
      start: { x: 0, y: 0 },
      end: { x: 2000, y: 0 },
      layerId: l2.id,
      color: '#38bdf8',
      thickness: 2,
      style: 'solid',
      arrows: 'none',
      showMeasurement: false,
    });
    expect(line2).toBeDefined();

    const pickPoint = { x: 1000, y: 0 };

    // 4. When nothing is selected: Top/active layer (line2 on l2) is selected first
    planStore.getState().setSelectedIds([]);
    const firstHit = selectTool.hitTest(pickPoint);
    expect(firstHit).not.toBeNull();
    expect(firstHit?.id).toBe(line2.id);

    // 5. When layer (two) object is selected (just drawn or selected), clicking overlapping spot selects layer (one) object underneath!
    planStore.getState().setSelectedIds([line2.id]);
    const secondHit = selectTool.hitTest(pickPoint);
    expect(secondHit).not.toBeNull();
    expect(secondHit?.id).toBe(wall1!.id);

    // 6. When layer (one) object is selected, clicking again cycles back to layer (two) object
    planStore.getState().setSelectedIds([wall1!.id]);
    const thirdHit = selectTool.hitTest(pickPoint);
    expect(thirdHit).not.toBeNull();
    expect(thirdHit?.id).toBe(line2.id);
  });
});

describe('DimensionLayer Rendering & Upright Text Orientation', () => {
  let dimensionLayer: DimensionLayer;

  beforeEach(() => {
    dimensionLayer = new DimensionLayer();
  });

  it('initializes with standard 350mm offset and 45 degree ticks', () => {
    expect(dimensionLayer.offsetMm).toBe(350);
    expect(dimensionLayer.tickLengthMm).toBe(150);
    expect(dimensionLayer.tickAngleRad).toBeCloseTo(Math.PI / 4, 4);
  });

  it('renders wall dimensions without throwing errors with various unit configurations', () => {
    planStore.getState().clear();
    planStore.getState().addWall({ x: 0, y: 0 }, { x: 3048, y: 0 }, 200);

    const mockCtx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      fillRect: () => {},
      measureText: () => ({ width: 60 }),
      fillText: () => {},
      translate: () => {},
      rotate: () => {},
      setLineDash: () => {},
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      textAlign: '',
      textBaseline: '',
    } as unknown as CanvasRenderingContext2D;

    const state = planStore.getState();

    // Test across all unit configurations
    const units: UnitSettings['lengthUnit'][] = ['mm', 'cm', 'm', 'in', 'ft', 'ft_in'];
    for (const unit of units) {
      expect(() => {
        dimensionLayer.render(mockCtx, state.walls, state.vertices, 1.0, {
          ...DEFAULT_UNIT_SETTINGS,
          lengthUnit: unit,
          fractionPrecision: 16,
        });
      }).not.toThrow();
    }
  });

  it('formats dimensions dynamically in preferred units during drawing', () => {
    // 2500 mm in meters
    expect(formatLength(2500, { lengthUnit: 'm', decimalPlaces: 2 })).toBe('2.50 m');
    // 2500 mm in cm
    expect(formatLength(2500, { lengthUnit: 'cm', decimalPlaces: 1 })).toBe('250.0 cm');
    // 3048 mm in ft
    expect(formatLength(3048, { lengthUnit: 'ft', decimalPlaces: 2 })).toBe('10.00 ft');
    // 3048 mm in ft_in
    expect(formatLength(3048, { lengthUnit: 'ft_in' })).toBe(`10' - 0"`);
    // 25.4 mm in inches
    expect(formatLength(25.4, { lengthUnit: 'in', decimalPlaces: 2 })).toBe('1.00 in');
  });
});

