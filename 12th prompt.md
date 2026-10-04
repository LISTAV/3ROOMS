### Step 12: Universal Asset Transform Gizmo, Line Drawing Tool, Keyboard Guard & Inspector Unit Sync

```markdown
You are resolving critical interaction bugs and adding the Line Annotation Tool and Universal Asset Transform Gizmo to the 2D CAD floor plan engine.

### Objectives
1. Fix the global Backspace/Delete key listener bug that deletes selected canvas entities while typing inside inspector text inputs.
2. Build a Universal Transform Gizmo for the Select Tool: allow rotating and resizing all assets, with live dimension callouts rendered in the user's active preferred unit.
3. Build a Dedicated Line Drawing Tool (`line` tool) with customizable stroke width, color, stroke style (solid, dashed, dotted), and dynamic length measurement tapes.
4. Synchronize the Property Inspector with the active unit system (cm, m, in, ft, ft_in) with two-way parsing/formatting so raw millimeters are never exposed in the UI.

```

---

### 1. Fix: Keyboard Event Guard (`src/engine/input/KeyboardManager.ts` or `src/App.vue`)

#### Root Cause:

Global `keydown` listeners on `window` or `document` intercept `Backspace`, `Delete`, and tool shortcut keys (`W`, `D`, `V`, `G`) even when an `or` element is focused.

#### Implementation:

Create a centralized keyboard guard helper:

```typescript
export function isInputElementActive(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tagName = el.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    (el as HTMLElement).isContentEditable
  );
}

```

In your global keydown listener:

```typescript
window.addEventListener('keydown', (e: KeyboardEvent) => {
  // If the user is currently typing in an input field, DO NOT handle CAD shortcuts
  if (isInputElementActive()) {
    return;
  }

  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    deleteActiveSelection();
  }

  // Handle tool switches (V, W, D, L, etc.) only when not focused on an input
  if (e.key.toLowerCase() === 'v') setActiveTool('select');
  if (e.key.toLowerCase() === 'l') setActiveTool('line');
  // ...
});

```

---

### 2. Universal Asset Resize & Rotate Gizmo (`src/engine/gizmos/TransformGizmo.ts`)

Enhance the Select Tool so that clicking any asset (furniture item, symbol, custom shape) activates a transformation gizmo with the following features:

#### Visual Elements

1. **Oriented Bounding Box:** Renders an accent-colored outline matching the asset's world dimensions and orientation angle $\theta$.
2. **4 Corner Resize Handles:** Small squares ($8\text{px} \times 8\text{px}$) placed at local corners:
* Top-Left: $(-w/2, -h/2)$
* Top-Right: $(w/2, -h/2)$
* Bottom-Right: $(w/2, h/2)$
* Bottom-Left: $(-w/2, h/2)$


3. **Top Rotation Handle:** A circle handle offset upward by $300\,\text{mm}$ (world space) from the top-center edge, connected via a stalk line.
4. **Live Unit Dimension Callout (HUD):**
* Directly underneath or alongside the bounding box, render a floating measurement badge showing:

$$\text{formatLength}(w, \text{unitSettings}) \times \text{formatLength}(h, \text{unitSettings})$$


* Example: `180 cm × 90 cm` or `5' - 11" × 2' - 11 1/2"`.



#### Math for Resizing with Local Space Transformation

When dragging a corner handle at index $i$:

1. Convert mouse pointer coordinates $(P_x, P_y)$ from world space into the asset's unrotated local space:

$$\begin{bmatrix} P_{\text{local}, x} \\ P_{\text{local}, y} \end{bmatrix} = \begin{bmatrix} \cos(-\theta) & -\sin(-\theta) \\ \sin(-\theta) & \cos(-\theta) \end{bmatrix} \begin{bmatrix} P_x - C_x \\ P_y - C_y \end{bmatrix}$$


2. Compute new width and height based on the dragged handle. If `Shift` is held, constrain the aspect ratio to $w_0 / h_0$.
3. Keep the opposite corner pinned in world space by shifting the center position $(C_x, C_y)$ accordingly.
4. Enforce minimum dimensions: $w \ge 100\,\text{mm}$, $h \ge 100\,\text{mm}$.

---

### 3. Dedicated Line Drawing Tool (`line`)

Add a standalone 2D Line Drawing Tool distinct from structural walls for architectural references, property boundaries, and wiring/plumbing annotations.

#### Data Model (`src/core/types.ts`)

```typescript
export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface CadLine {
  id: string;
  start: Point2D;
  end: Point2D;
  strokeWidthMm: number;    // Line thickness in millimeters (e.g., 20mm, 50mm)
  strokeColor: string;      // Hex color (e.g., '#e11d48', '#2563eb', '#1e293b')
  lineStyle: LineStyle;     // 'solid', 'dashed', 'dotted'
  layerId: string;
}

```

Extend `FloorPlanState` to include:

* `lines: Record<string, CadLine>`
* `selectedLineId: string | null`

