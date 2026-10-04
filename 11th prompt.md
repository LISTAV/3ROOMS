### Step 11: Multi-Unit Measurement Engine & Photoshop-Style Layer System

```markdown
You are implementing two major core architectural systems for the 2D CAD floor plan engine:
1. A customizable multi-unit measurement system supporting metric (mm, cm, m) and imperial (decimal inches, decimal feet, and architectural fractional feet-and-inches like 12' - 4 1/2") with real-time dimension rendering on walls.
2. A Photoshop/AutoCAD-style Layer System with visibility toggles, lock states, layer opacity, z-order stacking, and an active drawing target layer.

```

---

### 1. Multi-Unit Measurement Engine (`src/core/units/unitFormatter.ts`)

#### Architectural Rule:

**All internal coordinates, dimensions, and areas must remain strictly stored in canonical millimeters (mm) and square millimeters (mm²).** Conversion happens exclusively at the presentation/input boundary.

#### Unit Definitions & Formats

Implement support for the following unit formats:

* `'mm'`: `2400 mm`
* `'cm'`: `240 cm`
* `'m'`: `2.40 m`
* `'in'`: `94.5"`
* `'ft'`: `7.88 ft`
* `'ft_in'`: Architectural US standard: `7' - 10 1/2"` (with configurable fraction precision: `1/2"`, `1/4"`, `1/8"`, `1/16"`).

#### Unit Math Specifications

Implement pure formatting and parsing functions:

```typescript
export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft' | 'ft_in';
export type AreaUnit = 'sq_m' | 'sq_cm' | 'sq_ft' | 'sq_in';
export type FractionPrecision = 2 | 4 | 8 | 16; // 1/2, 1/4, 1/8, 1/16

export interface UnitSettings {
  lengthUnit: LengthUnit;
  areaUnit: AreaUnit;
  decimalPlaces: number;       // For decimal formats (default: 2)
  fractionPrecision: FractionPrecision; // For 'ft_in' (default: 16)
}

// Convert canonical millimeters to display string
export function formatLength(mm: number, settings: UnitSettings): string;

// Convert user string input (e.g. "12' 4 1/2\"" or "3.5m" or "250cm") back to mm
export function parseLengthToMm(input: string, fallbackUnit: LengthUnit): number | null;

// Convert canonical mm² to formatted area string (e.g. "18.50 m²" or "199.13 sq ft")
export function formatArea(mm2: number, settings: UnitSettings): string;

```

#### Architectural Fraction Algorithm (`ft_in`):

1. Convert millimeters to total inches: $\text{totalInches} = \frac{mm}{25.4}$.
2. $\text{feet} = \lfloor \frac{\text{totalInches}}{12} \rfloor$.
3. $\text{remainingInches} = \text{totalInches} - (\text{feet} \times 12)$.
4. Split `remainingInches` into whole inches and fractional part:
* $\text{wholeInches} = \lfloor \text{remainingInches} \rfloor$.
* $\text{fraction} = \text{remainingInches} - \text{wholeInches}$.
* Round fraction to nearest $N^{\text{th}}$ step where $N = \text{fractionPrecision}$:



$$\text{numerator} = \operatorname{round}(\text{fraction} \times N)$$

* Simplify fraction using Greatest Common Divisor (GCD) (e.g., $4/16 \to 1/4$, $8/16 \to 1/2$).
* If numerator rounds up to $N$, roll over: increment `wholeInches` by 1. If `wholeInches == 12`, increment `feet` by 1 and set `wholeInches = 0`.

5. Output format: `\({feet}' -\){wholeInches} \({numerator}/\){denominator}"` (omit fraction if 0; omit inches if 0).

---

### 2. Live Dynamic Dimension Layer (`src/engine/layers/DimensionLayer.ts`)

Render architectural dimension tapes along every wall:

1. **Dimension Line Offset:**
* Offset the dimension line outward from the wall centerline by $350\,\text{mm}$ along the wall's normal vector.


2. **CAD Tick Marks:**
* At both endpoints, draw a standard 45° CAD slash tick mark ($150\,\text{mm}$ length, stroke width $2\,\text{px}$) or architectural extension ticks.


3. **Smart Upright Text Orientation:**
* Compute wall angle: $\theta = \operatorname{atan2}(dy, dx)$.
* Text must **never** render upside down. If $\theta > \frac{\pi}{2}$ or $\theta < -\frac{\pi}{2}$, rotate text angle by $180^\circ$ ($\theta + \pi$).
* Draw background text bounding box mask (`rgba(255, 255, 255, 0.85)` or canvas background color) so dimension lines do not strike through the text.
* Text label displays `formatLength(wallLength, activeUnitSettings)`.



---

### 3. Photoshop-Style Layer Architecture

#### Data Model (`src/core/types.ts`)

Extend types to attach elements to layers and define the layer structure:

```typescript
export interface Layer {
  id: string;
  name: string;             // e.g. "01 - Structural Walls", "02 - Openings", "03 - Furniture", "04 - Dimensions"
  visible: boolean;         // Eye toggle
  locked: boolean;          // Padlock toggle (prevents selection and mutation)
  opacity: number;          // 0.0 to 1.0 (Photoshop-like alpha blending)
  colorTag?: string;        // Optional color tag for visual identification
  order: number;            // Stacking index (0 = bottom background, N = top overlay)
}

export interface LayerState {
  layers: Record;
  activeLayerId: string;    // Elements drawn will be assigned to this layer
  layerOrder: string[];     // Ordered array of layer IDs [bottomLayerId, ..., topLayerId]
}

```

