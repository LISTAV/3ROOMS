import type { Point2D, OpeningType, Opening, Wall } from '../../core/types.js';
import type { Viewport } from '../viewport/Viewport.js';
import type { Tool, ToolContext } from './Tool.js';
import { projectPointOnSegment } from '../../core/math/line.js';
import { distance, length, sub, add, scale, normal } from '../../core/math/vector.js';
import { planStore } from '../../core/store/planStore.js';
import { computeOpeningGeometry, type OpeningGeometry } from '../../core/geometry/openings.js';
import { OpeningRenderer } from '../renderer/OpeningRenderer.js';
import { drawDimension } from '../renderer/DimensionRenderer.js';
import { formatLength } from '../../core/units/unitFormatter.js';
import { uiStore } from '../../core/store/uiStore.js';

export interface OpeningToolOptions {
  id?: string;
  openingType?: OpeningType;
  defaultWidth?: number;
}

/**
 * Interactive tool for parametrically anchoring openings (doors and windows) to walls:
 * - Live projection and margin-clamped preview when hovering over a wall
 * - Single-click placement to commit to planStore
 * - Direct selection and dragging (sliding along wall) of placed openings
 * - Keyboard shortcuts: F / Space toggles swing direction (flipH), V toggles swing side (flipV)
 */
export class OpeningTool implements Tool {
  public readonly id: string;

  public openingType: OpeningType = 'single_door';
  public defaultWidth: number = 900; // mm (doors: 900, windows: 1200)
  public hoverWallId: string | null = null;
  public previewOffsetRatio: number = 0.5;
  public flipH: boolean = false;
  public flipV: boolean = false;

  // Dragging / Sliding state
  public isDragging: boolean = false;
  public dragOpeningId: string | null = null;

  private previewRenderer: OpeningRenderer = new OpeningRenderer({
    leafFillColor: 'rgba(255, 255, 255, 0.7)',
    leafStrokeColor: '#2563eb',
    arcColor: '#3b82f6',
    windowGlassColor: '#0284c7',
  });

  constructor(options: OpeningToolOptions = {}) {
    this.id = options.id ?? 'opening';
    if (options.openingType) {
      this.setOpeningType(options.openingType, options.defaultWidth);
    } else if (options.defaultWidth) {
      this.defaultWidth = options.defaultWidth;
    }
  }

  /**
   * Updates the opening type and adjusts the default width accordingly.
   */
  public setOpeningType(type: OpeningType, width?: number): void {
    this.openingType = type;
    if (width !== undefined) {
      this.defaultWidth = width;
    } else if (type === 'window') {
      this.defaultWidth = 1200;
    } else if (type === 'double_door') {
      this.defaultWidth = 1500;
    } else {
      this.defaultWidth = 900;
    }
  }

  public onActivate(_ctx: ToolContext): void {
    this.reset();
  }

  public onDeactivate(_ctx: ToolContext): void {
    this.reset();
  }

  public reset(): void {
    this.hoverWallId = null;
    this.previewOffsetRatio = 0.5;
    this.isDragging = false;
    this.dragOpeningId = null;
  }

