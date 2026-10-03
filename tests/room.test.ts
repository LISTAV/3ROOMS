import { describe, it, expect, beforeEach } from 'vitest';
import type { Vertex, Wall } from '../src/core/types.js';
import { detectRooms } from '../src/core/geometry/roomDetector.js';
import { calculateShoelaceArea } from '../src/core/math/polygon.js';
import { planStore } from '../src/core/store/planStore.js';
import { RoomRenderer } from '../src/engine/renderer/RoomRenderer.js';

describe('Planar Face Traversal & Automatic Room Detection', () => {
  describe('1. Single Rectangular Room (4 walls)', () => {
    it('detects exactly 1 room with exact 12m² area and centroid (2000, 1500)', () => {
      // 4000mm x 3000mm room (4m x 3m = 12m²)
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

      const rooms = detectRooms(vertices, walls);

      // Exactly 1 room detected
      expect(rooms).toHaveLength(1);

      const room = rooms[0];
      // Area equals exactly 12,000,000 mm²
      expect(room.areaMm2).toBeCloseTo(12000000, 1);
      // Centroid is at (2000, 1500)
      expect(room.centroid.x).toBeCloseTo(2000, 1);
      expect(room.centroid.y).toBeCloseTo(1500, 1);

      // Wall IDs should contain all 4 walls
      expect(room.wallIds.sort()).toEqual(['w1', 'w2', 'w3', 'w4'].sort());

      // Points should be counter-clockwise ordered
      expect(room.points).toHaveLength(4);
      const signedArea = calculateShoelaceArea(room.points);
      expect(signedArea).toBeGreaterThan(0);
      expect(signedArea).toBeCloseTo(12000000, 1);
    });

    it('works regardless of wall direction definitions (A->B vs B->A)', () => {
      const vertices: Record<string, Vertex> = {
        v1: { id: 'v1', x: 0, y: 0 },
        v2: { id: 'v2', x: 4000, y: 0 },
        v3: { id: 'v3', x: 4000, y: 3000 },
        v4: { id: 'v4', x: 0, y: 3000 },
      };

      // Reversed start/end on some walls
      const walls: Record<string, Wall> = {
        w1: { id: 'w1', startId: 'v2', endId: 'v1', thickness: 200 },
        w2: { id: 'w2', startId: 'v2', endId: 'v3', thickness: 200 },
        w3: { id: 'w3', startId: 'v4', endId: 'v3', thickness: 200 },
        w4: { id: 'w4', startId: 'v4', endId: 'v1', thickness: 200 },
      };

      const rooms = detectRooms(vertices, walls);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].areaMm2).toBeCloseTo(12000000, 1);
    });
  });

  describe('2. Two Adjacent Rooms Sharing a Wall (7 walls)', () => {
    it('detects 2 distinct rooms (12m² and 9m²) with shared wall in both rooms', () => {
      // Room 1: 4m x 3m (0,0) to (4000,3000) -> 12 m²
      // Room 2: 3m x 3m (4000,0) to (7000,3000) -> 9 m²
      const vertices: Record<string, Vertex> = {
        v1: { id: 'v1', x: 0, y: 0 },
        v2: { id: 'v2', x: 4000, y: 0 },
        v3: { id: 'v3', x: 4000, y: 3000 },
        v4: { id: 'v4', x: 0, y: 3000 },
        v5: { id: 'v5', x: 7000, y: 0 },
        v6: { id: 'v6', x: 7000, y: 3000 },
      };

      const walls: Record<string, Wall> = {
        w1: { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 }, // R1 bottom
        w2: { id: 'w2', startId: 'v2', endId: 'v3', thickness: 200 }, // Shared wall
        w3: { id: 'w3', startId: 'v3', endId: 'v4', thickness: 200 }, // R1 top
        w4: { id: 'w4', startId: 'v4', endId: 'v1', thickness: 200 }, // R1 left
        w5: { id: 'w5', startId: 'v2', endId: 'v5', thickness: 200 }, // R2 bottom
        w6: { id: 'w6', startId: 'v5', endId: 'v6', thickness: 200 }, // R2 right
        w7: { id: 'w7', startId: 'v6', endId: 'v3', thickness: 200 }, // R2 top
      };

      const rooms = detectRooms(vertices, walls);

      // Exactly 2 distinct rooms detected
      expect(rooms).toHaveLength(2);

      const r1 = rooms.find((r) => Math.abs(r.areaMm2 - 12000000) < 100);
      const r2 = rooms.find((r) => Math.abs(r.areaMm2 - 9000000) < 100);

      expect(r1).toBeDefined();
      expect(r2).toBeDefined();

      // Check Room 1
      expect(r1!.areaMm2).toBeCloseTo(12000000, 1);
      expect(r1!.centroid.x).toBeCloseTo(2000, 1);
      expect(r1!.centroid.y).toBeCloseTo(1500, 1);

      // Check Room 2
      expect(r2!.areaMm2).toBeCloseTo(9000000, 1);
      expect(r2!.centroid.x).toBeCloseTo(5500, 1);
      expect(r2!.centroid.y).toBeCloseTo(1500, 1);

      // Both rooms must contain shared wall w2
      expect(r1!.wallIds).toContain('w2');
      expect(r2!.wallIds).toContain('w2');

      // Exterior clockwise envelope is cleanly discarded (no 21m² envelope or negative area)
      const envelope = rooms.find((r) => r.areaMm2 > 20000000);
      expect(envelope).toBeUndefined();
    });
  });

  describe('3. Open / Non-Enclosed Walls', () => {
    it('detects 0 rooms for a 3-wall U-shape', () => {
      const vertices: Record<string, Vertex> = {
        v1: { id: 'v1', x: 0, y: 0 },
        v2: { id: 'v2', x: 4000, y: 0 },
        v3: { id: 'v3', x: 4000, y: 3000 },
        v4: { id: 'v4', x: 0, y: 3000 },
      };

      // 3 walls forming a U (no wall between v4 and v1)
      const walls: Record<string, Wall> = {
        w1: { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 },
        w2: { id: 'w2', startId: 'v2', endId: 'v3', thickness: 200 },
        w3: { id: 'w3', startId: 'v3', endId: 'v4', thickness: 200 },
      };

      const rooms = detectRooms(vertices, walls);
      expect(rooms).toHaveLength(0);
    });

    it('detects 0 rooms for a single wall or disconnected walls', () => {
      const vertices: Record<string, Vertex> = {
        v1: { id: 'v1', x: 0, y: 0 },
        v2: { id: 'v2', x: 1000, y: 0 },
      };

      const walls: Record<string, Wall> = {
        w1: { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 },
      };

      const rooms = detectRooms(vertices, walls);
      expect(rooms).toHaveLength(0);
    });
  });

  describe('4. Dead-End Spur Wall Inside a Room', () => {
    it('detects only the parent enclosed room when a dead-end spur wall exists inside', () => {
      // 5m x 5m room: (0,0) to (5000,5000) -> 25 m²
      // With a spur wall from (0, 2500) to (2000, 2500)
      const vertices: Record<string, Vertex> = {
        v1: { id: 'v1', x: 0, y: 0 },
        v2: { id: 'v2', x: 5000, y: 0 },
        v3: { id: 'v3', x: 5000, y: 5000 },
        v4: { id: 'v4', x: 0, y: 5000 },
        vSpurRoot: { id: 'vSpurRoot', x: 0, y: 2500 },
        vSpurTip: { id: 'vSpurTip', x: 2000, y: 2500 },
      };

      const walls: Record<string, Wall> = {
        w1: { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 },
        w2: { id: 'w2', startId: 'v2', endId: 'v3', thickness: 200 },
        w3: { id: 'w3', startId: 'v3', endId: 'v4', thickness: 200 },
        w4a: { id: 'w4a', startId: 'v4', endId: 'vSpurRoot', thickness: 200 },
        w4b: { id: 'w4b', startId: 'vSpurRoot', endId: 'v1', thickness: 200 },
        wSpur: { id: 'wSpur', startId: 'vSpurRoot', endId: 'vSpurTip', thickness: 200 },
      };

      const rooms = detectRooms(vertices, walls);

      // Exactly 1 room detected
      expect(rooms).toHaveLength(1);
      expect(rooms[0].areaMm2).toBeCloseTo(25000000, 1);
      expect(rooms[0].centroid.x).toBeCloseTo(2500, 1);
      expect(rooms[0].centroid.y).toBeCloseTo(2500, 1);

      // Spur wall must not be included as part of the room perimeter
      expect(rooms[0].wallIds).not.toContain('wSpur');
    });
  });

  describe('5. PlanStore Integration & Room Lifecycle', () => {
    beforeEach(() => {
      // Clear store before each test
      const state = planStore.getState();
      const wallIds = Object.keys(state.walls);
      const vertexIds = Object.keys(state.vertices);
      state.deleteElements([...wallIds, ...vertexIds]);
    });

    it('automatically recomputes rooms when walls are added to form a closed loop', () => {
      const store = planStore.getState();

      // Initially no rooms
      expect(Object.keys(planStore.getState().rooms)).toHaveLength(0);

      // Add 3 walls (U-shape)
      store.addWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 200);
      store.addWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, 200);
      store.addWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }, 200);

      // Still 0 rooms
      expect(Object.keys(planStore.getState().rooms)).toHaveLength(0);

      // Add 4th wall closing the loop
      store.addWall({ x: 0, y: 3000 }, { x: 0, y: 0 }, 200);

      // 1 room detected!
      const roomsAfter = Object.values(planStore.getState().rooms);
      expect(roomsAfter).toHaveLength(1);
      expect(roomsAfter[0].areaMm2).toBeCloseTo(12000000, 1);
    });

    it('preserves user custom room names when recomputing rooms', () => {
      const store = planStore.getState();

      // Form 4m x 3m room
      store.addWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 200);
      store.addWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, 200);
      store.addWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }, 200);
      store.addWall({ x: 0, y: 3000 }, { x: 0, y: 0 }, 200);

      const rooms = Object.values(planStore.getState().rooms);
      expect(rooms).toHaveLength(1);
      const roomId = rooms[0].id;

      // Set custom room name
      store.setRoomName(roomId, 'Primary Bedroom');
      expect(planStore.getState().rooms[roomId].name).toBe('Primary Bedroom');

      // Add an independent spur wall outside the room
      store.addWall({ x: 10000, y: 0 }, { x: 12000, y: 0 }, 200);

      // Recomputed rooms should still preserve 'Primary Bedroom'
      const recomputedRooms = Object.values(planStore.getState().rooms);
      expect(recomputedRooms).toHaveLength(1);
      expect(recomputedRooms[0].name).toBe('Primary Bedroom');
    });

    it('updates room area and centroid when a vertex is moved', () => {
      const store = planStore.getState();

      store.addWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 200);
      store.addWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, 200);
      store.addWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }, 200);
      store.addWall({ x: 0, y: 3000 }, { x: 0, y: 0 }, 200);

      expect(Object.values(planStore.getState().rooms)[0].areaMm2).toBeCloseTo(12000000, 1);

      // Find vertex at (4000, 3000) and move it to (4000, 6000) -> 4m x 6m = 24m²
      const state = planStore.getState();
      const vertexCorner = Object.values(state.vertices).find(
        (v) => Math.abs(v.x - 4000) < 1 && Math.abs(v.y - 3000) < 1
      );
      expect(vertexCorner).toBeDefined();

      // Move (4000, 3000) to (4000, 6000) and also move top-left (0, 3000) to (0, 6000)
      const vertexTopLeft = Object.values(state.vertices).find(
        (v) => Math.abs(v.x - 0) < 1 && Math.abs(v.y - 3000) < 1
      );
      expect(vertexTopLeft).toBeDefined();

      store.moveVertex(vertexCorner!.id, { x: 4000, y: 6000 });
      store.moveVertex(vertexTopLeft!.id, { x: 0, y: 6000 });

      const updatedRooms = Object.values(planStore.getState().rooms);
      expect(updatedRooms).toHaveLength(1);
      expect(updatedRooms[0].areaMm2).toBeCloseTo(24000000, 1);
      expect(updatedRooms[0].centroid!.x).toBeCloseTo(2000, 1);
      expect(updatedRooms[0].centroid!.y).toBeCloseTo(3000, 1);
    });

    it('clears rooms when a bounding wall is deleted', () => {
      const store = planStore.getState();

      store.addWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 200);
      store.addWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, 200);
      store.addWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }, 200);
      store.addWall({ x: 0, y: 3000 }, { x: 0, y: 0 }, 200);

      expect(Object.values(planStore.getState().rooms)).toHaveLength(1);

      // Delete one of the walls
      const wallId = Object.keys(planStore.getState().walls)[0];
      store.deleteElements([wallId]);

      // Loop is broken -> 0 rooms
      expect(Object.values(planStore.getState().rooms)).toHaveLength(0);
    });
  });

  describe('6. RoomRenderer', () => {
    it('renders room floors and badges cleanly without throwing errors', () => {
      const renderer = new RoomRenderer();

      // Mock Canvas 2D context
      const drawCalls: string[] = [];
      const mockCtx = {
        save: () => drawCalls.push('save'),
        restore: () => drawCalls.push('restore'),
        beginPath: () => drawCalls.push('beginPath'),
        closePath: () => drawCalls.push('closePath'),
        moveTo: (x: number, y: number) => drawCalls.push(`moveTo(${x},${y})`),
        lineTo: (x: number, y: number) => drawCalls.push(`lineTo(${x},${y})`),
        quadraticCurveTo: () => drawCalls.push('quadraticCurveTo'),
        fill: () => drawCalls.push('fill'),
        stroke: () => drawCalls.push('stroke'),
        translate: (x: number, y: number) => drawCalls.push(`translate(${x},${y})`),
        setLineDash: () => drawCalls.push('setLineDash'),
        measureText: (text: string) => ({ width: text.length * 8 }),
        fillText: (text: string, x: number, y: number) => drawCalls.push(`fillText(${text},${x},${y})`),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: '',
        textBaseline: '',
      } as unknown as CanvasRenderingContext2D;

      const vertices: Record<string, Vertex> = {
        v1: { id: 'v1', x: 0, y: 0 },
        v2: { id: 'v2', x: 4000, y: 0 },
        v3: { id: 'v3', x: 4000, y: 3000 },
        v4: { id: 'v4', x: 0, y: 3000 },
      };

      const rooms = detectRooms(vertices, {
        w1: { id: 'w1', startId: 'v1', endId: 'v2', thickness: 200 },
        w2: { id: 'w2', startId: 'v2', endId: 'v3', thickness: 200 },
        w3: { id: 'w3', startId: 'v3', endId: 'v4', thickness: 200 },
        w4: { id: 'w4', startId: 'v4', endId: 'v1', thickness: 200 },
      });

      expect(rooms).toHaveLength(1);

      const roomMap = { [rooms[0].id]: rooms[0] };

      // Render unselected
      expect(() => {
        renderer.render(mockCtx, roomMap, vertices, null, 1.0);
      }).not.toThrow();

      // Render selected
      expect(() => {
        renderer.render(mockCtx, roomMap, vertices, rooms[0].id, 1.5);
      }).not.toThrow();

      // Ensure fills and text renders were called
      expect(drawCalls).toContain('fill');
      expect(drawCalls.some((c) => c.startsWith('fillText(Room 1'))).toBe(true);
      expect(drawCalls.some((c) => c.startsWith('fillText(12.00 m²'))).toBe(true);
    });
  });
});
