# 3ROOMS 📐

> Professional, high-performance 2D CAD floor plan engine built with Vanilla Canvas 2D, TypeScript, and reactive Zustand state management.

---

## ✨ Features

- **🧱 Wall Geometry & Dynamic Corner Mitering:**
  - Continuous consecutive wall chains with orthogonal snapping and angle locks.
  - Mathematical miter joint computation resolving collinear, acute, obtuse, and reflex corner miters without visual seams or overlaps.
  - Interactive wall thickness adjustment (100mm, 150mm, 200mm, 300mm presets + custom numeric input) with live miter re-computation.
  - Dynamic vector-based wall length stretching.

- **🚪 Parametric Openings (Doors & Windows):**
  - Anchor openings anywhere along walls with normalized offset ratios (`0.0` to `1.0`).
  - Architectural CAD symbols: Single doors (90° leaf + swing arc), double doors (meeting leaves + dual swing arcs), and sliding/fixed windows (jamb cutouts, sills, centered glass panes).
  - Live flip controls: Flip In/Out (`V`) and Flip Swing (`F` / `Space`).

- **🏠 Automatic Room Face Detection & Closed Loop Calculations:**
  - Planar straight-line graph cycle detection via angular sorting and DCEL half-edge traversal.
  - Automatic floor area calculation via the Shoelace formula ($m^2$, $mm^2$, or $sq\ ft$).
  - Customizable room labeling and floor finish color palette picker.

- **🛋️ SVG Furniture & Stairs Catalog with Custom SVG Import:**
  - High-performance in-memory SVG symbol registry and texture cache with `localStorage` persistence.
  - Built-in CAD symbol catalog across 5 categories: Stairs & Circulation (Straight, L-Shape, U-Shape, Spiral), Living Room, Bedroom, Kitchen & Dining, and Bathroom & Sanitary.
  - Click-to-place and HTML5 Drag-and-Drop directly onto the canvas.
  - **Custom SVG Symbol Import:** Upload and use any arbitrary `.svg` file with automatic aspect ratio detection and real-world dimensions.
  - 2D Transform Gizmo: 300mm rotation handle stalk with 15° Shift snap, 4 corner proportional scale handles, translation dragging with grid snap.

- **🎨 Photoshop-Style Layer Panel:**
  - Multi-layer stack with layer visibility (eye toggle), lock state (padlock), reordering, and opacity blending.
  - Active layer routing and layer-aware selection hit-testing with overlapping element cycling.

- **📐 Architectural Units Engine & Live Measurements:**
  - Full support for Metric (`mm`, `cm`, `m`) and Imperial (`in`, `ft`, architectural fractional `ft_in` e.g. `10' - 4 1/2"`).
  - Real-time live dimension badges on drawing preview tapes.

- **🖼️ Reference Image / Blueprint Underlays:**
  - Import blueprints (`.png`, `.jpg`, `.webp`, `.svg`) with adjustable opacity/transparency slider and 2D transform handles.

- **📏 Parametric Line Tool:**
  - Draw lines with custom color, thickness, dash styles (solid, dashed, dotted), and arrowheads (`none`, `start`, `end`, `both`).

- **💾 Project I/O & Export Engine:**
  - Native project file save and load (`.floorplan` JSON schema).
  - Export Scalable Vector Graphics (`.svg`), AutoCAD 2000 (`.dxf`), and high-resolution 300 DPI raster (`.png`).

- **🛠️ UI Chrome & Docked Studio Layout:**
  - Docked studio top navigation bar with tool switcher, file controls, history, zoom controls, and export menu.
  - Collapsible Left Asset Catalog and Right Properties Inspector docking underneath the top bar with zero overlap.
  - Compact 32px Status Bar with coordinate readouts, active zoom %, Grid Snap toggle (`G`), and unit system selector.

- **⏪ Full Undo / Redo History Stack:**
  - Centralized immutable history snapshots supporting instantaneous undo/redo for all geometry and asset modifications.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>V</kbd> | Select Tool |
