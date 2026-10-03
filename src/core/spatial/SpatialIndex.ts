import RBush from 'rbush';
import type { Point2D, Vertex, Wall } from '../types.js';

export interface SpatialItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
  type: 'vertex' | 'wall';
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 2D R-Tree spatial indexing wrapper around rbush for fast geometric queries.
 */
export class SpatialIndex {
  private tree: RBush<SpatialItem>;
  private itemMap: Map<string, SpatialItem> = new Map();

  constructor(maxEntries?: number) {
    const RBushConstructor = ((RBush as unknown as { default?: typeof RBush }).default ?? RBush) as unknown as new <T>(
      maxEntries?: number
    ) => RBush<T>;
    this.tree = new RBushConstructor<SpatialItem>(maxEntries);
  }

  /**
   * Inserts an item into the spatial index.
   */
  public insert(item: SpatialItem): void {
    this.tree.insert(item);
    this.itemMap.set(`${item.type}_${item.id}`, item);
  }

  /**
   * Bulk loads items into the spatial index.
   */
  public load(items: SpatialItem[]): void {
    this.tree.load(items);
    for (const item of items) {
      this.itemMap.set(`${item.type}_${item.id}`, item);
    }
  }

  /**
   * Removes an item from the index.
   */
  public remove(item: SpatialItem): void {
    this.tree.remove(item);
    this.itemMap.delete(`${item.type}_${item.id}`);
  }

  /**
   * Clears the entire spatial index.
   */
  public clear(): void {
    this.tree.clear();
    this.itemMap.clear();
  }

  /**
   * Searches for items intersecting the given bounding box.
   */
  public search(bbox: BoundingBox): SpatialItem[] {
    return this.tree.search(bbox);
  }

  /**
   * Queries items located within a search radius from a center point.
   */
  public queryRadius(center: Point2D, radius: number): SpatialItem[] {
    return this.search({
      minX: center.x - radius,
      minY: center.y - radius,
      maxX: center.x + radius,
      maxY: center.y + radius,
    });
  }

  /**
   * Returns all indexed items.
   */
  public all(): SpatialItem[] {
    return this.tree.all();
  }

  /**
   * Rebuilds the spatial index from normalized floor plan graph state.
   */
  public rebuild(
    vertices: Record<string, Vertex>,
    walls: Record<string, Wall>
  ): void {
    this.syncFromGraph(vertices, walls);
  }

  /**
   * Syncs the spatial index from normalized floor plan graph state.
   */
  public syncFromGraph(
    vertices: Record<string, Vertex>,
    walls: Record<string, Wall>
  ): void {
    this.clear();
    const items: SpatialItem[] = [];

    // 1. Index Vertices (small bounding box of 2mm)
    for (const vertex of Object.values(vertices)) {
      items.push({
        id: vertex.id,
        type: 'vertex',
        minX: vertex.x - 1,
        minY: vertex.y - 1,
        maxX: vertex.x + 1,
        maxY: vertex.y + 1,
      });
    }

    // 2. Index Walls (bounding box encompassing thickness)
    for (const wall of Object.values(walls)) {
      const startV = vertices[wall.startId];
      const endV = vertices[wall.endId];
      if (!startV || !endV) continue;

      const halfThick = (wall.thickness ?? 150) / 2;
      items.push({
        id: wall.id,
        type: 'wall',
        minX: Math.min(startV.x, endV.x) - halfThick,
        minY: Math.min(startV.y, endV.y) - halfThick,
        maxX: Math.max(startV.x, endV.x) + halfThick,
        maxY: Math.max(startV.y, endV.y) + halfThick,
      });
    }

    this.load(items);
  }
}
