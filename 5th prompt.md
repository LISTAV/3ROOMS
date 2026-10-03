#5th prompt.md
```markdown
# Agent Task: Step 5 — Wall Mitering & Solid Polygon Offsetting

You are implementing Step 5 of the 2D CAD floor plan engine. In this step, you will transform 1D centerline graph edges into solid 2D polygonal walls with configurable thickness, calculating clean geometric corner miters where walls meet at shared vertices.

```

---

### Objectives

1. Implement corner miter calculations (`miter.ts`) that compute exact polygon boundary vertices for walls meeting at shared junctions (L-corners, T-junctions, cross-intersections, collinear joins, and dead-ends).
2. Implement miter limit clamping (bevel fallback) to prevent extreme geometric spikes on sharp acute angles.
3. Build `WallRenderer` to render solid wall bodies, clean exterior contour strokes, and seamless interior corner transitions without dividing seams across connected joints.
4. Add selection highlighting for active walls.
5. Write a comprehensive Vitest test suite (`tests/miter.test.ts`) verifying miter calculations across orthogonal, collinear, acute, and multi-wall junctions.

---

### File Targets

* `src/core/geometry/miter.ts`
* `src/engine/renderer/WallRenderer.ts`
* `tests/miter.test.ts`

---

### Mathematical & Topological Specifications

#### 1. Wall Polygon Representation

Each wall edge connects `startVertex` ($V_s$) and `endVertex` ($V_e$) with thickness $T$. A standalone wall without connected corners is a rectangle defined by 4 points:

* Left-Start ($LS$), Left-End ($LE$), Right-End ($RE$), Right-Start ($RS$).
* Left and right are determined relative to the directed vector $\vec{d} = \operatorname{normalize}(V_e - V_s)$ and normal $\vec{n} = (-d_y, d_x)$:

$$\text{Left Offset} = \vec{n} \cdot \frac{T}{2}, \quad \text{Right Offset} = -\vec{n} \cdot \frac{T}{2}$$

When walls meet at a shared vertex $V$, their boundary offsets intersect to form mitered corner points.

---

#### 2. Corner Miter Algorithm (`src/core/geometry/miter.ts`)

Create a pure module that computes the adjusted boundary points for all walls connected to a vertex:

```typescript
export interface WallEndpointMiter {
  wallId: string;
  isStart: boolean;        // true if vertex is wall's startId, false if endId
  leftPoint: Point2D;      // Adjusted boundary corner on left side (relative to wall direction)
  rightPoint: Point2D;     // Adjusted boundary corner on right side
  bevelPoints?: Point2D[]; // Optional points if miter limit triggered a bevel cut
}

export interface WallPolygon {
  wallId: string;
  polygon: Point2D[];      // Ordered counter-clockwise boundary points
}

```

Implement the core resolution function:

```typescript
export function computeVertexMiters(
  vertex: Vertex,
  connectedWalls: Wall[],
  allVertices: Record,
  miterLimitMultiplier: number = 2.5
): WallEndpointMiter[]

```

**Algorithmic Steps:**

1. **Degree 0 (Isolated Wall / Detached Vertex):**
* Fall back to standard perpendicular end cap: offset directly along normal $\pm \vec{n} \cdot \frac{T}{2}$.


2. **Degree 1 (Dead-End / Wall Termination):**
* The end of a single wall terminates with a square cap perpendicular to the wall direction:



$$P_{\text{left}} = V + \vec{n} \cdot \frac{T}{2}, \quad P_{\text{right}} = V - \vec{n} \cdot \frac{T}{2}$$

3. **Degree 2+ (Corners, T-Junctions, Multi-Way Intersections):**
* For every connected wall $i$, compute its unit vector pointing **away** from vertex $V$:



$$\vec{d}_i = \operatorname{normalize}(P_{\text{other}} - V)$$

* Compute each wall's radial angle: $\theta_i = \operatorname{atan2}(\vec{d}_i.y, \vec{d}_i.x)$.
* Sort the connected walls in **counter-clockwise order** by $\theta_i$.
* For each consecutive pair of walls $(W_i, W_{i+1})$ around $V$ (wrapping around to the start):
* Compute the **left boundary line** of $W_i$:
* Line passing through $V + \vec{n}_i \cdot \frac{T_i}{2}$ along direction $\vec{d}_i$.


* Compute the **right boundary line** of $W_{i+1}$:
* Line passing through $V - \vec{n}_{i+1} \cdot \frac{T_{i+1}}{2}$ along direction $\vec{d}_{i+1}$.


