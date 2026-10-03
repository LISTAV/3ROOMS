```markdown
# Agent Task: Step 6 — Planar Face Traversal (Automatic Room & Area Detection)

You are implementing Step 6 of the 2D CAD floor plan engine. In this step, you will implement an automatic planar face traversal algorithm (Half-Edge / DCEL cycle finding) that detects enclosed rooms when walls form closed loops, calculates surface areas in square meters (\(m^2\)), and renders room floor tints with centered dimension labels.

```

---

### Objectives

1. Implement a planar graph cycle-finding algorithm (`roomDetector.ts`) using directed half-edges and counter-clockwise angular traversal.
2. Differentiate internal rooms (counter-clockwise cycles, positive area) from the exterior building envelope (clockwise cycle, negative area).
3. Compute exact room surface areas ($m^2$) and polygon centroids for label placement.
4. Build `RoomRenderer` to draw translucent floor fills and architectural room badges (Name + Area) that stay crisp across zoom levels.
5. Integrate room auto-detection into `planStore` so rooms re-evaluate automatically whenever walls are added, moved, or deleted.
6. Write a comprehensive Vitest test suite (`tests/room.test.ts`) verifying single rooms, multi-room plans with shared interior walls, and non-enclosed open walls.

---

### File Targets

* `src/core/geometry/roomDetector.ts`
* `src/engine/renderer/RoomRenderer.ts`
* `src/core/store/planStore.ts` (update with room state actions)
* `tests/room.test.ts`

---

### Mathematical & Topological Specifications

#### 1. Planar Cycle Finding Algorithm (`src/core/geometry/roomDetector.ts`)

Create a pure module that extracts all minimal enclosed polygonal faces from the planar graph:

```typescript
import type { Point2D, Vertex, Wall, RoomFace } from '../types';

export interface DetectedRoom {
  id: string;
  vertexIds: string[]; // Ordered counter-clockwise
  points: Point2D[];   // World coordinates of polygon boundary
  wallIds: string[];   // Walls forming the perimeter
  areaMm2: number;     // Absolute area in mm²
  centroid: Point2D;   // Centroid for label placement
}

```

Implement the core cycle detector:

```typescript
export function detectRooms(
  vertices: Record,
  walls: Record
): DetectedRoom[]

```

**Algorithmic Steps:**

1. **Construct Directed Half-Edges:**
* Every undirected `Wall` between vertex $A$ and vertex $B$ produces two directed half-edges: $A \to B$ and $B \to A$.
* Maintain a key for each directed half-edge: `"\({startId}->\){endId}"`.
* Maintain a `visitedHalfEdges` set (`Set`).


2. **Angular Adjacency Map:**
* For every vertex $V$, find all outgoing half-edges $(V \to W_i)$.
* For each outgoing half-edge, compute its directional angle:



$$\theta = \operatorname{atan2}(W_i.y - V.y, W_i.x - V.x) \quad \text{where } \theta \in (-\pi, \pi]$$

* Sort outgoing half-edges radially at vertex $V$ in **ascending counter-clockwise order** of $\theta$.

3. **Traverse Minimal Cycles (Next-Edge Rule):**
* For each unvisited half-edge $e_{\text{start}} = (u \to v)$:
* Initialize cycle path: `[u]`.
* Current half-edge: $curr = (u \to v)$.
* Loop:
* Mark $curr$ as visited in `visitedHalfEdges`.
* Add vertex $v$ to path.
* At vertex $v$, find the incoming direction from $u$:







$$\theta_{\text{in}} = \operatorname{atan2}(u.y - v.y, u.x - v.x)$$

```
   - In the sorted list of outgoing half-edges from \(v\), select the edge that comes **immediately counter-clockwise after \(\theta_{\text{in}}\)** (the first outgoing edge with angle greater than \(\theta_{\text{in}}\), wrapping to the beginning of the list if necessary). Let this be \((v \to w)\).
   - Advance: \(u = v, v = w, curr = (v \to w)\).
   - Stop when \(curr === e_{\text{start}}\) or when cycle length exceeds total wall count \(\times 2\) (guard against non-manifold infinite loops).

```

4. **Filter Enclosed Rooms vs. Exterior Envelope:**
* If the cycle returned to $e_{\text{start}}$ with $\ge 3$ vertices:
* Remove duplicate trailing vertex from path.
* Extract ordered `Point2D` array from vertex IDs.
* Calculate signed area using `calculateShoelaceArea(points)`:





$$A_{\text{signed}} = \frac{1}{2} \sum_{i=0}^{n-1} (x_i y_{i+1} - x_{i+1} y_i)$$

