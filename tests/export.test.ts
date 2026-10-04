import { describe, it, expect } from 'vitest';
import type { FloorPlanState, Vertex, Wall, Opening, RoomFace, FurnitureInstance } from '../src/core/types.js';
import { serializeProject, deserializeProject } from '../src/core/io/schema.js';
import { exportToSvg, calculateProjectBounds } from '../src/core/export/svgExporter.js';
import { exportToDxf } from '../src/core/export/dxfExporter.js';
import { renderToOffscreenCanvas } from '../src/core/export/pngExporter.js';

describe('Project Serialization & File Format (src/core/io/schema.ts)', () => {
  function createSample4WallRoom(): FloorPlanState {
    const vertices: Record<string, Vertex> = {
      v1: { id: 'v1', x: 0, y: 0 },
      v2: { id: 'v2', x: 4000, y: 0 },
      v3: { id: 'v3', x: 4000, y: 3000 },
      v4: { id: 'v4', x: 0, y: 3000 },
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
      op2: {
        id: 'op2',
        wallId: 'w3',
        type: 'window',
        offsetRatio: 0.5,
        width: 1200,
        flipH: false,
        flipV: false,
      },
    };

    const rooms: Record<string, RoomFace> = {
      r1: {
        id: 'r1',
        name: 'Living Room',
        color: 'rgba(240, 248, 255, 0.8)',
        vertexIds: ['v1', 'v2', 'v3', 'v4'],
        wallIds: ['w1', 'w2', 'w3', 'w4'],
        areaMm2: 12000000,
        centroid: { x: 2000, y: 1500 },
      },
    };

    const furniture: Record<string, FurnitureInstance> = {
      f1: {
        id: 'f1',
        defId: 'sofa_3seater',
        x: 2000,
        y: 1500,
        width: 2200,
        height: 900,
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
    };
  }

  it('performs a lossless round-trip on a 4-wall room with openings and furniture', () => {
    const originalState = createSample4WallRoom();
    const metadata = {
      title: 'Master Suite Project',
      unitSystem: 'metric_mm' as const,
    };

    const json = serializeProject(originalState, metadata);
    expect(json).toBeTypeOf('string');

    const deserialized = deserializeProject(json);

    // Verify format and metadata
    expect(deserialized.formatVersion).toBe('1.0.0');
    expect(deserialized.metadata.title).toBe('Master Suite Project');
    expect(deserialized.metadata.unitSystem).toBe('metric_mm');

    // Verify lossless state hydration
    expect(deserialized.vertices).toEqual(originalState.vertices);
    expect(deserialized.walls).toEqual(originalState.walls);
    expect(deserialized.openings).toEqual(originalState.openings);
    expect(deserialized.rooms).toEqual(originalState.rooms);
    expect(deserialized.furniture).toEqual(originalState.furniture);
  });

  it('throws descriptive error on malformed JSON string', () => {
    expect(() => deserializeProject('{ invalid json ')).toThrow(/Invalid JSON/);
  });

  it('throws descriptive error on missing formatVersion', () => {
    const invalidJson = JSON.stringify({ state: { vertices: {}, walls: {} } });
    expect(() => deserializeProject(invalidJson)).toThrow(/Missing "formatVersion"/);
  });

  it('throws descriptive error on orphaned wall vertices', () => {
    const corrupted = {
      formatVersion: '1.0.0',
      appVersion: '1.0.0',
      state: {
        vertices: {
          v1: { id: 'v1', x: 0, y: 0 },
        },
        walls: {
          w1: { id: 'w1', startId: 'v1', endId: 'v_ghost', thickness: 200 },
        },
        openings: {},
        rooms: {},
        furniture: {},
      },
    };

    expect(() => deserializeProject(JSON.stringify(corrupted))).toThrow(
      /references missing end vertex "v_ghost"/
    );
  });

  it('throws descriptive error when opening references missing wall', () => {
    const corrupted = {
      formatVersion: '1.0.0',
      appVersion: '1.0.0',
      state: {
        vertices: {
          v1: { id: 'v1', x: 0, y: 0 },
          v2: { id: 'v2', x: 1000, y: 0 },
        },
        walls: {
          w1: { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 },
        },
        openings: {
          op1: { id: 'op1', wallId: 'w_unknown', type: 'single_door', offsetRatio: 0.5, width: 900 },
        },
        rooms: {},
        furniture: {},
      },
    };

    expect(() => deserializeProject(JSON.stringify(corrupted))).toThrow(
      /references missing wall "w_unknown"/
    );
  });
});

describe('Vector SVG Exporter (src/core/export/svgExporter.ts)', () => {
  it('calculates project bounding box with padding', () => {
    const state: FloorPlanState = {
      vertices: {
        v1: { id: 'v1', x: 100, y: 100 },
        v2: { id: 'v2', x: 500, y: 300 },
      },
      walls: {},
      openings: {},
      rooms: {},
      furniture: {},
      selectedFurnitureId: null,
    };

    const bbox = calculateProjectBounds(state, 50);
    expect(bbox.minX).toBe(50);
    expect(bbox.minY).toBe(50);
    expect(bbox.maxX).toBe(550);
    expect(bbox.maxY).toBe(350);
    expect(bbox.width).toBe(500);
    expect(bbox.height).toBe(300);
  });

  it('outputs valid XML containing <svg>, <polygon>, and <text> tags with millimeter coordinates', () => {
    const vertices: Record<string, Vertex> = {
      v1: { id: 'v1', x: 0, y: 0 },
      v2: { id: 'v2', x: 4000, y: 0 },
      v3: { id: 'v3', x: 4000, y: 3000 },
      v4: { id: 'v4', x: 0, y: 3000 },
    };

    const walls: Record<string, Wall> = {
      w1: { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 },
      w2: { id: 'w2', startId: 'v2', endId: 'v3', thickness: 200 },
      w3: { id: 'w3', startId: 'v3', endId: 'v4', thickness: 200 },
      w4: { id: 'w4', startId: 'v4', endId: 'v1', thickness: 200 },
    };

    const rooms: Record<string, RoomFace> = {
      r1: {
        id: 'r1',
        name: 'Conference Room',
        vertexIds: ['v1', 'v2', 'v3', 'v4'],
        wallIds: ['w1', 'w2', 'w3', 'w4'],
        areaMm2: 12000000,
        centroid: { x: 2000, y: 1500 },
      },
    };

    const state: FloorPlanState = {
      vertices,
      walls,
      openings: {},
      rooms,
      furniture: {},
      selectedFurnitureId: null,
    };

    const svg = exportToSvg(state);

    // Verify standard drafting elements
    expect(svg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('<g id="rooms">');
    expect(svg).toContain('<g id="walls">');
    expect(svg).toContain('<g id="dimensions">');

    // Verify tag presence
    expect(svg).toContain('<polygon');
    expect(svg).toContain('<text');
    expect(svg).toContain('Conference Room');
    expect(svg).toContain('12.00 m²');
    expect(svg).toContain('4,000 mm');

    // Verify viewBox millimeter units
    expect(svg).toMatch(/viewBox="-?\d+\s+-?\d+\s+\d+\s+\d+"/);
    expect(svg).toContain('width="');
    expect(svg).toContain('height="');
  });

  it('renders door leaves and swing arcs in <g id="openings">', () => {
    const vertices: Record<string, Vertex> = {
      v1: { id: 'v1', x: 0, y: 0 },
      v2: { id: 'v2', x: 3000, y: 0 },
    };
    const walls: Record<string, Wall> = {
      w1: { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 },
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

    const state: FloorPlanState = {
      vertices,
      walls,
      openings,
      rooms: {},
      furniture: {},
      selectedFurnitureId: null,
    };

    const svg = exportToSvg(state);
    expect(svg).toContain('<g id="openings">');
    expect(svg).toContain('class="door-leaf"');
    expect(svg).toContain('class="door-arc"');
    expect(svg).toContain('class="opening-jamb"');
  });
});

describe('AutoCAD DXF Exporter (src/core/export/dxfExporter.ts)', () => {
  it('outputs required DXF markers and AutoCAD 2000 headers', () => {
    const vertices: Record<string, Vertex> = {
      v1: { id: 'v1', x: 0, y: 0 },
      v2: { id: 'v2', x: 3000, y: 0 },
      v3: { id: 'v3', x: 3000, y: 2000 },
    };
    const walls: Record<string, Wall> = {
      w1: { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 },
      w2: { id: 'w2', startId: 'v2', endId: 'v3', thickness: 200 },
    };

    const state: FloorPlanState = {
      vertices,
      walls,
      openings: {},
      rooms: {},
      furniture: {},
      selectedFurnitureId: null,
    };

    const dxf = exportToDxf(state);

    // Prompt verification requirements: essential DXF markers
    expect(dxf).toContain('0\nSECTION');
    expect(dxf).toContain('2\nENTITIES');
    expect(dxf).toContain('0\nEOF');

    // AutoCAD 2000 AC1015 format check
    expect(dxf).toContain('9\n$ACADVER');
    expect(dxf).toContain('1\nAC1015');

    // Standard CAD Layers Table check
    expect(dxf).toContain('2\nWALLS');
    expect(dxf).toContain('2\nDOORS');
    expect(dxf).toContain('2\nWINDOWS');
    expect(dxf).toContain('2\nROOMS');
    expect(dxf).toContain('2\nDIMENSIONS');
    expect(dxf).toContain('2\nFURNITURE');

    // Walls written as LWPOLYLINE
    expect(dxf).toContain('0\nLWPOLYLINE');
    expect(dxf).toContain('8\nWALLS');
  });

  it('outputs door swing ARC and LINE entities in DOORS layer', () => {
    const vertices: Record<string, Vertex> = {
      v1: { id: 'v1', x: 0, y: 0 },
      v2: { id: 'v2', x: 3000, y: 0 },
    };
    const walls: Record<string, Wall> = {
      w1: { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 },
    };
    const openings: Record<string, Opening> = {
      door1: {
        id: 'door1',
        wallId: 'w1',
        type: 'single_door',
        offsetRatio: 0.5,
        width: 900,
        flipH: false,
        flipV: false,
      },
    };

    const state: FloorPlanState = {
      vertices,
      walls,
      openings,
      rooms: {},
      furniture: {},
      selectedFurnitureId: null,
    };

    const dxf = exportToDxf(state);

    expect(dxf).toContain('0\nARC');
    expect(dxf).toContain('8\nDOORS');
    expect(dxf).toContain('40\n900'); // Radius 900mm
  });
});

describe('High-Resolution PNG Exporter (src/core/export/pngExporter.ts)', () => {
  it('renders to offscreen canvas without throwing error', () => {
    const vertices: Record<string, Vertex> = {
      v1: { id: 'v1', x: 0, y: 0 },
      v2: { id: 'v2', x: 2000, y: 0 },
    };
    const walls: Record<string, Wall> = {
      w1: { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 },
    };

    const state: FloorPlanState = {
      vertices,
      walls,
      openings: {},
      rooms: {},
      furniture: {},
      selectedFurnitureId: null,
    };

    // If OffscreenCanvas or document is available in environment
    if (typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined') {
      const canvas = renderToOffscreenCanvas(state, { scale: 1.0 });
      expect(canvas).toBeDefined();
      expect(canvas.width).toBeGreaterThan(0);
      expect(canvas.height).toBeGreaterThan(0);
    }
  });
});