  public onPointerMove(e: PointerEvent, worldPoint: Point2D, ctx: ToolContext): void {
    const store = planStore.getState();
    const zoom = ctx.viewport.zoom;
    const hoverThresholdMm = 15 / zoom;

    // 1. If currently dragging an existing opening along its parent wall
    if (this.isDragging && this.dragOpeningId) {
      const opening = store.openings[this.dragOpeningId];
      if (!opening) {
        this.isDragging = false;
        this.dragOpeningId = null;
        return;
      }

      const wall = store.walls[opening.wallId];
      if (wall) {
        const startV = store.vertices[wall.startId];
        const endV = store.vertices[wall.endId];
        if (startV && endV) {
          const wallLen = distance(startV, endV);
          if (wallLen >= opening.width) {
            const margin = wall.thickness / 2 + opening.width / 2;
            const proj = projectPointOnSegment(worldPoint, startV, endV);
            const clampedDist =
              wallLen >= 2 * margin
                ? Math.max(margin, Math.min(wallLen - margin, proj.t * wallLen))
                : wallLen / 2;

            store.moveOpening(this.dragOpeningId, clampedDist / wallLen);
            ctx.requestRender();
          }
        }
      }
      return;
    }

    // 2. Query spatial index or store walls for hover candidate
    const queryRadius = Math.max(hoverThresholdMm, 150);
    const nearbyItems = ctx.spatialIndex.queryRadius(worldPoint, queryRadius);

    let candidateWall: Wall | null = null;
    let minDistance = hoverThresholdMm;

    // Check spatial index candidates first
    for (const item of nearbyItems) {
      if (item.type !== 'wall') continue;
      const wall = store.walls[item.id];
      if (!wall) continue;
      const startV = store.vertices[wall.startId];
      const endV = store.vertices[wall.endId];
      if (!startV || !endV) continue;

      const proj = projectPointOnSegment(worldPoint, startV, endV);
      if (proj.distance < minDistance) {
        minDistance = proj.distance;
        candidateWall = wall;
      }
    }

    // Fallback: check all store walls if spatial index was empty
    if (!candidateWall && nearbyItems.length === 0) {
      for (const wall of Object.values(store.walls)) {
        const startV = store.vertices[wall.startId];
        const endV = store.vertices[wall.endId];
        if (!startV || !endV) continue;

        const proj = projectPointOnSegment(worldPoint, startV, endV);
        if (proj.distance < minDistance) {
          minDistance = proj.distance;
          candidateWall = wall;
        }
      }
    }

    if (candidateWall) {
      const startV = store.vertices[candidateWall.startId];
      const endV = store.vertices[candidateWall.endId];

      if (startV && endV) {
        const wallLen = distance(startV, endV);

        // Guard minimum wall length
        if (wallLen >= this.defaultWidth) {
          const margin = candidateWall.thickness / 2 + this.defaultWidth / 2;
          const proj = projectPointOnSegment(worldPoint, startV, endV);
          const clampedDist =
            wallLen >= 2 * margin
              ? Math.max(margin, Math.min(wallLen - margin, proj.t * wallLen))
              : wallLen / 2;

          this.hoverWallId = candidateWall.id;
          this.previewOffsetRatio = clampedDist / wallLen;
          ctx.requestRender();
          return;
        }
      }
    }

    if (this.hoverWallId !== null) {
      this.hoverWallId = null;
      ctx.requestRender();
    }
  }

  public onPointerDown(e: PointerEvent, worldPoint: Point2D, ctx: ToolContext): void {
    if (e.button !== 0) return; // Left click only

    const store = planStore.getState();
    const zoom = ctx.viewport.zoom;
    const thresholdMm = 20 / zoom;

    // 1. Check if clicking on flip handle buttons of any selected opening
    for (const selId of store.selectedIds) {
      const op = store.openings[selId];
      if (!op) continue;
      const wall = store.walls[op.wallId];
      if (!wall) continue;
      const geom = computeOpeningGeometry(op, wall, store.vertices);
      if (!geom) continue;

      const flipPos = OpeningRenderer.getFlipButtonPositions(geom, zoom);
      if (distance(worldPoint, flipPos.flipH) <= flipPos.radius * 1.5) {
        store.toggleOpeningFlipH(op.id);
        ctx.requestRender();
        return;
      }
      if (distance(worldPoint, flipPos.flipV) <= flipPos.radius * 1.5) {
        store.toggleOpeningFlipV(op.id);
        ctx.requestRender();
        return;
      }
    }

    // 2. Check if clicking on an existing opening to select and drag it
    for (const op of Object.values(store.openings)) {
      const wall = store.walls[op.wallId];
      if (!wall) continue;
      const geom = computeOpeningGeometry(op, wall, store.vertices);
      if (!geom) continue;

      if (OpeningRenderer.isPointNearOpening(worldPoint, geom, thresholdMm)) {
        store.setSelectedIds([op.id]);
        this.isDragging = true;
        this.dragOpeningId = op.id;
        ctx.requestRender();
        return;
      }
    }

    // 3. Anchor new opening if hovering over a valid wall
    if (this.hoverWallId) {
      const newOpening = store.addOpening({
        wallId: this.hoverWallId,
        offsetRatio: this.previewOffsetRatio,
        width: this.defaultWidth,
        type: this.openingType,
        flipH: this.flipH,
        flipV: this.flipV,
      });

      store.setSelectedIds([newOpening.id]);
      ctx.requestRender();
    } else {
      // Clicked on empty space: clear selection
      if (store.selectedIds.length > 0) {
        store.setSelectedIds([]);
        ctx.requestRender();
      }
    }
  }