```
 - **Room Condition:** \(A_{\text{signed}} > 0\) indicates a counter-clockwise minimal enclosed face (**Internal Room**).
 - **Exterior Condition:** \(A_{\text{signed}} \le 0\) indicates a clockwise perimeter enclosing the entire floor plan from outside (**Exterior Building Envelope**). Discard this cycle.
 - **Area Filter:** Discard small degenerate cycles where area \(< 100,000\,\text{mm}^2\) (\(0.1\,\text{m}^2\)).

```

5. **Compute Polygon Centroid:**
* Calculate polygon centroid using the standard formula for non-self-intersecting closed polygons:



$$C_x = \frac{1}{6A} \sum_{i=0}^{n-1} (x_i + x_{i+1})(x_i y_{i+1} - x_{i+1} y_i)$$

$$C_y = \frac{1}{6A} \sum_{i=0}^{n-1} (y_i + y_{i+1})(x_i y_{i+1} - x_{i+1} y_i)$$

* If $A \approx 0$, fall back to bounding box center.

---

#### 2. Room State Integration (`src/core/store/planStore.ts`)

Update `planStore` to keep room detections synchronized with graph mutations:

* Add a helper `recomputeRooms()` inside the store:
* Invoked automatically after `addWall`, `moveVertex`, `splitWallAtPoint`, and `deleteElements`.
* Calls `detectRooms(state.vertices, state.walls)`.
* Preserves custom user labels if an existing room's geometry remains equivalent (e.g. matching vertex set).
* Updates `state.rooms: Record`.



---

#### 3. Room Floor & Label Renderer (`src/engine/renderer/RoomRenderer.ts`)

Implement `RoomRenderer`:

```typescript
export class RoomRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    rooms: Record,
    vertices: Record,
    selectedRoomId: string | null,
    zoom: number
  ): void
}

```

**Styling & Rendering Details:**

* **Floor Fill:**
* For each room, draw closed polygon path through its ordered vertices.
* Fill with a subtle architectural tint: `rgba(241, 245, 249, 0.7)` (slate-100) or `rgba(59, 130, 246, 0.05)` (subtle blue).
* If selected: highlight fill with `rgba(59, 130, 246, 0.15)` and draw a dashed inner outline in `#3b82f6`.


* **Architectural Room Badge:**
* Positioned at room `centroid`.
* Draw semi-transparent pill or badge background (`rgba(255, 255, 255, 0.85)` with subtle rounded border) so text is clearly readable over grid lines.
* **Room Name:** Font `13px Inter, system-ui`, bold, color `#1e293b` (slate-800).
* Default label: `"Room"` or numbered `"Room 1"`.


* **Area Text:** Font `11px Inter, system-ui`, regular, color `#64748b` (slate-500).
* Format: `(areaMm2 / 1_000_000).toFixed(2) + " m²"`.


* Typography and badge padding must scale inversely with zoom ($1 / \text{zoom}$) so text remains readable and fixed in screen pixels.



---

### Verification Suite (`tests/room.test.ts`)

Write unit tests covering:

1. **Single Rectangular Room (4 walls):**
* Vertices at $(0,0)$, $(4000,0)$, $(4000,3000)$, $(0,3000)$.
* Verify exactly **1** room detected.
* Verify area equals exactly $12,000,000\,\text{mm}^2$ ($12.00\,\text{m}^2$).
* Verify centroid is at $(2000, 1500)$.
* Verify exterior clockwise cycle is cleanly discarded.


2. **Two Adjacent Rooms Sharing a Wall (7 walls):**
* Room 1 ($4\text{m} \times 3\text{m}$) sharing its right wall with Room 2 ($3\text{m} \times 3\text{m}$).
* Total walls: 7. Shared wall connected to both rooms.
* Verify exactly **2** distinct rooms detected with areas $12.00\,\text{m}^2$ and $9.00\,\text{m}^2$.
* Verify the shared wall ID exists in both rooms' `wallIds`.


3. **Open / Non-Enclosed Walls:**
* 3 walls forming a "U" shape (no 4th wall closing the loop).
* Verify **0** rooms detected.


4. **Dead-End Spur Wall Inside a Room:**
* Enclosed $5\text{m} \times 5\text{m}$ room with an interior partition wall attached to one side but not closing any sub-loop.
* Verify only the parent enclosed room is detected; spur wall does not crash traversal or create degenerate faces.



---

### Quality Standards

* Pure topological traversal: `detectRooms` must be completely headless and deterministic.
* Zero infinite loops: cycle traversal must include a visit-guard and iteration ceiling.
* Strict TypeScript typing (`noImplicitAny: true`).
* Ensure all tests pass and compiler checks clean:
```bash
npm run test
npx tsc --noEmit

```



```

```