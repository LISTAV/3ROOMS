import { describe, it, expect, beforeEach } from 'vitest';
import { createPlanStore, PlanStore } from '../src/core/store/planStore.js';
import type { StoreApi } from 'zustand/vanilla';

describe('Planar Graph Store (Topology & State Integrity)', () => {
  let store: StoreApi<PlanStore>;

  beforeEach(() => {
    store = createPlanStore();
  });

  describe('1. Vertex Creation and Automatic Merging', () => {
    it('creates a new vertex when no vertex is within tolerance', () => {
      const v1 = store.getState().getOrCreateVertex(1000, 2000);
      expect(v1.id).toBeDefined();
      expect(v1.x).toBe(1000);
      expect(v1.y).toBe(2000);

      const state = store.getState();
      expect(Object.keys(state.vertices).length).toBe(1);
    });

    it('automatically reuses existing vertex when within toleranceMm (default 5mm)', () => {
      const v1 = store.getState().getOrCreateVertex(1000, 2000);
      // Point within 3mm of v1
      const v2 = store.getState().getOrCreateVertex(1002, 2001);

      expect(v2.id).toBe(v1.id);
      expect(Object.keys(store.getState().vertices).length).toBe(1);

      // Point outside tolerance (10mm away)
      const v3 = store.getState().getOrCreateVertex(1010, 2000);
      expect(v3.id).not.toBe(v1.id);
      expect(Object.keys(store.getState().vertices).length).toBe(2);
    });
  });

  describe('2. Wall Creation and Connectivity', () => {
    it('creates a wall between two points and automatically shares vertices', () => {
      const wall1 = store.getState().addWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 200);
      expect(wall1).not.toBeNull();
      expect(wall1!.thickness).toBe(200);

      // Add a connected perpendicular wall starting at (4000, 0)
      const wall2 = store.getState().addWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, 150);
      expect(wall2).not.toBeNull();

      const state = store.getState();
      // Total 3 unique vertices, sharing the corner vertex at (4000, 0)
      expect(Object.keys(state.vertices).length).toBe(3);
      expect(wall1!.endId).toBe(wall2!.startId);
    });

    it('rejects zero-length walls', () => {
      const wall = store.getState().addWall({ x: 500, y: 500 }, { x: 500, y: 500 });
      expect(wall).toBeNull();
      expect(Object.keys(store.getState().walls).length).toBe(0);
    });

    it('rejects walls whose endpoints merge to the same vertex', () => {
      // 2mm apart (within default 5mm tolerance)
      const wall = store.getState().addWall({ x: 500, y: 500 }, { x: 502, y: 501 });
      expect(wall).toBeNull();
      expect(Object.keys(store.getState().walls).length).toBe(0);
    });

    it('prevents duplicate walls between the same pair of vertices', () => {
      const w1 = store.getState().addWall({ x: 0, y: 0 }, { x: 3000, y: 0 });
      const w2 = store.getState().addWall({ x: 0, y: 0 }, { x: 3000, y: 0 });
      const w3 = store.getState().addWall({ x: 3000, y: 0 }, { x: 0, y: 0 }); // Reverse direction

      expect(w1).not.toBeNull();
      expect(w2!.id).toBe(w1!.id);
      expect(w3!.id).toBe(w1!.id);
      expect(Object.keys(store.getState().walls).length).toBe(1);
    });
  });

  describe('3. Cascading Vertex Moves', () => {
    it('cascades vertex move so all connected walls automatically pivot', () => {
      // Create an L-junction: Wall 1 (0,0) -> (4000,0) and Wall 2 (4000,0) -> (4000,3000)
      const w1 = store.getState().addWall({ x: 0, y: 0 }, { x: 4000, y: 0 })!;
      const w2 = store.getState().addWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 })!;

      const sharedCornerId = w1.endId;
      expect(w2.startId).toBe(sharedCornerId);

      // Move the corner vertex from (4000, 0) to (4500, 500)
      store.getState().moveVertex(sharedCornerId, { x: 4500, y: 500 });

      const state = store.getState();
      const updatedCorner = state.vertices[sharedCornerId];
      expect(updatedCorner.x).toBe(4500);
      expect(updatedCorner.y).toBe(500);

      // Wall endpoints stay connected because they reference sharedCornerId
      expect(state.walls[w1.id].endId).toBe(sharedCornerId);
      expect(state.walls[w2.id].startId).toBe(sharedCornerId);
    });
  });

  describe('4. Wall Splitting', () => {
    it('splits a wall into two connected segments sharing a new vertex', () => {
      const wall = store.getState().addWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 180)!;
      const originalStartId = wall.startId;
      const originalEndId = wall.endId;

      const splitResult = store.getState().splitWallAtPoint(wall.id, { x: 1500, y: 0 });
      expect(splitResult).not.toBeNull();

      const { newVertexId, wall1Id, wall2Id } = splitResult!;
      const state = store.getState();

      // Original wall is removed
      expect(state.walls[wall.id]).toBeUndefined();

      // Two new walls exist
      const wall1 = state.walls[wall1Id];
      const wall2 = state.walls[wall2Id];
      expect(wall1).toBeDefined();
      expect(wall2).toBeDefined();

      // Verify topology
      expect(wall1.startId).toBe(originalStartId);
      expect(wall1.endId).toBe(newVertexId);
      expect(wall1.thickness).toBe(180);

      expect(wall2.startId).toBe(newVertexId);
      expect(wall2.endId).toBe(originalEndId);
      expect(wall2.thickness).toBe(180);

      // Split vertex has correct coordinates
      const splitVertex = state.vertices[newVertexId];
      expect(splitVertex.x).toBe(1500);
      expect(splitVertex.y).toBe(0);
    });

    it('rejects splitting at endpoints', () => {
      const wall = store.getState().addWall({ x: 0, y: 0 }, { x: 4000, y: 0 })!;
      const res1 = store.getState().splitWallAtPoint(wall.id, { x: 0, y: 0 });
      const res2 = store.getState().splitWallAtPoint(wall.id, { x: 4000, y: 0 });

      expect(res1).toBeNull();
      expect(res2).toBeNull();
      expect(store.getState().walls[wall.id]).toBeDefined();
    });
  });

  describe('5. Element Deletion and Orphan Cleanup', () => {
    it('deleting a wall cleans up orphaned vertices that have 0 remaining walls', () => {
      const wall = store.getState().addWall({ x: 0, y: 0 }, { x: 2000, y: 0 })!;
      expect(Object.keys(store.getState().vertices).length).toBe(2);

      store.getState().deleteElements([wall.id]);

      const state = store.getState();
      expect(Object.keys(state.walls).length).toBe(0);
      // Both vertices had only 1 wall and are now orphaned -> cleaned up
      expect(Object.keys(state.vertices).length).toBe(0);
    });

    it('deleting a wall preserves shared vertices that still connect other walls', () => {
      // Create L-shape: w1 (0,0)->(2000,0) and w2 (2000,0)->(2000,2000)
      const w1 = store.getState().addWall({ x: 0, y: 0 }, { x: 2000, y: 0 })!;
      const w2 = store.getState().addWall({ x: 2000, y: 0 }, { x: 2000, y: 2000 })!;
      const sharedId = w1.endId;

      // Delete only w1
      store.getState().deleteElements([w1.id]);

      const state = store.getState();
      expect(state.walls[w1.id]).toBeUndefined();
      expect(state.walls[w2.id]).toBeDefined();

      // Vertex (0,0) was orphaned -> removed
      expect(state.vertices[w1.startId]).toBeUndefined();
      // Shared vertex (2000,0) still connects w2 -> preserved!
      expect(state.vertices[sharedId]).toBeDefined();
      // Vertex (2000,2000) connects w2 -> preserved
      expect(state.vertices[w2.endId]).toBeDefined();
    });
  });
});
