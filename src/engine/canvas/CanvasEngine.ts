import type { Point2D } from '../../core/types.js';
import { Viewport } from '../viewport/Viewport.js';
import { GridRenderer } from './GridRenderer.js';
import { ToolManager } from '../tools/ToolManager.js';
import { SnapEngine } from '../../core/snap/SnapEngine.js';
import { SpatialIndex } from '../../core/spatial/SpatialIndex.js';
import type { ToolContext } from '../tools/Tool.js';
import { planStore } from '../../core/store/planStore.js';
import { computeParallelOffset } from '../../core/math/line.js';
import { drawDimension } from '../renderer/DimensionRenderer.js';

import { WallRenderer } from '../renderer/WallRenderer.js';
import { RoomRenderer } from '../renderer/RoomRenderer.js';
import { OpeningRenderer } from '../renderer/OpeningRenderer.js';
import { FurnitureLayer } from '../layers/FurnitureLayer.js';
import { assetManager } from '../../core/assets/AssetManager.js';
import { generateWallPolygons } from '../../core/geometry/miter.js';
import { generateWallPolygonsWithOpenings } from '../../core/geometry/openings.js';

export interface CanvasEngineOptions {
  canvas: HTMLCanvasElement;
  viewport?: Viewport;
  gridRenderer?: GridRenderer;
  wallRenderer?: WallRenderer;
  roomRenderer?: RoomRenderer;
  openingRenderer?: OpeningRenderer;
  furnitureLayer?: FurnitureLayer;
  toolManager?: ToolManager;
  snapEngine?: SnapEngine;
  spatialIndex?: SpatialIndex;
  backgroundColor?: string;
}

/**
 * Controller managing the HTMLCanvasElement lifecycle, Retina/HiDPI scaling,
 * mouse/keyboard viewport interaction, tool routing, and immediate-mode render loop.
 */
export class CanvasEngine {
  public readonly canvas: HTMLCanvasElement;
  public readonly ctx: CanvasRenderingContext2D;
  public readonly viewport: Viewport;
  public readonly gridRenderer: GridRenderer;
  public readonly wallRenderer: WallRenderer;
  public readonly roomRenderer: RoomRenderer;
  public readonly openingRenderer: OpeningRenderer;
  public readonly furnitureLayer: FurnitureLayer;
  public readonly toolManager: ToolManager;
  public readonly snapEngine: SnapEngine;
  public readonly spatialIndex: SpatialIndex;
  public backgroundColor: string;

  private dpr: number = 1;
  private resizeObserver: ResizeObserver | null = null;
  private animationFrameId: number | null = null;

  // Interaction state
  private isPanning: boolean = false;
  private isSpacePressed: boolean = false;
  private activePointerId: number | null = null;
  private lastPointerPos: Point2D | null = null;

  // Bound event listeners for cleanup
  private boundOnPointerDown: (e: PointerEvent) => void;
  private boundOnPointerMove: (e: PointerEvent) => void;
  private boundOnPointerUp: (e: PointerEvent) => void;
  private boundOnWheel: (e: WheelEvent) => void;
  private boundOnKeyDown: (e: KeyboardEvent) => void;
  private boundOnKeyUp: (e: KeyboardEvent) => void;
  private boundOnContextMenu: (e: MouseEvent) => void;

  constructor(options: CanvasEngineOptions) {
    this.canvas = options.canvas;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('CanvasEngine requires a 2D rendering context.');
    }
    this.ctx = ctx;

    this.viewport = options.viewport ?? new Viewport();
    this.gridRenderer = options.gridRenderer ?? new GridRenderer();
    this.wallRenderer = options.wallRenderer ?? new WallRenderer();
    this.roomRenderer = options.roomRenderer ?? new RoomRenderer();
    this.openingRenderer = options.openingRenderer ?? new OpeningRenderer();
    this.furnitureLayer = options.furnitureLayer ?? new FurnitureLayer();
    this.spatialIndex = options.spatialIndex ?? new SpatialIndex();
    this.snapEngine = options.snapEngine ?? new SnapEngine({ spatialIndex: this.spatialIndex });
    this.toolManager = options.toolManager ?? new ToolManager();
    this.backgroundColor = options.backgroundColor ?? '#f8fafc'; // Slate-50 off-white

    // Subscribe to asset manager updates (re-render when SVG textures load)
    assetManager.onAssetLoaded(() => {
      this.requestRender();
    });

    // Bind event handlers
    this.boundOnPointerDown = this.handlePointerDown.bind(this);
    this.boundOnPointerMove = this.handlePointerMove.bind(this);
    this.boundOnPointerUp = this.handlePointerUp.bind(this);
    this.boundOnWheel = this.handleWheel.bind(this);
    this.boundOnKeyDown = this.handleKeyDown.bind(this);
    this.boundOnKeyUp = this.handleKeyUp.bind(this);
    this.boundOnContextMenu = (e) => e.preventDefault();

