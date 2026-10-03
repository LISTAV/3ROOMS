/**
 * 2D point representation in millimeters.
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * Floor plan vertex representing an endpoint or junction of walls.
 */
export interface Vertex {
  id: string;
  x: number;
  y: number;
}

/**
 * Wall segment connecting two vertices with a defined thickness in millimeters.
 */
export interface Wall {
  id: string;
  startId: string;
  endId: string;
  thickness: number;
}

/**
 * Types of openings that can be placed on a wall.
 */
/**
 * Types of openings that can be placed on a wall.
 */
export type OpeningType =
  | 'single_door'
  | 'double_door'
  | 'window'
  | 'sliding_window'
  | 'fixed_window'
  | 'opening';

/**
 * Opening placed along a wall segment.
 * offsetRatio: Normalized position along wall segment (0.0 to 1.0).
 * width: Opening width in millimeters.
 */
export interface Opening {
  id: string;
  wallId: string;
  offsetRatio: number;
  width: number;
  type: OpeningType;
  flipH: boolean;
  flipV: boolean;
}

/**
 * Supported engineering/architectural unit systems.
 */
export type UnitSystem = 'metric_mm' | 'metric_m' | 'imperial_ft';

/**
 * Planar room face bounded by vertices and walls.
 * areaMm2: Room area in square millimeters.
 */
export interface RoomFace {
  id: string;
  name?: string;
  color?: string;
  vertexIds: string[];
  wallIds: string[];
  areaMm2: number;
  points?: Point2D[];
  centroid?: Point2D;
}

/**
 * Definition of an architectural symbol or furniture asset.
 */
export interface FurnitureDefinition {
  id: string;              // e.g., 'bed_queen', 'sofa_3seater', 'dining_table_round'
  name: string;            // Display name
  category: 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'doors_windows';
  defaultWidthMm: number;  // Real-world width in millimeters
  defaultHeightMm: number; // Real-world height/depth in millimeters
  svgContent: string;      // Raw inline SVG markup
}

/**
 * An instantiated furniture item placed on the floor plan canvas.
 */
export interface FurnitureInstance {
  id: string;              // Unique instance ID
  defId: string;           // Points to FurnitureDefinition.id
  x: number;               // World position X in mm (center of object)
  y: number;               // World position Y in mm (center of object)
  width: number;           // mm
  height: number;          // mm
  rotation: number;        // Rotation in radians
  zIndex: number;          // Stacking order
}

/**
 * Normalized planar floor plan state store.
 */
export interface FloorPlanState {
  vertices: Record<string, Vertex>;
  walls: Record<string, Wall>;
  openings: Record<string, Opening>;
  rooms: Record<string, RoomFace>;
  furniture: Record<string, FurnitureInstance>;
  selectedFurnitureId: string | null;
}
