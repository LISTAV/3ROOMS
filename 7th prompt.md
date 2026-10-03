```markdown
# Agent Task: Step 7 — Openings Pipeline (Doors & Windows Slicing Walls)

You are implementing Step 7 of the 2D CAD floor plan engine. In this step, you will build parametric wall openings (single swing doors, double doors, and sliding/hung windows), dynamically punch slots through solid wall polygons, and render architectural CAD symbols (door leaves, swing radius arcs, and window sills/glazing).

```

---

### Objectives

1. Implement parametric opening calculations (`src/core/geometry/openings.ts`) that resolve world coordinates, orientation vectors, and linear cutout spans along a parent wall.
2. Update the wall polygon generation pipeline to cleanly slice openings out of solid wall polygons, capping cutout edges with perpendicular wall jambs.
3. Implement `OpeningTool` for interactive placement: hovering over a wall projects the opening onto the segment, displays a live preview, and clicking anchors the opening to the wall.
4. Build `OpeningRenderer` to draw architectural 2D symbols:
* **Single Door:** $90^\circ$ open leaf rectangle and circular dashed swing arc with flip support (`flipH` / `flipV`).
* **Double Door:** Dual meeting leaves with dual swing arcs.
* **Window:** Wall opening cutout with outer sill and dual parallel thin glass lines.


5. Add selection, dragging (sliding along wall), and toggle commands (flip swing / flip interior-exterior side).
6. Write a comprehensive Vitest test suite (`tests/openings.test.ts`) verifying parametric spans, projection clamping, and opening cutouts.

---

### File Targets

* `src/core/geometry/openings.ts`
* `src/engine/tools/OpeningTool.ts`
* `src/engine/renderer/OpeningRenderer.ts`
* `src/engine/renderer/WallRenderer.ts` (update cutout slicing pass)
* `tests/openings.test.ts`

---

### Mathematical & Topological Specifications

#### 1. Parametric Opening Math (`src/core/geometry/openings.ts`)

Openings do not exist as independent floating objects; they are parametrically anchored to a parent `Wall`:

```typescript
import type { Point2D, Wall, Vertex, Opening, OpeningType } from '../types';

export interface OpeningGeometry {
  openingId: string;
  wallId: string;
  center: Point2D;
  spanStart: Point2D;      // World point where opening begins along wall
  spanEnd: Point2D;        // World point where opening ends along wall
  unitVector: Point2D;     // Direction vector along the wall (start -> end)
  normalVector: Point2D;   // Perpendicular normal vector
  width: number;
  wallThickness: number;
  type: OpeningType;
  flipH: boolean;          // Invert swing direction (hinge at start vs hinge at end)
  flipV: boolean;          // Invert swing side (open inside vs open outside)
}

```

Implement the calculation functions:

```typescript
export function computeOpeningGeometry(
  opening: Opening,
  wall: Wall,
  vertices: Record
): OpeningGeometry | null

```

**Calculation Steps:**

1. Retrieve endpoints $V_s$ and $V_e$ of the parent wall.
2. Compute wall vector $\vec{W} = V_e - V_s$, total wall length $L = \Vert{}\vec{W}\Vert{}$, and unit direction $\vec{u} = \frac{\vec{W}}{L}$.
3. Guard minimum wall length: if $L < \text{opening.width}$, opening cannot fit; clamp width or return `null`.
4. Calculate center point from `offsetRatio` ($t \in [0.0, 1.0]$):

$$\text{center} = V_s + \vec{u} \cdot (t \cdot L)$$

5. **Boundary Margin Clamping:**
* To keep door jambs structurally sound, openings must not overlap corner miters.
* Clamp center position so the opening maintains at least a half-thickness margin from both wall ends:



$$\text{margin} = \frac{\text{wall.thickness}}{2} + \frac{\text{opening.width}}{2}$$

$$\text{centerDistance} = \operatorname{clamp}(t \cdot L, \text{margin}, L - \text{margin})$$

$$\text{center} = V_s + \vec{u} \cdot \text{centerDistance}$$

6. Compute cutout endpoints along the centerline:

$$\text{spanStart} = \text{center} - \vec{u} \cdot \frac{\text{opening.width}}{2}$$

$$\text{spanEnd} = \text{center} + \vec{u} \cdot \frac{\text{opening.width}}{2}$$

---

#### 2. Wall Slicing Algorithm (`src/core/geometry/openings.ts`)

When a wall has $K$ openings:

1. Sort openings along the wall in ascending order of their distance from $V_s$.
2. Segment the parent wall into solid wall chunks:
* Chunk 0: from wall start $V_s$ to Opening 1 `spanStart`.
* Chunk $i$: from Opening $i$ `spanEnd` to Opening $i+1$ `spanStart`.
* Chunk $K$: from Opening $K$ `spanEnd` to wall end $V_e$.


3. For each solid chunk:
* Construct its boundary polygon using the wall thickness and appropriate end caps (mitered corners at $V_s$ and $V_e$, flat perpendicular jamb caps at `spanStart` and `spanEnd`).


4. Result: the single wall polygon is rendered as segmented sub-polygons with empty rectangular voids where openings reside.

---

