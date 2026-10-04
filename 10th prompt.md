### Step 10: Tauri v2 Native Packaging, Local File I/O & CAD Exporters

```markdown
You are completing the final phase of the 2D CAD floor plan engine: wrapping the application in Tauri v2, implementing local file persistence with a versioned `.floorplan` JSON schema, and building production-ready export pipelines for SVG and AutoCAD DXF.

### Objectives
1. Configure Tauri v2 with native dialogs and file system capabilities.
2. Implement schema-validated project serialization (`.floorplan` JSON) with dirty-state tracking (Save / Save As / Open).
3. Build a standalone Vector SVG Exporter that outputs crisp, scale-accurate blueprints without canvas artifacts.
4. Build a pure-TypeScript AutoCAD DXF (R12/2000) Exporter for compatibility with standard architecture tools.
5. Add a high-resolution PNG rasterizer using an offscreen canvas.

---

### 1. Project Serialization & File Format (`src/core/io/schema.ts`)
Define the official file schema using strict typing (or Zod):

```typescript
export interface FloorPlanProjectFile {
  formatVersion: '1.0.0';
  appVersion: string;
  metadata: {
    title: string;
    createdAt: string;
    updatedAt: string;
    unitSystem: 'metric_mm' | 'metric_m' | 'imperial_ft';
  };
  state: {
    vertices: Record<string, Vertex>;
    walls: Record<string, Wall>;
    openings: Record<string, Opening>;
    rooms: Record<string, RoomFace>;
    furniture: Record<string, FurnitureInstance>;
  };
}

