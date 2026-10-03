import type { Point2D, Vertex, Wall } from '../types.js';
import { distance, length } from '../math/vector.js';
import { projectPointOnSegment } from '../math/line.js';
import { SpatialIndex } from '../spatial/SpatialIndex.js';

export type SnapType = 'vertex' | 'edge' | 'alignment' | 'ortho' | 'grid' | 'none';

export interface AlignmentGuideline {
  axis: 'x' | 'y'; // 'x' is vertical line x = pos; 'y' is horizontal line y = pos
  position: number;
  sourcePoint: Point2D;
  sourceVertexId?: string;
}

export interface SnapResult {
  point: Point2D;
  snapType: SnapType;
  snappedVertexId?: string;
  snappedWallId?: string;
  targetId?: string; // Unified identifier for snapped entity (vertex ID or wall ID)
  guidelines: AlignmentGuideline[];
  orthoAngle?: number; // In degrees (-180 to 180)
}

export interface ResolveSnapOptions {
  cursorWorld: Point2D;
  zoom: number;
  orthoOrigin?: Point2D;
  isShiftPressed?: boolean;
  vertices?: Record<string, Vertex>;
  walls?: Record<string, Wall>;
  ignoreVertexIds?: string[];
  ignoreWallIds?: string[];
  searchRadiusMm?: number;
}

export interface SnapEngineOptions {
  spatialIndex?: SpatialIndex;
  vertexSnapRadiusPixels?: number; // Default: 12px
  edgeSnapRadiusPixels?: number; // Default: 10px
  alignmentThresholdPixels?: number; // Default: 8px
  gridSnapEnabled?: boolean; // Default: false
  gridSpacingMm?: number; // Default: 100mm
}

export interface SnapContext {
  rawPoint: Point2D;
  zoom: number;
  shiftKey?: boolean;
  referencePoint?: Point2D;
  ignoreVertexIds?: string[];
  ignoreWallIds?: string[];
  searchRadiusMm?: number;
}

/**
 * High-performance spatial snapping engine handling:
 * - Magnetic vertex corners (screen-radius-aware)
 * - Wall edge projection sliding
 * - Dynamic alignment guidelines (Figma-style horizontal/vertical raycasts)
 * - Orthogonal axis lock (0°, 45°, 90°, 180° when Shift is held)
 * - Configurable millimeter grid snapping
 */
export class SnapEngine {
  public spatialIndex: SpatialIndex;
  public vertexSnapRadiusPixels: number;
  public edgeSnapRadiusPixels: number;
  public alignmentThresholdPixels: number;
  public gridSnapEnabled: boolean;
  public gridSpacingMm: number;

  constructor(options: SnapEngineOptions = {}) {
    this.spatialIndex = options.spatialIndex ?? new SpatialIndex();
    this.vertexSnapRadiusPixels = options.vertexSnapRadiusPixels ?? 12;
    this.edgeSnapRadiusPixels = options.edgeSnapRadiusPixels ?? 10;
    this.alignmentThresholdPixels = options.alignmentThresholdPixels ?? 8;
    this.gridSnapEnabled = options.gridSnapEnabled ?? false;
    this.gridSpacingMm = options.gridSpacingMm ?? 100;
  }