    this.attachEvents();
    this.setupResizeObserver();
  }

  /**
   * Returns the current tool execution context.
   */
  public getToolContext(): ToolContext {
    return {
      viewport: this.viewport,
      snapEngine: this.snapEngine,
      spatialIndex: this.spatialIndex,
      requestRender: () => this.requestRender(),
    };
  }

  /**
   * Schedules a single requestAnimationFrame pass when viewport or scene changes.
   */
  public requestRender(): void {
    if (this.animationFrameId === null && typeof requestAnimationFrame !== 'undefined') {
      this.animationFrameId = requestAnimationFrame(() => {
        this.animationFrameId = null;
        this.render();
      });
    }
  }

  /**
   * Immediate-mode render pass executing the pipeline:
   * Background -> GridRenderer -> Origin Box -> Committed Walls -> Tool Overlays
   */
  public render(): void {
    const clientWidth = this.canvas.clientWidth || 800;
    const clientHeight = this.canvas.clientHeight || 600;
    const dpr = this.dpr;

    // 1. Reset context to device pixel space
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 2. Clear canvas with background color
    this.ctx.fillStyle = this.backgroundColor;
    this.ctx.fillRect(0, 0, clientWidth, clientHeight);

    // 3. Apply Viewport Transform in world millimeter space
    this.ctx.setTransform(
      dpr * this.viewport.zoom,
      0,
      0,
      dpr * this.viewport.zoom,
      dpr * this.viewport.panX,
      dpr * this.viewport.panY
    );

    // 4. Render infinite CAD grid in world coordinates
    this.gridRenderer.render(this.ctx, this.viewport, clientWidth, clientHeight);

    // 5. Render Room Floor Fills & Badges
    const state = planStore.getState();
    const selectedRoomId = state.selectedIds.find((id) => state.rooms[id]) ?? null;
    this.roomRenderer.render(
      this.ctx,
      state.rooms,
      state.vertices,
      selectedRoomId,
      this.viewport.zoom
    );

    // 6. Render Placeholder World Origin Box: 1000x1000mm (1m x 1m)
    this.renderOriginBox();

    // 6b. Render Furniture & Architectural Symbols Layer
    this.furnitureLayer.render(
      this.ctx,
      state.furniture,
      this.viewport.zoom,
      state.selectedFurnitureId
    );

    // 7. Render Committed Walls from PlanStore (sliced by openings)
    this.renderCommittedWalls();

    // 7b. Render Committed Openings from PlanStore (doors, windows, CAD symbols)
    this.openingRenderer.render(
      this.ctx,
      state.openings,
      state.walls,
      state.vertices,
      state.selectedIds,
      this.viewport.zoom
    );

    // 8. Render Active Tool Overlays (live preview, snap markers, guidelines, dimensions)
    this.toolManager.renderOverlay(this.ctx, this.viewport);
  }

  /**
   * Renders committed walls and joint vertices from the graph store.
   */
  private renderCommittedWalls(): void {
    const state = planStore.getState();
    const zoom = this.viewport.zoom;
    const screenPixel = 1 / zoom;

    // 1. Generate clean mitered polygons for all walls, sliced by openings
    const wallPolygons =
      Object.keys(state.openings).length > 0
        ? generateWallPolygonsWithOpenings(state.vertices, state.walls, state.openings)
        : generateWallPolygons(state.vertices, state.walls);

    // 2. Render solid wall bodies, seamless corner miters, and selection highlights
    this.wallRenderer.render(
      this.ctx,
      wallPolygons,
      state.selectedIds,
      zoom,
      { vertices: state.vertices, walls: state.walls, openings: state.openings }
    );

    // 3. Render dimension annotations along committed walls
    for (const wall of Object.values(state.walls)) {
      const startV = state.vertices[wall.startId];
      const endV = state.vertices[wall.endId];
      if (!startV || !endV) continue;

      drawDimension(this.ctx, startV, endV, 350, zoom);
    }

    // Render joint vertices
    for (const vertex of Object.values(state.vertices)) {
      this.ctx.fillStyle = '#0ea5e9'; // sky-500
      this.ctx.strokeStyle = '#0369a1'; // sky-700
      this.ctx.lineWidth = 1 * screenPixel;

      this.ctx.beginPath();
      this.ctx.arc(vertex.x, vertex.y, 3 * screenPixel, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  /**
   * Draws a 1000x1000mm (1m x 1m) reference box at the world origin (0, 0).
   */
  private renderOriginBox(): void {
    const screenPixelInWorld = 1 / this.viewport.zoom;

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(59, 130, 246, 0.06)';
    this.ctx.fillRect(0, 0, 1000, 1000);

    this.ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
    this.ctx.lineWidth = 1.5 * screenPixelInWorld;
    this.ctx.strokeRect(0, 0, 1000, 1000);

    this.ctx.restore();
  }

  /**
   * Initializes Retina/HiDPI canvas resizing via ResizeObserver.
   */
  private setupResizeObserver(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.updateCanvasDimensions();
      });
      this.resizeObserver.observe(this.canvas);
    }
    this.updateCanvasDimensions();
  }

  /**
   * Updates canvas internal buffer resolution to match physical display pixels.
   */
  public updateCanvasDimensions(): void {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.dpr = dpr;

    const rect = this.canvas.getBoundingClientRect();
    const displayWidth = rect.width || this.canvas.clientWidth || 800;
    const displayHeight = rect.height || this.canvas.clientHeight || 600;

    const physicalWidth = Math.round(displayWidth * dpr);
    const physicalHeight = Math.round(displayHeight * dpr);

    if (this.canvas.width !== physicalWidth || this.canvas.height !== physicalHeight) {
      this.canvas.width = physicalWidth;
      this.canvas.height = physicalHeight;
      this.requestRender();
    }
  }

  private attachEvents(): void {
    this.canvas.addEventListener('pointerdown', this.boundOnPointerDown);
    this.canvas.addEventListener('pointermove', this.boundOnPointerMove);
    this.canvas.addEventListener('pointerup', this.boundOnPointerUp);
    this.canvas.addEventListener('pointercancel', this.boundOnPointerUp);
    this.canvas.addEventListener('wheel', this.boundOnWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.boundOnContextMenu);

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.boundOnKeyDown);
      window.addEventListener('keyup', this.boundOnKeyUp);
    }
  }

  public destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.boundOnPointerDown);
    this.canvas.removeEventListener('pointermove', this.boundOnPointerMove);
    this.canvas.removeEventListener('pointerup', this.boundOnPointerUp);
    this.canvas.removeEventListener('pointercancel', this.boundOnPointerUp);
    this.canvas.removeEventListener('wheel', this.boundOnWheel);
    this.canvas.removeEventListener('contextmenu', this.boundOnContextMenu);

    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundOnKeyDown);
      window.removeEventListener('keyup', this.boundOnKeyUp);
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.animationFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private handlePointerDown(e: PointerEvent): void {
    const isMiddleMouse = e.button === 1;
    const isLeftWithSpace = e.button === 0 && this.isSpacePressed;

    if (isMiddleMouse || isLeftWithSpace) {
      this.isPanning = true;
      this.activePointerId = e.pointerId;
      this.lastPointerPos = { x: e.clientX, y: e.clientY };

      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }

      this.canvas.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    // Forward to active tool
    const rect = this.canvas.getBoundingClientRect();
    const screenPt: Point2D = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    const worldPt = this.viewport.screenToWorld(screenPt);
    this.toolManager.onPointerDown(e, worldPt, this.getToolContext());
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.isPanning && this.lastPointerPos) {
      const deltaX = e.clientX - this.lastPointerPos.x;
      const deltaY = e.clientY - this.lastPointerPos.y;

      this.viewport.panBy(deltaX, deltaY);
      this.lastPointerPos = { x: e.clientX, y: e.clientY };
      this.requestRender();
      return;
    }

    // Forward to active tool
    const rect = this.canvas.getBoundingClientRect();
    const screenPt: Point2D = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    const worldPt = this.viewport.screenToWorld(screenPt);
    this.toolManager.onPointerMove(e, worldPt, this.getToolContext());
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.isPanning && (this.activePointerId === null || e.pointerId === this.activePointerId)) {
      this.isPanning = false;
      this.activePointerId = null;
      this.lastPointerPos = null;

      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }

      this.canvas.style.cursor = this.isSpacePressed ? 'grab' : 'default';
      return;
    }

    // Forward to active tool
    const rect = this.canvas.getBoundingClientRect();
    const screenPt: Point2D = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    const worldPt = this.viewport.screenToWorld(screenPt);
    this.toolManager.onPointerUp(e, worldPt, this.getToolContext());
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const screenAnchor: Point2D = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const zoomFactor = Math.pow(0.999, e.deltaY);
    this.viewport.zoomAt(screenAnchor, zoomFactor);
    this.requestRender();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space' && !this.isSpacePressed) {
      this.isSpacePressed = true;
      if (!this.isPanning) {
        this.canvas.style.cursor = 'grab';
      }
    }

    // Forward to active tool
    this.toolManager.onKeyDown(e, this.getToolContext());
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      this.isSpacePressed = false;
      if (!this.isPanning) {
        this.canvas.style.cursor = 'default';
      }
    }
  }
}