* Find intersection point $P_{\text{miter}}$ of these two boundary lines using `getLineIntersection()`.
* **Parallel / Collinear Guard ($180^\circ$ continuous walls):**
* If $\vec{d}_i$ and $\vec{d}_{i+1}$ are collinear (angle difference $\approx \pi$), the offset lines are parallel; set $P_{\text{miter}} = V + \vec{n}_i \cdot \frac{T_i}{2}$.


* **Miter Limit Clamping (Spike Guard):**
* Compute distance $d = \operatorname{distance}(V, P_{\text{miter}})$.
* If $d > \text{miterLimitMultiplier} \times \max(T_i, T_{i+1})$ (acute corner spike):
* Clamp the miter by slicing the sharp tip into a flat bevel edge perpendicular to the angle bisector.




* Assign $P_{\text{miter}}$ as:
* The `leftPoint` of $W_i$ at vertex $V$.
* The `rightPoint` of $W_{i+1}$ at vertex $V$.





---

#### 3. Full Wall Mesh Assembly (`src/core/geometry/miter.ts`)

Implement `generateWallPolygons`:

```typescript
export function generateWallPolygons(
  vertices: Record,
  walls: Record
): Record

```

* Iterates over all vertices and calls `computeVertexMiters()`.
* For each wall, pairs its start-endpoint miters ($LS, RS$) with its end-endpoint miters ($LE, RE$).
* Assembles the closed polygon in counter-clockwise winding order:
`[LS, LE, (optional end bevels), RE, RS, (optional start bevels)]`.

---

#### 4. Solid Wall Renderer (`src/engine/renderer/WallRenderer.ts`)

Create `WallRenderer` to draw computed polygons onto the canvas:

* **Render Pass Structure:**
```typescript
export class WallRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    wallPolygons: Record,
    selectedWallIds: string[],
    zoom: number
  ): void
}

```


* **Styling Specs:**
* **Wall Body Fill:** Solid `#334155` (slate-700) or clean architectural `#475569`.
* **Outer Contour Lines:** `#0f172a` (slate-900), fixed stroke width of $1.5\,\text{px}$ in screen space (`lineWidth = 1.5 / zoom`).
* **Joint Seam Elimination:** Draw all solid fills first, then draw boundary strokes. Since miter points coincide at vertices, adjacent walls merge seamlessly into a single visual structure.
* **Selection Highlight:** If a wall's ID is in `selectedWallIds`:
* Draw an outer accent glow or stroke in `#3b82f6` (blue-500) with line width $3\,\text{px} / \text{zoom}$.


* **Centerline Gizmo (Optional/Debug):** Thin dashed centerline in `#94a3b8` with endpoints rendered as small circular handles (radius $4\,\text{px} / \text{zoom}$) when selected.



---

### Verification Suite (`tests/miter.test.ts`)

Write unit tests covering:

1. **Dead-End Wall (Degree 1):**
* A single horizontal wall from $(0, 0)$ to $(1000, 0)$ with thickness $100\,\text{mm}$.
* Start miter points: Left $=(0, 50)$, Right $=(0, -50)$.
* End miter points: Left $=(1000, 50)$, Right $=(1000, -50)$.


2. **Orthogonal L-Corner (90°):**
* Wall 1: $(0, 1000) \to (0, 0)$, Wall 2: $(0, 0) \to (1000, 0)$, thickness $= 200\,\text{mm}$.
* Outer corner miter at $(0, 0)$ must intersect at exactly $(-100, -100)$.
* Inner corner miter must intersect at $(100, 100)$.


3. **Collinear Continuous Wall (180°):**
* Wall 1: $(0, 0) \to (1000, 0)$, Wall 2: $(1000, 0) \to (2000, 0)$, thickness $= 150\,\text{mm}$.
* Shared vertex at $(1000, 0)$ must maintain parallel boundaries at $y = 75$ and $y = -75$ without distortion.


4. **Acute Angle Miter Limit Clamping:**
* Two walls meeting at a $20^\circ$ acute angle.
* Verify miter distance clamp activates, producing a bevel instead of a spike exceeding the limit threshold.


5. **T-Junction (3 Walls Meeting):**
* Continuous wall along X-axis with a perpendicular wall meeting at $(1000, 0)$.
* Verify that all three walls produce bounded, non-degenerate polygons.



---

### Quality Standards

* Pure mathematical functions: no Canvas rendering dependencies inside `src/core/geometry/miter.ts`.
* Numerical stability: use an epsilon tolerance ($10^{-6}$) for parallel line checks to prevent `NaN` or division-by-zero crashes.
* Strict TypeScript typing (`noImplicitAny: true`).
* Ensure all tests pass and compiler checks clean:
```bash
npm run test
npx tsc --noEmit

```



```

```