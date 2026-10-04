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
  layerId?: string;
}

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
  layerId?: string;
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
  layerId?: string;
}

export type AssetCategory =
  | 'living'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'doors_windows'
  | 'stairs'
  | 'custom';

/**
 * Definition of an architectural symbol or furniture asset.
 */
export interface FurnitureDefinition {
  id: string;              // e.g., 'bed_queen', 'sofa_3seater', 'staircase_straight'
  name: string;            // Display name
  category: AssetCategory;
  defaultWidthMm: number;  // Real-world width in millimeters
  defaultHeightMm: number; // Real-world height/depth in millimeters
  svgContent: string;      // Raw inline SVG markup
  isCustom?: boolean;      // True if imported by user
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
  layerId?: string;
  aspectRatioLocked?: boolean;
}

/**
 * Reference underlay image placed on the floor plan canvas with opacity/transparency support.
 */
export interface ImageInstance {
  id: string;              // Unique instance ID (e.g. "img_12345")
  src: string;             // Base64 data URL or image URI
  name?: string;           // Optional file name (e.g. "blueprint.png")
  x: number;               // Center X in world coordinates (mm)
  y: number;               // Center Y in world coordinates (mm)
  width: number;           // Display width in mm
  height: number;          // Display height in mm
  rotation: number;        // Rotation in radians
  opacity: number;         // Opacity / Transparency: 0.0 (fully transparent) to 1.0 (fully opaque)
  locked: boolean;         // When locked, immune to canvas drag/selection clicks
  zIndex: number;          // Stacking order
  layerId?: string;        // Assigned layer ID
  aspectRatio: number;     // Natural aspect ratio (width / height)
}

/**
 * Photoshop/AutoCAD-style Layer definition.
 */
export interface Layer {
  id: string;
  name: string;             // e.g. "01 - Structural Walls", "02 - Openings", "03 - Furniture", "04 - Dimensions"
  visible: boolean;         // Eye toggle
  locked: boolean;          // Padlock toggle (prevents selection and mutation)
  opacity: number;          // 0.0 to 1.0 (Photoshop-like alpha blending)
  colorTag?: string;        // Optional color tag for visual identification
  order: number;            // Stacking index (0 = bottom background, N = top overlay)
}

/**
 * Layer collection and active drawing state.
 */
export interface LayerState {
  layers: Record<string, Layer>;
  activeLayerId: string;    // Elements drawn will be assigned to this layer
  layerOrder: string[];     // Ordered array of layer IDs [bottomLayerId, ..., topLayerId]
}

export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type ArrowheadStyle = 'none' | 'start' | 'end' | 'both';

export interface LineEntity {
  id: string;
  layerId: string;
  start: Point2D;          // Canonical world coordinates in mm
  end: Point2D;            // Canonical world coordinates in mm
  thickness: number;       // Line width in mm (e.g., 20mm, 50mm, 100mm)
  color: string;           // Hex color (e.g., '#1e293b')
  style: LineStyle;        // 'solid' | 'dashed' | 'dotted'
  arrows: ArrowheadStyle;  // Optional arrowheads for annotations
  showMeasurement: boolean;// Whether to render the length tag along the line
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
  images?: Record<string, ImageInstance>;
  selectedImageId?: string | null;
  lines?: Record<string, LineEntity>;
  selectedLineId?: string | null;
  layers?: Record<string, Layer>;
  activeLayerId?: string;
  layerOrder?: string[];
}

