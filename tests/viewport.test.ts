import { describe, it, expect, beforeEach } from 'vitest';
import { Viewport } from '../src/engine/viewport/Viewport.js';
import type { Point2D } from '../src/core/types.js';

describe('Viewport Math Engine', () => {
  let viewport: Viewport;

  beforeEach(() => {
    viewport = new Viewport();
  });

  describe('1. Coordinate Transformations (Inverses)', () => {
    it('verifies screenToWorld and worldToScreen are exact inverses at default zoom and pan', () => {
      const screenPoints: Point2D[] = [
        { x: 0, y: 0 },
        { x: 500, y: 300 },
        { x: -200, y: 800 },
        { x: 1920, y: 1080 },
      ];

      for (const pt of screenPoints) {
        const world = viewport.screenToWorld(pt);
        const backToScreen = viewport.worldToScreen(world);

        expect(backToScreen.x).toBeCloseTo(pt.x, 9);
        expect(backToScreen.y).toBeCloseTo(pt.y, 9);
      }
    });

    it('verifies screenToWorld and worldToScreen are exact inverses across different zoom levels and pan offsets', () => {
      const testCases = [
        { zoom: 0.05, panX: 250, panY: -150 },
        { zoom: 0.1, panX: 0, panY: 0 },
        { zoom: 0.5, panX: 1000, panY: 500 },
        { zoom: 1.0, panX: -400, panY: 800 },
        { zoom: 2.5, panX: 120, panY: -340 },
        { zoom: 5.0, panX: -1920, panY: -1080 },
      ];

      const testWorldPoints: Point2D[] = [
        { x: 0, y: 0 },
        { x: 4000, y: 3000 },
        { x: -10000, y: 25000 },
        { x: 123.456, y: -789.012 },
      ];

      for (const config of testCases) {
        const vp = new Viewport({
          zoom: config.zoom,
          panX: config.panX,
          panY: config.panY,
        });

        for (const worldPt of testWorldPoints) {
          const screen = vp.worldToScreen(worldPt);
          const backToWorld = vp.screenToWorld(screen);

          expect(backToWorld.x).toBeCloseTo(worldPt.x, 8);
          expect(backToWorld.y).toBeCloseTo(worldPt.y, 8);
        }
      }
    });
  });

  describe('2. zoomAt Mouse Anchor Invariance', () => {
    it('keeps the world coordinate under the mouse cursor completely invariant before and after zoom operation', () => {
      const anchors: Point2D[] = [
        { x: 0, y: 0 },
        { x: 960, y: 540 },    // center of 1080p
        { x: 300, y: 700 },
        { x: 1920, y: 1080 },
      ];

      const zoomFactors = [1.25, 1.5, 2.0, 0.8, 0.5, 0.9];

      for (const anchor of anchors) {
        for (const factor of zoomFactors) {
          // Viewport with arbitrary pan & zoom
          const vp = new Viewport({ zoom: 0.2, panX: 150, panY: -80 });

          // World coordinate under cursor before zoom
          const worldBefore = vp.screenToWorld(anchor);

          // Perform zoom at anchor
          vp.zoomAt(anchor, factor);

          // World coordinate under cursor after zoom
          const worldAfter = vp.screenToWorld(anchor);

          // Screen position of the original world point after zoom
          const screenAfter = vp.worldToScreen(worldBefore);

          expect(worldAfter.x).toBeCloseTo(worldBefore.x, 8);
          expect(worldAfter.y).toBeCloseTo(worldBefore.y, 8);
          expect(screenAfter.x).toBeCloseTo(anchor.x, 8);
          expect(screenAfter.y).toBeCloseTo(anchor.y, 8);
        }
      }
    });

    it('enforces minZoom and maxZoom boundary limits during zoomAt', () => {
      const vp = new Viewport({ zoom: 0.01, minZoom: 0.005, maxZoom: 5.0 });
      const anchor: Point2D = { x: 500, y: 500 };

      // Zoom out excessively
      vp.zoomAt(anchor, 0.001);
      expect(vp.zoom).toBe(0.005);

      // Zoom in excessively
      vp.zoomAt(anchor, 10000);
      expect(vp.zoom).toBe(5.0);
    });
  });

  describe('3. Viewport Bounds Calculation', () => {
    it('correctly reports visible world rectangle for a 1920x1080 canvas at default zoom and origin pan', () => {
      // Default: zoom = 0.1, panX = 0, panY = 0
      const bounds = viewport.getViewportBounds(1920, 1080);

      // (0 - 0) / 0.1 = 0; (1920 - 0) / 0.1 = 19200
      expect(bounds.minX).toBeCloseTo(0);
      expect(bounds.minY).toBeCloseTo(0);
      expect(bounds.maxX).toBeCloseTo(19200);
      expect(bounds.maxY).toBeCloseTo(10800);
    });

    it('correctly calculates bounds with center pan offset on a 1920x1080 canvas', () => {
      // Zoom = 0.2, Pan centered at (960, 540)
      const vp = new Viewport({ zoom: 0.2, panX: 960, panY: 540 });
      const bounds = vp.getViewportBounds(1920, 1080);

      // Top-left: (0 - 960) / 0.2 = -4800, (0 - 540) / 0.2 = -2700
      // Bottom-right: (1920 - 960) / 0.2 = 4800, (1080 - 540) / 0.2 = 2700
      expect(bounds.minX).toBeCloseTo(-4800);
      expect(bounds.minY).toBeCloseTo(-2700);
      expect(bounds.maxX).toBeCloseTo(4800);
      expect(bounds.maxY).toBeCloseTo(2700);
    });
  });

  describe('4. Pan and Transform Components', () => {
    it('correctly increments panX and panY with panBy', () => {
      viewport.panBy(150, -75);
      expect(viewport.panX).toBe(150);
      expect(viewport.panY).toBe(-75);

      viewport.panBy(-50, 100);
      expect(viewport.panX).toBe(100);
      expect(viewport.panY).toBe(25);
    });

    it('provides transform components [a, b, c, d, e, f] for context transforms', () => {
      const vp = new Viewport({ zoom: 0.25, panX: 300, panY: 450 });
      const [a, b, c, d, e, f] = vp.getTransformComponents();

      expect(a).toBe(0.25);
      expect(b).toBe(0);
      expect(c).toBe(0);
      expect(d).toBe(0.25);
      expect(e).toBe(300);
      expect(f).toBe(450);

      const matrix = vp.getTransform();
      expect(matrix.a).toBe(0.25);
      expect(matrix.d).toBe(0.25);
      expect(matrix.e).toBe(300);
      expect(matrix.f).toBe(450);
    });
  });
});
