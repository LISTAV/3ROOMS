import { createStore } from 'zustand/vanilla';
import type { Point2D, Vertex, Wall, Opening, RoomFace, FurnitureInstance, ImageInstance, LineEntity, Layer } from '../types.js';
import { distance } from '../math/vector.js';
import { detectRooms } from '../geometry/roomDetector.js';
import { assetManager } from '../assets/AssetManager.js';

let idCounter = 0;
export function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++idCounter).toString(36)}`;
}

export const DEFAULT_SEED_LAYERS: Record<string, Layer> = {
  'layer-rooms': {
    id: 'layer-rooms',
    name: 'Rooms & Floors',
    visible: true,
    locked: false,
    opacity: 1.0,
    colorTag: '#6366f1',
    order: 0,
  },
  'layer-furniture': {
    id: 'layer-furniture',
    name: 'Furniture & Symbols',
    visible: true,
    locked: false,
    opacity: 1.0,
    colorTag: '#ec4899',
    order: 1,
  },
  'layer-walls': {
    id: 'layer-walls',
    name: 'Walls & Openings',
    visible: true,
    locked: false,
    opacity: 1.0,
    colorTag: '#0ea5e9',
    order: 2,
  },
  'layer-dimensions': {
    id: 'layer-dimensions',
    name: 'Dimensions & Annotations',
    visible: true,
    locked: false,
    opacity: 1.0,
    colorTag: '#10b981',
    order: 3,
  },
};

export const DEFAULT_LAYER_ORDER = [
  'layer-rooms',
  'layer-furniture',
  'layer-walls',
  'layer-dimensions',
];

export const DEFAULT_ACTIVE_LAYER_ID = 'layer-walls';

export interface PlanStoreState {
  vertices: Record<string, Vertex>;
  walls: Record<string, Wall>;
  openings: Record<string, Opening>;
  rooms: Record<string, RoomFace>;
  furniture: Record<string, FurnitureInstance>;
  selectedFurnitureId: string | null;
  images: Record<string, ImageInstance>;
  selectedImageId: string | null;
  lines: Record<string, LineEntity>;
  selectedLineId: string | null;
  selectedIds: string[];
  // Layer System
  layers: Record<string, Layer>;
  activeLayerId: string;
  layerOrder: string[];
}

export interface PlanStoreActions {
  getOrCreateVertex: (x: number, y: number, toleranceMm?: number) => Vertex;
  addWall: (startPoint: Point2D, endPoint: Point2D, thickness?: number, layerId?: string) => Wall | null;
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
    customDimensions?: { width?: number; height?: number },
    layerId?: string
  ) => FurnitureInstance;
  updateFurnitureTransform: (
    id: string,
    updates: Partial<Pick<FurnitureInstance, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'zIndex' | 'layerId' | 'aspectRatioLocked'>>
  ) => void;
  deleteFurniture: (id: string) => void;
  selectFurniture: (id: string | null) => void;
  // Reference Images with Transparency
  addImage: (
    image: Omit<ImageInstance, 'id' | 'zIndex' | 'rotation' | 'opacity' | 'locked' | 'aspectRatio'> & {
      id?: string;
      zIndex?: number;
      rotation?: number;
      opacity?: number;
      locked?: boolean;
      aspectRatio?: number;
    }
  ) => ImageInstance;
  updateImage: (id: string, updates: Partial<Omit<ImageInstance, 'id'>>) => void;
  deleteImage: (id: string) => void;
  selectImage: (id: string | null) => void;
  setImageOpacity: (id: string, opacity: number) => void;
  toggleImageLock: (id: string) => void;
  // Parametric Drafting Lines
  addLine: (line: Omit<LineEntity, 'id' | 'layerId'> & { id?: string; layerId?: string }) => LineEntity;
  updateLine: (id: string, updates: Partial<Omit<LineEntity, 'id'>>) => void;
  deleteLine: (id: string) => void;
  selectLine: (id: string | null) => void;
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
  loadProject: (projectState: Partial<PlanStoreState>) => void;
  // Layer Management Actions
  createLayer: (nameOrOptions?: string | Partial<Layer>, options?: Partial<Layer>) => Layer;
  deleteLayer: (layerId: string, reassignToLayerId?: string) => void;
  updateLayer: (layerId: string, updates: Partial<Layer>) => void;
  toggleLayerVisibility: (layerId: string) => void;
  toggleLayerLock: (layerId: string) => void;
  setLayerOpacity: (layerId: string, opacity: number) => void;
  setActiveLayer: (layerId: string) => void;
  reorderLayers: (newOrderOrFromIndex: string[] | number, toIndex?: number) => void;
  moveSelectedToLayer: (layerId: string) => void;
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
    images: initialState?.images ?? {},
    selectedImageId: initialState?.selectedImageId ?? null,
    lines: initialState?.lines ?? {},
    selectedLineId: initialState?.selectedLineId ?? null,
    selectedIds: initialState?.selectedIds ?? [],
    layers: initialState?.layers ?? { ...DEFAULT_SEED_LAYERS },
    activeLayerId: initialState?.activeLayerId ?? DEFAULT_ACTIVE_LAYER_ID,
    layerOrder: initialState?.layerOrder ? [...initialState.layerOrder] : [...DEFAULT_LAYER_ORDER],

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

    addWall: (
      startPoint: Point2D,
      endPoint: Point2D,
      thickness: number = 150,
      layerId?: string
    ): Wall | null => {
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

      const currentActiveLayer = state.activeLayerId || 'layer-walls';
      const newWall: Wall = {
        id: generateId('w'),
        startId: startVertex.id,
        endId: endVertex.id,
        thickness,
        layerId: layerId || currentActiveLayer,
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
      const state = get();
      const currentActiveLayer = state.activeLayerId || 'layer-walls';
      const newOpening: Opening = {
        id,
        wallId: openingData.wallId,
        offsetRatio: openingData.offsetRatio,
        width: openingData.width,
        type: openingData.type,
        flipH: openingData.flipH ?? false,
        flipV: openingData.flipV ?? false,
        layerId: ('layerId' in openingData && openingData.layerId) ? openingData.layerId : currentActiveLayer,
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
      customDimensions?: { width?: number; height?: number },
      layerId?: string
    ): FurnitureInstance => {
      const def = assetManager.getDefinition(defId);
      const width = customDimensions?.width ?? def?.defaultWidthMm ?? 1000;
      const height = customDimensions?.height ?? def?.defaultHeightMm ?? 1000;

      const state = get();
      const zIndex = Object.keys(state.furniture).length + 1;
      const targetLayer =
        layerId ||
        (state.activeLayerId && state.activeLayerId !== 'layer-walls' && state.activeLayerId !== 'layer-dimensions'
          ? state.activeLayerId
          : 'layer-furniture');

      const newInstance: FurnitureInstance = {
        id: generateId('furn'),
        defId,
        x: position.x,
        y: position.y,
        width,
        height,
        rotation: 0,
        zIndex,
        layerId: targetLayer,
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
      updates: Partial<Pick<FurnitureInstance, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'zIndex' | 'layerId' | 'aspectRatioLocked'>>
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
        selectedImageId: null,
        selectedIds: id ? [id] : s.selectedIds.filter((sel) => !s.furniture[sel]),
      }));
    },

    addImage: (
      image: Omit<ImageInstance, 'id' | 'zIndex' | 'rotation' | 'opacity' | 'locked' | 'aspectRatio'> & {
        id?: string;
        zIndex?: number;
        rotation?: number;
        opacity?: number;
        locked?: boolean;
        aspectRatio?: number;
      }
    ): ImageInstance => {
      recordHistory(get);
      const state = get();
      const id = image.id || generateId('img');
      const zIndex = image.zIndex ?? (Object.keys(state.images).length + 1);
      const targetLayer =
        image.layerId ||
        (state.activeLayerId && state.activeLayerId !== 'layer-dimensions'
          ? state.activeLayerId
          : 'layer-rooms');

      const newImage: ImageInstance = {
        id,
        src: image.src,
        name: image.name || 'Reference Image',
        x: image.x,
        y: image.y,
        width: image.width,
        height: image.height,
        rotation: image.rotation ?? 0,
        opacity: Math.max(0, Math.min(1, image.opacity ?? 0.6)), // Default 0.6 opacity for translucent tracing!
        locked: image.locked ?? false,
        zIndex,
        layerId: targetLayer,
        aspectRatio: image.aspectRatio || (image.width / (image.height || 1)),
      };

      set((s) => ({
        images: {
          ...s.images,
          [id]: newImage,
        },
        selectedImageId: id,
        selectedFurnitureId: null,
        selectedIds: [id],
      }));

      return newImage;
    },

    updateImage: (id: string, updates: Partial<Omit<ImageInstance, 'id'>>): void => {
      set((s) => {
        const target = s.images[id];
        if (!target) return s;
        return {
          images: {
            ...s.images,
            [id]: {
              ...target,
              ...updates,
              opacity: updates.opacity !== undefined ? Math.max(0, Math.min(1, updates.opacity)) : target.opacity,
            },
          },
        };
      });
    },

    deleteImage: (id: string): void => {
      recordHistory(get);
      set((s) => {
        const next = { ...s.images };
        delete next[id];
        return {
          images: next,
          selectedImageId: s.selectedImageId === id ? null : s.selectedImageId,
          selectedIds: s.selectedIds.filter((sel) => sel !== id),
        };
      });
    },

    selectImage: (id: string | null): void => {
      set((s) => ({
        selectedImageId: id,
        selectedFurnitureId: null,
        selectedIds: id ? [id] : s.selectedIds.filter((sel) => !s.images[sel]),
      }));
    },

    setImageOpacity: (id: string, opacity: number): void => {
      const state = get();
      if (!state.images[id]) return;
      recordHistory(get);
      const clamped = Math.max(0, Math.min(1, opacity));
      set((s) => {
        const target = s.images[id];
        if (!target) return s;
        return {
          images: {
            ...s.images,
            [id]: {
              ...target,
              opacity: clamped,
            },
          },
        };
      });
    },

    toggleImageLock: (id: string): void => {
      const state = get();
      if (!state.images[id]) return;
      recordHistory(get);
      set((s) => {
        const target = s.images[id];
        if (!target) return s;
        return {
          images: {
            ...s.images,
            [id]: {
              ...target,
              locked: !target.locked,
            },
          },
        };
      });
    },

    addLine: (line: Omit<LineEntity, 'id' | 'layerId'> & { id?: string; layerId?: string }): LineEntity => {
      recordHistory(get);
      const state = get();
      const id = line.id || generateId('line');
      const targetLayer = line.layerId || state.activeLayerId || 'layer-dimensions';

      const newLine: LineEntity = {
        id,
        layerId: targetLayer,
        start: { ...line.start },
        end: { ...line.end },
        thickness: line.thickness ?? 50,
        color: line.color || '#334155',
        style: line.style || 'solid',
        arrows: line.arrows || 'none',
        showMeasurement: line.showMeasurement ?? true,
      };

      set((s) => ({
        lines: {
          ...s.lines,
          [id]: newLine,
        },
        selectedLineId: id,
        selectedFurnitureId: null,
        selectedImageId: null,
        selectedIds: [id],
      }));

      return newLine;
    },

    updateLine: (id: string, updates: Partial<Omit<LineEntity, 'id'>>): void => {
      const state = get();
      if (!state.lines[id]) return;
      recordHistory(get);
      set((s) => {
        const target = s.lines[id];
        if (!target) return s;
        return {
          lines: {
            ...s.lines,
            [id]: {
              ...target,
              ...updates,
              start: updates.start ? { ...updates.start } : target.start,
              end: updates.end ? { ...updates.end } : target.end,
            },
          },
        };
      });
    },

    deleteLine: (id: string): void => {
      recordHistory(get);
      set((s) => {
        const next = { ...s.lines };
        delete next[id];
        return {
          lines: next,
          selectedLineId: s.selectedLineId === id ? null : s.selectedLineId,
          selectedIds: s.selectedIds.filter((sel) => sel !== id),
        };
      });
    },

    selectLine: (id: string | null): void => {
      set((s) => ({
        selectedLineId: id,
        selectedFurnitureId: null,
        selectedImageId: null,
        selectedIds: id ? [id] : s.selectedIds.filter((sel) => !s.lines[sel]),
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

        // 6. Remove specified images
        const nextImages = { ...s.images };
        for (const imgId of Object.keys(nextImages)) {
          if (idSet.has(imgId)) {
            delete nextImages[imgId];
          }
        }

        // 7. Remove specified lines
        const nextLines = { ...s.lines };
        for (const lId of Object.keys(nextLines)) {
          if (idSet.has(lId)) {
            delete nextLines[lId];
          }
        }

        const nextSelectedFurnitureId = idSet.has(s.selectedFurnitureId ?? '')
          ? null
          : s.selectedFurnitureId;

        const nextSelectedImageId = idSet.has(s.selectedImageId ?? '')
          ? null
          : s.selectedImageId;

        const nextSelectedLineId = idSet.has(s.selectedLineId ?? '')
          ? null
          : s.selectedLineId;

        return {
          vertices: nextVertices,
          walls: nextWalls,
          openings: nextOpenings,
          furniture: nextFurniture,
          selectedFurnitureId: nextSelectedFurnitureId,
          images: nextImages,
          selectedImageId: nextSelectedImageId,
          lines: nextLines,
          selectedLineId: nextSelectedLineId,
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
        images: previous.images ?? {},
        selectedImageId: previous.selectedImageId ?? null,
        lines: previous.lines ?? {},
        selectedLineId: previous.selectedLineId ?? null,
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
        images: next.images ?? {},
        selectedImageId: next.selectedImageId ?? null,
        lines: next.lines ?? {},
        selectedLineId: next.selectedLineId ?? null,
        selectedIds: next.selectedIds,
      });

      get().recomputeRooms();
    },

    canUndo: (): boolean => past.length > 0,

    canRedo: (): boolean => future.length > 0,

    setSelectedIds: (ids: string[]) => {
      const state = get();
      const furnId = ids.find((id) => state.furniture[id]) ?? null;
      const imgId = ids.find((id) => state.images[id]) ?? null;
      const lineId = ids.find((id) => state.lines[id]) ?? null;
      set({ selectedIds: ids, selectedFurnitureId: furnId, selectedImageId: imgId, selectedLineId: lineId });
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
        images: {},
        selectedImageId: null,
        lines: {},
        selectedLineId: null,
        selectedIds: [],
        layers: { ...DEFAULT_SEED_LAYERS },
        activeLayerId: DEFAULT_ACTIVE_LAYER_ID,
        layerOrder: [...DEFAULT_LAYER_ORDER],
      });
    },

    loadProject: (projectState: Partial<PlanStoreState>) => {
      recordHistory(get);
      set({
        vertices: { ...(projectState.vertices ?? {}) },
        walls: { ...(projectState.walls ?? {}) },
        openings: { ...(projectState.openings ?? {}) },
        rooms: { ...(projectState.rooms ?? {}) },
        furniture: { ...(projectState.furniture ?? {}) },
        selectedFurnitureId: null,
        images: { ...(projectState.images ?? {}) },
        selectedImageId: null,
        lines: { ...(projectState.lines ?? {}) },
        selectedLineId: null,
        selectedIds: [],
        layers: projectState.layers ? { ...projectState.layers } : { ...DEFAULT_SEED_LAYERS },
        activeLayerId: projectState.activeLayerId || DEFAULT_ACTIVE_LAYER_ID,
        layerOrder: projectState.layerOrder ? [...projectState.layerOrder] : [...DEFAULT_LAYER_ORDER],
      });
      get().recomputeRooms();
    },

    createLayer: (nameOrOptions?: string | Partial<Layer>, options?: Partial<Layer>): Layer => {
      recordHistory(get);
      const state = get();
      const id = generateId('layer');
      const order = state.layerOrder.length;

      let layerName: string | undefined;
      let layerOpts: Partial<Layer> | undefined;

      if (typeof nameOrOptions === 'object' && nameOrOptions !== null) {
        layerOpts = nameOrOptions;
        layerName = layerOpts.name;
      } else if (typeof nameOrOptions === 'string') {
        layerName = nameOrOptions;
        layerOpts = options;
      } else {
        layerOpts = options;
      }

      const newLayer: Layer = {
        id,
        name: layerName || `Layer ${order + 1}`,
        visible: layerOpts?.visible ?? true,
        locked: layerOpts?.locked ?? false,
        opacity: layerOpts?.opacity ?? 1.0,
        colorTag: layerOpts?.colorTag || '#3b82f6',
        order,
        ...layerOpts,
      };

      set((s) => ({
        layers: {
          ...s.layers,
          [id]: newLayer,
        },
        layerOrder: [...s.layerOrder, id],
        activeLayerId: id,
      }));

      return newLayer;
    },

    deleteLayer: (layerId: string, reassignToLayerId?: string): void => {
      const state = get();
      if (state.layerOrder.length <= 1) {
        return; // Don't delete the only layer
      }

      recordHistory(get);

      const targetFallback =
        reassignToLayerId ||
        state.layerOrder.find((id) => id !== layerId) ||
        DEFAULT_ACTIVE_LAYER_ID;

      // Reassign entities on this layer to fallback
      const updatedWalls = { ...state.walls };
      for (const w of Object.values(updatedWalls)) {
        if (w.layerId === layerId) {
          updatedWalls[w.id] = { ...w, layerId: targetFallback };
        }
      }

      const updatedOpenings = { ...state.openings };
      for (const op of Object.values(updatedOpenings)) {
        if (op.layerId === layerId) {
          updatedOpenings[op.id] = { ...op, layerId: targetFallback };
        }
      }

      const updatedFurniture = { ...state.furniture };
      for (const f of Object.values(updatedFurniture)) {
        if (f.layerId === layerId) {
          updatedFurniture[f.id] = { ...f, layerId: targetFallback };
        }
      }

      const updatedRooms = { ...state.rooms };
      for (const r of Object.values(updatedRooms)) {
        if (r.layerId === layerId) {
          updatedRooms[r.id] = { ...r, layerId: targetFallback };
        }
      }

      const updatedImages = { ...state.images };
      for (const img of Object.values(updatedImages)) {
        if (img.layerId === layerId) {
          updatedImages[img.id] = { ...img, layerId: targetFallback };
        }
      }

      const updatedLines = { ...state.lines };
      for (const l of Object.values(updatedLines)) {
        if (l.layerId === layerId) {
          updatedLines[l.id] = { ...l, layerId: targetFallback };
        }
      }

      const newLayers = { ...state.layers };
      delete newLayers[layerId];
      const newLayerOrder = state.layerOrder.filter((id) => id !== layerId);

      const newActive =
        state.activeLayerId === layerId ? targetFallback : state.activeLayerId;

      set({
        walls: updatedWalls,
        openings: updatedOpenings,
        furniture: updatedFurniture,
        rooms: updatedRooms,
        images: updatedImages,
        lines: updatedLines,
        layers: newLayers,
        layerOrder: newLayerOrder,
        activeLayerId: newActive,
      });
    },

    updateLayer: (layerId: string, updates: Partial<Layer>): void => {
      set((s) => {
        const target = s.layers[layerId];
        if (!target) return s;
        return {
          layers: {
            ...s.layers,
            [layerId]: {
              ...target,
              ...updates,
            },
          },
        };
      });
    },

    toggleLayerVisibility: (layerId: string): void => {
      set((s) => {
        const target = s.layers[layerId];
        if (!target) return s;
        return {
          layers: {
            ...s.layers,
            [layerId]: {
              ...target,
              visible: !target.visible,
            },
          },
        };
      });
    },

    toggleLayerLock: (layerId: string): void => {
      set((s) => {
        const target = s.layers[layerId];
        if (!target) return s;
        return {
          layers: {
            ...s.layers,
            [layerId]: {
              ...target,
              locked: !target.locked,
            },
          },
        };
      });
    },

    setLayerOpacity: (layerId: string, opacity: number): void => {
      const clamped = Math.max(0, Math.min(1, opacity));
      set((s) => {
        const target = s.layers[layerId];
        if (!target) return s;
        return {
          layers: {
            ...s.layers,
            [layerId]: {
              ...target,
              opacity: clamped,
            },
          },
        };
      });
    },

    setActiveLayer: (layerId: string): void => {
      const state = get();
      if (state.layers[layerId]) {
        set({ activeLayerId: layerId });
      }
    },

    reorderLayers: (newOrderOrFromIndex: string[] | number, toIndex?: number): void => {
      recordHistory(get);
      set((s) => {
        let newLayerOrder: string[];
        if (Array.isArray(newOrderOrFromIndex)) {
          newLayerOrder = [...newOrderOrFromIndex];
        } else if (typeof newOrderOrFromIndex === 'number' && typeof toIndex === 'number') {
          const from = newOrderOrFromIndex;
          const to = toIndex;
          if (from < 0 || from >= s.layerOrder.length || to < 0 || to >= s.layerOrder.length) {
            return s;
          }
          const order = [...s.layerOrder];
          const [moved] = order.splice(from, 1);
          order.splice(to, 0, moved);
          newLayerOrder = order;
        } else {
          return s;
        }

        const updatedLayers = { ...s.layers };
        newLayerOrder.forEach((id, idx) => {
          if (updatedLayers[id]) {
            updatedLayers[id] = { ...updatedLayers[id], order: idx };
          }
        });
        return {
          layers: updatedLayers,
          layerOrder: newLayerOrder,
        };
      });
    },

    moveSelectedToLayer: (layerId: string): void => {
      const state = get();
      if (!state.layers[layerId] || state.selectedIds.length === 0) return;

      recordHistory(get);
      const selSet = new Set(state.selectedIds);

      const updatedWalls = { ...state.walls };
      for (const id of selSet) {
        if (updatedWalls[id]) {
          updatedWalls[id] = { ...updatedWalls[id], layerId };
        }
      }

      const updatedOpenings = { ...state.openings };
      for (const id of selSet) {
        if (updatedOpenings[id]) {
          updatedOpenings[id] = { ...updatedOpenings[id], layerId };
        }
      }

      const updatedFurniture = { ...state.furniture };
      for (const id of selSet) {
        if (updatedFurniture[id]) {
          updatedFurniture[id] = { ...updatedFurniture[id], layerId };
        }
      }

      const updatedRooms = { ...state.rooms };
      for (const id of selSet) {
        if (updatedRooms[id]) {
          updatedRooms[id] = { ...updatedRooms[id], layerId };
        }
      }

      const updatedImages = { ...state.images };
      for (const id of selSet) {
        if (updatedImages[id]) {
          updatedImages[id] = { ...updatedImages[id], layerId };
        }
      }
      if (state.selectedImageId && updatedImages[state.selectedImageId]) {
        updatedImages[state.selectedImageId] = { ...updatedImages[state.selectedImageId], layerId };
      }

      const updatedLines = { ...state.lines };
      for (const id of selSet) {
        if (updatedLines[id]) {
          updatedLines[id] = { ...updatedLines[id], layerId };
        }
      }
      if (state.selectedLineId && updatedLines[state.selectedLineId]) {
        updatedLines[state.selectedLineId] = { ...updatedLines[state.selectedLineId], layerId };
      }

      set({
        walls: updatedWalls,
        openings: updatedOpenings,
        furniture: updatedFurniture,
        rooms: updatedRooms,
        images: updatedImages,
        lines: updatedLines,
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
        images: JSON.parse(JSON.stringify(state.images || {})),
        selectedImageId: state.selectedImageId,
        lines: JSON.parse(JSON.stringify(state.lines || {})),
        selectedLineId: state.selectedLineId,
        selectedIds: [...state.selectedIds],
        layers: JSON.parse(JSON.stringify(state.layers)),
        activeLayerId: state.activeLayerId,
        layerOrder: [...state.layerOrder],
      };
    },
  }));
}

// Global default store instance
export const planStore = createPlanStore();
