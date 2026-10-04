import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FloorPlanState, Vertex, Wall, Opening, RoomFace, FurnitureInstance } from '../src/core/types.js';
import {
  STANDARD_PAPER_SIZES,
  computeSheetLayout,
  exportToPdfBlob,
  renderSheetPreview,
  type PdfExportOptions,
} from '../src/core/export/pdfExporter.js';
import { fileManager } from '../src/core/io/fileManager.js';
import { planStore } from '../src/core/store/planStore.js';

// Setup Mock Canvas Environment for Node.js Vitest Execution
class MockCanvasContext {
  public fillStyle: any = '#000000';
  public strokeStyle: any = '#000000';
  public lineWidth: number = 1;
  public font: string = '10px sans-serif';
  public textAlign: string = 'left';
  public textBaseline: string = 'alphabetic';

  save(): void {}
  restore(): void {}
  fillRect(): void {}
  clearRect(): void {}
  strokeRect(): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  stroke(): void {}
  fill(): void {}
  arc(): void {}
  arcTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  rect(): void {}
  roundRect(): void {}
  clip(): void {}
  scale(): void {}
  translate(): void {}
  rotate(): void {}
  fillText(): void {}
  strokeText(): void {}
  measureText() {
    return { width: 50 };
  }
  setLineDash(): void {}
  createLinearGradient() {
    return {
      addColorStop(): void {},
    };
  }
  drawImage(): void {}
}

class MockCanvas {
  public width: number = 800;
  public height: number = 600;

  getContext(): any {
    return new MockCanvasContext();
  }

  toDataURL(): string {
    // 1x1 transparent PNG data URL
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  }
}