  public onPointerUp(_e: PointerEvent, _worldPoint: Point2D, _ctx: ToolContext): void {
    this.isDragging = false;
    this.dragOpeningId = null;
  }

  public onKeyDown(e: KeyboardEvent, ctx: ToolContext): void {
    const store = planStore.getState();
    const selectedOpeningId = store.selectedIds.find((id) => store.openings[id]);

    // Flip Swing (flipH): F or Space
    if (e.code === 'KeyF' || e.code === 'Space') {
      if (selectedOpeningId) {
        store.toggleOpeningFlipH(selectedOpeningId);
      }
      this.flipH = !this.flipH;
      ctx.requestRender();
      e.preventDefault();
      return;
    }

    // Flip Side (flipV): V
    if (e.code === 'KeyV') {
      if (selectedOpeningId) {
        store.toggleOpeningFlipV(selectedOpeningId);
      }
      this.flipV = !this.flipV;
      ctx.requestRender();
      e.preventDefault();
      return;
    }

    // Delete selected opening: Delete or Backspace
    if (e.code === 'Delete' || e.code === 'Backspace') {
      if (store.selectedIds.length > 0) {
        store.deleteElements(store.selectedIds);
        ctx.requestRender();
      }
      return;
    }

    // Escape: clear selection or reset hover
    if (e.code === 'Escape') {
      if (store.selectedIds.length > 0) {
        store.setSelectedIds([]);
      }
      this.reset();
      ctx.requestRender();
    }
  }

  public renderOverlay(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    if (!this.hoverWallId || this.isDragging) return;

    const store = planStore.getState();
    const wall = store.walls[this.hoverWallId];
    if (!wall) return;

    const startV = store.vertices[wall.startId];
    const endV = store.vertices[wall.endId];
    if (!startV || !endV) return;

    const zoom = viewport.zoom;
    const screenPixel = 1 / zoom;

    const previewOpening: Opening = {
      id: 'preview',
      wallId: this.hoverWallId,
      offsetRatio: this.previewOffsetRatio,
      width: this.defaultWidth,
      type: this.openingType,
      flipH: this.flipH,
      flipV: this.flipV,
    };

    const geom = computeOpeningGeometry(previewOpening, wall, store.vertices);
    if (!geom) return;

    ctx.save();

    // 1. Draw glowing dashed guide line along parent wall centerline
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
    ctx.lineWidth = 2 * screenPixel;
    ctx.setLineDash([4 * screenPixel, 4 * screenPixel]);
    ctx.beginPath();
    ctx.moveTo(startV.x, startV.y);
    ctx.lineTo(endV.x, endV.y);
    ctx.stroke();

    // 2. Render live preview of opening symbol
    this.previewRenderer.render(
      ctx,
      { preview: previewOpening },
      { [wall.id]: wall },
      store.vertices,
      [],
      zoom
    );

    // 3. Render placement distance dimensions to wall ends
    drawDimension(ctx, startV, geom.spanStart, 300, zoom);
    drawDimension(ctx, geom.spanEnd, endV, 300, zoom);

    // 4. Render small HUD badge near opening center
    const badgePos = add(geom.center, scale(normal(geom.unitVector), wall.thickness / 2 + 50 * screenPixel));
    ctx.save();
    ctx.font = `bold ${Math.round(11 * screenPixel)}px sans-serif`;
    const unitSettings = uiStore.getState().unitSettings;
    const widthText = formatLength(this.defaultWidth, unitSettings);
    const label = `${this.openingType === 'window' ? 'Window' : 'Door'} ${widthText} [F/Space: Flip, V: Side]`;
    const textWidth = ctx.measureText(label).width;
    const padX = 8 * screenPixel;
    const padY = 4 * screenPixel;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1 * screenPixel;

    ctx.beginPath();
    ctx.roundRect?.(
      badgePos.x - textWidth / 2 - padX,
      badgePos.y - 8 * screenPixel - padY,
      textWidth + padX * 2,
      16 * screenPixel + padY * 2,
      4 * screenPixel
    );
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, badgePos.x, badgePos.y);
    ctx.restore();

    ctx.restore();
  }
}
