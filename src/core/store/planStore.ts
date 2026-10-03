import { createStore } from 'zustand/vanilla';
import type { Point2D, Vertex, Wall, Opening, RoomFace, FurnitureInstance } from '../types.js';
import { distance } from '../math/vector.js';
import { detectRooms } from '../geometry/roomDetector.js';
import { assetManager } from '../assets/AssetManager.js';

let idCounter = 0;
export function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++idCounter).toString(36)}`;
}

export interface PlanStoreState {
  vertices: Record<string, Vertex>;
  walls: Record<string, Wall>;
  openings: Record<string, Opening>;
  rooms: Record<string, RoomFace>;
  furniture: Record<string, FurnitureInstance>;
  selectedFurnitureId: string | null;
  selectedIds: string[];
}

export interface PlanStoreActions {
  getOrCreateVertex: (x: number, y: number, toleranceMm?: number) => Vertex;
  addWall: (startPoint: Point2D, endPoint: Point2D, thickness?: number) => Wall | null;
  updateWallThickness: (wallId: string, thickness: number) => void;
  setWallLength: (wallId: string, newLength: number) => void;
  moveVertex: (vertexId: string, newPosition: Point2D) => void;
  splitWallAtPoint: (
    wallId: string,
    splitPoint: Point2D
  ) => { newVertexId: string; wall1Id: string; wall2Id: string } | null;
  addOpening: (opening: Omit<Opening, 'id'> | Opening) => Opening;
  updateOpening: (id: string, updates: Partial<Omit<Opening, 'id'>>) => void;
  moveOpening: (id: string, newOffsetRatio: number) => void;
  toggleOpeningFlipH: (id: string) => void;
  toggleOpeningFlipV: (id: string) => void;
  addFurniture: (
    defId: string,
    position: Point2D,
    customDimensions?: { width?: number; height?: number }
  ) => FurnitureInstance;
  updateFurnitureTransform: (
    id: string,
    updates: Partial<Pick<FurnitureInstance, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'zIndex'>>
  ) => void;
  deleteFurniture: (id: string) => void;
  selectFurniture: (id: string | null) => void;
  deleteElements: (ids: string[]) => void;
  setSelectedIds: (ids: string[]) => void;
  setRoomName: (roomId: string, name: string) => void;
  setRoomColor: (roomId: string, color: string) => void;
  recomputeRooms: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
  getStateSnapshot: () => PlanStoreState;
}

export type PlanStore = PlanStoreState & PlanStoreActions;

export function createPlanStore(initialState?: Partial<PlanStoreState>) {
  const past: PlanStoreState[] = [];
  const future: PlanStoreState[] = [];

  const recordHistory = (get: () => PlanStore) => {
    const snap = get().getStateSnapshot();
    past.push(snap);
    if (past.length > 50) {
      past.shift();
    }
    future.length = 0; // Clear future on new action
  };

  return createStore<PlanStore>((set, get) => ({
    vertices: initialState?.vertices ?? {},
    walls: initialState?.walls ?? {},
    openings: initialState?.openings ?? {},
    rooms: initialState?.rooms ?? {},
    furniture: initialState?.furniture ?? {},
    selectedFurnitureId: initialState?.selectedFurnitureId ?? null,
    selectedIds: initialState?.selectedIds ?? [],

    getOrCreateVertex: (x: number, y: number, toleranceMm: number = 5): Vertex => {
      const state = get();
      const pt: Point2D = { x, y };

      // Search for an existing vertex within tolerance
      for (const vertex of Object.values(state.vertices)) {
        if (distance(pt, { x: vertex.x, y: vertex.y }) <= toleranceMm) {
          return vertex;
        }
      }

      // Create new vertex if none in range
      const newVertex: Vertex = {
        id: generateId('v'),
        x,
        y,
      };

      set((s) => ({
        vertices: {
          ...s.vertices,
          [newVertex.id]: newVertex,
        },
      }));

      return newVertex;
    },

    addWall: (startPoint: Point2D, endPoint: Point2D, thickness: number = 150): Wall | null => {
      if (distance(startPoint, endPoint) < 1e-3) {
        return null; // Reject zero-length walls
      }

      const startVertex = get().getOrCreateVertex(startPoint.x, startPoint.y);
      const endVertex = get().getOrCreateVertex(endPoint.x, endPoint.y);

      if (startVertex.id === endVertex.id) {
        return null;
      }

      // Check if a wall already connects these two vertices
      const state = get();
      for (const existingWall of Object.values(state.walls)) {
        const isSame =
          (existingWall.startId === startVertex.id && existingWall.endId === endVertex.id) ||
          (existingWall.startId === endVertex.id && existingWall.endId === startVertex.id);
        if (isSame) {
          return existingWall;
        }
      }

      recordHistory(get);

      const newWall: Wall = {
        id: generateId('w'),
        startId: startVertex.id,
        endId: endVertex.id,
        thickness,
      };

      set((s) => ({
        walls: {
          ...s.walls,
          [newWall.id]: newWall,
        },
      }));

      get().recomputeRooms();

      return newWall;
    },

    updateWallThickness: (wallId: string, thickness: number): void => {
      const state = get();
      if (!state.walls[wallId]) return;
      recordHistory(get);

      set((s) => ({
        walls: {
          ...s.walls,
          [wallId]: {
            ...s.walls[wallId],
            thickness: Math.max(50, thickness),
          },
        },
      }));

      get().recomputeRooms();
    },

    setWallLength: (wallId: string, newLength: number): void => {
      const state = get();
      const wall = state.walls[wallId];
      if (!wall || newLength < 10) return;

      const startV = state.vertices[wall.startId];
      const endV = state.vertices[wall.endId];
      if (!startV || !endV) return;

      const curDist = distance(startV, endV);
      if (curDist < 1e-4) return;

      const dirX = (endV.x - startV.x) / curDist;
      const dirY = (endV.y - startV.y) / curDist;

      const newEndX = Math.round(startV.x + dirX * newLength);
      const newEndY = Math.round(startV.y + dirY * newLength);

      recordHistory(get);
      get().moveVertex(endV.id, { x: newEndX, y: newEndY });
    },

    moveVertex: (vertexId: string, newPosition: Point2D): void => {
      set((s) => {
        const target = s.vertices[vertexId];
        if (!target) return s;

        return {
          vertices: {
            ...s.vertices,
            [vertexId]: {
              ...target,
              x: newPosition.x,
              y: newPosition.y,
            },
          },
        };
      });

      get().recomputeRooms();
    },

    splitWallAtPoint: (wallId: string, splitPoint: Point2D) => {
      const state = get();
      const wall = state.walls[wallId];
      if (!wall) return null;

      const startV = state.vertices[wall.startId];
      const endV = state.vertices[wall.endId];
      if (!startV || !endV) return null;

      // Don't split exactly on the existing endpoints
      if (
        distance(splitPoint, startV) <= 1e-3 ||
        distance(splitPoint, endV) <= 1e-3
      ) {
        return null;
      }

      const splitVertex = get().getOrCreateVertex(splitPoint.x, splitPoint.y);
      if (splitVertex.id === wall.startId || splitVertex.id === wall.endId) {
        return null;
      }

      const wall1: Wall = {
        id: generateId('w'),
        startId: wall.startId,
        endId: splitVertex.id,
        thickness: wall.thickness,
      };

      const wall2: Wall = {
        id: generateId('w'),
        startId: splitVertex.id,
        endId: wall.endId,
        thickness: wall.thickness,
      };

      set((s) => {
        const nextWalls = { ...s.walls };
        delete nextWalls[wallId];
        nextWalls[wall1.id] = wall1;
        nextWalls[wall2.id] = wall2;

        // Reassign openings on original wall to closest sub-wall segment
        const nextOpenings = { ...s.openings };
        for (const [opId, op] of Object.entries(nextOpenings)) {
          if (op.wallId === wallId) {
            if (op.offsetRatio <= 0.5) {
              nextOpenings[opId] = { ...op, wallId: wall1.id, offsetRatio: op.offsetRatio * 2 };
            } else {
              nextOpenings[opId] = {
                ...op,
                wallId: wall2.id,
                offsetRatio: (op.offsetRatio - 0.5) * 2,
              };
            }
          }
        }

        return {
          walls: nextWalls,
          openings: nextOpenings,
          selectedIds: s.selectedIds.filter((id) => id !== wallId),
        };
      });

      get().recomputeRooms();

      return {
        newVertexId: splitVertex.id,
        wall1Id: wall1.id,
        wall2Id: wall2.id,
      };
    },

    addOpening: (openingData: Omit<Opening, 'id'> | Opening): Opening => {
      const id = 'id' in openingData && openingData.id ? openingData.id : generateId('op');
      const newOpening: Opening = {
        id,
        wallId: openingData.wallId,
        offsetRatio: openingData.offsetRatio,
        width: openingData.width,
        type: openingData.type,
        flipH: openingData.flipH ?? false,
        flipV: openingData.flipV ?? false,
      };

      set((s) => ({
        openings: {
          ...s.openings,
          [newOpening.id]: newOpening,
        },
      }));

      return newOpening;
    },

    updateOpening: (id: string, updates: Partial<Omit<Opening, 'id'>>): void => {
      set((s) => {
        const target = s.openings[id];
        if (!target) return s;
        return {
          openings: {
            ...s.openings,
            [id]: {
              ...target,
              ...updates,
            },
          },
        };
      });
    },

    moveOpening: (id: string, newOffsetRatio: number): void => {
      set((s) => {
        const target = s.openings[id];
        if (!target) return s;
        return {
          openings: {
            ...s.openings,
            [id]: {
              ...target,
              offsetRatio: Math.max(0, Math.min(1, newOffsetRatio)),
            },
          },
        };
      });
    },

    toggleOpeningFlipH: (id: string): void => {
      set((s) => {
        const target = s.openings[id];
        if (!target) return s;
        return {
          openings: {
            ...s.openings,
            [id]: {
              ...target,
              flipH: !target.flipH,
            },
          },
        };
      });
    },

    toggleOpeningFlipV: (id: string): void => {
      set((s) => {
        const target = s.openings[id];
        if (!target) return s;
        return {
          openings: {
            ...s.openings,
            [id]: {
              ...target,
              flipV: !target.flipV,
            },
          },
        };
      });
    },

    addFurniture: (
      defId: string,
      position: Point2D,
      customDimensions?: { width?: number; height?: number }
    ): FurnitureInstance => {
      const def = assetManager.getDefinition(defId);
      const width = customDimensions?.width ?? def?.defaultWidthMm ?? 1000;
      const height = customDimensions?.height ?? def?.defaultHeightMm ?? 1000;

      const state = get();
      const zIndex = Object.keys(state.furniture).length + 1;

      const newInstance: FurnitureInstance = {
        id: generateId('furn'),
        defId,
        x: position.x,
        y: position.y,
        width,
        height,
        rotation: 0,
        zIndex,
      };

      set((s) => ({
        furniture: {
          ...s.furniture,
          [newInstance.id]: newInstance,
        },
        selectedFurnitureId: newInstance.id,
        selectedIds: [newInstance.id],
      }));

      return newInstance;
    },

    updateFurnitureTransform: (
      id: string,
      updates: Partial<Pick<FurnitureInstance, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'zIndex'>>
    ): void => {
      set((s) => {
        const target = s.furniture[id];
        if (!target) return s;
        return {
          furniture: {
            ...s.furniture,
            [id]: {
              ...target,
              ...updates,
            },
          },
        };
      });
    },

    deleteFurniture: (id: string): void => {
      recordHistory(get);
      set((s) => {
        const next = { ...s.furniture };
        delete next[id];
        return {
          furniture: next,
          selectedFurnitureId: s.selectedFurnitureId === id ? null : s.selectedFurnitureId,
          selectedIds: s.selectedIds.filter((sel) => sel !== id),
        };
      });
    },

    selectFurniture: (id: string | null): void => {
      set((s) => ({
        selectedFurnitureId: id,
        selectedIds: id ? [id] : s.selectedIds.filter((sel) => !s.furniture[sel]),
      }));
    },

    deleteElements: (ids: string[]): void => {
      recordHistory(get);
      const idSet = new Set(ids);

      set((s) => {
        const nextWalls = { ...s.walls };
        const nextOpenings = { ...s.openings };

        // 1. If any vertex is deleted, also delete all connected walls
        for (const [wId, wall] of Object.entries(nextWalls)) {
          if (idSet.has(wId) || idSet.has(wall.startId) || idSet.has(wall.endId)) {
            delete nextWalls[wId];
          }
        }

        // 2. Remove specified openings and openings on deleted walls
        for (const [opId, op] of Object.entries(nextOpenings)) {
          if (idSet.has(opId) || !nextWalls[op.wallId]) {
            delete nextOpenings[opId];
          }
        }

        // 3. Count remaining connected walls for each vertex
        const vertexWallCount = new Map<string, number>();
        for (const vId of Object.keys(s.vertices)) {
          vertexWallCount.set(vId, 0);
        }
        for (const wall of Object.values(nextWalls)) {
          vertexWallCount.set(wall.startId, (vertexWallCount.get(wall.startId) ?? 0) + 1);
          vertexWallCount.set(wall.endId, (vertexWallCount.get(wall.endId) ?? 0) + 1);
        }

        // 4. Remove orphaned vertices (0 connected walls)
        const nextVertices = { ...s.vertices };
        for (const [vId, count] of vertexWallCount.entries()) {
          if (count === 0 || idSet.has(vId)) {
            delete nextVertices[vId];
          }
        }

        // 5. Remove specified furniture
        const nextFurniture = { ...s.furniture };
        for (const fId of Object.keys(nextFurniture)) {
          if (idSet.has(fId)) {
            delete nextFurniture[fId];
          }
        }

        const nextSelectedFurnitureId = idSet.has(s.selectedFurnitureId ?? '')
          ? null
          : s.selectedFurnitureId;

        return {
          vertices: nextVertices,
          walls: nextWalls,
          openings: nextOpenings,
          furniture: nextFurniture,
          selectedFurnitureId: nextSelectedFurnitureId,
          selectedIds: s.selectedIds.filter((id) => !idSet.has(id)),
        };
      });

      get().recomputeRooms();
    },

    recomputeRooms: (): void => {
      const state = get();
      const detected = detectRooms(state.vertices, state.walls);
      const nextRooms: Record<string, RoomFace> = {};

      // Canonical mapping of existing rooms to preserve custom user names
      const existingRoomsByVertexKey = new Map<string, RoomFace>();
      for (const room of Object.values(state.rooms)) {
        const key = [...room.vertexIds].sort().join('-');
        existingRoomsByVertexKey.set(key, room);
      }

      for (let i = 0; i < detected.length; i++) {
        const d = detected[i];
        const key = [...d.vertexIds].sort().join('-');
        const existing = existingRoomsByVertexKey.get(key);

        const roomId = existing ? existing.id : d.id;
        const roomName = existing?.name ?? d.name ?? `Room ${i + 1}`;
        const roomColor = existing?.color;

        nextRooms[roomId] = {
          id: roomId,
          name: roomName,
          color: roomColor,
          vertexIds: d.vertexIds,
          wallIds: d.wallIds,
          areaMm2: d.areaMm2,
          points: d.points,
          centroid: d.centroid,
        };
      }

      set({ rooms: nextRooms });
    },

    setRoomName: (roomId: string, name: string): void => {
      set((s) => {
        const target = s.rooms[roomId];
        if (!target) return s;
        return {
          rooms: {
            ...s.rooms,
            [roomId]: {
              ...target,
              name,
            },
          },
        };
      });
    },

    setRoomColor: (roomId: string, color: string): void => {
      recordHistory(get);
      set((s) => {
        const target = s.rooms[roomId];
        if (!target) return s;
        return {
          rooms: {
            ...s.rooms,
            [roomId]: {
              ...target,
              color,
            },
          },
        };
      });
    },

    undo: (): void => {
      if (past.length === 0) return;
      const current = get().getStateSnapshot();
      const previous = past.pop()!;
      future.push(current);

      set({
        vertices: previous.vertices,
        walls: previous.walls,
        openings: previous.openings,
        rooms: previous.rooms,
        furniture: previous.furniture,
        selectedFurnitureId: previous.selectedFurnitureId,
        selectedIds: previous.selectedIds,
      });

      get().recomputeRooms();
    },

    redo: (): void => {
      if (future.length === 0) return;
      const current = get().getStateSnapshot();
      const next = future.pop()!;
      past.push(current);

      set({
        vertices: next.vertices,
        walls: next.walls,
        openings: next.openings,
        rooms: next.rooms,
        furniture: next.furniture,
        selectedFurnitureId: next.selectedFurnitureId,
        selectedIds: next.selectedIds,
      });

      get().recomputeRooms();
    },

    canUndo: (): boolean => past.length > 0,

    canRedo: (): boolean => future.length > 0,

    setSelectedIds: (ids: string[]) => {
      const state = get();
      const furnId = ids.find((id) => state.furniture[id]) ?? null;
      set({ selectedIds: ids, selectedFurnitureId: furnId });
    },

    clear: () => {
      recordHistory(get);
      set({
        vertices: {},
        walls: {},
        openings: {},
        rooms: {},
        furniture: {},
        selectedFurnitureId: null,
        selectedIds: [],
      });
    },

    getStateSnapshot: () => {
      const state = get();
      return {
        vertices: JSON.parse(JSON.stringify(state.vertices)),
        walls: JSON.parse(JSON.stringify(state.walls)),
        openings: JSON.parse(JSON.stringify(state.openings)),
        rooms: JSON.parse(JSON.stringify(state.rooms)),
        furniture: JSON.parse(JSON.stringify(state.furniture)),
        selectedFurnitureId: state.selectedFurnitureId,
        selectedIds: [...state.selectedIds],
      };
    },
  }));
}

// Global default store instance
export const planStore = createPlanStore();