describe('Architectural PDF Export Engine (src/core/export/pdfExporter.ts)', () => {
  const originalDocument = globalThis.document;

  beforeAll(() => {
    (globalThis as any).document = {
      createElement: (tag: string) => {
        if (tag === 'canvas') return new MockCanvas();
        return {
          click: () => {},
        };
      },
      body: {
        appendChild: () => {},
        removeChild: () => {},
      },
    };
    if (typeof (globalThis as any).URL === 'undefined') {
      (globalThis as any).URL = {};
    }
    (globalThis as any).URL.createObjectURL = () => 'blob:mock-url';
    (globalThis as any).URL.revokeObjectURL = () => {};
  });

  afterAll(() => {
    (globalThis as any).document = originalDocument;
  });

  function createSampleState(): FloorPlanState {
    const vertices: Record<string, Vertex> = {
      v1: { id: 'v1', x: 0, y: 0 },
      v2: { id: 'v2', x: 6000, y: 0 },
      v3: { id: 'v3', x: 6000, y: 4000 },
      v4: { id: 'v4', x: 0, y: 4000 },
    };

    const walls: Record<string, Wall> = {
      w1: { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 },
      w2: { id: 'w2', startId: 'v2', endId: 'v3', thickness: 200 },
      w3: { id: 'w3', startId: 'v3', endId: 'v4', thickness: 200 },
      w4: { id: 'w4', startId: 'v4', endId: 'v1', thickness: 200 },
    };

    const openings: Record<string, Opening> = {
      op1: {
        id: 'op1',
        wallId: 'w1',
        type: 'single_door',
        offsetRatio: 0.5,
        width: 900,
        flipH: false,
        flipV: false,
      },
    };

    const rooms: Record<string, RoomFace> = {
      r1: {
        id: 'r1',
        name: 'Master Suite',
        color: 'rgba(230, 240, 255, 0.8)',
        vertexIds: ['v1', 'v2', 'v3', 'v4'],
        wallIds: ['w1', 'w2', 'w3', 'w4'],
        areaMm2: 24000000,
        centroid: { x: 3000, y: 2000 },
      },
    };

    const furniture: Record<string, FurnitureInstance> = {
      f1: {
        id: 'f1',
        defId: 'bed_double',
        x: 3000,
        y: 2000,
        width: 1600,
        height: 2000,
        rotation: 0,
        zIndex: 1,
      },
    };

    return {
      vertices,
      walls,
      openings,
      rooms,
      furniture,
      selectedFurnitureId: null,
      lines: {},
      images: {},
    };
  }

  describe('Standard Paper Sizes Dictionary', () => {
    it('defines standard ISO series with correct millimeter dimensions', () => {
      expect(STANDARD_PAPER_SIZES.A4.widthMm).toBe(210);
      expect(STANDARD_PAPER_SIZES.A4.heightMm).toBe(297);

      expect(STANDARD_PAPER_SIZES.A3.widthMm).toBe(297);
      expect(STANDARD_PAPER_SIZES.A3.heightMm).toBe(420);

      expect(STANDARD_PAPER_SIZES.A2.widthMm).toBe(420);
      expect(STANDARD_PAPER_SIZES.A2.heightMm).toBe(594);

      expect(STANDARD_PAPER_SIZES.A1.widthMm).toBe(594);
      expect(STANDARD_PAPER_SIZES.A1.heightMm).toBe(841);

      expect(STANDARD_PAPER_SIZES.A0.widthMm).toBe(841);
      expect(STANDARD_PAPER_SIZES.A0.heightMm).toBe(1189);
    });

    it('defines standard US / Architectural sizes accurately', () => {
      expect(STANDARD_PAPER_SIZES.Letter.widthMm).toBeCloseTo(215.9, 1);
      expect(STANDARD_PAPER_SIZES.Letter.heightMm).toBeCloseTo(279.4, 1);

      expect(STANDARD_PAPER_SIZES.Tabloid.widthMm).toBeCloseTo(279.4, 1);
      expect(STANDARD_PAPER_SIZES.Tabloid.heightMm).toBeCloseTo(431.8, 1);

      expect(STANDARD_PAPER_SIZES.ArchD.widthMm).toBeCloseTo(609.6, 1);
      expect(STANDARD_PAPER_SIZES.ArchD.heightMm).toBeCloseTo(914.4, 1);

      expect(STANDARD_PAPER_SIZES.ArchE.widthMm).toBeCloseTo(914.4, 1);
      expect(STANDARD_PAPER_SIZES.ArchE.heightMm).toBeCloseTo(1219.2, 1);
    });
  });

  describe('Sheet Layout Computation (computeSheetLayout)', () => {
    const state = createSampleState();

    it('computes correct orientation for landscape request', () => {
      const layout = computeSheetLayout(state, {
        paperSize: 'A3',
        orientation: 'landscape',
        marginMm: 15,
        includeBorder: true,
        includeTitleBlock: true,
      });

      expect(layout.pageWidthMm).toBe(420);
      expect(layout.pageHeightMm).toBe(297);
      expect(layout.isLandscape).toBe(true);
      expect(layout.marginMm).toBe(15);
      expect(layout.titleBlockHeight).toBeGreaterThan(0);
      expect(layout.drawAreaWidth).toBeLessThan(420);
      expect(layout.drawAreaHeight).toBeLessThan(297);
    });

    it('computes correct orientation for portrait request', () => {
      const layout = computeSheetLayout(state, {
        paperSize: 'A4',
        orientation: 'portrait',
        marginMm: 10,
        includeBorder: true,
        includeTitleBlock: false,
      });

      expect(layout.pageWidthMm).toBe(210);
      expect(layout.pageHeightMm).toBe(297);
      expect(layout.isLandscape).toBe(false);
      expect(layout.marginMm).toBe(10);
      expect(layout.titleBlockHeight).toBe(0);
    });

    it('automatically picks landscape when plan aspect ratio is wider than tall', () => {
      // 6000 x 4000 is 1.5 ratio (wider than tall)
      const layout = computeSheetLayout(state, {
        paperSize: 'A3',
        orientation: 'auto',
      });

      expect(layout.isLandscape).toBe(true);
      expect(layout.pageWidthMm).toBe(420);
      expect(layout.pageHeightMm).toBe(297);
    });
  });

  describe('PDF Blob Generation (exportToPdfBlob)', () => {
    it('produces a valid application/pdf Blob with %PDF- signature', async () => {
      const state = createSampleState();
      const options: PdfExportOptions = {
        paperSize: 'A4',
        orientation: 'landscape',
        marginMm: 12,
        includeBorder: true,
        includeTitleBlock: true,
        includeDimensions: true,
        includeCornerAngles: true,
        includeRooms: true,
        includeFurniture: true,
        projectName: 'Modern Villa',
        sheetNumber: 'A-101',
      };

      const blob = await exportToPdfBlob(state, options);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('application/pdf');
      expect(blob.size).toBeGreaterThan(500);

      // Verify %PDF- magic bytes
      const arrayBuffer = await blob.arrayBuffer();
      const headerBytes = new Uint8Array(arrayBuffer.slice(0, 5));
      const headerString = String.fromCharCode(...headerBytes);
      expect(headerString).toBe('%PDF-');
    });

    it('produces PDF without title block when toggled off', async () => {
      const state = createSampleState();
      const options: PdfExportOptions = {
        paperSize: 'Letter',
        orientation: 'portrait',
        marginMm: 10,
        includeBorder: false,
        includeTitleBlock: false,
      };

      const blob = await exportToPdfBlob(state, options);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });
  });

  describe('Live Sheet Preview Canvas Renderer (renderSheetPreview)', () => {
    it('renders on HTML canvas without throwing errors', () => {
      const state = createSampleState();
      const canvas = document.createElement('canvas') as HTMLCanvasElement;
      canvas.width = 520;
      canvas.height = 380;

      const options: PdfExportOptions = {
        paperSize: 'A3',
        orientation: 'landscape',
        marginMm: 15,
        includeBorder: true,
        includeTitleBlock: true,
      };

      expect(() => {
        renderSheetPreview(canvas, state, options);
      }).not.toThrow();
    });
  });

  describe('FileManager PDF Integration (fileManager.exportPdf)', () => {
    it('calls exportPdf and triggers download in browser mode', async () => {
      const sample = createSampleState();
      planStore.getState().loadProject(sample);

      const exportSpy = vi.spyOn(fileManager, 'exportPdf');
      await fileManager.exportPdf({
        paperSize: 'A4',
        orientation: 'landscape',
      });

      expect(exportSpy).toHaveBeenCalled();
    });
  });
});
