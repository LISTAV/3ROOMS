import { createStore } from 'zustand/vanilla';
import type { Point2D, UnitSystem, LineStyle, ArrowheadStyle } from '../types.js';
import {
  type UnitSettings,
  type LengthUnit,
  type DimensionSettings,
  type DimensionPosition,
  DEFAULT_UNIT_SETTINGS,
  DEFAULT_DIMENSION_SETTINGS,
} from '../units/unitFormatter.js';

export type ToolType = 'select' | 'wall' | 'door' | 'double_door' | 'window' | 'pan' | 'measure' | 'furniture' | 'line';

export interface UIStoreState {
  activeTool: ToolType;
  snapToGrid: boolean;
  orthoLock: boolean;
  cursorWorldPos: Point2D;
  zoom: number;
  gridSpacingMm: number;
  unitSystem: UnitSystem;
  unitSettings: UnitSettings;
  dimensionSettings: DimensionSettings;
  showCatalog: boolean;
  showInspector: boolean;
  showLayers: boolean;
  activePlacementDefId: string | null;
  lineDefaults: {
    thickness: number;
    color: string;
    style: LineStyle;
    arrows: ArrowheadStyle;
    showMeasurement: boolean;
  };
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
  setUnitSettings: (settings: Partial<UnitSettings>) => void;
  setDimensionSettings: (settings: Partial<DimensionSettings>) => void;
  setDimensionFontSize: (fontSize: number) => void;
  setDimensionPosition: (position: DimensionPosition) => void;
  setDimensionOffset: (offsetMm: number) => void;
  setLengthUnit: (unit: LengthUnit) => void;
  cycleUnitSystem: () => void;
  toggleCatalog: () => void;
  toggleInspector: () => void;
  setInspectorVisible: (visible: boolean) => void;
  toggleLayers: () => void;
  startFurniturePlacement: (defId: string) => void;
  setLineDefaults: (defaults: Partial<UIStoreState['lineDefaults']>) => void;
  requestZoomToFit: () => void;
  requestResetZoom: () => void;
}

export type UIStore = UIStoreState & UIStoreActions;

export { formatLength, formatArea, DEFAULT_DIMENSION_SETTINGS } from '../units/unitFormatter.js';

export function createUIStore(initial?: Partial<UIStoreState>) {
  return createStore<UIStore>((set) => ({
    activeTool: initial?.activeTool ?? 'select',
    snapToGrid: initial?.snapToGrid ?? true,
    orthoLock: initial?.orthoLock ?? false,
    cursorWorldPos: initial?.cursorWorldPos ?? { x: 0, y: 0 },
    zoom: initial?.zoom ?? 0.1,
    gridSpacingMm: initial?.gridSpacingMm ?? 100,
    unitSystem: initial?.unitSystem ?? 'metric_mm',
    unitSettings: initial?.unitSettings ?? { ...DEFAULT_UNIT_SETTINGS },
    dimensionSettings: initial?.dimensionSettings ?? { ...DEFAULT_DIMENSION_SETTINGS },
    showCatalog: initial?.showCatalog ?? true,
    showInspector: initial?.showInspector ?? true,
    showLayers: initial?.showLayers ?? false,
    activePlacementDefId: initial?.activePlacementDefId ?? null,
    lineDefaults: initial?.lineDefaults ?? {
      thickness: 50,
      color: '#334155',
      style: 'solid',
      arrows: 'none',
      showMeasurement: true,
    },
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
    setUnitSystem: (system: UnitSystem) =>
      set((s) => {
        let lengthUnit: LengthUnit = 'mm';
        let areaUnit = s.unitSettings.areaUnit;
        if (system === 'metric_m') {
          lengthUnit = 'm';
          areaUnit = 'sq_m';
        } else if (system === 'imperial_ft') {
          lengthUnit = 'ft_in';
          areaUnit = 'sq_ft';
        }
        return {
          unitSystem: system,
          unitSettings: {
            ...s.unitSettings,
            lengthUnit,
            areaUnit,
          },
        };
      }),
    setUnitSettings: (settings: Partial<UnitSettings>) =>
      set((s) => ({
        unitSettings: {
          ...s.unitSettings,
          ...settings,
        },
      })),
    setDimensionSettings: (settings: Partial<DimensionSettings>) =>
      set((s) => ({
        dimensionSettings: {
          ...s.dimensionSettings,
          ...settings,
        },
      })),
    setDimensionFontSize: (fontSize: number) =>
      set((s) => ({
        dimensionSettings: {
          ...s.dimensionSettings,
          fontSize: Math.max(8, Math.min(48, fontSize)),
        },
      })),
    setDimensionPosition: (position: DimensionPosition) =>
      set((s) => ({
        dimensionSettings: {
          ...s.dimensionSettings,
          position,
        },
      })),
    setDimensionOffset: (offsetMm: number) =>
      set((s) => ({
        dimensionSettings: {
          ...s.dimensionSettings,
          offsetMm: Math.max(0, Math.min(2000, offsetMm)),
        },
      })),
    setLengthUnit: (unit: LengthUnit) =>
      set((s) => {
        let unitSystem: UnitSystem = 'metric_mm';
        let areaUnit = s.unitSettings.areaUnit;
        if (unit === 'cm' || unit === 'm') {
          unitSystem = 'metric_m';
          areaUnit = 'sq_m';
        } else if (unit === 'in' || unit === 'ft' || unit === 'ft_in') {
          unitSystem = 'imperial_ft';
          areaUnit = 'sq_ft';
        } else {
          areaUnit = 'sq_m';
        }
        return {
          unitSystem,
          unitSettings: {
            ...s.unitSettings,
            lengthUnit: unit,
            areaUnit,
          },
        };
      }),
    cycleUnitSystem: () =>
      set((s) => {
        const order: LengthUnit[] = ['mm', 'cm', 'm', 'in', 'ft', 'ft_in'];
        const nextIndex = (order.indexOf(s.unitSettings.lengthUnit) + 1) % order.length;
        const nextUnit = order[nextIndex];
        let unitSystem: UnitSystem = 'metric_mm';
        if (nextUnit === 'cm' || nextUnit === 'm') {
          unitSystem = 'metric_m';
        } else if (nextUnit === 'in' || nextUnit === 'ft' || nextUnit === 'ft_in') {
          unitSystem = 'imperial_ft';
        }
        return {
          unitSystem,
          unitSettings: {
            ...s.unitSettings,
            lengthUnit: nextUnit,
          },
        };
      }),
    toggleCatalog: () => set((s) => ({ showCatalog: !s.showCatalog })),
    toggleInspector: () => set((s) => ({ showInspector: !s.showInspector })),
    setInspectorVisible: (visible: boolean) => set({ showInspector: visible }),
    toggleLayers: () => set((s) => ({ showLayers: !s.showLayers })),
    startFurniturePlacement: (defId: string) =>
      set({
        activeTool: 'furniture',
        activePlacementDefId: defId,
      }),
    setLineDefaults: (defaults) =>
      set((s) => ({ lineDefaults: { ...s.lineDefaults, ...defaults } })),
    requestZoomToFit: () => set((s) => ({ zoomToFitTrigger: s.zoomToFitTrigger + 1 })),
    requestResetZoom: () => set((s) => ({ resetZoomTrigger: s.resetZoomTrigger + 1 })),
  }));
}

// Global UI Store instance
export const uiStore = createUIStore();
