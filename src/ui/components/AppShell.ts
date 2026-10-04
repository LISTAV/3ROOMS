import { TopToolbar } from './TopToolbar.js';
import { AssetCatalog } from './AssetCatalog.js';
import { PropertyInspector } from './PropertyInspector.js';
import { StatusBar } from './StatusBar.js';
import { LayerPanel } from './LayerPanel.js';
import { CanvasEngine } from '../../engine/canvas/CanvasEngine.js';
import { WallTool } from '../../engine/tools/WallTool.js';
import { OpeningTool } from '../../engine/tools/OpeningTool.js';
import { FurnitureTool } from '../../engine/tools/FurnitureTool.js';
import { SelectTool } from '../../engine/tools/SelectTool.js';
import { PanTool } from '../../engine/tools/PanTool.js';
import { LineTool } from '../../engine/tools/LineTool.js';
import { uiStore, type ToolType } from '../../core/store/uiStore.js';
import { planStore } from '../../core/store/planStore.js';
import { fileManager } from '../../core/io/fileManager.js';
import { importImageFromFile } from '../../core/io/imageLoader.js';
import type { Point2D } from '../../core/types.js';
import { isInputElementActive } from '../../engine/input/KeyboardManager.js';

export class AppShell {
  public root: HTMLElement;
  public engine: CanvasEngine;
  public topToolbar: TopToolbar;
  public assetCatalog: AssetCatalog;
  public propertyInspector: PropertyInspector;
  public statusBar: StatusBar;
  public layerPanel: LayerPanel;

  // Tools
  public selectTool: SelectTool;
  public wallTool: WallTool;
  public doorTool: OpeningTool;
  public doubleDoorTool: OpeningTool;
  public windowTool: OpeningTool;
  public furnitureTool: FurnitureTool;
  public lineTool: LineTool;
  public panTool: PanTool;

  constructor(rootContainer: HTMLElement) {
    this.root = rootContainer;
    this.root.className = 'cad-shell';

    // 1. Instantiate Sub-components
    this.topToolbar = new TopToolbar();
    this.assetCatalog = new AssetCatalog();
    this.propertyInspector = new PropertyInspector();
    this.statusBar = new StatusBar();
    this.layerPanel = new LayerPanel();

    // 2. Assemble Workspace DOM Structure
    const workspaceLayer = document.createElement('div');
    workspaceLayer.className = 'workspace-layer';

    const canvasViewport = document.createElement('main');
    canvasViewport.className = 'canvas-viewport';

    const canvas = document.createElement('canvas');
    canvas.id = 'cad-canvas';
    canvasViewport.appendChild(canvas);

    workspaceLayer.appendChild(this.assetCatalog.element);
    workspaceLayer.appendChild(canvasViewport);
    workspaceLayer.appendChild(this.propertyInspector.element);
    workspaceLayer.appendChild(this.layerPanel.element);

    this.root.innerHTML = '';
    this.root.appendChild(this.topToolbar.element);
    this.root.appendChild(workspaceLayer);
    this.root.appendChild(this.statusBar.element);

    // 3. Initialize CAD Canvas Engine
    this.engine = new CanvasEngine({
      canvas,
    });

    // 4. Register Tools
    this.selectTool = new SelectTool();
    this.wallTool = new WallTool();
    this.doorTool = new OpeningTool({ id: 'door', openingType: 'single_door', defaultWidth: 900 });
    this.doubleDoorTool = new OpeningTool({ id: 'double_door', openingType: 'double_door', defaultWidth: 1500 });
    this.windowTool = new OpeningTool({ id: 'window', openingType: 'window', defaultWidth: 1200 });
    this.furnitureTool = new FurnitureTool();
    this.lineTool = new LineTool();
    this.panTool = new PanTool();

    this.engine.toolManager.registerTool(this.selectTool);
    this.engine.toolManager.registerTool(this.wallTool);
    this.engine.toolManager.registerTool(this.doorTool);
    this.engine.toolManager.registerTool(this.doubleDoorTool);
    this.engine.toolManager.registerTool(this.windowTool);
    this.engine.toolManager.registerTool(this.furnitureTool);
    this.engine.toolManager.registerTool(this.lineTool);
    this.engine.toolManager.registerTool(this.panTool);

    // Set initial tool
    this.engine.toolManager.setActiveTool('select', this.engine.getToolContext());

    // 5. Setup Store Bindings & Subscriptions
    this.setupStoreBindings(canvas);

    // 6. Setup Drag & Drop from Catalog
    this.setupDragAndDrop(canvasViewport, canvas);

    // 7. Setup Global Keyboard Shortcuts
    this.setupKeyboardShortcuts();

    // 8. Initial Render
    this.engine.updateCanvasDimensions();
    this.engine.render();
  }

