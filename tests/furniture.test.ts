import { describe, it, expect, beforeEach } from 'vitest';
import type { FurnitureInstance } from '../src/core/types.js';
import {
  transformWorldToLocal,
  transformLocalToWorld,
  isPointInFurnitureBox,
  isPointInRotationHandle,
  getCornerHandleHit,
  STALK_LENGTH_MM,
} from '../src/engine/tools/FurnitureTool.js';
import { createPlanStore } from '../src/core/store/planStore.js';
import { assetManager, DEFAULT_FURNITURE_CATALOG } from '../src/core/assets/AssetManager.js';

describe('SVG Furniture Catalog & Asset Placement', () => {
  describe('1. AssetManager & Standard Catalog', () => {
    it('registers all 5 standard architectural symbols with valid dimensions and SVG content', () => {
      expect(DEFAULT_FURNITURE_CATALOG.length).toBeGreaterThanOrEqual(5);

      const requiredIds = [
        'sofa_3seater',
        'bed_queen',
        'dining_table_6',
        'kitchen_sink_double',
        'toilet',
      ];

      for (const id of requiredIds) {
        const def = assetManager.getDefinition(id);
        expect(def).toBeDefined();
        expect(def!.defaultWidthMm).toBeGreaterThan(0);
        expect(def!.defaultHeightMm).toBeGreaterThan(0);
        expect(def!.svgContent).toContain('<svg');
        expect(def!.svgContent).toContain('</svg>');
      }

      // Check specific expected dimensions from prompt
      expect(assetManager.getDefinition('sofa_3seater')!.defaultWidthMm).toBe(2200);
      expect(assetManager.getDefinition('sofa_3seater')!.defaultHeightMm).toBe(900);

      expect(assetManager.getDefinition('bed_queen')!.defaultWidthMm).toBe(1600);
      expect(assetManager.getDefinition('bed_queen')!.defaultHeightMm).toBe(2000);

      expect(assetManager.getDefinition('dining_table_6')!.defaultWidthMm).toBe(1800);
      expect(assetManager.getDefinition('dining_table_6')!.defaultHeightMm).toBe(900);

      expect(assetManager.getDefinition('kitchen_sink_double')!.defaultWidthMm).toBe(800);
      expect(assetManager.getDefinition('kitchen_sink_double')!.defaultHeightMm).toBe(500);

      expect(assetManager.getDefinition('toilet')!.defaultWidthMm).toBe(450);
      expect(assetManager.getDefinition('toilet')!.defaultHeightMm).toBe(700);
    });

    it('filters definitions by category', () => {
      const living = assetManager.getDefinitionsByCategory('living');
      expect(living.some((d) => d.id === 'sofa_3seater')).toBe(true);

      const bedroom = assetManager.getDefinitionsByCategory('bedroom');
      expect(bedroom.some((d) => d.id === 'bed_queen')).toBe(true);

      const kitchen = assetManager.getDefinitionsByCategory('kitchen');
      expect(kitchen.some((d) => d.id === 'dining_table_6')).toBe(true);
      expect(kitchen.some((d) => d.id === 'kitchen_sink_double')).toBe(true);

      const bathroom = assetManager.getDefinitionsByCategory('bathroom');
      expect(bathroom.some((d) => d.id === 'toilet')).toBe(true);
    });
  });

  describe('2. Local-Space Inverse Rotation Formula', () => {
    it('accurately transforms between world and local object space', () => {
      const center = { x: 1000, y: 2000 };
      const rotation = Math.PI / 4; // 45 degrees

      const localOriginal = { x: 250, y: -150 };
      const worldPoint = transformLocalToWorld(localOriginal, center, rotation);
      const localComputed = transformWorldToLocal(worldPoint, center, rotation);

      expect(localComputed.x).toBeCloseTo(localOriginal.x, 4);
      expect(localComputed.y).toBeCloseTo(localOriginal.y, 4);
    });

    it('hit-tests unrotated item (0 degrees)', () => {
      // 2000mm wide x 1000mm high centered at (3000, 2000)
      const instance: FurnitureInstance = {
        id: 'f1',
        defId: 'sofa_3seater',
        x: 3000,
        y: 2000,
        width: 2000,
        height: 1000,
        rotation: 0,
        zIndex: 1,
      };

      // Interior points: local bounds are [-1000, 1000] x [-500, 500]
      expect(isPointInFurnitureBox({ x: 3000, y: 2000 }, instance)).toBe(true); // Center
      expect(isPointInFurnitureBox({ x: 3500, y: 2200 }, instance)).toBe(true); // Inside
      expect(isPointInFurnitureBox({ x: 3990, y: 2490 }, instance)).toBe(true); // Near corner

      // Exterior points
      expect(isPointInFurnitureBox({ x: 4100, y: 2000 }, instance)).toBe(false); // Past right edge
      expect(isPointInFurnitureBox({ x: 3000, y: 2600 }, instance)).toBe(false); // Past bottom edge
      expect(isPointInFurnitureBox({ x: 1900, y: 2000 }, instance)).toBe(false); // Past left edge
    });

    it('hit-tests item rotated by 90 degrees (PI / 2)', () => {
      // 2000mm wide (local X) x 1000mm high (local Y) centered at (3000, 2000)
      // When rotated 90 degrees, local X extends along world Y and local Y extends along world -X
      const instance: FurnitureInstance = {
        id: 'f1',
        defId: 'sofa_3seater',
        x: 3000,
        y: 2000,
        width: 2000,
        height: 1000,
        rotation: Math.PI / 2,
        zIndex: 1,
      };

      // A point at world (3000, 2800) corresponds to local:
      // dx = 0, dy = 800. local.x = 800, local.y = 0.
      // Since local.x = 800 <= 1000 and local.y = 0 <= 500 -> INSIDE
      expect(isPointInFurnitureBox({ x: 3000, y: 2800 }, instance)).toBe(true);

      // A point at world (3800, 2000):
      // dx = 800, dy = 0. local.x = 0, local.y = -800.
      // Since |-800| > 500 (half height) -> OUTSIDE
      expect(isPointInFurnitureBox({ x: 3800, y: 2000 }, instance)).toBe(false);

      // Past rotated extent
      expect(isPointInFurnitureBox({ x: 3000, y: 3100 }, instance)).toBe(false); // local.x = 1100 > 1000
    });

    it('hit-tests item rotated by 45 degrees (PI / 4)', () => {
      const instance: FurnitureInstance = {
        id: 'f1',
        defId: 'dining_table_6',
        x: 0,
        y: 0,
        width: 1000,
        height: 500,
        rotation: Math.PI / 4,
        zIndex: 1,
      };

      // Local point (300, 100) is inside [-500, 500] x [-250, 250]
      const cos = Math.cos(Math.PI / 4);
      const sin = Math.sin(Math.PI / 4);
      const insideWorld = {
        x: 300 * cos - 100 * sin,
        y: 300 * sin + 100 * cos,
      };
      expect(isPointInFurnitureBox(insideWorld, instance)).toBe(true);

      // Local point (700, 0) is outside (700 > 500)
      const outsideWorld = {
        x: 700 * cos,
        y: 700 * sin,
      };
      expect(isPointInFurnitureBox(outsideWorld, instance)).toBe(false);
    });
  });

  describe('3. Rotation and Scale Handles Hit-Testing', () => {
    it('detects hit on rotation handle offset 300mm above top edge at 0 and 90 degrees', () => {
      const instance: FurnitureInstance = {
        id: 'f1',
        defId: 'bed_queen',
        x: 1000,
        y: 1000,
        width: 1600,
        height: 2000,
        rotation: 0,
        zIndex: 1,
      };

      // Half height = 1000mm. Top edge = y - 1000 = 0.
      // Stalk offset = 300mm -> handle center is at (1000, -300)
      expect(isPointInRotationHandle({ x: 1000, y: -300 }, instance, STALK_LENGTH_MM, 25)).toBe(true);
      expect(isPointInRotationHandle({ x: 1010, y: -310 }, instance, STALK_LENGTH_MM, 25)).toBe(true);

      // Away from handle
      expect(isPointInRotationHandle({ x: 1000, y: 0 }, instance, STALK_LENGTH_MM, 25)).toBe(false);
      expect(isPointInRotationHandle({ x: 1000, y: 1000 }, instance, STALK_LENGTH_MM, 25)).toBe(false);

      // When rotated 90 degrees (PI / 2):
      const rotatedInst: FurnitureInstance = {
        ...instance,
        rotation: Math.PI / 2,
      };

      // In local space, handle is at (0, -height/2 - 300) = (0, -1300).
      // When rotated by 90°: world = (1000 - (-1300)*sin(90°), 1000 + (-1300)*cos(90°))
      // = (1000 + 1300, 1000) = (2300, 1000)
      expect(isPointInRotationHandle({ x: 2300, y: 1000 }, rotatedInst, STALK_LENGTH_MM, 25)).toBe(true);
      expect(isPointInRotationHandle({ x: 1000, y: -300 }, rotatedInst, STALK_LENGTH_MM, 25)).toBe(false);
    });

    it('detects corner scale handles for resizing', () => {
      const instance: FurnitureInstance = {
        id: 'f1',
        defId: 'toilet',
        x: 500,
        y: 500,
        width: 450,
        height: 700,
        rotation: 0,
        zIndex: 1,
      };

      // Top-Left corner: (500 - 225, 500 - 350) = (275, 150)
      expect(getCornerHandleHit({ x: 275, y: 150 }, instance, 20)).toBe(0);

      // Top-Right corner: (500 + 225, 500 - 350) = (725, 150)
      expect(getCornerHandleHit({ x: 725, y: 150 }, instance, 20)).toBe(1);

      // Bottom-Right corner: (500 + 225, 500 + 350) = (725, 850)
      expect(getCornerHandleHit({ x: 725, y: 850 }, instance, 20)).toBe(2);

      // Bottom-Left corner: (500 - 225, 500 + 350) = (275, 850)
      expect(getCornerHandleHit({ x: 275, y: 850 }, instance, 20)).toBe(3);

      // Center (not a corner)
      expect(getCornerHandleHit({ x: 500, y: 500 }, instance, 20)).toBe(-1);
    });
  });

  describe('4. PlanStore Furniture Actions & Proper Bounds Updating', () => {
    it('adds furniture with default catalog dimensions and updates transform', () => {
      const store = createPlanStore();

      // Add a queen bed at (2000, 3000)
      const bed = store.getState().addFurniture('bed_queen', { x: 2000, y: 3000 });

      expect(bed.id).toBeDefined();
      expect(bed.defId).toBe('bed_queen');
      expect(bed.x).toBe(2000);
      expect(bed.y).toBe(3000);
      expect(bed.width).toBe(1600);
      expect(bed.height).toBe(2000);
      expect(bed.rotation).toBe(0);

      expect(store.getState().furniture[bed.id]).toBeDefined();
      expect(store.getState().selectedFurnitureId).toBe(bed.id);

      // Update position and rotation
      store.getState().updateFurnitureTransform(bed.id, {
        x: 2500,
        y: 3500,
        rotation: Math.PI / 4,
        width: 1800,
        height: 2200,
      });

      const updated = store.getState().furniture[bed.id];
      expect(updated.x).toBe(2500);
      expect(updated.y).toBe(3500);
      expect(updated.width).toBe(1800);
      expect(updated.height).toBe(2200);
      expect(updated.rotation).toBeCloseTo(Math.PI / 4, 4);

      // Hit-test respects updated bounds and position
      expect(isPointInFurnitureBox({ x: 2500, y: 3500 }, updated)).toBe(true);
      // Point well outside the updated bounds is empty
      expect(isPointInFurnitureBox({ x: 5000, y: 5000 }, updated)).toBe(false);
    });

    it('supports selection and deletion of furniture', () => {
      const store = createPlanStore();
      const sofa = store.getState().addFurniture('sofa_3seater', { x: 1000, y: 1000 });

      expect(store.getState().selectedFurnitureId).toBe(sofa.id);

      // Deselect
      store.getState().selectFurniture(null);
      expect(store.getState().selectedFurnitureId).toBeNull();

      // Re-select
      store.getState().selectFurniture(sofa.id);
      expect(store.getState().selectedFurnitureId).toBe(sofa.id);

      // Delete furniture
      store.getState().deleteFurniture(sofa.id);
      expect(store.getState().furniture[sofa.id]).toBeUndefined();
      expect(store.getState().selectedFurnitureId).toBeNull();
    });

    it('cascades deletion through deleteElements', () => {
      const store = createPlanStore();
      const sink = store.getState().addFurniture('kitchen_sink_double', { x: 500, y: 500 });

      expect(store.getState().furniture[sink.id]).toBeDefined();

      store.getState().deleteElements([sink.id]);
      expect(store.getState().furniture[sink.id]).toBeUndefined();
    });
  });
});
