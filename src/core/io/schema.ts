import type {
  Vertex,
  Wall,
  Opening,
  RoomFace,
  FurnitureInstance,
  ImageInstance,
  LineEntity,
  FloorPlanState,
  UnitSystem,
  Layer,
} from '../types.js';

export interface ProjectMetadata {
  title: string;
  createdAt: string;
  updatedAt: string;
  unitSystem: UnitSystem;
}

export interface FloorPlanProjectFile {
  formatVersion: '1.0.0';
  appVersion: string;
  metadata: ProjectMetadata;
  state: {
    vertices: Record<string, Vertex>;
    walls: Record<string, Wall>;
    openings: Record<string, Opening>;
    rooms: Record<string, RoomFace>;
    furniture: Record<string, FurnitureInstance>;
    images?: Record<string, ImageInstance>;
    lines?: Record<string, LineEntity>;
    layers?: Record<string, Layer>;
    activeLayerId?: string;
    layerOrder?: string[];
  };
}

export interface DeserializedProject extends FloorPlanState {
  metadata: ProjectMetadata;
  formatVersion: '1.0.0';
  appVersion: string;
}

export const CURRENT_FORMAT_VERSION = '1.0.0';
export const CURRENT_APP_VERSION = '1.0.0';

/**
 * Serializes the current floor plan state and metadata into a validated, formatted JSON string.
 */
export function serializeProject(
  state: FloorPlanState | {
    vertices: Record<string, Vertex>;
    walls: Record<string, Wall>;
    openings: Record<string, Opening>;
    rooms: Record<string, RoomFace>;
    furniture: Record<string, FurnitureInstance>;
  },
  metadata?: Partial<ProjectMetadata>
): string {
  const now = new Date().toISOString();
  const projectFile: FloorPlanProjectFile = {
    formatVersion: CURRENT_FORMAT_VERSION,
    appVersion: CURRENT_APP_VERSION,
    metadata: {
      title: metadata?.title || 'Untitled Project',
      createdAt: metadata?.createdAt || now,
      updatedAt: now,
      unitSystem: metadata?.unitSystem || 'metric_mm',
    },
    state: {
      vertices: state.vertices ?? {},
      walls: state.walls ?? {},
      openings: state.openings ?? {},
      rooms: state.rooms ?? {},
      furniture: state.furniture ?? {},
      images: (state as any).images ?? {},
      lines: (state as any).lines ?? {},
      layers: (state as any).layers,
      activeLayerId: (state as any).activeLayerId,
      layerOrder: (state as any).layerOrder,
    },
  };

  return JSON.stringify(projectFile, null, 2);
}

/**
 * Validates and deserializes a project JSON string into a FloorPlanState with attached metadata.
 * Throws human-readable descriptive errors if schema or relational integrity fails.
 */
export function deserializeProject(jsonString: string): DeserializedProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new Error(`Invalid JSON: Failed to parse floor plan file. ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid FloorPlan file: Root object must be a valid JSON object.');
  }

  const data = parsed as Partial<FloorPlanProjectFile>;

  // Check format version
  if (!data.formatVersion) {
    throw new Error('Invalid FloorPlan file: Missing "formatVersion" field.');
  }

  if (data.formatVersion !== CURRENT_FORMAT_VERSION) {
    throw new Error(
      `Unsupported format version "${data.formatVersion}". Supported version is "${CURRENT_FORMAT_VERSION}".`
    );
  }

  if (!data.state || typeof data.state !== 'object') {
    throw new Error('Invalid FloorPlan file: Missing or invalid "state" field.');
  }

  const { state } = data;
  const vertices = state.vertices ?? {};
  const walls = state.walls ?? {};
  const openings = state.openings ?? {};
  const rooms = state.rooms ?? {};
  const furniture = state.furniture ?? {};

  if (typeof vertices !== 'object' || typeof walls !== 'object') {
    throw new Error('Invalid FloorPlan file: "vertices" and "walls" must be valid objects.');
  }

  // Relational integrity check: Verify that every wall vertex exists in vertices
  for (const [wallId, wall] of Object.entries(walls)) {
    if (!wall || typeof wall !== 'object') {
      throw new Error(`Invalid FloorPlan file: Wall "${wallId}" is malformed.`);
    }
    if (!wall.startId || !vertices[wall.startId]) {
      throw new Error(
        `Integrity error: Wall "${wallId}" references missing start vertex "${wall.startId}".`
      );
    }
    if (!wall.endId || !vertices[wall.endId]) {
      throw new Error(
        `Integrity error: Wall "${wallId}" references missing end vertex "${wall.endId}".`
      );
    }
  }

  // Relational integrity check: Verify openings reference existing walls
  for (const [openingId, opening] of Object.entries(openings)) {
    if (!opening || typeof opening !== 'object') {
      throw new Error(`Invalid FloorPlan file: Opening "${openingId}" is malformed.`);
    }
    if (!opening.wallId || !walls[opening.wallId]) {
      throw new Error(
        `Integrity error: Opening "${openingId}" references missing wall "${opening.wallId}".`
      );
    }
  }

  const metadata: ProjectMetadata = {
    title: data.metadata?.title || 'Untitled Project',
    createdAt: data.metadata?.createdAt || new Date().toISOString(),
    updatedAt: data.metadata?.updatedAt || new Date().toISOString(),
    unitSystem: data.metadata?.unitSystem || 'metric_mm',
  };

  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    appVersion: data.appVersion || CURRENT_APP_VERSION,
    metadata,
    vertices: { ...vertices },
    walls: { ...walls },
    openings: { ...openings },
    rooms: { ...rooms },
    furniture: { ...furniture },
    images: state.images ? { ...state.images } : {},
    lines: state.lines ? { ...state.lines } : {},
    selectedFurnitureId: null,
    selectedImageId: null,
    selectedLineId: null,
    layers: state.layers,
    activeLayerId: state.activeLayerId,
    layerOrder: state.layerOrder,
  };
}