  private setupStoreBindings(canvas: HTMLCanvasElement): void {
    // 1. Sync Tool switching from uiStore to engine
    uiStore.subscribe((state, prevState) => {
      if (state.activeTool !== prevState.activeTool) {
        let toolId = state.activeTool as string;
        if (toolId === 'door' && state.activeTool === 'double_door') {
          toolId = 'double_door';
        }
        this.engine.toolManager.setActiveTool(toolId, this.engine.getToolContext());
        this.updateStatusHint();
      }

      // Handle placement trigger
      if (
        state.activeTool === 'furniture' &&
        state.activePlacementDefId &&
        state.activePlacementDefId !== prevState.activePlacementDefId
      ) {
        this.engine.toolManager.setActiveTool('furniture', this.engine.getToolContext());
        this.furnitureTool.startPlacement(state.activePlacementDefId, this.engine.getToolContext());
      }

      // Grid snap
      this.engine.snapEngine.gridSnapEnabled = state.snapToGrid;
      this.engine.snapEngine.gridSpacingMm = state.gridSpacingMm;

      // Viewport action triggers
      if (state.zoomToFitTrigger !== prevState.zoomToFitTrigger) {
        this.handleZoomToFit();
      }
      if (state.resetZoomTrigger !== prevState.resetZoomTrigger) {
        this.handleResetZoom();
      }

      if (state.unitSettings !== prevState.unitSettings) {
        this.engine.requestRender();
      }
    });

    // 2. Sync planStore changes to canvas render
    planStore.subscribe(() => {
      this.engine.requestRender();
    });

    // 3. Pointer move updates coordinates in uiStore
    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const screenPt: Point2D = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      const worldPt = this.engine.viewport.screenToWorld(screenPt);

      uiStore.getState().setCursorWorldPos(worldPt);
      uiStore.getState().setZoom(this.engine.viewport.zoom);
    });

    // 4. Window resize triggers canvas update
    window.addEventListener('resize', () => {
      this.engine.updateCanvasDimensions();
      this.engine.render();
    });
  }

  private setupDragAndDrop(viewport: HTMLElement, canvas: HTMLCanvasElement): void {
    viewport.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    });

    viewport.addEventListener('drop', async (e: DragEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const screenPt: Point2D = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      const worldPt = this.engine.viewport.screenToWorld(screenPt);

      // 1. Check if dropped item is an image file
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.type.startsWith('image/')) {
            try {
              await importImageFromFile(file, { worldPosition: worldPt });
              this.engine.requestRender();
            } catch (err) {
              console.error('Failed to import dropped image:', err);
            }
            return;
          }
        }
      }

      // 2. Check if dropped item is a catalog furniture asset
      const defId = e.dataTransfer?.getData('text/plain');
      if (!defId) return;

      // Create furniture instance
      const newInst = planStore.getState().addFurniture(defId, worldPt);
      planStore.getState().selectFurniture(newInst.id);
      uiStore.getState().setActiveTool('select');
      this.engine.requestRender();
    });
  }

  private setupKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input
      if (isInputElementActive()) {
        return;
      }

      // Tool Switcher Shortcuts
      if (e.code === 'KeyV') {
        uiStore.getState().setActiveTool('select');
      } else if (e.code === 'KeyW') {
        uiStore.getState().setActiveTool('wall');
      } else if (e.code === 'KeyD') {
        uiStore.getState().setActiveTool('door');
      } else if (e.code === 'KeyO') {
        uiStore.getState().setActiveTool('window');
      } else if (e.code === 'KeyH') {
        uiStore.getState().setActiveTool('pan');
      } else if (e.code === 'KeyM') {
        uiStore.getState().setActiveTool('furniture');
      } else if (e.code === 'KeyL' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        uiStore.getState().setActiveTool('line');
      }

      // Toggles
      if (e.code === 'KeyG') {
        uiStore.getState().toggleSnapToGrid();
      } else if (e.shiftKey && e.code === 'KeyL') {
        uiStore.getState().toggleLayers();
      } else if (e.code === 'F8') {
        uiStore.getState().toggleOrthoLock();
        e.preventDefault();
      }

      // File Operations
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyN') {
        e.preventDefault();
        fileManager.newProject();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyO') {
        e.preventDefault();
        fileManager.openProject();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        e.preventDefault();
        if (e.shiftKey) {
          fileManager.saveProjectAs();
        } else {
          fileManager.saveProject();
        }
      }

      // History
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        if (e.shiftKey) {
          planStore.getState().redo();
        } else {
          planStore.getState().undo();
        }
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        planStore.getState().redo();
        e.preventDefault();
      }

      // Viewport shortcuts
      if (e.shiftKey && e.code === 'Digit1') {
        this.handleZoomToFit();
        e.preventDefault();
      } else if (e.shiftKey && e.code === 'Digit0') {
        this.handleResetZoom();
        e.preventDefault();
      }
    });
  }

  private handleZoomToFit(): void {
    const state = planStore.getState();
    const vertices = Object.values(state.vertices);
    const furniture = Object.values(state.furniture);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const v of vertices) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    }

    for (const f of furniture) {
      const hw = f.width / 2;
      const hh = f.height / 2;
      if (f.x - hw < minX) minX = f.x - hw;
      if (f.y - hh < minY) minY = f.y - hh;
      if (f.x + hw > maxX) maxX = f.x + hw;
      if (f.y + hh > maxY) maxY = f.y + hh;
    }

    const rect = this.engine.canvas.getBoundingClientRect();
    const sw = rect.width || 800;
    const sh = rect.height || 600;

    if (minX !== Infinity && maxX !== -Infinity) {
      this.engine.viewport.zoomToFit({ minX, minY, maxX, maxY }, sw, sh, 0.1);
    } else {
      this.engine.viewport.resetZoom(sw, sh, 0.1);
    }

    uiStore.getState().setZoom(this.engine.viewport.zoom);
    this.engine.requestRender();
  }

  private handleResetZoom(): void {
    const rect = this.engine.canvas.getBoundingClientRect();
    const sw = rect.width || 800;
    const sh = rect.height || 600;
    this.engine.viewport.resetZoom(sw, sh, 0.1);
    uiStore.getState().setZoom(this.engine.viewport.zoom);
    this.engine.requestRender();
  }

  private updateStatusHint(): void {
    const tool = uiStore.getState().activeTool;
    let hint = 'Ready';

    switch (tool) {
      case 'select':
        hint = 'Select Tool: Click walls, openings, rooms or furniture to inspect & transform. [Del to remove]';
        break;
      case 'wall':
        hint = 'Wall Tool: Click to anchor joint. Hold Shift for Ortho angle lock.';
        break;
      case 'door':
        hint = 'Door Tool: Hover over wall segment and click to place. [F: Flip Swing, V: Flip Side]';
        break;
      case 'window':
        hint = 'Window Tool: Hover over wall segment and click to place window opening.';
        break;
      case 'pan':
        hint = 'Pan Tool: Drag left mouse button to pan viewport. [Wheel to zoom]';
        break;
      case 'furniture':
        hint = 'Furniture Tool: Click to place symbol. Drag rotation handle to rotate (+Shift for 15° snap).';
        break;
      case 'line':
        hint = 'Line Tool: Click to anchor start point, move to preview (+Shift for 45° angle snap), click to place line.';
        break;
    }

    this.statusBar.setHint(hint);
  }
}
