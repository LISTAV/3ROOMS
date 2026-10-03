import { planStore } from '../../core/store/planStore.js';
import { uiStore, formatLength, formatArea } from '../../core/store/uiStore.js';
import { getIconSvg } from '../icons.js';
import { distance } from '../../core/math/vector.js';
import type { OpeningType, UnitSystem } from '../../core/types.js';

export class PropertyInspector {
  public element: HTMLElement;
  private unsubscribePlan: (() => void) | null = null;
  private unsubscribeUI: (() => void) | null = null;

  constructor() {
    this.element = document.createElement('aside');
    this.element.className = 'property-inspector-sidebar';
    this.render();
    this.subscribeStores();
  }

  public render(): void {
    const isVisible = uiStore.getState().showInspector;
    this.element.classList.toggle('collapsed', !isVisible);

    const plan = planStore.getState();
    const ui = uiStore.getState();

    // Determine selection context
    const selectedFurnId = plan.selectedFurnitureId;
    const selectedId = plan.selectedIds[0];

    let contentHtml = '';

    if (selectedFurnId && plan.furniture[selectedFurnId]) {
      contentHtml = this.renderFurnitureProperties(plan.furniture[selectedFurnId]);
    } else if (selectedId && plan.openings[selectedId]) {
      contentHtml = this.renderOpeningProperties(plan.openings[selectedId]);
    } else if (selectedId && plan.walls[selectedId]) {
      contentHtml = this.renderWallProperties(plan.walls[selectedId]);
    } else if (selectedId && plan.rooms[selectedId]) {
      contentHtml = this.renderRoomProperties(plan.rooms[selectedId]);
    } else {
      contentHtml = this.renderProjectProperties();
    }

    this.element.innerHTML = `
      <div class="inspector-header">
        <div class="inspector-title">
          <span class="inspector-icon">${getIconSvg('Sliders', 16)}</span>
          <span>Properties</span>
        </div>
        <button class="icon-btn-ghost" id="inspector-close-btn" title="Close Panel">
          ${getIconSvg('X', 14)}
        </button>
      </div>

      <div class="inspector-body">
        ${contentHtml}
      </div>
    `;

    this.bindEvents();
  }