  /**
   * Evaluates snapping for a given world point and context.
   * Follows strict CAD precedence: Vertex > Edge > Alignment / Ortho > Grid > Raw.
   */
  public snap(
    context: SnapContext,
    vertices: Record<string, Vertex>,
    walls: Record<string, Wall>
  ): SnapResult {
    const { rawPoint, zoom, shiftKey, referencePoint } = context;
    const ignoreVertices = new Set(context.ignoreVertexIds ?? []);
    const ignoreWalls = new Set(context.ignoreWallIds ?? []);

    // Screen-to-world millimeter thresholds based on current zoom
    const vertexRadiusMm = this.vertexSnapRadiusPixels / zoom;
    const edgeRadiusMm = this.edgeSnapRadiusPixels / zoom;
    const alignRadiusMm = this.alignmentThresholdPixels / zoom;

    // -------------------------------------------------------------
    // 1. VERTEX SNAPPING (Magnetic Corners - Highest Priority)
    // -------------------------------------------------------------
    const vertexCandidates = this.spatialIndex.queryRadius(rawPoint, vertexRadiusMm);
    let closestVertex: Vertex | null = null;
    let minVertexDist = Infinity;

    for (const item of vertexCandidates) {
      if (item.type !== 'vertex' || ignoreVertices.has(item.id)) continue;
      const v = vertices[item.id];
      if (!v) continue;

      const d = distance(rawPoint, v);
      if (d <= vertexRadiusMm && d < minVertexDist) {
        minVertexDist = d;
        closestVertex = v;
      }
    }

    if (closestVertex) {
      return {
        point: { x: closestVertex.x, y: closestVertex.y },
        snapType: 'vertex',
        snappedVertexId: closestVertex.id,
        targetId: closestVertex.id,
        guidelines: [],
      };
    }

    // -------------------------------------------------------------
    // 2. ORTHOGONAL AXIS LOCK (Shift held with reference point)
    // -------------------------------------------------------------
    let currentPoint = { ...rawPoint };
    let orthoAngleDeg: number | undefined;

    if (shiftKey && referencePoint) {
      const dx = rawPoint.x - referencePoint.x;
      const dy = rawPoint.y - referencePoint.y;
      const dist = length({ x: dx, y: dy });

      if (dist > 1e-3) {
        const rawAngleRad = Math.atan2(dy, dx);
        const rawAngleDeg = (rawAngleRad * 180) / Math.PI;

        // Snap to nearest 45-degree increment (0, 45, 90, 135, 180, -45, -90, -135)
        const snappedDeg = Math.round(rawAngleDeg / 45) * 45;
        const snappedRad = (snappedDeg * Math.PI) / 180;

        currentPoint = {
          x: referencePoint.x + dist * Math.cos(snappedRad),
          y: referencePoint.y + dist * Math.sin(snappedRad),
        };
        orthoAngleDeg = snappedDeg;
      }
    }

    // -------------------------------------------------------------
    // 3. EDGE / WALL PROJECTION SNAPPING (Sliding along walls)
    // -------------------------------------------------------------
    // Search for nearby walls
    const wallCandidates = this.spatialIndex.queryRadius(currentPoint, edgeRadiusMm + 200);
    let bestEdgePoint: Point2D | null = null;
    let bestWallId: string | undefined;
    let minEdgeDist = Infinity;

    for (const item of wallCandidates) {
      if (item.type !== 'wall' || ignoreWalls.has(item.id)) continue;
      const wall = walls[item.id];
      if (!wall) continue;

      const startV = vertices[wall.startId];
      const endV = vertices[wall.endId];
      if (!startV || !endV) continue;

      const proj = projectPointOnSegment(currentPoint, startV, endV);
      if (proj.distance <= edgeRadiusMm && proj.t > 0 && proj.t < 1) {
        if (proj.distance < minEdgeDist) {
          minEdgeDist = proj.distance;
          bestEdgePoint = proj.point;
          bestWallId = wall.id;
        }
      }
    }

    // If edge projection found and shift key is NOT forcing an ortho line elsewhere
    if (bestEdgePoint && (!shiftKey || !referencePoint)) {
      return {
        point: bestEdgePoint,
        snapType: 'edge',
        snappedWallId: bestWallId,
        targetId: bestWallId,
        guidelines: [],
      };
    }

    // -------------------------------------------------------------
    // 4. DYNAMIC ALIGNMENT GUIDELINES (Figma-style smart guides)
    // -------------------------------------------------------------
    const guidelines: AlignmentGuideline[] = [];
    let alignedX: number | null = null;
    let alignedY: number | null = null;
    let minDiffX = Infinity;
    let minDiffY = Infinity;

    // Check vertices for horizontal (same Y) and vertical (same X) alignment
    // Use an expanded search window around current point
    const alignSearchDist = context.searchRadiusMm ?? Math.max(5000, 1000 / zoom);
    const alignCandidates = this.spatialIndex.queryRadius(currentPoint, alignSearchDist);

    for (const item of alignCandidates) {
      if (item.type !== 'vertex' || ignoreVertices.has(item.id)) continue;
      const v = vertices[item.id];
      if (!v) continue;

      // Vertical guideline: same X coordinate
      const diffX = Math.abs(currentPoint.x - v.x);
      if (diffX <= alignRadiusMm && diffX < minDiffX) {
        minDiffX = diffX;
        alignedX = v.x;
        guidelines.push({
          axis: 'x',
          position: v.x,
          sourcePoint: { x: v.x, y: v.y },
          sourceVertexId: v.id,
        });
      }

      // Horizontal guideline: same Y coordinate
      const diffY = Math.abs(currentPoint.y - v.y);
      if (diffY <= alignRadiusMm && diffY < minDiffY) {
        minDiffY = diffY;
        alignedY = v.y;
        guidelines.push({
          axis: 'y',
          position: v.y,
          sourcePoint: { x: v.x, y: v.y },
          sourceVertexId: v.id,
        });
      }
    }

    if (alignedX !== null || alignedY !== null) {
      if (orthoAngleDeg !== undefined) {
        return {
          point: {
            x: alignedX !== null ? alignedX : currentPoint.x,
            y: alignedY !== null ? alignedY : currentPoint.y,
          },
          snapType: 'ortho',
          orthoAngle: orthoAngleDeg,
          guidelines,
        };
      }

      return {
        point: {
          x: alignedX !== null ? alignedX : currentPoint.x,
          y: alignedY !== null ? alignedY : currentPoint.y,
        },
        snapType: 'alignment',
        guidelines,
      };
    }

    // -------------------------------------------------------------
    // 5. ORTHOGONAL RESULT (if ortho was calculated above)
    // -------------------------------------------------------------
    if (orthoAngleDeg !== undefined) {
      return {
        point: currentPoint,
        snapType: 'ortho',
        orthoAngle: orthoAngleDeg,
        guidelines: [],
      };
    }

    // -------------------------------------------------------------
    // 6. MILLIMETER GRID SNAPPING
    // -------------------------------------------------------------
    if (this.gridSnapEnabled && this.gridSpacingMm > 0) {
      const gridX = Math.round(rawPoint.x / this.gridSpacingMm) * this.gridSpacingMm;
      const gridY = Math.round(rawPoint.y / this.gridSpacingMm) * this.gridSpacingMm;
      return {
        point: { x: gridX, y: gridY },
        snapType: 'grid',
        guidelines: [],
      };
    }

    // -------------------------------------------------------------
    // 7. RAW POINT (No snap target)
    // -------------------------------------------------------------
    return {
      point: { x: rawPoint.x, y: rawPoint.y },
      snapType: 'none',
      guidelines: [],
    };
  }

  /**
   * Convenience wrapper resolving snap from options object.
   */
  public resolveSnap(
    options: ResolveSnapOptions,
    vertices: Record<string, Vertex> = {},
    walls: Record<string, Wall> = {}
  ): SnapResult {
    const v = options.vertices ?? vertices;
    const w = options.walls ?? walls;
    return this.snap(
      {
        rawPoint: options.cursorWorld,
        zoom: options.zoom,
        shiftKey: options.isShiftPressed,
        referencePoint: options.orthoOrigin,
        ignoreVertexIds: options.ignoreVertexIds,
        ignoreWallIds: options.ignoreWallIds,
        searchRadiusMm: options.searchRadiusMm,
      },
      v,
      w
    );
  }
}