Update entity interfaces (`Wall`, `Opening`, `RoomFace`, `FurnitureInstance`) with:

```typescript
layerId: string; // Foreign key referencing Layer.id

```

#### Default Seed Layers:

When a new plan is initialized, seed with standard architectural layers:

1. `layer-rooms` (Order: 0, Name: "Rooms & Floors", Opacity: 1.0)
2. `layer-furniture` (Order: 1, Name: "Furniture & Symbols", Opacity: 1.0)
3. `layer-walls` (Order: 2, Name: "Walls & Openings", Opacity: 1.0, Default active)
4. `layer-dimensions` (Order: 3, Name: "Dimensions & Annotations", Opacity: 1.0)

---

### 4. Canvas Render Pipeline with Layers

Update `src/engine/canvas/renderLoop.ts`:

1. Iterate through `layerOrder` from lowest index (bottom) to highest (top):
```typescript
for (const layerId of layerOrder) {
  const layer = layers[layerId];
  if (!layer || !layer.visible) continue; // Skip hidden layers

  ctx.save();
  ctx.globalAlpha = layer.opacity;

  // Render entities belonging strictly to this layer:
  // - If layer has walls -> render walls with layerId
  // - If layer has rooms -> render rooms with layerId
  // - If layer has furniture -> render furniture with layerId
  // - If layer is dimension layer -> render dimension tapes
  renderLayerEntities(ctx, layerId, state);

  ctx.restore();
}

```


2. **Hit-Testing & Interaction Guard:**
* Any entity belonging to a layer where `layer.locked === true` or `layer.visible === false` **must be rejected** during selection raycasting or pointer hit-testing.
* When using the `WallTool` or placing furniture, assign the new entity's `layerId` to `activeLayerId`.



---

### 5. UI Layer Management Panel (`src/ui/components/LayerPanel.vue`)

Build a Photoshop/Figma-style floating or dockable Layers palette:

1. **Layer List Items (Stack Top to Bottom):**
* **Active Indicator:** Visual highlight showing which layer is current active target. Clicking a layer row sets `activeLayerId`.
* **Visibility Toggle (Eye icon):** Clicking toggles `layer.visible`.
* **Lock Toggle (Padlock icon):** Clicking toggles `layer.locked`.
* **Opacity Slider / Input:** Small slider (0–100%) affecting `layer.opacity` in real time.
* **Layer Name:** Double-click to inline edit layer name.
* **Drag Handle / Reorder:** Drag row up/down to reorder `layerOrder`.


2. **Footer Actions:**
* **New Layer button (`+`):** Appends a new custom layer.
* **Delete Layer button (Trash):** Deletes layer (prompt to delete or reassign orphaned items to active layer).
* **Move Selected Items to Active Layer:** Moves currently selected elements into `activeLayerId`.


3. **Unit Switcher Header / Popover:**
* Quick dropdown toggle in top ribbon or status bar allowing instantaneous switching between:
* `Millimeters (mm)`
* `Centimeters (cm)`
* `Meters (m)`
* `Inches (in)`
* `Feet (ft)`
* `Feet & Inches (ft - in)`


* Switching units updates all visible dimension tapes and property inputs immediately without altering raw world coordinates.



---

### 6. Verification & Automated Tests (`tests/units_and_layers.test.ts`)

Write unit tests covering:

1. `formatLength`:
* `25.4 mm` $\to$ `1.00 in` and `0' - 1"`.
* `3048 mm` $\to$ `10' - 0"`.
* `2400 mm` with fraction precision 16 $\to$ `7' - 10 1/2"`.


2. `parseLengthToMm`:
* Parse `"10' 6\""` $\to$ $3200.4\,\text{mm}$.
* Parse `"2.5m"` $\to$ $2500\,\text{mm}$.
* Parse `"150cm"` $\to$ $1500\,\text{mm}$.


3. Layer culling:
* Setting `layer.visible = false` excludes entities from the render buffer.
* Setting `layer.locked = true` blocks selection hit-tests.


4. Ensure `npm run test` and `npx tsc --noEmit` pass with zero errors.

```

```

---

### Verification Checklist for This Feature

1. **Fractional Precision:** Draw a wall of $3,048\,\text{mm}$—switch unit system to `ft_in` and confirm the label reads `10' - 0"`. Draw a wall of $2,400\,\text{mm}$ and verify it renders `7' - 10 1/2"`.
2. **Text Readability:** Draw walls at $45^\circ$, $135^\circ$, $225^\circ$, and $315^\circ$. Verify the dimension text is always oriented upright so the user never has to tilt their head upside-down to read measurements.
3. **Layer Visibility & Alpha:** Open the Layers panel, toggle off the "Dimensions" eye icon, and ensure all dimension text and tick marks disappear instantly. Adjust the "Furniture" opacity slider to 50% and verify furniture items become translucent on the canvas.
4. **Lock Protection:** Lock the "Walls" layer and try clicking to select or drag a wall corner. The engine must reject the selection.