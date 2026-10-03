import { describe, it, expect, beforeEach } from 'vitest';
import { createUIStore, formatLength, formatArea } from '../src/core/store/uiStore.js';
import { createPlanStore } from '../src/core/store/planStore.js';

describe('UI Store & Unit Formatting', () => {
  it('formats millimeter lengths correctly across metric and imperial systems', () => {
    // 2500 mm = 2.5 m = 8 feet 2.4 inches (~8' 2")
    expect(formatLength(2500, 'metric_mm')).toBe('2,500 mm');
    expect(formatLength(2500, 'metric_m')).toBe('2.50 m');
    expect(formatLength(2500, 'imperial_ft')).toBe(`8' 2"`);

    // Edge cases
    expect(formatLength(0, 'metric_mm')).toBe('0 mm');
    expect(formatLength(0, 'metric_m')).toBe('0.00 m');
    expect(formatLength(0, 'imperial_ft')).toBe(`0' 0"`);
  });

  it('formats areas correctly across metric and imperial systems', () => {
    // 12,000,000 mm² = 12 m²
    expect(formatArea(12_000_000, 'metric_m')).toBe('12.00 m²');
    expect(formatArea(12_000_000, 'metric_mm')).toBe('12,000,000 mm²');
    // 12 m² = ~129.2 sq ft
    expect(formatArea(12_000_000, 'imperial_ft')).toBe('129.2 sq ft');
  });

  it('handles UI state updates for activeTool, snapToGrid, and orthoLock', () => {
    const store = createUIStore();

    expect(store.getState().activeTool).toBe('select');
    expect(store.getState().snapToGrid).toBe(true);
    expect(store.getState().orthoLock).toBe(false);

    store.getState().setActiveTool('wall');
    expect(store.getState().activeTool).toBe('wall');

    store.getState().toggleSnapToGrid();
    expect(store.getState().snapToGrid).toBe(false);

    store.getState().toggleOrthoLock();
    expect(store.getState().orthoLock).toBe(true);

    store.getState().setCursorWorldPos({ x: 1200, y: -450 });
    expect(store.getState().cursorWorldPos).toEqual({ x: 1200, y: -450 });

    store.getState().setGridSpacing(200);
    expect(store.getState().gridSpacingMm).toBe(200);

    store.getState().cycleUnitSystem();
    expect(store.getState().unitSystem).toBe('metric_m');
  });
});

describe('PlanStore History (Undo / Redo)', () => {
  let store: ReturnType<typeof createPlanStore>;

  beforeEach(() => {
    store = createPlanStore();
  });

  it('records history and undoes / redoes wall creation', () => {
    expect(store.getState().canUndo()).toBe(false);
    expect(store.getState().canRedo()).toBe(false);

    // 1. Add wall
    const wall = store.getState().addWall({ x: 0, y: 0 }, { x: 3000, y: 0 });
    expect(wall).not.toBeNull();
    expect(Object.keys(store.getState().walls).length).toBe(1);
    expect(store.getState().canUndo()).toBe(true);

    // 2. Undo
    store.getState().undo();
    expect(Object.keys(store.getState().walls).length).toBe(0);
    expect(store.getState().canUndo()).toBe(false);
    expect(store.getState().canRedo()).toBe(true);

    // 3. Redo
    store.getState().redo();
    expect(Object.keys(store.getState().walls).length).toBe(1);
    expect(store.getState().canUndo()).toBe(true);
    expect(store.getState().canRedo()).toBe(false);
  });

  it('updates wall thickness immediately and records history', () => {
    const wall = store.getState().addWall({ x: 0, y: 0 }, { x: 2000, y: 0 }, 150)!;
    expect(store.getState().walls[wall.id].thickness).toBe(150);

    // Update thickness
    store.getState().updateWallThickness(wall.id, 250);
    expect(store.getState().walls[wall.id].thickness).toBe(250);

    // Undo thickness change
    store.getState().undo();
    expect(store.getState().walls[wall.id].thickness).toBe(150);
  });

  it('stretches wall length along its direction vector', () => {
    const wall = store.getState().addWall({ x: 0, y: 0 }, { x: 2000, y: 0 }, 150)!;
    expect(store.getState().vertices[wall.endId].x).toBe(2000);

    store.getState().setWallLength(wall.id, 3500);
    expect(store.getState().vertices[wall.endId].x).toBe(3500);
    expect(store.getState().vertices[wall.endId].y).toBe(0);
  });

  it('updates room name and custom floor finish color', () => {
    // Form a closed 4-wall square room
    store.getState().addWall({ x: 0, y: 0 }, { x: 3000, y: 0 });
    store.getState().addWall({ x: 3000, y: 0 }, { x: 3000, y: 3000 });
    store.getState().addWall({ x: 3000, y: 3000 }, { x: 0, y: 3000 });
    store.getState().addWall({ x: 0, y: 3000 }, { x: 0, y: 0 });

    const rooms = Object.values(store.getState().rooms);
    expect(rooms.length).toBe(1);
    const roomId = rooms[0].id;

    store.getState().setRoomName(roomId, 'Master Bedroom');
    expect(store.getState().rooms[roomId].name).toBe('Master Bedroom');

    store.getState().setRoomColor(roomId, '#dbeafe');
    expect(store.getState().rooms[roomId].color).toBe('#dbeafe');

    // Recomputing rooms preserves custom name and color
    store.getState().recomputeRooms();
    expect(store.getState().rooms[roomId].name).toBe('Master Bedroom');
    expect(store.getState().rooms[roomId].color).toBe('#dbeafe');
  });

  it('places furniture from catalog with correct default dimensions and tracks selection', () => {
    const furn = store.getState().addFurniture('bed_queen', { x: 1500, y: 1500 });
    expect(furn.defId).toBe('bed_queen');
    expect(furn.width).toBe(1600);
    expect(furn.height).toBe(2000);
    expect(store.getState().selectedFurnitureId).toBe(furn.id);

    // Delete furniture
    store.getState().deleteFurniture(furn.id);
    expect(store.getState().furniture[furn.id]).toBeUndefined();
    expect(store.getState().selectedFurnitureId).toBeNull();
  });
});
