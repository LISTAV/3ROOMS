You are building Step 2 of the 2D CAD floor plan engine: The Viewport Matrix Engine, Coordinate System, and Infinite Canvas Renderer.

Do not build wall drawing tools or UI buttons yet. Focus exclusively on the canvas viewport, mouse pan/zoom mechanics, DPI scaling, and the dynamic background CAD grid.

### Objectives
1. Implement a headless `Viewport` class handling 2D affine transformation matrices and coordinate space conversions.
2. Implement an adaptive CAD `GridRenderer` that draws major/minor millimeter grids that rescale smoothly with zoom.
3. Implement a decoupled `CanvasEngine` class managing the canvas lifecycle, Retina/HiDPI scaling via `devicePixelRatio`, mouse interaction events, and an immediate-mode `requestAnimationFrame` render loop.
4. Write Vitest unit tests verifying coordinate transformation math.

---

### 1. Viewport Math Engine (`src/engine/viewport/Viewport.ts`)
Create a `Viewport` class with the following specifications:

- **Internal State:**
  - `panX: number`: Horizontal translation in screen pixels.
  - `panY: number`: Vertical translation in screen pixels.
  - `zoom: number`: Scale factor (e.g., 1.0 = 1 screen pixel per 1 world mm; default zoom should be around 0.1 to fit a typical 10m x 10m room on screen).
  - Zoom bounds: `minZoom: 0.005` (50m view), `maxZoom: 5.0` (detailed 1mm view).

- **Core Methods:**
  - `screenToWorld(screenPoint: Point2D): Point2D`:
    Formula: `worldX = (screenX - panX) / zoom`, `worldY = (screenY - panY) / zoom`.
  - `worldToScreen(worldPoint: Point2D): Point2D`:
    Formula: `screenX = (worldX * zoom) + panX`, `screenY = (worldY * zoom) + panY`.
  - `panBy(deltaScreenX: number, deltaScreenY: number): void`:
    Increments `panX` and `panY`.
  - `zoomAt(screenAnchor: Point2D, zoomFactor: number): void`:
    Multiplies `zoom` by `zoomFactor` (clamped to bounds), while keeping the world position under `screenAnchor` perfectly stationary on the screen:
    `newPan = screenAnchor - (worldAnchor * newZoom)`
  - `getTransform(): DOMMatrix`: Returns standard 2D matrix or affine components `[a, b, c, d, e, f]` for `ctx.setTransform()`.
  - `getViewportBounds(canvasWidth: number, canvasHeight: number): { minX: number; minY: number; maxX: number; maxY: number }`:
    Calculates the visible bounding box in world coordinates (essential for culling offscreen geometry).

---

### 2. Adaptive Infinite CAD Grid (`src/engine/canvas/GridRenderer.ts`)
Render an infinite CAD grid directly in world coordinates:
- The grid must scale with zoom. As the user zooms out, sub-divisions should gracefully step up so lines don't turn into a solid block:
  - Major lines: Every `1,000mm` (1 meter). Render with `#cbd5e1` (slate-300), stroke width 1px in screen space.
  - Minor lines: Every `100mm` (10 centimeters). Render with `#f1f5f9` (slate-100), stroke width 1px in screen space.
  - Origin axes: World `(0, 0)` axes drawn in `#94a3b8` (slate-400) with subtle arrows or thickness.
- If the screen distance between minor grid lines falls below 10 pixels, fade out or stop rendering the minor grid lines to prevent visual moiré patterns.
- Always use `Math.floor()` or coordinate snapping to viewport bounds so only lines visible within the viewport are drawn (never loop from -Infinity to +Infinity).

---

### 3. Canvas Engine & Event Loop (`src/engine/canvas/CanvasEngine.ts`)
Create a decoupled controller class that attaches to an `HTMLCanvasElement`:
- **HiDPI / Retina Handling:**
  - Track `window.devicePixelRatio`.
  - Use `ResizeObserver` to detect canvas container dimensions.
  - Set `canvas.width = clientWidth * dpr` and `canvas.height = clientHeight * dpr`.
  - In the render loop, set context transform with `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` before applying viewport transforms.
- **Input Handling:**
  - **Panning:** Middle mouse button drag OR Spacebar + Left mouse button drag.
  - **Zooming:** Mouse wheel event (`wheel`). Use normalized wheel delta to call `viewport.zoomAt({ x: e.clientX, y: e.clientY }, factor)`.
  - Pointer capture: Use `setPointerCapture` to ensure pan dragging continues smoothly even if the cursor leaves the canvas window.
- **Render Loop:**
  - Implement a `requestRender()` method that schedules a single `requestAnimationFrame` render pass when the viewport changes.
  - Clear canvas with a clean off-white background (`#ffffff` or `#f8fafc`).
  - Render order: `Background -> GridRenderer -> (Placeholder World Origin Box: 1000x1000mm)`.

---

### 4. Tests & Verification (`tests/viewport.test.ts`)
Write unit tests for `Viewport`:
1. `screenToWorld` and `worldToScreen` are exact inverses across different zoom levels and pan offsets.
2. `zoomAt` keeps the world coordinate under the mouse cursor completely invariant before and after the zoom operation.
3. Viewport bounds calculation correctly reports the visible world rectangle for a 1920x1080 canvas.

### Verification Checklist:
- Run `npm run test` and ensure all transform math passes 100%.
- Run `npx tsc --noEmit` to verify clean typing.