#### 3. Interactive Opening Tool (`src/engine/tools/OpeningTool.ts`)

Implement `OpeningTool` conforming to the `Tool` interface:

* **State:**
* `openingType: OpeningType` (default: `'single_door'`)
* `defaultWidth: number` (doors: $900\,\text{mm}$, windows: $1200\,\text{mm}$)
* `hoverWallId: string | null`
* `previewOffsetRatio: number`
* `flipH: boolean = false`
* `flipV: boolean = false`


* **Interaction Flow:**
* **`onPointerMove`:**
* Query spatial index for walls within a screen hover threshold ($15\,\text{px} / \text{zoom}$).
* If hovering near a wall:
* Project cursor onto the wall centerline using `projectPointOnSegment()`.
* Store `hoverWallId` and projected ratio `t`.
* Request render.


* If not near any wall: clear `hoverWallId`.


* **`onPointerDown`:**
* If `hoverWallId` exists:
* Commit new opening to `planStore`:
```typescript
planStore.getState().addOpening({
  wallId: hoverWallId,
  offsetRatio: previewOffsetRatio,
  width: defaultWidth,
  type: openingType,
  flipH,
  flipV
});

```


* Re-render canvas.




* **`onKeyDown`:**
* Pressing `F` or `Space` toggles `flipH` (swing direction).
* Pressing `V` toggles `flipV` (open inside vs. outside).
* Pressing `Escape` deactivates tool and returns to `'select'`.





---

#### 4. CAD Architectural Opening Renderer (`src/engine/renderer/OpeningRenderer.ts`)

Render openings in world coordinates using standard 2D drafting conventions:

```typescript
export class OpeningRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    openings: Record,
    walls: Record,
    vertices: Record,
    selectedOpeningIds: string[],
    zoom: number
  ): void
}

```

**Symbol Rendering Details:**

1. **Jamb End-Caps:**
* Draw thin lines along the opening borders perpendicular to the wall axis in `#0f172a` (stroke width $1.5\,\text{px} / \text{zoom}$).


2. **Single Swing Door:**
* **Hinge & Latch Points:**
* If `!flipH`: Hinge is at `spanStart`, swings toward `spanEnd`.
* If `flipH`: Hinge is at `spanEnd`, swings toward `spanStart`.


* **Door Leaf:**
* Rectangular leaf rotated $90^\circ$ from the wall vector into the swing side determined by `flipV`.
* Leaf dimensions: length $= \text{width}$, thickness $= 35\,\text{mm}$.
* Fill: `#ffffff`, stroke: `#0f172a` ($1\,\text{px} / \text{zoom}$).


* **Swing Arc:**
* Centered on the hinge point with radius $= \text{width}$.
* Draw a $90^\circ$ quarter-circle arc connecting the open leaf tip back to the opposite door jamb.
* Stroke: `#94a3b8` (slate-400), dashed line `ctx.setLineDash([3 / zoom, 3 / zoom])`, width $1\,\text{px} / \text{zoom}$.




3. **Double Door:**
* Two meeting leaves hinged at `spanStart` and `spanEnd`, each of width $\frac{\text{width}}{2}$.
* Two symmetric $90^\circ$ dashed swing arcs meeting at the center.


4. **Window:**
* Draw two parallel sill lines connecting the outer wall miter boundaries across the opening span in `#64748b` (slate-500).
* Draw one (or two) thin centered glass pane line(s) along the wall centerline in `#38bdf8` (sky-400) or `#0f172a`, stroke width $1.5\,\text{px} / \text{zoom}$.


5. **Selection Highlight:**
* If opening is selected: draw a glowing accent box in `#3b82f6` around the opening span with small flip handle buttons.



---

### Verification Suite (`tests/openings.test.ts`)

Write Vitest unit tests verifying:

1. **Offset Projection & Clamping:**
* $4000\,\text{mm}$ wall with thickness $200\,\text{mm}$ and opening width $900\,\text{mm}$.
* Safe margin $= 100 + 450 = 550\,\text{mm}$.
* Cursor placed at ratio $0.05$ ($200\,\text{mm}$) clamps center distance to $550\,\text{mm}$ ($t = 0.1375$).
* Cursor placed at center ($t = 0.5$) maintains center at $2000\,\text{mm}$.


2. **Span Calculations:**
* At center $2000\,\text{mm}$ with width $900\,\text{mm}$, verify `spanStart` is at $1550\,\text{mm}$ and `spanEnd` is at $2450\,\text{mm}$.


3. **Wall Segment Slicing:**
* A $5000\,\text{mm}$ wall with two doors ($900\,\text{mm}$ each) at $t = 0.25$ and $t = 0.75$.
* Verify that wall polygon generation produces **3** distinct solid wall polygons with correct gaps.


4. **Flip State Logic:**
* Verify hinge and latch coordinates swap correctly when `flipH` changes.
* Verify normal vector direction negates when `flipV` changes.



---

### Quality Standards

* No visual collision: openings must never bleed past wall corners or overlap adjacent openings.
* Strict TypeScript typing (`noImplicitAny: true`).
* Ensure all tests pass and compiler checks clean:
```bash
npm run test
npx tsc --noEmit

```



```

```