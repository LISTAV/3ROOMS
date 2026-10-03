import { createStore } from 'zustand/vanilla';
import type { Point2D, UnitSystem } from '../types.js';

export type ToolType = 'select' | 'wall' | 'door' | 'double_door' | 'window' | 'pan' | 'measure' | 'furniture';

export interface UIStoreState {
  activeTool: ToolType;
  snapToGrid: boolean;
  orthoLock: boolean;
  cursorWorldPos: Point2D;
  zoom: number;
  gridSpacingMm: number;
  unitSystem: UnitSystem;
  showCatalog: boolean;
  showInspector: boolean;
  activePlacementDefId: string | null;
  // Trigger counters for viewport actions
  zoomToFitTrigger: number;
  resetZoomTrigger: number;
}

export interface UIStoreActions {
  setActiveTool: (tool: ToolType) => void;
  setSnapToGrid: (enabled: boolean) => void;
  toggleSnapToGrid: () => void;
  setOrthoLock: (enabled: boolean) => void;
  toggleOrthoLock: () => void;
  setCursorWorldPos: (pos: Point2D) => void;
  setZoom: (zoom: number) => void;
  setGridSpacing: (spacingMm: number) => void;
  setUnitSystem: (system: UnitSystem) => void;
  cycleUnitSystem: () => void;
  toggleCatalog: () => void;
  toggleInspector: () => void;
  startFurniturePlacement: (defId: string) => void;
  requestZoomToFit: () => void;
  requestResetZoom: () => void;
}

export type UIStore = UIStoreState & UIStoreActions;

/**
 * Formats a millimeter dimension string into the target unit system.
 */
export function formatLength(mm: number, unitSystem: UnitSystem = 'metric_mm'): string {
  if (isNaN(mm)) return '0 mm';

  switch (unitSystem) {
    case 'metric_m': {
      const meters = mm / 1000;
      return `${meters.toFixed(2)} m`;
    }
    case 'imperial_ft': {
      const totalInches = mm / 25.4;
      let feet = Math.floor(totalInches / 12);
      let inches = Math.round(totalInches % 12);
      if (inches === 12) {
        feet += 1;
        inches = 0;
      }
      return `${feet}' ${inches}"`;
    }
    case 'metric_mm':
    default:
      return `${Math.round(mm).toLocaleString('en-US')} mm`;
  }
}

/**
 * Formats a square millimeter area string into the target unit system.
 */
export function formatArea(mm2: number, unitSystem: UnitSystem = 'metric_mm'): string {
  if (isNaN(mm2)) return '0 m²';

  switch (unitSystem) {
    case 'imperial_ft': {
      // 1 sq ft = 92903.04 mm²
      const sqFt = mm2 / 92903.04;
      return `${sqFt.toFixed(1)} sq ft`;
    }
    case 'metric_mm': {
      return `${Math.round(mm2).toLocaleString('en-US')} mm²`;
    }
    case 'metric_m':
    default: {
      const sqMeters = mm2 / 1_000_000;
      return `${sqMeters.toFixed(2)} m²`;
    }
  }
}

export function createUIStore(initial?: Partial<UIStoreState>) {
  return createStore<UIStore>((set) => ({
    activeTool: initial?.activeTool ?? 'select',
    snapToGrid: initial?.snapToGrid ?? true,
    orthoLock: initial?.orthoLock ?? false,
    cursorWorldPos: initial?.cursorWorldPos ?? { x: 0, y: 0 },
    zoom: initial?.zoom ?? 0.1,
    gridSpacingMm: initial?.gridSpacingMm ?? 100,
    unitSystem: initial?.unitSystem ?? 'metric_mm',
    showCatalog: initial?.showCatalog ?? true,
    showInspector: initial?.showInspector ?? true,
    activePlacementDefId: initial?.activePlacementDefId ?? null,
    zoomToFitTrigger: 0,
    resetZoomTrigger: 0,

    setActiveTool: (tool: ToolType) => set({ activeTool: tool }),
    setSnapToGrid: (enabled: boolean) => set({ snapToGrid: enabled }),
    toggleSnapToGrid: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
    setOrthoLock: (enabled: boolean) => set({ orthoLock: enabled }),
    toggleOrthoLock: () => set((s) => ({ orthoLock: !s.orthoLock })),
    setCursorWorldPos: (pos: Point2D) => set({ cursorWorldPos: { ...pos } }),
    setZoom: (zoom: number) => set({ zoom }),
    setGridSpacing: (spacingMm: number) => set({ gridSpacingMm: spacingMm }),
    setUnitSystem: (system: UnitSystem) => set({ unitSystem: system }),
    cycleUnitSystem: () =>
      set((s) => {
        const order: UnitSystem[] = ['metric_mm', 'metric_m', 'imperial_ft'];
        const nextIndex = (order.indexOf(s.unitSystem) + 1) % order.length;
        return { unitSystem: order[nextIndex] };
      }),
    toggleCatalog: () => set((s) => ({ showCatalog: !s.showCatalog })),
    toggleInspector: () => set((s) => ({ showInspector: !s.showInspector })),
    startFurniturePlacement: (defId: string) =>
      set({
        activeTool: 'furniture',
        activePlacementDefId: defId,
      }),
    requestZoomToFit: () => set((s) => ({ zoomToFitTrigger: s.zoomToFitTrigger + 1 })),
    requestResetZoom: () => set((s) => ({ resetZoomTrigger: s.resetZoomTrigger + 1 })),
  }));
}

// Global UI Store instance
export const uiStore = createUIStore();
