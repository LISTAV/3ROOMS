### Step 8: SVG Furniture Catalog & Asset Placement

```markdown
You are implementing the furniture and architectural symbol system for the 2D CAD floor plan engine. This includes the asset data contract, an in-memory SVG symbol registry, interactive drag-and-drop/placement on the Canvas 2D viewport, and a selection/transform gizmo.

### Objectives
1. Extend the data model and Zustand store to support furniture instances.
2. Build an asset manager that loads, caches, and renders SVG architectural symbols onto an immediate-mode Canvas 2D context.
3. Implement interactive placement, selection hit-testing, dragging, and a rotation/scale gizmo.
4. Add basic keyboard controls (Delete, R to rotate 45°/90°).

---

### 1. Data Contract Extension (`src/core/types.ts`)
Add the following interfaces to the existing type definitions:

```typescript
export interface FurnitureDefinition {
  id: string;              // e.g., 'bed_queen', 'sofa_3seater', 'dining_table_round'
  name: string;            // Display name
  category: 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'doors_windows';
  defaultWidthMm: number;  // Real-world width in millimeters
  defaultHeightMm: number; // Real-world height/depth in millimeters
  svgContent: string;      // Raw inline SVG markup
}

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

```

Update `FloorPlanState` to include:

* `furniture: Record<string, FurnitureInstance>`
* `selectedFurnitureId: string | null`

---

### 2. Asset Loader & Texture Cache (`src/core/assets/AssetManager.ts`)

Canvas 2D cannot render raw SVG strings directly without conversion. Build an `AssetManager` singleton to parse and cache them into drawable image sources:

1. Maintain an internal `Map<string, HTMLImageElement | ImageBitmap>` cache keyed by `defId`.
2. When registering a definition:
* Convert `svgContent` to a base64 Data URL or Blob URL (`URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))`).
* Load it asynchronously into an `Image` element and cache it.


3. Fallback Rendering: If an image is still loading or fails, render a labeled placeholder rectangle with the dimensions `(width, height)` centered on `(x, y)`.
4. Provide a default built-in catalog of at least 5 standard architectural symbols (clean, minimalist top-down vector CAD lines):
* `sofa_3seater` (2200mm × 900mm)
* `bed_queen` (1600mm × 2000mm)
* `dining_table_6` (1800mm × 900mm)
* `kitchen_sink_double` (800mm × 500mm)
* `toilet` (450mm × 700mm)



---

### 3. Rendering Pipeline (`src/engine/layers/FurnitureLayer.ts`)

Integrate furniture rendering into the canvas render loop:

* Execution order: Room fills → **FurnitureLayer** → Wall Layer → Dimension Layer → Gizmo Layer.
* For each `FurnitureInstance`:
1. `ctx.save()`
2. `ctx.translate(instance.x, instance.y)`
3. `ctx.rotate(instance.rotation)`
4. Draw the cached image centered at `(-instance.width / 2, -instance.height / 2, instance.width, instance.height)`.
5. `ctx.restore()`



---

### 4. Selection & Transform Gizmo (`src/engine/tools/FurnitureTool.ts`)

When a furniture item is selected (`selectedFurnitureId !== null`):

1. **Bounding Box:** Draw a thin accent-colored bounding box around the oriented item.
2. **Rotation Handle:** Render a circular handle offset above the top edge by 300mm (world space) connected by a stalk line.
3. **Corner Scale Handles:** 4 small square corner handles for proportional resizing.
4. **Hit Testing:**
* To hit-test an arbitrary point $(P_x, P_y)$ against a rotated item centered at $(C_x, C_y)$ with angle $\theta$:
* Transform $P$ into local object space:

$$P_{\text{local}} = R(-\theta) \cdot (P - C)$$


* Check if $P_{\text{local}}$ lies within the unrotated box: $[-w/2, w/2] \times [-h/2, h/2]$.
* Check distance from $P_{\text{local}}$ to the rotation handle position $(0, -h/2 - \text{stalkLength})$.




5. **Dragging:**
* When dragging inside the bounding box: update $(x, y)$. If grid snap is enabled, snap $(x, y)$ to the nearest grid step.
* When dragging the rotation handle: calculate $\theta = \operatorname{atan2}(P_y - C_y, P_x - C_x) + \pi/2$. If Shift is held, snap rotation to $15^\circ$ or $45^\circ$ increments.



---

### 5. Keyboard & Store Actions

Implement the following actions in the store:

* `addFurniture(defId: string, position: Point2D)`
* `updateFurnitureTransform(id: string, updates: Partial<Pick<FurnitureInstance, 'x' | 'y' | 'width' | 'height' | 'rotation'>>)`
* `deleteFurniture(id: string)`
* `selectFurniture(id: string | null)`

Wire keyboard listeners:

* `Delete` or `Backspace`: Delete currently selected furniture item.
* `KeyR`: Rotate selected item by $+45^\circ$ ($+\pi/4$ radians).
* `Escape`: Deselect item.

---

### Verification Requirements

1. Add Vitest unit tests in `tests/furniture.test.ts` verifying:
* The inverse rotation hit-test formula for rotated items ($0^\circ$, $45^\circ$, and $90^\circ$).
* Proper bounds updating when changing dimensions or positions.


2. Ensure `npm run test` and `npx tsc --noEmit` pass with zero errors.

```

---

### Verification Checklist Before Moving to Step 9

1. Run `npm run test` to confirm the local-space inverse rotation hit-test passes.
2. Verify that placing a symbol (e.g., `bed_queen`) renders sharp top-down vectors onto the canvas.
3. Drag the symbol around to confirm it moves smoothly without lagging behind the cursor.
4. Grab the rotation handle and ensure the oriented bounding box and handles follow the rotation angle accurately.

<FollowUp label="Ready for Step 9? Generate the UI Chrome, Dockable Panels & Toolbars prompt." query="Show me Step 9: UI Chrome, Dockable Panels, Inspector & Toolbars implementation prompt for the agentic IDE."/>

```