  // --------------------------------------------------------------------------
  // 1. PROJECT METADATA (NO SELECTION)
  // --------------------------------------------------------------------------
  private renderProjectProperties(): string {
    const plan = planStore.getState();
    const ui = uiStore.getState();

    const wallCount = Object.keys(plan.walls).length;
    const roomCount = Object.keys(plan.rooms).length;
    const furnCount = Object.keys(plan.furniture).length;

    // Sum enclosed area across detected rooms
    let totalAreaMm2 = 0;
    for (const r of Object.values(plan.rooms)) {
      totalAreaMm2 += r.areaMm2;
    }

    return `
      <div class="property-section">
        <div class="section-title">
          <span>Project Overview</span>
        </div>

        <div class="metric-grid">
          <div class="metric-card">
            <span class="metric-label">Enclosed Area</span>
            <span class="metric-value highlight">${formatArea(totalAreaMm2, ui.unitSystem)}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Total Walls</span>
            <span class="metric-value">${wallCount}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Rooms</span>
            <span class="metric-value">${roomCount}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Furniture Assets</span>
            <span class="metric-value">${furnCount}</span>
          </div>
        </div>
      </div>

      <div class="property-section">
        <div class="section-title">
          <span>Units & Drafting Grid</span>
        </div>

        <div class="form-group">
          <label>Unit System</label>
          <div class="segmented-control" id="unit-system-control">
            <button class="segment-btn ${ui.unitSystem === 'metric_mm' ? 'active' : ''}" data-unit="metric_mm">Millimeters (mm)</button>
            <button class="segment-btn ${ui.unitSystem === 'metric_m' ? 'active' : ''}" data-unit="metric_m">Meters (m)</button>
            <button class="segment-btn ${ui.unitSystem === 'imperial_ft' ? 'active' : ''}" data-unit="imperial_ft">Feet-Inches (ft)</button>
          </div>
        </div>

        <div class="form-group">
          <label>Grid Spacing (mm)</label>
          <div class="preset-pill-group">
            ${[50, 100, 200, 500, 1000]
              .map(
                (step) => `
              <button class="preset-pill ${ui.gridSpacingMm === step ? 'active' : ''}" data-grid="${step}">${step}mm</button>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 2. WALL PROPERTIES
  // --------------------------------------------------------------------------
  private renderWallProperties(wall: { id: string; startId: string; endId: string; thickness: number }): string {
    const plan = planStore.getState();
    const ui = uiStore.getState();

    const sv = plan.vertices[wall.startId];
    const ev = plan.vertices[wall.endId];
    const lengthMm = sv && ev ? Math.round(distance(sv, ev)) : 0;

    return `
      <div class="property-section">
        <div class="section-title">
          <span>🧱 Wall Element</span>
          <span class="badge-accent">${wall.id}</span>
        </div>

        <div class="form-group">
          <label>Wall Length</label>
          <div class="input-with-unit">
            <input type="number" id="wall-length-input" value="${lengthMm}" step="50" min="100" />
            <span class="unit-tag">mm (${formatLength(lengthMm, ui.unitSystem)})</span>
          </div>
        </div>

        <div class="form-group">
          <label>Thickness Preset</label>
          <div class="preset-pill-group">
            ${[100, 150, 200, 250, 300]
              .map(
                (th) => `
              <button class="preset-pill ${wall.thickness === th ? 'active' : ''}" data-thickness="${th}">${th}mm</button>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="form-group">
          <label>Custom Thickness (mm)</label>
          <input type="number" id="wall-thickness-custom" value="${wall.thickness}" step="10" min="50" max="600" />
        </div>

        <div class="section-divider"></div>

        <button class="btn-danger-block" id="btn-delete-wall">
          ${getIconSvg('Trash2', 15)}
          <span>Delete Wall</span>
        </button>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 3. OPENING PROPERTIES (DOORS & WINDOWS)
  // --------------------------------------------------------------------------
  private renderOpeningProperties(opening: {
    id: string;
    wallId: string;
    offsetRatio: number;
    width: number;
    type: OpeningType;
    flipH: boolean;
    flipV: boolean;
  }): string {
    const types: Array<{ id: OpeningType; label: string }> = [
      { id: 'single_door', label: 'Single Door' },
      { id: 'double_door', label: 'Double Door' },
      { id: 'sliding_window', label: 'Sliding Window' },
      { id: 'fixed_window', label: 'Fixed Window' },
    ];

    return `
      <div class="property-section">
        <div class="section-title">
          <span>🚪 Opening Element</span>
          <span class="badge-accent">${opening.type}</span>
        </div>

        <div class="form-group">
          <label>Opening Type</label>
          <div class="segmented-control vertical" id="opening-type-control">
            ${types
              .map(
                (t) => `
              <button class="segment-btn ${opening.type === t.id ? 'active' : ''}" data-op-type="${t.id}">${t.label}</button>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="form-group">
          <label>Clear Width Preset</label>
          <div class="preset-pill-group">
            ${[750, 820, 900, 1000, 1200, 1500]
              .map(
                (w) => `
              <button class="preset-pill ${opening.width === w ? 'active' : ''}" data-width="${w}">${w}mm</button>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="form-group">
          <label>Custom Width (mm)</label>
          <input type="number" id="opening-width-input" value="${opening.width}" step="50" min="400" max="3000" />
        </div>

        <div class="form-group">
          <label>Orientation & Swings</label>
          <div class="action-btn-row">
            <button class="action-btn ${opening.flipV ? 'active' : ''}" id="btn-flip-v" title="Flip In / Out Side">
              ${getIconSvg('FlipVertical', 14)}
              <span>Flip In/Out</span>
            </button>
            <button class="action-btn ${opening.flipH ? 'active' : ''}" id="btn-flip-h" title="Flip Hinge / Swing">
              ${getIconSvg('FlipHorizontal', 14)}
              <span>Flip Swing</span>
            </button>
          </div>
        </div>

        <div class="section-divider"></div>

        <button class="btn-danger-block" id="btn-delete-opening">
          ${getIconSvg('Trash2', 15)}
          <span>Delete Opening</span>
        </button>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 4. ROOM FACE PROPERTIES
  // --------------------------------------------------------------------------
  private renderRoomProperties(room: {
    id: string;
    name?: string;
    color?: string;
    areaMm2: number;
    vertexIds: string[];
  }): string {
    const ui = uiStore.getState();

    const colorPresets = [
      '#f1f5f9', // slate
      '#e2e8f0', // cool grey
      '#dbeafe', // soft blue
      '#dcfce7', // soft green
      '#fef3c7', // soft amber
      '#ffedd5', // soft peach
      '#ede9fe', // soft violet
      '#fae8ff', // soft pink
    ];

    return `
      <div class="property-section">
        <div class="section-title">
          <span>🏠 Room Face</span>
          <span class="badge-accent">${room.name ?? 'Room'}</span>
        </div>

        <div class="form-group">
          <label>Room Name</label>
          <input type="text" id="room-name-input" value="${room.name ?? ''}" placeholder="e.g. Living Room, Bedroom" />
        </div>

        <div class="metric-card highlight">
          <span class="metric-label">Calculated Floor Area</span>
          <span class="metric-value">${formatArea(room.areaMm2, ui.unitSystem)}</span>
        </div>

        <div class="form-group" style="margin-top: 14px;">
          <label>Floor Finish Color</label>
          <div class="color-palette-picker">
            ${colorPresets
              .map(
                (c) => `
              <button class="color-swatch ${room.color === c ? 'active' : ''}" 
                      style="background-color: ${c};" 
                      data-color="${c}"
                      title="${c}"></button>
            `
              )
              .join('')}
          </div>
          <div class="custom-color-row" style="margin-top: 8px;">
            <input type="color" id="room-color-picker" value="${room.color ?? '#f1f5f9'}" />
            <span class="color-hex-label">${room.color ?? '#f1f5f9'}</span>
          </div>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 5. FURNITURE PROPERTIES
  // --------------------------------------------------------------------------
  private renderFurnitureProperties(furn: {
    id: string;
    defId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    zIndex: number;
  }): string {
    const deg = Math.round(((furn.rotation * 180) / Math.PI) % 360);

    return `
      <div class="property-section">
        <div class="section-title">
          <span>🛋️ Furniture Asset</span>
          <span class="badge-accent">${furn.defId}</span>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Position X (mm)</label>
            <input type="number" id="furn-x-input" value="${Math.round(furn.x)}" step="50" />
          </div>
          <div class="form-group">
            <label>Position Y (mm)</label>
            <input type="number" id="furn-y-input" value="${Math.round(furn.y)}" step="50" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Width (mm)</label>
            <input type="number" id="furn-w-input" value="${Math.round(furn.width)}" step="50" min="100" />
          </div>
          <div class="form-group">
            <label>Depth (mm)</label>
            <input type="number" id="furn-h-input" value="${Math.round(furn.height)}" step="50" min="100" />
          </div>
        </div>

        <div class="form-group">
          <label>Rotation (${deg}°)</label>
          <div class="rotation-control-row">
            <input type="range" id="furn-rot-slider" min="0" max="360" value="${deg < 0 ? deg + 360 : deg}" />
            <button class="preset-pill" id="furn-rot-45" title="Rotate +45°">+45°</button>
            <button class="preset-pill" id="furn-rot-90" title="Rotate +90°">+90°</button>
          </div>
        </div>

        <div class="form-group">
          <label>Stacking Order (Z-Index: ${furn.zIndex})</label>
          <div class="action-btn-row">
            <button class="action-btn" id="furn-bring-forward" title="Bring Forward">
              ${getIconSvg('Layers', 14)}
              <span>Forward</span>
            </button>
            <button class="action-btn" id="furn-send-backward" title="Send Backward">
              ${getIconSvg('Layers', 14)}
              <span>Backward</span>
            </button>
          </div>
        </div>

        <div class="section-divider"></div>

        <button class="btn-danger-block" id="btn-delete-furniture">
          ${getIconSvg('Trash2', 15)}
          <span>Delete Asset</span>
        </button>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // EVENT BINDINGS
  // --------------------------------------------------------------------------
  private bindEvents(): void {
    const plan = planStore.getState();

    // Close button
    this.element.querySelector('#inspector-close-btn')?.addEventListener('click', () => {
      uiStore.getState().toggleInspector();
    });

    // 1. Project Controls
    this.element.querySelectorAll<HTMLButtonElement>('#unit-system-control .segment-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = btn.dataset.unit as UnitSystem;
        if (u) uiStore.getState().setUnitSystem(u);
      });
    });

    this.element.querySelectorAll<HTMLButtonElement>('.preset-pill[data-grid]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const step = parseInt(btn.dataset.grid ?? '100', 10);
        if (!isNaN(step)) uiStore.getState().setGridSpacing(step);
      });
    });

    // 2. Wall Controls
    const selectedId = plan.selectedIds[0];
    if (selectedId && plan.walls[selectedId]) {
      const wallId = selectedId;

      this.element.querySelector<HTMLInputElement>('#wall-length-input')?.addEventListener('change', (e) => {
        const newLen = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(newLen)) planStore.getState().setWallLength(wallId, newLen);
      });

      this.element.querySelectorAll<HTMLButtonElement>('.preset-pill[data-thickness]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const th = parseInt(btn.dataset.thickness ?? '150', 10);
          if (!isNaN(th)) planStore.getState().updateWallThickness(wallId, th);
        });
      });

      this.element.querySelector<HTMLInputElement>('#wall-thickness-custom')?.addEventListener('change', (e) => {
        const th = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(th)) planStore.getState().updateWallThickness(wallId, th);
      });

      this.element.querySelector('#btn-delete-wall')?.addEventListener('click', () => {
        planStore.getState().deleteElements([wallId]);
      });
    }

    // 3. Opening Controls
    if (selectedId && plan.openings[selectedId]) {
      const opId = selectedId;

      this.element.querySelectorAll<HTMLButtonElement>('[data-op-type]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const t = btn.dataset.opType as OpeningType;
          if (t) planStore.getState().updateOpening(opId, { type: t });
        });
      });

      this.element.querySelectorAll<HTMLButtonElement>('.preset-pill[data-width]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const w = parseInt(btn.dataset.width ?? '900', 10);
          if (!isNaN(w)) planStore.getState().updateOpening(opId, { width: w });
        });
      });

      this.element.querySelector<HTMLInputElement>('#opening-width-input')?.addEventListener('change', (e) => {
        const w = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(w)) planStore.getState().updateOpening(opId, { width: w });
      });

      this.element.querySelector('#btn-flip-v')?.addEventListener('click', () => {
        planStore.getState().toggleOpeningFlipV(opId);
      });

      this.element.querySelector('#btn-flip-h')?.addEventListener('click', () => {
        planStore.getState().toggleOpeningFlipH(opId);
      });

      this.element.querySelector('#btn-delete-opening')?.addEventListener('click', () => {
        planStore.getState().deleteElements([opId]);
      });
    }

    // 4. Room Controls
    if (selectedId && plan.rooms[selectedId]) {
      const roomId = selectedId;

      this.element.querySelector<HTMLInputElement>('#room-name-input')?.addEventListener('change', (e) => {
        const name = (e.target as HTMLInputElement).value.trim();
        if (name) planStore.getState().setRoomName(roomId, name);
      });

      this.element.querySelectorAll<HTMLButtonElement>('.color-swatch[data-color]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const c = btn.dataset.color;
          if (c) planStore.getState().setRoomColor(roomId, c);
        });
      });

      this.element.querySelector<HTMLInputElement>('#room-color-picker')?.addEventListener('input', (e) => {
        const c = (e.target as HTMLInputElement).value;
        if (c) planStore.getState().setRoomColor(roomId, c);
      });
    }

    // 5. Furniture Controls
    const furnId = plan.selectedFurnitureId;
    if (furnId && plan.furniture[furnId]) {
      this.element.querySelector<HTMLInputElement>('#furn-x-input')?.addEventListener('change', (e) => {
        const x = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(x)) planStore.getState().updateFurnitureTransform(furnId, { x });
      });

      this.element.querySelector<HTMLInputElement>('#furn-y-input')?.addEventListener('change', (e) => {
        const y = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(y)) planStore.getState().updateFurnitureTransform(furnId, { y });
      });

      this.element.querySelector<HTMLInputElement>('#furn-w-input')?.addEventListener('change', (e) => {
        const w = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(w)) planStore.getState().updateFurnitureTransform(furnId, { width: w });
      });

      this.element.querySelector<HTMLInputElement>('#furn-h-input')?.addEventListener('change', (e) => {
        const h = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(h)) planStore.getState().updateFurnitureTransform(furnId, { height: h });
      });

      this.element.querySelector<HTMLInputElement>('#furn-rot-slider')?.addEventListener('input', (e) => {
        const deg = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(deg)) {
          const rad = (deg * Math.PI) / 180;
          planStore.getState().updateFurnitureTransform(furnId, { rotation: rad });
        }
      });

      this.element.querySelector('#furn-rot-45')?.addEventListener('click', () => {
        const f = planStore.getState().furniture[furnId];
        if (f) {
          const nxt = (f.rotation + Math.PI / 4) % (Math.PI * 2);
          planStore.getState().updateFurnitureTransform(furnId, { rotation: nxt });
        }
      });

      this.element.querySelector('#furn-rot-90')?.addEventListener('click', () => {
        const f = planStore.getState().furniture[furnId];
        if (f) {
          const nxt = (f.rotation + Math.PI / 2) % (Math.PI * 2);
          planStore.getState().updateFurnitureTransform(furnId, { rotation: nxt });
        }
      });

      this.element.querySelector('#furn-bring-forward')?.addEventListener('click', () => {
        const f = planStore.getState().furniture[furnId];
        if (f) {
          planStore.getState().updateFurnitureTransform(furnId, { zIndex: f.zIndex + 1 });
        }
      });

      this.element.querySelector('#furn-send-backward')?.addEventListener('click', () => {
        const f = planStore.getState().furniture[furnId];
        if (f && f.zIndex > 1) {
          planStore.getState().updateFurnitureTransform(furnId, { zIndex: f.zIndex - 1 });
        }
      });

      this.element.querySelector('#btn-delete-furniture')?.addEventListener('click', () => {
        planStore.getState().deleteFurniture(furnId);
      });
    }
  }

  private subscribeStores(): void {
    this.unsubscribePlan = planStore.subscribe(() => {
      this.render();
    });

    this.unsubscribeUI = uiStore.subscribe(() => {
      this.render();
    });
  }

  public destroy(): void {
    this.unsubscribePlan?.();
    this.unsubscribeUI?.();
  }
}
