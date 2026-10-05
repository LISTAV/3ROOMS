import { planStore } from '../../core/store/planStore.js';
import { uiStore, formatLength, formatArea } from '../../core/store/uiStore.js';
import { getIconSvg } from '../icons.js';
import { distance } from '../../core/math/vector.js';
import { parseLengthToMm } from '../../core/units/unitFormatter.js';
import type { OpeningType, UnitSystem, ImageInstance, LineEntity, LineStyle, ArrowheadStyle, FurnitureInstance, Point2D, DimensionPosition } from '../../core/types.js';

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
    const selectedImgId = plan.selectedImageId;
    const selectedLineId = plan.selectedLineId;
    const selectedId = plan.selectedIds[0];

    let contentHtml = '';

    if (selectedImgId && plan.images?.[selectedImgId]) {
      contentHtml = this.renderImageProperties(plan.images[selectedImgId]);
    } else if (selectedFurnId && plan.furniture[selectedFurnId]) {
      contentHtml = this.renderFurnitureProperties(plan.furniture[selectedFurnId]);
    } else if (selectedLineId && plan.lines?.[selectedLineId]) {
      contentHtml = this.renderLineProperties(plan.lines[selectedLineId]);
    } else if (selectedId && plan.lines?.[selectedId]) {
      contentHtml = this.renderLineProperties(plan.lines[selectedId]);
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

      <div class="property-section">
        <div class="section-title">
          <span>📏 Measurement & Dimensions</span>
        </div>

        <!-- Position: Outside, Centered, Inside -->
        <div class="form-group">
          <label>Dimension Label Position</label>
          <div class="segmented-control" id="dim-position-control">
            <button class="segment-btn ${ui.dimensionSettings.position === 'outside' ? 'active' : ''}" data-dim-pos="outside">Outside</button>
            <button class="segment-btn ${ui.dimensionSettings.position === 'centered' ? 'active' : ''}" data-dim-pos="centered">Centered</button>
            <button class="segment-btn ${ui.dimensionSettings.position === 'inside' ? 'active' : ''}" data-dim-pos="inside">Inside</button>
          </div>
        </div>

        <!-- Font Size Presets & Custom -->
        <div class="form-group">
          <label>Dimension Font Size</label>
          <div class="preset-pill-group" style="margin-bottom: 8px;">
            ${[10, 12, 14, 16, 20, 24]
              .map(
                (size) => `
              <button class="preset-pill ${ui.dimensionSettings.fontSize === size ? 'active' : ''}" data-dim-fontsize="${size}">${size}px</button>
            `
              )
              .join('')}
          </div>
          <div class="input-with-unit">
            <input type="number" id="dim-fontsize-input" min="8" max="48" step="1" value="${ui.dimensionSettings.fontSize}" />
            <span class="unit-addon">px</span>
          </div>
        </div>

        <!-- Offset Distance Presets & Custom -->
        <div class="form-group">
          <label>Dimension Offset Distance</label>
          <div class="preset-pill-group" style="margin-bottom: 8px;">
            ${[150, 250, 350, 500, 750]
              .map(
                (offset) => `
              <button class="preset-pill ${ui.dimensionSettings.offsetMm === offset ? 'active' : ''}" data-dim-offset="${offset}">${formatLength(offset, ui.unitSettings)}</button>
            `
              )
              .join('')}
          </div>
          <div class="input-with-unit">
            <input type="text" id="dim-offset-input" value="${formatLength(ui.dimensionSettings.offsetMm, ui.unitSettings)}" placeholder="e.g. 350mm, 35cm" />
          </div>
          <div style="font-size: 11px; color: var(--text-dim); margin-top: 4px;">
            ${ui.dimensionSettings.position === 'centered' ? 'Centered mode aligns measurement text directly along walls & lines.' : 'Controls outward/inward distance of dimension lines from walls.'}
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
            <input type="text" id="wall-length-input" value="${formatLength(lengthMm, ui.unitSettings)}" placeholder="e.g. 300cm, 3m, 10ft" />
          </div>
        </div>

        <div class="form-group">
          <label>Thickness Preset</label>
          <div class="preset-pill-group">
            ${[100, 150, 200, 250, 300]
              .map(
                (th) => `
              <button class="preset-pill ${wall.thickness === th ? 'active' : ''}" data-thickness="${th}">${formatLength(th, ui.unitSettings)}</button>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="form-group">
          <label>Custom Thickness</label>
          <input type="text" id="wall-thickness-custom" value="${formatLength(wall.thickness, ui.unitSettings)}" placeholder="e.g. 15cm, 200mm, 6in" />
        </div>

        <div class="form-group" style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-subtle); padding: 8px 10px; border-radius: 8px; margin-top: 8px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Dimension Annotations</div>
          <div style="display: flex; gap: 6px; margin-bottom: 6px;">
            <div class="segmented-control" style="flex: 1;">
              <button class="segment-btn ${ui.dimensionSettings.position === 'outside' ? 'active' : ''}" data-dim-pos="outside">Outside</button>
              <button class="segment-btn ${ui.dimensionSettings.position === 'centered' ? 'active' : ''}" data-dim-pos="centered">Centered</button>
              <button class="segment-btn ${ui.dimensionSettings.position === 'inside' ? 'active' : ''}" data-dim-pos="inside">Inside</button>
            </div>
          </div>
          <div class="preset-pill-group">
            ${[10, 12, 14, 16, 20]
              .map(
                (size) => `
              <button class="preset-pill ${ui.dimensionSettings.fontSize === size ? 'active' : ''}" data-dim-fontsize="${size}">${size}px</button>
            `
              )
              .join('')}
          </div>
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
    const ui = uiStore.getState();
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
              <button class="preset-pill ${opening.width === w ? 'active' : ''}" data-width="${w}">${formatLength(w, ui.unitSettings)}</button>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="form-group">
          <label>Custom Width</label>
          <input type="text" id="opening-width-input" value="${formatLength(opening.width, ui.unitSettings)}" placeholder="e.g. 900mm, 90cm, 3ft" />
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
  private renderFurnitureProperties(furn: FurnitureInstance): string {
    const deg = Math.round(((furn.rotation * 180) / Math.PI) % 360);
    const ui = uiStore.getState();
    const isLocked = !!furn.aspectRatioLocked;
    const widthFormatted = formatLength(furn.width, ui.unitSettings);
    const heightFormatted = formatLength(furn.height, ui.unitSettings);

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

        <!-- Dimensions in Active Unit & Aspect Ratio Lock -->
        <div class="form-row" style="align-items: flex-end; gap: 6px;">
          <div class="form-group" style="flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <label>Width</label>
              <span style="font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);">${widthFormatted}</span>
            </div>
            <input type="text" id="furn-w-input" value="${widthFormatted}" placeholder="e.g. 1800 or 6' 0\"" />
          </div>

          <button class="preset-pill ${isLocked ? 'active' : ''}" id="furn-aspect-lock-btn" title="${isLocked ? 'Unlock Aspect Ratio' : 'Lock Aspect Ratio'}" style="margin-bottom: 2px; height: 32px; padding: 0 10px; display: flex; align-items: center; justify-content: center;">
            <span>${isLocked ? '🔒 Lock' : '🔓 Ratio'}</span>
          </button>

          <div class="form-group" style="flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <label>Depth</label>
              <span style="font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);">${heightFormatted}</span>
            </div>
            <input type="text" id="furn-h-input" value="${heightFormatted}" placeholder="e.g. 900 or 3' 0\"" />
          </div>
        </div>

        <!-- Rotation with numeric input & presets -->
        <div class="form-group" style="margin-top: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label>Rotation</label>
            <div style="display: flex; align-items: center; gap: 4px;">
              <input type="number" id="furn-rot-input" min="0" max="360" value="${deg < 0 ? deg + 360 : deg}" style="width: 58px; padding: 2px 4px; text-align: right; font-family: var(--font-mono); font-size: 12px; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: 4px; color: var(--text-main);" />
              <span style="font-size: 12px; color: var(--text-dim);">°</span>
            </div>
          </div>
          <div class="rotation-control-row">
            <input type="range" id="furn-rot-slider" min="0" max="360" value="${deg < 0 ? deg + 360 : deg}" />
            <button class="preset-pill" id="furn-rot-45" title="Rotate +45°">+45°</button>
            <button class="preset-pill" id="furn-rot-90" title="Rotate +90°">+90°</button>
            <button class="preset-pill" id="furn-rot-180" title="Flip 180°">180°</button>
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
  // 5B. PARAMETRIC DRAFTING LINE PROPERTIES
  // --------------------------------------------------------------------------
  private renderLineProperties(line: LineEntity): string {
    const ui = uiStore.getState();
    const plan = planStore.getState();
    const len = Math.round(distance(line.start, line.end));
    const formattedLength = formatLength(len, ui.unitSettings);

    const colorPresets = [
      '#1e293b', // Slate-800
      '#2563eb', // Blue-600
      '#dc2626', // Red-600
      '#16a34a', // Green-600
      '#d97706', // Amber-600
      '#9333ea', // Purple-600
      '#64748b', // Slate-500
    ];

    const thicknessPresets = [10, 25, 50, 100, 200];

    return `
      <div class="property-section">
        <div class="section-title">
          <span>📏 Drafting Line</span>
          <span class="badge-accent">${formattedLength}</span>
        </div>

        <!-- Length in Active Unit -->
        <div class="form-group">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
            <label>Length (${ui.unitSettings.lengthUnit})</label>
            <span style="font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);">${formattedLength}</span>
          </div>
          <input type="text" id="line-length-input" value="${formattedLength}" placeholder="e.g. 2500mm, 2.5m, 8' 4\"" />
          <div style="font-size: 11px; color: var(--text-dim); margin-top: 4px;">
            Adjusts line endpoint along direction vector.
          </div>
        </div>

        <!-- Thickness Presets and Custom Input -->
        <div class="form-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label>Thickness</label>
            <span style="font-size: 12px; font-weight: 600; color: var(--text-main);">${formatLength(line.thickness, ui.unitSettings)}</span>
          </div>
          <div class="preset-pill-group" style="margin-bottom: 8px;">
            ${thicknessPresets
              .map(
                (th) => `
              <button class="preset-pill ${line.thickness === th ? 'active' : ''}" data-line-thickness="${th}">${formatLength(th, ui.unitSettings)}</button>
            `
              )
              .join('')}
          </div>
          <input type="text" id="line-thickness-custom" value="${formatLength(line.thickness, ui.unitSettings)}" placeholder="e.g. 50mm, 5cm, 2in" />
        </div>

        <!-- Stroke Color Swatches & Picker -->
        <div class="form-group">
          <label>Stroke Color</label>
          <div class="color-palette-picker">
            ${colorPresets
              .map(
                (c) => `
              <button class="color-swatch ${line.color.toLowerCase() === c.toLowerCase() ? 'active' : ''}" 
                      style="background-color: ${c};" 
                      data-line-color="${c}"
                      title="${c}"></button>
            `
              )
              .join('')}
          </div>
          <div class="custom-color-row" style="margin-top: 8px;">
            <input type="color" id="line-color-picker" value="${line.color || '#334155'}" />
            <span class="color-hex-label">${line.color || '#334155'}</span>
          </div>
        </div>

        <!-- Stroke Style: Solid, Dashed, Dotted -->
        <div class="form-group">
          <label>Stroke Style</label>
          <div class="segmented-control" id="line-style-control">
            <button class="segment-btn ${line.style === 'solid' ? 'active' : ''}" data-line-style="solid">Solid</button>
            <button class="segment-btn ${line.style === 'dashed' ? 'active' : ''}" data-line-style="dashed">Dashed</button>
            <button class="segment-btn ${line.style === 'dotted' ? 'active' : ''}" data-line-style="dotted">Dotted</button>
          </div>
        </div>

        <!-- Arrowheads: None, Start, End, Both -->
        <div class="form-group">
          <label>Arrowheads</label>
          <div class="segmented-control" id="line-arrows-control">
            <button class="segment-btn ${line.arrows === 'none' ? 'active' : ''}" data-line-arrows="none">None</button>
            <button class="segment-btn ${line.arrows === 'start' ? 'active' : ''}" data-line-arrows="start">Start</button>
            <button class="segment-btn ${line.arrows === 'end' ? 'active' : ''}" data-line-arrows="end">End</button>
            <button class="segment-btn ${line.arrows === 'both' ? 'active' : ''}" data-line-arrows="both">Both</button>
          </div>
        </div>

        <!-- Show Dimension Tag Checkbox -->
        <div class="form-group" style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px;">
          <label for="line-show-measurement" style="margin-bottom: 0; cursor: pointer;">Show Measurement Tag</label>
          <input type="checkbox" id="line-show-measurement" ${line.showMeasurement ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;" />
        </div>

        <div class="form-group" style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-subtle); padding: 8px 10px; border-radius: 8px; margin-top: 8px;">
          <div style="font-size: 11px; font-weight: 600; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Dimension Tag Style</div>
          <div style="display: flex; gap: 6px; margin-bottom: 6px;">
            <div class="segmented-control" style="flex: 1;">
              <button class="segment-btn ${ui.dimensionSettings.position === 'outside' ? 'active' : ''}" data-dim-pos="outside">Outside</button>
              <button class="segment-btn ${ui.dimensionSettings.position === 'centered' ? 'active' : ''}" data-dim-pos="centered">Centered</button>
              <button class="segment-btn ${ui.dimensionSettings.position === 'inside' ? 'active' : ''}" data-dim-pos="inside">Inside</button>
            </div>
          </div>
          <div class="preset-pill-group">
            ${[10, 12, 14, 16, 20]
              .map(
                (size) => `
              <button class="preset-pill ${ui.dimensionSettings.fontSize === size ? 'active' : ''}" data-dim-fontsize="${size}">${size}px</button>
            `
              )
              .join('')}
          </div>
        </div>

        <!-- Assigned Layer -->
        <div class="form-group" style="margin-top: 10px;">
          <label>Assigned Layer</label>
          <select id="line-layer-select" class="cad-select" style="width: 100%; padding: 6px 10px; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle); border-radius: 6px;">
            ${(plan.layerOrder || []).map((lId) => {
              const l = plan.layers[lId];
              return `<option value="${lId}" ${line.layerId === lId ? 'selected' : ''}>${l ? l.name : lId}</option>`;
            }).join('')}
          </select>
        </div>

        <div class="section-divider"></div>

        <button class="btn-danger-block" id="btn-delete-line">
          ${getIconSvg('Trash2', 15)}
          <span>Delete Line</span>
        </button>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 6. REFERENCE / UNDERLAY IMAGE PROPERTIES (WITH TRANSPARENCY)
  // --------------------------------------------------------------------------
  private renderImageProperties(img: ImageInstance): string {
    const deg = Math.round(((img.rotation * 180) / Math.PI) % 360);
    const opacityPct = Math.round(Math.max(0, Math.min(1, img.opacity ?? 1.0)) * 100);
    const state = planStore.getState();

    return `
      <div class="property-section">
        <div class="section-title">
          <span>🖼️ Reference Image</span>
          <span class="badge-accent">${img.name || 'Underlay'}</span>
        </div>

        <!-- Opacity / Transparency Control (PRIMARY USER REQUEST) -->
        <div class="form-group" style="margin-top: 10px; background: rgba(30, 41, 59, 0.4); padding: 12px; border-radius: 8px; border: 1px solid var(--border-subtle);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <label style="font-weight: 600; color: var(--text-main); font-size: 13px;">Transparency / Opacity</label>
            <span id="img-opacity-val" style="font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: #38bdf8;">${opacityPct}%</span>
          </div>
          <input type="range" id="img-opacity-slider" min="0" max="100" value="${opacityPct}" step="1" style="width: 100%; cursor: pointer;" />
          <div class="action-btn-row" style="margin-top: 8px;">
            <button class="preset-pill ${opacityPct === 25 ? 'active' : ''}" data-img-opacity="25">25%</button>
            <button class="preset-pill ${opacityPct === 50 ? 'active' : ''}" data-img-opacity="50">50%</button>
            <button class="preset-pill ${opacityPct === 75 ? 'active' : ''}" data-img-opacity="75">75%</button>
            <button class="preset-pill ${opacityPct === 100 ? 'active' : ''}" data-img-opacity="100">100%</button>
          </div>
          <div style="font-size: 11px; color: var(--text-dim); margin-top: 6px;">
            Adjust slider to fade background image for easy wall tracing.
          </div>
        </div>

        <div class="section-divider"></div>

        <!-- Lock in Place Toggle -->
        <div class="form-group">
          <button class="action-btn ${img.locked ? 'active' : ''}" id="btn-toggle-img-lock" style="width: 100%; justify-content: center; padding: 8px 12px;">
            ${getIconSvg(img.locked ? 'Lock' : 'Unlock', 15)}
            <span>${img.locked ? 'Locked (Click to Unlock)' : 'Lock in Place (Trace Mode)'}</span>
          </button>
          <div style="font-size: 11px; color: var(--text-dim); margin-top: 4px; line-height: 1.3;">
            ${img.locked ? '🔒 Image is pinned. Canvas clicks will pass through to draw walls.' : 'Lock to trace walls over this image without accidentally dragging it.'}
          </div>
        </div>

        <div class="section-divider"></div>

        <!-- Dimensions -->
        <div class="form-row">
          <div class="form-group">
            <label>Width (mm)</label>
            <input type="number" id="img-w-input" value="${Math.round(img.width)}" step="50" min="100" />
          </div>
          <div class="form-group">
            <label>Height (mm)</label>
            <input type="number" id="img-h-input" value="${Math.round(img.height)}" step="50" min="100" />
          </div>
        </div>

        <!-- Position -->
        <div class="form-row">
          <div class="form-group">
            <label>Position X (mm)</label>
            <input type="number" id="img-x-input" value="${Math.round(img.x)}" step="50" />
          </div>
          <div class="form-group">
            <label>Position Y (mm)</label>
            <input type="number" id="img-y-input" value="${Math.round(img.y)}" step="50" />
          </div>
        </div>

        <!-- Rotation -->
        <div class="form-group">
          <label>Rotation (${deg}°)</label>
          <div class="rotation-control-row">
            <input type="range" id="img-rot-slider" min="0" max="360" value="${deg < 0 ? deg + 360 : deg}" />
            <button class="preset-pill" id="img-rot-0" title="Reset Rotation">0°</button>
            <button class="preset-pill" id="img-rot-45" title="Rotate +45°">+45°</button>
            <button class="preset-pill" id="img-rot-90" title="Rotate +90°">+90°</button>
          </div>
        </div>

        <!-- Layer Assignment -->
        <div class="form-group">
          <label>Assigned Layer</label>
          <select id="img-layer-select" class="cad-select" style="width: 100%; padding: 6px 10px; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle); border-radius: 6px;">
            ${(state.layerOrder || []).map((lId) => {
              const l = state.layers[lId];
              return `<option value="${lId}" ${img.layerId === lId ? 'selected' : ''}>${l ? l.name : lId}</option>`;
            }).join('')}
          </select>
        </div>

        <div class="section-divider"></div>

        <button class="btn-danger-block" id="btn-delete-image">
          ${getIconSvg('Trash2', 15)}
          <span>Delete Image</span>
        </button>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // EVENT BINDINGS
  // --------------------------------------------------------------------------
  private bindEvents(): void {
    const plan = planStore.getState();
    const ui = uiStore.getState();

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

    // Measurement & Dimension Annotations Controls
    this.element.querySelectorAll<HTMLButtonElement>('[data-dim-pos]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pos = btn.dataset.dimPos as DimensionPosition;
        if (pos) uiStore.getState().setDimensionPosition(pos);
      });
    });

    this.element.querySelectorAll<HTMLButtonElement>('[data-dim-fontsize]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sz = parseInt(btn.dataset.dimFontsize ?? '12', 10);
        if (!isNaN(sz) && sz >= 6) uiStore.getState().setDimensionFontSize(sz);
      });
    });

    this.element.querySelector<HTMLInputElement>('#dim-fontsize-input')?.addEventListener('change', (e) => {
      const sz = parseInt((e.target as HTMLInputElement).value, 10);
      if (!isNaN(sz) && sz >= 6 && sz <= 72) {
        uiStore.getState().setDimensionFontSize(sz);
      }
    });

    this.element.querySelectorAll<HTMLButtonElement>('[data-dim-offset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const off = parseInt(btn.dataset.dimOffset ?? '350', 10);
        if (!isNaN(off)) uiStore.getState().setDimensionOffset(off);
      });
    });

    this.element.querySelector<HTMLInputElement>('#dim-offset-input')?.addEventListener('change', (e) => {
      const raw = (e.target as HTMLInputElement).value;
      const off = parseLengthToMm(raw, ui.unitSettings.lengthUnit);
      if (off !== null && off >= 0) {
        uiStore.getState().setDimensionOffset(off);
      }
    });

    // 2. Wall Controls
    const selectedId = plan.selectedIds[0];
    if (selectedId && plan.walls[selectedId]) {
      const wallId = selectedId;

      this.element.querySelector<HTMLInputElement>('#wall-length-input')?.addEventListener('change', (e) => {
        const raw = (e.target as HTMLInputElement).value;
        const newLen = parseLengthToMm(raw, ui.unitSettings.lengthUnit);
        if (newLen !== null && newLen > 0) planStore.getState().setWallLength(wallId, newLen);
      });

      this.element.querySelectorAll<HTMLButtonElement>('.preset-pill[data-thickness]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const th = parseInt(btn.dataset.thickness ?? '150', 10);
          if (!isNaN(th)) planStore.getState().updateWallThickness(wallId, th);
        });
      });

      this.element.querySelector<HTMLInputElement>('#wall-thickness-custom')?.addEventListener('change', (e) => {
        const raw = (e.target as HTMLInputElement).value;
        const th = parseLengthToMm(raw, ui.unitSettings.lengthUnit);
        if (th !== null && th > 0) planStore.getState().updateWallThickness(wallId, th);
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
        const raw = (e.target as HTMLInputElement).value;
        const w = parseLengthToMm(raw, ui.unitSettings.lengthUnit);
        if (w !== null && w > 0) planStore.getState().updateOpening(opId, { width: w });
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
      const furn = plan.furniture[furnId];
      const ui = uiStore.getState();

      this.element.querySelector<HTMLInputElement>('#furn-x-input')?.addEventListener('change', (e) => {
        const x = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(x)) planStore.getState().updateFurnitureTransform(furnId, { x });
      });

      this.element.querySelector<HTMLInputElement>('#furn-y-input')?.addEventListener('change', (e) => {
        const y = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(y)) planStore.getState().updateFurnitureTransform(furnId, { y });
      });

      this.element.querySelector<HTMLInputElement>('#furn-w-input')?.addEventListener('change', (e) => {
        const raw = (e.target as HTMLInputElement).value;
        const parsed = parseLengthToMm(raw, ui.unitSettings.lengthUnit);
        if (parsed !== null && parsed >= 100) {
          const updates: Partial<FurnitureInstance> = { width: Math.round(parsed) };
          if (furn.aspectRatioLocked && furn.width > 0) {
            const ratio = furn.width / Math.max(1, furn.height);
            updates.height = Math.max(100, Math.round(parsed / ratio));
          }
          planStore.getState().updateFurnitureTransform(furnId, updates);
        }
      });

      this.element.querySelector<HTMLInputElement>('#furn-h-input')?.addEventListener('change', (e) => {
        const raw = (e.target as HTMLInputElement).value;
        const parsed = parseLengthToMm(raw, ui.unitSettings.lengthUnit);
        if (parsed !== null && parsed >= 100) {
          const updates: Partial<FurnitureInstance> = { height: Math.round(parsed) };
          if (furn.aspectRatioLocked && furn.height > 0) {
            const ratio = furn.width / Math.max(1, furn.height);
            updates.width = Math.max(100, Math.round(parsed * ratio));
          }
          planStore.getState().updateFurnitureTransform(furnId, updates);
        }
      });

      this.element.querySelector('#furn-aspect-lock-btn')?.addEventListener('click', () => {
        planStore.getState().updateFurnitureTransform(furnId, {
          aspectRatioLocked: !furn.aspectRatioLocked,
        });
      });

      this.element.querySelector<HTMLInputElement>('#furn-rot-input')?.addEventListener('change', (e) => {
        const deg = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(deg)) {
          const rad = (deg * Math.PI) / 180;
          planStore.getState().updateFurnitureTransform(furnId, { rotation: rad });
        }
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

      this.element.querySelector('#furn-rot-180')?.addEventListener('click', () => {
        const f = planStore.getState().furniture[furnId];
        if (f) {
          const nxt = (f.rotation + Math.PI) % (Math.PI * 2);
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

    // 5B. Line Controls
    const lineId = plan.selectedLineId || (selectedId && plan.lines?.[selectedId] ? selectedId : null);
    if (lineId && plan.lines?.[lineId]) {
      const line = plan.lines[lineId];
      const ui = uiStore.getState();

      // Editable length
      this.element.querySelector<HTMLInputElement>('#line-length-input')?.addEventListener('change', (e) => {
        const raw = (e.target as HTMLInputElement).value;
        const newLen = parseLengthToMm(raw, ui.unitSettings.lengthUnit);
        if (newLen !== null && newLen > 0) {
          const curLen = distance(line.start, line.end);
          if (curLen > 1e-3) {
            const dirX = (line.end.x - line.start.x) / curLen;
            const dirY = (line.end.y - line.start.y) / curLen;
            const newEnd: Point2D = {
              x: Math.round(line.start.x + dirX * newLen),
              y: Math.round(line.start.y + dirY * newLen),
            };
            planStore.getState().updateLine(lineId, { end: newEnd });
          }
        }
      });

      // Thickness Presets
      this.element.querySelectorAll<HTMLButtonElement>('[data-line-thickness]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const th = parseInt(btn.dataset.lineThickness ?? '50', 10);
          if (!isNaN(th)) {
            planStore.getState().updateLine(lineId, { thickness: th });
          }
        });
      });

      // Custom Thickness Input
      this.element.querySelector<HTMLInputElement>('#line-thickness-custom')?.addEventListener('change', (e) => {
        const raw = (e.target as HTMLInputElement).value;
        const th = parseLengthToMm(raw, ui.unitSettings.lengthUnit);
        if (th !== null && th > 0) {
          planStore.getState().updateLine(lineId, { thickness: Math.round(th) });
        }
      });

      // Stroke Color Swatches
      this.element.querySelectorAll<HTMLButtonElement>('[data-line-color]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const c = btn.dataset.lineColor;
          if (c) {
            planStore.getState().updateLine(lineId, { color: c });
          }
        });
      });

      // Color Picker Input
      this.element.querySelector<HTMLInputElement>('#line-color-picker')?.addEventListener('input', (e) => {
        const c = (e.target as HTMLInputElement).value;
        if (c) {
          planStore.getState().updateLine(lineId, { color: c });
        }
      });

      // Stroke Style
      this.element.querySelectorAll<HTMLButtonElement>('[data-line-style]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const style = btn.dataset.lineStyle as LineStyle;
          if (style) {
            planStore.getState().updateLine(lineId, { style });
          }
        });
      });

      // Arrowheads
      this.element.querySelectorAll<HTMLButtonElement>('[data-line-arrows]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const arrows = btn.dataset.lineArrows as ArrowheadStyle;
          if (arrows) {
            planStore.getState().updateLine(lineId, { arrows });
          }
        });
      });

      // Measurement Tag Toggle
      this.element.querySelector<HTMLInputElement>('#line-show-measurement')?.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        planStore.getState().updateLine(lineId, { showMeasurement: checked });
      });

      // Layer Selection
      this.element.querySelector<HTMLSelectElement>('#line-layer-select')?.addEventListener('change', (e) => {
        const lId = (e.target as HTMLSelectElement).value;
        if (lId) {
          planStore.getState().updateLine(lineId, { layerId: lId });
        }
      });

      // Delete Line
      this.element.querySelector('#btn-delete-line')?.addEventListener('click', () => {
        planStore.getState().deleteLine(lineId);
      });
    }

    // 6. Image Controls (Transparency, Lock, Transform, Layer, Delete)
    const imgId = plan.selectedImageId || (plan.selectedIds[0] && plan.images?.[plan.selectedIds[0]] ? plan.selectedIds[0] : null);
    if (imgId && plan.images?.[imgId]) {
      const img = plan.images[imgId];

      // Opacity Slider
      const opacitySlider = this.element.querySelector<HTMLInputElement>('#img-opacity-slider');
      const opacityValDisplay = this.element.querySelector<HTMLElement>('#img-opacity-val');
      if (opacitySlider) {
        opacitySlider.addEventListener('input', (e) => {
          const val = parseInt((e.target as HTMLInputElement).value, 10);
          if (!isNaN(val)) {
            if (opacityValDisplay) opacityValDisplay.textContent = `${val}%`;
            planStore.getState().setImageOpacity(imgId, val / 100);
          }
        });
      }

      // Quick Opacity Presets (25%, 50%, 75%, 100%)
      this.element.querySelectorAll<HTMLButtonElement>('[data-img-opacity]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const pct = parseInt(btn.dataset.imgOpacity ?? '100', 10);
          if (!isNaN(pct)) {
            planStore.getState().setImageOpacity(imgId, pct / 100);
          }
        });
      });

      // Lock / Trace Mode Toggle
      this.element.querySelector('#btn-toggle-img-lock')?.addEventListener('click', () => {
        planStore.getState().toggleImageLock(imgId);
      });

      // Dimensions & Position
      this.element.querySelector<HTMLInputElement>('#img-w-input')?.addEventListener('change', (e) => {
        const w = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(w) && w > 10) {
          const aspect = img.aspectRatio || (img.width / img.height);
          planStore.getState().updateImage(imgId, { width: w, height: w / aspect });
        }
      });

      this.element.querySelector<HTMLInputElement>('#img-h-input')?.addEventListener('change', (e) => {
        const h = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(h) && h > 10) {
          const aspect = img.aspectRatio || (img.width / img.height);
          planStore.getState().updateImage(imgId, { height: h, width: h * aspect });
        }
      });

      this.element.querySelector<HTMLInputElement>('#img-x-input')?.addEventListener('change', (e) => {
        const x = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(x)) planStore.getState().updateImage(imgId, { x });
      });

      this.element.querySelector<HTMLInputElement>('#img-y-input')?.addEventListener('change', (e) => {
        const y = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(y)) planStore.getState().updateImage(imgId, { y });
      });

      // Rotation Slider & Presets
      this.element.querySelector<HTMLInputElement>('#img-rot-slider')?.addEventListener('input', (e) => {
        const deg = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(deg)) {
          const rad = (deg * Math.PI) / 180;
          planStore.getState().updateImage(imgId, { rotation: rad });
        }
      });

      this.element.querySelector('#img-rot-0')?.addEventListener('click', () => {
        planStore.getState().updateImage(imgId, { rotation: 0 });
      });

      this.element.querySelector('#img-rot-45')?.addEventListener('click', () => {
        const curImg = planStore.getState().images?.[imgId];
        if (curImg) {
          const nxt = (curImg.rotation + Math.PI / 4) % (Math.PI * 2);
          planStore.getState().updateImage(imgId, { rotation: nxt });
        }
      });

      this.element.querySelector('#img-rot-90')?.addEventListener('click', () => {
        const curImg = planStore.getState().images?.[imgId];
        if (curImg) {
          const nxt = (curImg.rotation + Math.PI / 2) % (Math.PI * 2);
          planStore.getState().updateImage(imgId, { rotation: nxt });
        }
      });

      // Layer Selection
      this.element.querySelector<HTMLSelectElement>('#img-layer-select')?.addEventListener('change', (e) => {
        const lId = (e.target as HTMLSelectElement).value;
        if (lId) {
          planStore.getState().updateImage(imgId, { layerId: lId });
        }
      });

      // Delete Image
      this.element.querySelector('#btn-delete-image')?.addEventListener('click', () => {
        planStore.getState().deleteImage(imgId);
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