```

Implement `serializeProject(state, metadata): string` and `deserializeProject(jsonString): FloorPlanState`.

* Validate that all wall vertices exist in `vertices` before loading to prevent orphaned edge errors.
* If schema validation fails, throw a human-readable error.

---

### 2. Native File I/O (`src/core/io/fileManager.ts`)

Integrate Tauri v2 plugins (`@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs`) with a fallback for browser mode:

1. **New File (`Ctrl+N`):**
* Prompt if current state has unsaved changes. Clear state and reset viewport matrix.


2. **Open File (`Ctrl+O`):**
* Open native file picker filtered by extension: `[{ name: 'Floor Plan', extensions: ['floorplan', 'json'] }]`.
* Read file contents, deserialize, hydrate Zustand store, and trigger "Zoom to Fit".


3. **Save (`Ctrl+S`):**
* If a current file path exists, write directly to disk.
* If no file path exists, delegate to **Save As**.


4. **Save As (`Ctrl+Shift+S`):**
* Open native save dialog with default name `Untitled.floorplan`.
* Write formatted JSON string to disk and store the active file path.


5. **Browser Fallback:**
* When running outside Tauri, use the HTML5 File System Access API (`showOpenFilePicker`, `showSaveFilePicker`) or trigger an anchor tag download.



---

### 3. Vector SVG Exporter (`src/core/export/svgExporter.ts`)

Generate a self-contained, publication-ready SVG string matching architectural drafting standards:

1. Calculate the global bounding box of all vertices and furniture with a 500mm padding.
2. Set `<svg>` `viewBox` using real-world millimeters: `viewBox="${minX} ${minY} ${width} ${height}"`.
3. Render layers in standard drafting order:
* `<g id="rooms">`: Filled polygons with semi-transparent color and text labels for room names + $m^2$ areas.
* `<g id="walls">`: Solid unioned polygons or mitred thick polylines styled with `fill="#222"` and stroke borders.
* `<g id="openings">`: Window sills, door swing 90° arcs (`stroke-dasharray="4 4"`), and door leaves.
* `<g id="furniture">`: Embed inline SVG nodes transformed via `transform="translate(x, y) rotate(deg)"`.
* `<g id="dimensions">`: Dimension tick lines, leader lines, and centered text labels rotated along wall normals.


4. Export as a `.svg` file via Tauri save dialog or download link.

---

### 4. AutoCAD DXF Exporter (`src/core/export/dxfExporter.ts`)

Implement a pure-TypeScript DXF generator (AutoCAD 2000 format) so plans can be opened directly in AutoCAD, LibreCAD, or Revit:

1. Emit the minimal required DXF section structure:
* `0 HEADER ... 0 ENDSEC`
* `0 TABLES ... 0 ENDSEC` (Defining standard CAD layers: `WALLS`, `DOORS`, `WINDOWS`, `ROOMS`, `DIMENSIONS`, `FURNITURE` with distinct ACI colors).
* `0 ENTITIES ... 0 ENDSEC`
* `0 EOF`


2. Map elements to CAD primitives:
* **Walls:** Write outer boundary polygons as closed `LWPOLYLINE` on layer `WALLS`.
* **Openings:** Write door swing arcs as `ARC` entities and leaves as `LINE` on layer `DOORS`.
* **Room Labels & Dimensions:** Write as `TEXT` entities with justification flags and coordinate placements.


3. Keep coordinates in world millimeters (1 DXF unit = 1 mm).

---

### 5. High-Resolution PNG Exporter (`src/core/export/pngExporter.ts`)

Export the floor plan as a high-DPI raster image:

1. Create an offscreen canvas sized to match the content bounding box multiplied by a scale factor (e.g., scale = 2 for 300 DPI print quality).
2. Apply scaling transform: `offscreenCtx.scale(scale, scale)`.
3. Translate context so `(minX, minY)` aligns to `(padding, padding)`.
4. Run the rendering pipeline (Rooms $\to$ Furniture $\to$ Walls $\to$ Openings $\to$ Dimensions).
5. Convert offscreen canvas to PNG blob (`canvas.toBlob()`) and write to disk.

---

### 6. Tauri v2 Desktop Configuration

Verify and update the following configuration files:

1. `src-tauri/tauri.conf.json`:
* Set window title to `"FloorPlan CAD"`.
* Enable plugins: `dialog`, `fs`.
* Configure window default size to 1280x800 with min dimensions 960x600.


2. `src-tauri/Cargo.toml`:
* Include required crates: `tauri = "2.x"`, `tauri-plugin-dialog`, `tauri-plugin-fs`.


3. Add a native window title updater in `src/App.vue`:
* Display project title and unsaved indicator: `FloorPlan CAD - [LivingRoomPlan.floorplan *]`.



---

### Verification Requirements

1. Create a unit test `tests/export.test.ts` verifying:
* `serializeProject` and `deserializeProject` perform a lossless round-trip on a 4-wall room.
* `svgExporter` outputs a valid XML string containing `<svg>`, `<polygon>`, and `<text>` tags matching expected millimeter coordinates.
* `dxfExporter` output contains essential DXF markers (`0\nSECTION`, `2\nENTITIES`, `0\nEOF`).


2. Run `npm run test` and `npx tsc --noEmit` with zero errors.
3. Test running `npm run tauri dev` (or web preview) to verify Save, Open, Export SVG, and Export PNG operations.

```

---

### Final Project Assembly Checklist

When your agentic IDE completes Step 10, the full core loop of the desktop CAD application will be functional:

| Capability | Component / Module | Verification Method |
| :--- | :--- | :--- |
| **Geometry Core** | `src/core/math/` | Vitest asserts intersection and Shoelace math |
| **Viewport Engine** | `src/engine/canvas/` | Mouse wheel zooms centered on cursor; middle-drag pans |
| **Wall & Snap Engine**| `src/engine/tools/WallTool.ts` | Orthogonal lock (Shift) and magnetic vertex snap |
| **Mitering & Rooms** | `src/core/rooms/` | Closed loops auto-tint and display $m^2$ area labels |
| **Openings** | `src/engine/layers/WallLayer.ts`| Doors slice solid wall polygons with 90° swing arcs |
| **Symbol Catalog** | `src/core/assets/` | Top-down SVG furniture drag-and-drop with rotate gizmo |
| **Native Integration**| `src-tauri/` | Local `.floorplan` JSON save/load, DXF & SVG export |

To build the standalone release executable, run:
```bash
npm run tauri build

```

This produces an optimized native executable (`.exe`, `.dmg`, or AppImage) under `src-tauri/target/release/bundle/`.