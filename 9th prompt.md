### Step 9: UI Chrome, Dockable Panels, Inspector & Toolbars

```markdown
You are building the UI chrome and interaction panels surrounding the 2D CAD canvas. The UI must remain completely decoupled from the canvas rendering loop: UI components interact strictly via the central store (reading state and dispatching actions), never by directly calling canvas rendering methods.

### Objectives
1. Build the Top Toolbar with tool toggles, history actions (Undo/Redo), and view controls.
2. Build the Left Asset Catalog with collapsible categories for architectural symbols.
3. Build the Right Context-Sensitive Properties Inspector to edit selected walls, openings, rooms, and furniture.
4. Build the Bottom Status Bar showing live world coordinates, active zoom level, and toggle buttons (Grid Snap, Ortho Lock).
5. Ensure clean styling with a dark/neutral CAD workbench aesthetic using modern CSS (Flexbox/Grid) and Lucide icons.

---

### 1. Store Bindings & UI State (`src/core/store/uiStore.ts` or extend existing store)
Expose UI-specific state:
- `activeTool`: `'select' | 'wall' | 'door' | 'window' | 'pan' | 'measure'`
- `snapToGrid`: `boolean` (default: `true`)
- `orthoLock`: `boolean` (default: `false`)
- `cursorWorldPos`: `{ x: number; y: number }` (updated on pointer move)
- `unitSystem`: `'metric_mm' | 'metric_m' | 'imperial_ft'`
- Helper functions: `formatLength(mm: number): string` and `formatArea(mm2: number): string` respecting the active `unitSystem`.

---

### 2. Top Toolbar (`src/ui/components/TopToolbar.vue`)
Build a horizontal floating ribbon at the top of the viewport:
1. **Tool Switcher (Radio Group):**
   - Select (`V`)
   - Wall Tool (`W`)
   - Door Tool (`D`)
   - Window Tool (`O`)
   - Pan Tool (`H` or Space)
2. **History Controls:**
   - Undo (`Ctrl+Z` / `Cmd+Z`) — disabled if history stack is empty.
   - Redo (`Ctrl+Y` / `Cmd+Shift+Z`) — disabled if future stack is empty.
3. **Viewport Actions:**
   - Zoom to Fit (scales viewport matrix to encompass all existing walls with 10% padding).
   - Reset Zoom (100% scale at origin).
   - Clear Canvas (with confirmation dialog).

---

### 3. Left Symbol Catalog (`src/ui/components/AssetCatalog.vue`)
Build a collapsible left sidebar (width: ~260px) to browse furniture and architectural items:
1. **Search Bar:** Real-time filter over symbol names.
2. **Categorized Accordion:**
   - Living Room (Sofas, Armchairs, Coffee Tables, TV Units)
   - Bedroom (Queen Bed, Single Bed, Wardrobe, Nightstand)
   - Kitchen (Counters, Sink, Stove, Refrigerator)
   - Bathroom (Toilet, Bathtub, Shower, Vanity Sink)
3. **Placement Interaction:**
   - Clicking an item sets it as the active placement symbol.
   - Hovering over the canvas displays a semi-transparent preview ghost of the symbol at the cursor's world position.
   - Left-click on canvas stamps the item into `furniture` state and returns to `select` mode.
   - Support standard HTML5 drag-and-drop: dragging an item from the palette directly over the canvas translates drop coordinates to world coordinates and creates the instance.

---

### 4. Right Properties Inspector (`src/ui/components/PropertyInspector.vue`)
Build a contextual sidebar (width: ~280px) on the right that switches depending on the active selection:

- **When No Selection:**
  - Display project-level metadata: Total Enclosed Area ($m^2$), Total Wall Count, Unit Selector (Millimeters / Meters / Feet-Inches), Grid Step size input.
- **When a Wall is Selected:**
  - Wall Length (read-only or editable to stretch the wall along its vector).
  - Wall Thickness input (e.g., 100mm, 150mm, 200mm, 300mm presets + custom numeric input).
  - Delete Wall button.
- **When an Opening (Door/Window) is Selected:**
  - Type toggle (Single Door, Double Door, Sliding Window, Fixed Window).
  - Width input (e.g., 750mm, 820mm, 900mm presets).
  - Flip In/Out (Toggle `flipV`) & Flip Left/Right (Toggle `flipH`) buttons.
  - Delete Opening button.
- **When a Room Face is Selected:**
  - Room Label input text (e.g., "Master Bedroom", "Kitchen").
  - Calculated Area display (automatically updated via Shoelace formula).
  - Floor Finish / Color picker (updates room fill color).
- **When Furniture is Selected:**
  - Position inputs ($X$, $Y$ in mm).
  - Dimensions ($Width$, $Depth$ in mm).
  - Rotation input (0° to 360° input or 45° step buttons).
  - Stacking controls: Bring Forward / Send Backward.
  - Delete button.

---

### 5. Bottom Status Bar (`src/ui/components/StatusBar.vue`)
A compact 28px bottom strip providing CAD feedback:
1. Live coordinates: `X: 4,200 mm | Y: -1,850 mm`.
2. Active Zoom: `Zoom: 125%`.
3. Toggle Buttons:
   - **GRID SNAP [ON/OFF]** (`G` shortcut).
   - **ORTHO LOCK [ON/OFF]** (`Shift` hold or `F8` toggle).
   - Unit Indicator: Clickable badge toggling between `mm`, `m`, and `ft-in`.

---

### 6. App Shell Layout (`src/App.vue`)
Assemble the complete interface using CSS Grid or absolute flex layers:
```html
<div class="cad-shell">
  <TopToolbar class="toolbar-layer"/>
  <div class="workspace-layer">
    <AssetCatalog v-if="showCatalog"/>
    <main class="canvas-viewport">
      <CanvasContainer/>
    </main>
    <PropertyInspector v-if="showInspector"/>
  </div>
  <StatusBar class="statusbar-layer"/>
</div>

```

### Verification Requirements

1. Confirm that pressing keyboard shortcuts (`V`, `W`, `D`, `G`, `Delete`) toggles tools and triggers the expected state mutations.
2. Changing the Wall Thickness input in the Property Inspector immediately updates the wall in the Zustand store and re-renders the wall on the canvas with correct mitering.
3. Placing furniture from the catalog creates an instance in `furniture` with correct default dimensions.
4. Ensure `npm run test` and `npx tsc --noEmit` pass with zero type errors.

```

---

### Verification Checklist Before Moving to Step 10

1. Run `npm run dev` and test selecting a wall—the right panel must switch to wall properties, and adjusting thickness must dynamically thicken the wall.
2. Select a closed room—the panel must display the computed $m^2$ and allow renaming it.
3. Drag a piece of furniture from the catalog onto the canvas and confirm it drops precisely where the cursor was released.
4. Verify that pan/zoom actions in the canvas feel instantaneous and do not trigger layout shifts in the UI chrome.

<FollowUp label="Ready for Step 10? Generate the Tauri v2 Native Packaging & Local File I/O prompt." query="Show me Step 10: Tauri v2 Native Packaging, Local File I/O (.floorplan JSON), and DXF/SVG Exporter prompt for the agentic IDE."/>

```