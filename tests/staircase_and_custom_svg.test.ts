import { describe, it, expect, beforeEach } from 'vitest';
import { AssetManager, DEFAULT_FURNITURE_CATALOG } from '../src/core/assets/AssetManager.js';
import type { FurnitureDefinition } from '../src/core/types.js';

describe('Staircase Assets & Custom SVG Import Engine', () => {
  let assetManager: AssetManager;

  beforeEach(() => {
    assetManager = AssetManager.getInstance();
  });

  describe('1. Built-in Staircase Catalog Definitions', () => {
    it('includes all 4 standard architectural staircase models in DEFAULT_FURNITURE_CATALOG', () => {
      const stairs = DEFAULT_FURNITURE_CATALOG.filter((d) => d.category === 'stairs');
      expect(stairs.length).toBe(4);

      const straight = stairs.find((s) => s.id === 'staircase_straight');
      expect(straight).toBeDefined();
      expect(straight?.name).toBe('Straight Staircase');
      expect(straight?.defaultWidthMm).toBe(1000);
      expect(straight?.defaultHeightMm).toBe(3000);
      expect(straight?.svgContent).toContain('<svg');
      expect(straight?.svgContent).toContain('viewBox="0 0 1000 3000"');
      expect(straight?.svgContent).toContain('UP');

      const lShape = stairs.find((s) => s.id === 'staircase_l_shape');
      expect(lShape).toBeDefined();
      expect(lShape?.name).toBe('L-Shape Staircase');
      expect(lShape?.defaultWidthMm).toBe(2000);
      expect(lShape?.defaultHeightMm).toBe(2000);

      const uShape = stairs.find((s) => s.id === 'staircase_u_shape');
      expect(uShape).toBeDefined();
      expect(uShape?.name).toBe('U-Shape Switchback');
      expect(uShape?.defaultWidthMm).toBe(2000);
      expect(uShape?.defaultHeightMm).toBe(3000);

      const spiral = stairs.find((s) => s.id === 'staircase_spiral');
      expect(spiral).toBeDefined();
      expect(spiral?.name).toBe('Spiral Staircase');
      expect(spiral?.defaultWidthMm).toBe(1600);
      expect(spiral?.defaultHeightMm).toBe(1600);
    });

    it('retrieves staircase definitions via getDefinitionsByCategory', () => {
      const stairs = assetManager.getDefinitionsByCategory('stairs');
      expect(stairs.length).toBeGreaterThanOrEqual(4);
      expect(stairs.some((s) => s.id === 'staircase_straight')).toBe(true);
      expect(stairs.some((s) => s.id === 'staircase_l_shape')).toBe(true);
      expect(stairs.some((s) => s.id === 'staircase_u_shape')).toBe(true);
      expect(stairs.some((s) => s.id === 'staircase_spiral')).toBe(true);
    });
  });

  describe('2. Custom SVG Parsing & Dimension Extraction', () => {
    it('parses valid SVG with viewBox and calculates aspect ratio and suggested dimensions', async () => {
      const mockSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1600" width="800" height="1600">
          <rect x="0" y="0" width="800" height="1600" fill="#fff" />
        </svg>
      `;

      const file = new File([mockSvg], 'custom-ladder-stairs.svg', { type: 'image/svg+xml' });
      const parsed = await assetManager.parseSvgFile(file);

      expect(parsed.svgContent).toContain('<svg');
      expect(parsed.viewBoxWidth).toBe(800);
      expect(parsed.viewBoxHeight).toBe(1600);
      expect(parsed.suggestedName).toBe('Custom ladder stairs');
      // Aspect is 0.5 -> vertical, height suggested ~2400, width ~1200
      expect(parsed.suggestedWidthMm).toBe(1200);
      expect(parsed.suggestedHeightMm).toBe(2400);
    });

    it('handles SVG with explicit width and height attributes when viewBox is missing', async () => {
      const mockSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">
          <circle cx="300" cy="200" r="100" />
        </svg>
      `;

      const file = new File([mockSvg], 'emergency-exit.svg', { type: 'image/svg+xml' });
      const parsed = await assetManager.parseSvgFile(file);

      expect(parsed.viewBoxWidth).toBe(600);
      expect(parsed.viewBoxHeight).toBe(400);
      expect(parsed.suggestedWidthMm).toBe(1200);
      expect(parsed.suggestedHeightMm).toBe(800);
      expect(parsed.suggestedName).toBe('Emergency exit');
    });

    it('rejects invalid non-SVG files with a clear error', async () => {
      const invalidFile = new File(['not an svg file content'], 'sample.txt', { type: 'text/plain' });
      await expect(assetManager.parseSvgFile(invalidFile)).rejects.toThrow(
        'File does not appear to be a valid SVG document.'
      );
    });
  });

  describe('3. Custom Asset Registration, Persistence & Removal', () => {
    it('registers a custom definition with isCustom flag set to true', () => {
      const customDef: FurnitureDefinition = {
        id: 'test_custom_spiral_stair_1',
        name: 'Custom Spiral Stair',
        category: 'stairs',
        defaultWidthMm: 1800,
        defaultHeightMm: 1800,
        svgContent: '<svg viewBox="0 0 1800 1800"><circle cx="900" cy="900" r="900" /></svg>',
      };

      assetManager.registerCustomDefinition(customDef);

      const retrieved = assetManager.getDefinition('test_custom_spiral_stair_1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.isCustom).toBe(true);
      expect(retrieved?.name).toBe('Custom Spiral Stair');
      expect(retrieved?.defaultWidthMm).toBe(1800);

      // Verify it shows up in getAllDefinitions
      const all = assetManager.getAllDefinitions();
      expect(all.some((d) => d.id === 'test_custom_spiral_stair_1')).toBe(true);
    });

    it('removes custom definition cleanly', () => {
      const customDef: FurnitureDefinition = {
        id: 'test_custom_temp_to_delete',
        name: 'Temp Stair to Delete',
        category: 'stairs',
        defaultWidthMm: 1000,
        defaultHeightMm: 2000,
        svgContent: '<svg viewBox="0 0 1000 2000"><rect width="1000" height="2000" /></svg>',
      };

      assetManager.registerCustomDefinition(customDef);
      expect(assetManager.getDefinition('test_custom_temp_to_delete')).toBeDefined();

      assetManager.removeCustomDefinition('test_custom_temp_to_delete');
      expect(assetManager.getDefinition('test_custom_temp_to_delete')).toBeUndefined();
    });
  });
});
