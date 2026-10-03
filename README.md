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

- **🛋️ SVG Furniture Catalog & Asset Placement:**
  - High-performance in-memory SVG symbol registry and texture cache.
  - Built-in CAD symbol catalog across 4 categories: Living Room, Bedroom, Kitchen & Dining, and Bathroom & Sanitary.
  - Click-to-place and HTML5 Drag-and-Drop directly onto the canvas.
  - 2D Transform Gizmo: 300mm rotation handle stalk with 15° Shift snap, 4 corner proportional scale handles, translation dragging with grid snap.

- **🛠️ UI Chrome, Dockable Panels, Inspector & Status Bar:**
  - Floating Top Toolbar ribbon with tool switcher (Select, Wall, Door, Window, Pan), Undo/Redo history, Zoom to Fit, and 100% Reset.
  - Left collapsible Asset Catalog with live search filter.
  - Context-sensitive Right Properties Inspector (switching for Project Overview, Walls, Openings, Rooms, and Furniture).
  - Compact 32px Status Bar with live coordinate readouts, active zoom %, Grid Snap toggle (`G`), and unit system cycling (`mm`, `m`, `ft-in`).

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
| <kbd>H</kbd> / <kbd>Space + Drag</kbd> | Pan Tool |
| <kbd>M</kbd> | Furniture Tool |
| <kbd>G</kbd> | Toggle Grid Snap |
| <kbd>F8</kbd> / <kbd>Shift</kbd> | Toggle / Hold Ortho Angle Lock |
| <kbd>R</kbd> | Rotate Selected Furniture (+45°) |
| <kbd>F</kbd> | Flip Opening Swing |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete Selected Element |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | Redo |
| <kbd>Shift</kbd> + <kbd>1</kbd> | Zoom to Fit All Elements |
| <kbd>Shift</kbd> + <kbd>0</kbd> | Reset Zoom to 100% |
| <kbd>Esc</kbd> | Deselect / Cancel Active Action |

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/LISTAV/3ROOMS.git
cd 3ROOMS

# Install dependencies
npm install
```

### Development

```bash
# Start local development server with Vite
npm run dev
```

### Running Tests

```bash
# Run unit and integration tests with Vitest
npm run test
```

### Type Checking & Production Build

```bash
# Run strict TypeScript compiler
npx tsc --noEmit

# Build production bundle
npm run build
```

---

## 🏛️ Architecture

- **`src/core/`**: Headless computational geometry, vector math, planar graph traversal, DCEL room detection, R-Tree spatial indexing, snap engine, asset manager, and Zustand stores (`planStore`, `uiStore`).
- **`src/engine/`**: Immediate-mode HTML5 Canvas 2D engine, multi-layer rendering pipeline (`GridRenderer`, `RoomRenderer`, `FurnitureLayer`, `WallRenderer`, `OpeningRenderer`, `DimensionRenderer`, `OverlayRenderer`), viewport affine matrix transformations, and interactive tools (`SelectTool`, `WallTool`, `OpeningTool`, `FurnitureTool`, `PanTool`).
- **`src/ui/`**: Decoupled workbench chrome components (`TopToolbar`, `AssetCatalog`, `PropertyInspector`, `StatusBar`, `AppShell`), Lucide icons, and modern studio theme (`cad-workbench.css`).
- **`tests/`**: Comprehensive Vitest test suite covering computational geometry, mitering, room detection, openings, furniture, viewport transformations, and UI state.

---

## 📄 License

MIT
