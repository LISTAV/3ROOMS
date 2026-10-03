import type { Point2D, Vertex, Wall } from '../types.js';
import { calculateShoelaceArea, getPolygonCentroid } from '../math/polygon.js';

export interface DetectedRoom {
  id: string;
  name?: string;
  vertexIds: string[]; // Ordered counter-clockwise
  points: Point2D[];   // World coordinates of polygon boundary
  wallIds: string[];   // Walls forming the perimeter
  areaMm2: number;     // Absolute area in mm²
  centroid: Point2D;   // Centroid for label placement
}

interface OutgoingHalfEdge {
  fromId: string;
  toId: string;
  wallId: string;
  angle: number; // Radial angle in radians (-PI to PI]
}

/**
 * Detects all minimal enclosed planar rooms from the wall graph using
 * DCEL / Half-Edge counter-clockwise angular traversal.
 * Discards exterior building envelope (clockwise cycles) and dead-end spurs.
 */
export function detectRooms(
  vertices: Record<string, Vertex>,
  walls: Record<string, Wall>
): DetectedRoom[] {
  // -------------------------------------------------------------------------
  // 1. Filter out dead-end spurs and open trees (Degree < 2 pruning)
  // -------------------------------------------------------------------------
  // Any vertex with degree < 2 cannot bound an enclosed room face.
  const activeWallMap = new Map<string, Wall>();
  for (const [id, wall] of Object.entries(walls)) {
    // Discard zero-length walls or walls with missing endpoints
    if (
      wall.startId !== wall.endId &&
      vertices[wall.startId] &&
      vertices[wall.endId]
    ) {
      activeWallMap.set(id, wall);
    }
  }

  // Iteratively prune degree-1 leaf vertices
  let changed = true;
  while (changed) {
    changed = false;
    const degreeMap = new Map<string, number>();

    for (const wall of activeWallMap.values()) {
      degreeMap.set(wall.startId, (degreeMap.get(wall.startId) ?? 0) + 1);
      degreeMap.set(wall.endId, (degreeMap.get(wall.endId) ?? 0) + 1);
    }

    for (const [wallId, wall] of Array.from(activeWallMap.entries())) {
      const degStart = degreeMap.get(wall.startId) ?? 0;
      const degEnd = degreeMap.get(wall.endId) ?? 0;

      if (degStart < 2 || degEnd < 2) {
        activeWallMap.delete(wallId);
        changed = true;
      }
    }
  }

  if (activeWallMap.size < 3) {
    return [];
  }

  // -------------------------------------------------------------------------
  // 2. Build Directed Half-Edges & Angular Adjacency Map
  // -------------------------------------------------------------------------
  const outgoingMap = new Map<string, OutgoingHalfEdge[]>();

  for (const wall of activeWallMap.values()) {
    const vA = vertices[wall.startId];
    const vB = vertices[wall.endId];

    // Half-edge A -> B
    const angleAB = Math.atan2(vB.y - vA.y, vB.x - vA.x);
    if (!outgoingMap.has(wall.startId)) outgoingMap.set(wall.startId, []);
    outgoingMap.get(wall.startId)!.push({
      fromId: wall.startId,
      toId: wall.endId,
      wallId: wall.id,
      angle: angleAB,
    });

    // Half-edge B -> A
    const angleBA = Math.atan2(vA.y - vB.y, vA.x - vB.x);
    if (!outgoingMap.has(wall.endId)) outgoingMap.set(wall.endId, []);
    outgoingMap.get(wall.endId)!.push({
      fromId: wall.endId,
      toId: wall.startId,
      wallId: wall.id,
      angle: angleBA,
    });
  }

  // Sort outgoing half-edges at each vertex in counter-clockwise order
  for (const edges of outgoingMap.values()) {
    edges.sort((a, b) => a.angle - b.angle);
  }

  // -------------------------------------------------------------------------
  // 3. Traverse Minimal Planar Cycles
  // -------------------------------------------------------------------------
  const visitedHalfEdges = new Set<string>();
  const detectedRooms: DetectedRoom[] = [];
  const seenRoomKeys = new Set<string>();
  let roomCounter = 1;

  for (const edges of outgoingMap.values()) {
    for (const startEdge of edges) {
      const startKey = `${startEdge.fromId}->${startEdge.toId}`;
      if (visitedHalfEdges.has(startKey)) continue;

      // Begin cycle traversal
      let curr = startEdge;
      const cycleVertices: string[] = [curr.fromId];
      const cycleWalls: string[] = [curr.wallId];
      const cycleHalfEdges: string[] = [startKey];

      const maxSteps = activeWallMap.size * 2 + 4;
      let closed = false;

      while (cycleVertices.length < maxSteps) {
        visitedHalfEdges.add(`${curr.fromId}->${curr.toId}`);

        const vFrom = vertices[curr.fromId];
        const vTo = vertices[curr.toId];

        // Incoming direction at vTo from vFrom
        const angleIn = Math.atan2(vFrom.y - vTo.y, vFrom.x - vTo.x);

        const nextCandidates = outgoingMap.get(curr.toId);
        if (!nextCandidates || nextCandidates.length === 0) break;

        // In standard Cartesian coordinates (+y up), to traverse an internal face counter-clockwise
        // with the interior on our left, we must take the sharpest left turn at vertex vTo.
        // Relative to the reverse incoming ray (angleIn = vTo -> vFrom), taking the sharpest left
        // turn corresponds to the outgoing edge immediately clockwise from angleIn (i.e. angle < angleIn).
        let nextEdge: OutgoingHalfEdge | null = null;
        for (let i = nextCandidates.length - 1; i >= 0; i--) {
          if (nextCandidates[i].angle < angleIn - 1e-7) {
            nextEdge = nextCandidates[i];
            break;
          }
        }
        // If no candidate has angle < angleIn, wrap around to the edge with the largest angle
        if (!nextEdge) {
          nextEdge = nextCandidates[nextCandidates.length - 1];
        }

        const nextKey = `${nextEdge.fromId}->${nextEdge.toId}`;
        if (nextKey === startKey) {
          closed = true;
          break;
        }

        // Avoid infinite loop if hitting an internal repeat
        if (cycleHalfEdges.includes(nextKey)) {
          break;
        }

        cycleVertices.push(nextEdge.fromId);
        cycleWalls.push(nextEdge.wallId);
        cycleHalfEdges.push(nextKey);
        curr = nextEdge;
      }

      if (!closed || cycleVertices.length < 3) continue;

      // Extract points
      const points = cycleVertices.map((vId) => ({
        x: vertices[vId].x,
        y: vertices[vId].y,
      }));

      // Calculate signed Shoelace area
      const signedArea = calculateShoelaceArea(points);

      // Positive area indicates counter-clockwise internal face (Room)
      // Negative area indicates clockwise exterior building envelope -> discard!
      if (signedArea > 100000) {
        // Minimum room threshold: 0.1 m² (100,000 mm²)
        // Canonical room key based on sorted vertex IDs to prevent duplicate entries
        const canonicalKey = [...cycleVertices].sort().join('-');
        if (!seenRoomKeys.has(canonicalKey)) {
          seenRoomKeys.add(canonicalKey);

          const centroid = getPolygonCentroid(points);
          // Unique wall IDs in cycle
          const uniqueWallIds = Array.from(new Set(cycleWalls));

          detectedRooms.push({
            id: `room_${roomCounter}`,
            name: `Room ${roomCounter}`,
            vertexIds: cycleVertices,
            points,
            wallIds: uniqueWallIds,
            areaMm2: signedArea,
            centroid,
          });

          roomCounter++;
        }
      }
    }
  }

  return detectedRooms;
}