#### Interaction Workflow (`src/engine/tools/LineTool.ts`)

1. Click 1: Anchor the start coordinate $(x_1, y_1)$.
2. Move: Draw a dynamic rubber-band preview line. If `Shift` is held, lock to orthogonal ($0^\circ, 45^\circ, 90^\circ$) angles.
3. Click 2: Anchor the end coordinate $(x_2, y_2)$ and commit the `CadLine` to the store.
4. **Live Measurement Display:**
* Compute Euclidean distance: $d = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$.
* Render a centered text label offset from the line normal displaying `formatLength(d, unitSettings)` (e.g., `450 cm`).
* Draw CAD endpoint tick slashes or small termination dots.



#### Canvas Rendering (`src/engine/layers/LineLayer.ts`)

```typescript
ctx.save();
ctx.strokeStyle = line.strokeColor;
ctx.lineWidth = line.strokeWidthMm; // Transformed via canvas scale matrix

if (line.lineStyle === 'dashed') {
  ctx.setLineDash([200, 100]); // in mm
} else if (line.lineStyle === 'dotted') {
  ctx.setLineDash([50, 50]);
} else {
  ctx.setLineDash([]);
}

ctx.beginPath();
ctx.moveTo(line.start.x, line.start.y);
ctx.lineTo(line.end.x, line.end.y);
ctx.stroke();
ctx.restore();

```

---

### 4. Inspector Panel Two-Way Unit Synchronization

The Property Inspector must always display and parse values in the **current active unit** (`cm`, `m`, `in`, `ft`, `ft_in`).

#### Implementation Pattern (`src/ui/components/UnitInput.vue` or helper)

Create a reusable unit-aware input component:

```typescript
// Props:
// valueMm: number (Canonical value stored in store)
// unitSettings: UnitSettings
// onChange: (newValMm: number) => void

// Internal display state:
const displayValue = computed(() => {
  return formatLength(props.valueMm, props.unitSettings);
});

function handleCommit(text: string) {
  // Use pure parser from Step 11:
  const parsedMm = parseLengthToMm(text, props.unitSettings.lengthUnit);
  if (parsedMm !== null && !isNaN(parsedMm) && parsedMm > 0) {
    props.onChange(parsedMm);
  }
}

```

#### Inspector Coverage:

1. **Asset / Furniture Inspector:**
* Width field displays `formatLength(furniture.width, unitSettings)` (e.g. `240 cm`).
* Depth field displays `formatLength(furniture.height, unitSettings)`.
* Editing and pressing Enter or blurring parses the input (e.g., typing `300cm` or `3m` or `10ft` converts correctly to mm).


2. **Line Inspector (when a CadLine is selected):**
* Line Length: read-only or editable extension in active units.
* Thickness input: options for standard drafting pens (e.g., $10\,\text{mm}, 25\,\text{mm}, 50\,\text{mm}, 100\,\text{mm}$) converted to active units.
* Stroke Style dropdown: Solid, Dashed, Dotted.
* Color picker: hex color swatch.


3. **Wall Inspector:**
* Thickness presets and inputs displayed in active unit (`15 cm`, `20 cm`, `6"`, etc.).



---

### Verification Requirements

1. **Keyboard Guard Test:** Focus an input field in the Property Inspector, type numbers, and press `Backspace`. The text must be deleted character-by-character; the canvas asset must **not** be deleted.
2. **Unit Consistency Test:** Switch the global unit setting from `mm` to `cm`.
* Verify all wall dimensions update from `3000 mm` to `300 cm`.
* Verify the asset transform gizmo HUD badge updates to show dimensions in `cm`.
* Verify the Property Inspector shows `cm`.


3. **Line Tool Test:**
* Select the Line tool (`L`), draw a diagonal line.
* Switch stroke style to `dashed` and stroke color to `#ef4444`. Verify it renders on the canvas as red dashed segments.
* Measure ticks and text label must render parallel to the line without overlapping.


4. Run `npm run test` and `npx tsc --noEmit` with zero errors.

```

```

---

### Verification Checklist for the Developer

1. **Backspace Behavior:** Click a furniture item, then click into the "Width" input in the right inspector. Press Backspace multiple times. The input text must delete cleanly, and the item must remain on the canvas. Press `Escape` to unfocus the input, then press `Delete`—the item should now delete as expected.
2. **Active Metric on Gizmo:** Select a furniture item (e.g., queen bed). Look at the bounding box label. In `cm` mode, it must read `160 cm × 200 cm`. Switch to `ft_in` in the status bar; it should instantly switch to `5' - 3" × 6' - 6 3/4"`.
3. **Resizing:** Grab any corner handle of the selected furniture item and drag outward. The asset must scale smoothly while the opposite corner remains anchored.
4. **Drawing Custom Lines:** Press `L`, click two points on the canvas, select the newly drawn line, change its style to "Dashed", and adjust its thickness in the inspector. Confirm the changes render instantly on screen.