| <kbd>W</kbd> | Wall Tool |
| <kbd>D</kbd> | Door Tool |
| <kbd>O</kbd> | Window Tool |
| <kbd>L</kbd> | Line Tool / Toggle Layers |
| <kbd>H</kbd> / <kbd>Space + Drag</kbd> | Pan Tool |
| <kbd>B</kbd> | Toggle Asset Catalog |
| <kbd>G</kbd> | Toggle Grid Snap |
| <kbd>F8</kbd> / <kbd>Shift</kbd> | Toggle / Hold Ortho Angle Lock |
| <kbd>R</kbd> | Rotate Selected Asset (+45°) |
| <kbd>F</kbd> | Flip Opening Swing |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete Selected Element |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | Redo |
| <kbd>Ctrl</kbd> + <kbd>N</kbd> | New Floor Plan |
| <kbd>Ctrl</kbd> + <kbd>O</kbd> | Open Floor Plan |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save Floor Plan |
| <kbd>Shift</kbd> + <kbd>1</kbd> | Zoom to Fit All Elements |
| <kbd>Shift</kbd> + <kbd>0</kbd> | Reset Zoom to 100% |
| <kbd>Esc</kbd> | Deselect / Cancel Active Action |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or higher)
- npm (installed automatically with Node.js)
- Git

### 1. Clone & Install

```bash
# Clone the repository
git clone https://github.com/LISTAV/3ROOMS.git
cd 3ROOMS

# Install all dependencies
npm install
```

### 2. Run the Web App (Development Server)

```bash
npm run dev
```

Open your browser and navigate to:
```
http://localhost:5173/
```

### 3. Run the Desktop Application (Optional - Tauri)

To run as a native desktop application:

```bash
# Ensure Rust is installed (https://rustup.rs/)
npm run tauri dev
```

### 4. Running Automated Tests

```bash
# Run Vitest test suites (185 tests across 15 test suites)
npm test
```

### 5. Production Build

```bash
# Compile TypeScript and bundle with Vite
npm run build
```

---

## 📐 Quick Start Guide for New Users

1. **Draw Exterior & Interior Walls**:
   - Press <kbd>W</kbd> or click **Wall** in the top navigation bar.
   - Click anywhere on the grid canvas and drag to draw a wall. Live dimensions will display your length in real time.
   - Connecting four walls into an enclosed loop automatically detects the room and computes its floor area ($m^2$ or $sq\ ft$).

2. **Add Doors & Windows**:
   - Press <kbd>D</kbd> for Doors or <kbd>O</kbd> for Windows.
   - Hover over any wall—the opening will snap to the wall with real-time witness offset dimensions. Click to insert.
   - Press <kbd>F</kbd> or <kbd>Space</kbd> to flip door swing direction.

3. **Place Furniture & Staircases**:
   - Click **Catalog** on the left (<kbd>B</kbd>).
   - Browse categories including **Stairs & Circulation** (Straight, L-Shape, Switchback, Spiral) or drag symbols onto the canvas.
   - Use the 2D transform gizmo to rotate or proportionally scale any symbol.

4. **Import Custom SVG Symbols**:
   - Click the **`Import SVG`** button in the top of the Asset Catalog sidebar.
   - Pick any `.svg` file from your computer. The app auto-detects its natural aspect ratio, lets you set real-world millimeter dimensions, and saves it in your catalog.

5. **Reference Blueprints / Image Underlays**:
   - Click **Add Image** in the top bar to import a blueprint (`.png`, `.jpg`, `.svg`).
   - Use the transparency slider in the Properties Inspector to trace over existing plans.

6. **Export Your Floor Plan**:
   - Click **Export** in the top toolbar to download as:
     - Vector Blueprint (`.svg`)
     - AutoCAD Drawing (`.dxf`)
     - High-Res 300 DPI Image (`.png`)

---

## 📄 License

MIT
