You are building Step 3 of the 2D CAD floor plan engine: The Planar Graph Store and the Multi-Target Snapping Engine.

Do not write canvas drawing code or UI components yet. Focus strictly on normalized graph state transitions, spatial indexing with R-Tree, and magnetic snap math.

### Objectives
1. Implement a normalized reactive store (using Zustand or a vanilla event-emitter store) managing the planar graph (`vertices`, `walls`, and `openings`).
2. Implement graph integrity methods: automatic vertex merging (sharing nodes at joints), wall splitting, and cascading vertex moves.
3. Implement a high-performance spatial snapping engine (`SnapEngine`) using `rbush` that handles:
   - Screen-radius-aware vertex snapping (magnetic corners).
   - Edge/wall projection snapping (sliding along an existing wall).
   - Dynamic alignment guidelines (Figma-style horizontal/vertical raycasts from nearby vertices).
   - Orthogonal axis lock (0°, 45°, 90°, 180° when Shift is held).
   - Configurable millimeter grid snapping.
4. Write comprehensive Vitest unit tests verifying state mutations, graph topological integrity, and snapping precedence.

---

### 1. Planar Graph Store (`src/core/store/planStore.ts`)
Create a normalized store using Zustand:

- **State Schema:**
  - `vertices: Record<string, Vertex>`
  - `walls: Record<string, Wall>`
  - `openings: Record<string, Opening>`
  - `selectedIds: string[]`

- **Core Actions:**
  - `getOrCreateVertex(x: number, y: number, toleranceMm?: number): Vertex`:
    Checks if a vertex already exists within `toleranceMm` (default 5mm). If found, returns the existing vertex to ensure walls automatically share endpoints. If not, creates and stores a new one.
  - `addWall(startPoint: Point2D, endPoint: Point2D, thickness?: number): Wall | null`:
    Uses `getOrCreateVertex` for both ends. Rejects zero-length walls. Connects the two vertices with a `Wall` entry.
  - `moveVertex(vertexId: string, newPosition: Point2D): void`:
    Updates vertex coordinates. Because walls reference vertex IDs, all connected walls automatically pivot without needing manual updates.
  - `splitWallAtPoint(wallId: string, splitPoint: Point2D): { newVertexId: string; wall1Id: string; wall2Id: string }`:
    Splits an existing wall into two connected wall segments sharing a new vertex at `splitPoint`. Preserves original wall thickness.
  - `deleteElements(ids: string[]): void`:
    Removes specified walls and openings. Cleans up orphaned vertices (vertices that have zero connected walls remaining).

---

### 2. Spatial Indexing Wrapper (`src/core/spatial/SpatialIndex.ts`)
Wrap `rbush` (or implement an R-Tree wrapper) to index entities in 2D bounding boxes:

- Define index item:
  ```typescript
  interface SpatialItem {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    id: string;
    type: 'vertex' | 'wall';
  }