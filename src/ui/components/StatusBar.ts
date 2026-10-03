import { uiStore, formatLength } from '../../core/store/uiStore.js';
import { getIconSvg } from '../icons.js';

export class StatusBar {
  public element: HTMLElement;
  private unsubscribeUI: (() => void) | null = null;

  constructor() {
    this.element = document.createElement('footer');
    this.element.className = 'status-bar-container';
    this.render();
    this.bindEvents();
    this.subscribeStores();
  }

  private render(): void {
    const ui = uiStore.getState();

    const formattedX = formatLength(ui.cursorWorldPos.x, ui.unitSystem);
    const formattedY = formatLength(ui.cursorWorldPos.y, ui.unitSystem);
    const zoomPct = Math.round(ui.zoom * 100);

    const unitLabels: Record<string, string> = {
      metric_mm: 'MM',
      metric_m: 'METERS',
      imperial_ft: 'FT-IN',
    };

    this.element.innerHTML = `
      <div class="status-bar">
        <!-- Left: Coordinates and Viewport metrics -->
        <div class="status-section left-section">
          <div class="status-item status-coords" title="Live World Coordinates">
            <span class="status-icon">${getIconSvg('Compass', 13)}</span>
            <span class="status-text">
              X: <strong>${formattedX}</strong> &nbsp;|&nbsp; Y: <strong>${formattedY}</strong>
            </span>
          </div>

          <div class="status-divider"></div>

          <div class="status-item status-zoom" title="Active Zoom Level">
            <span class="status-text">Zoom: <strong>${zoomPct}%</strong></span>
          </div>
        </div>

        <!-- Center: Tool status tip -->
        <div class="status-section center-section">
          <span class="status-hint" id="status-hint-text">Ready</span>
        </div>

        <!-- Right: Toggles and Unit Badge -->
        <div class="status-section right-section">
          <!-- Grid Snap Toggle -->
          <button class="status-toggle-btn ${ui.snapToGrid ? 'active' : ''}" id="status-toggle-grid" title="Toggle Grid Snap (G)">
            <span class="status-indicator"></span>
            <span class="btn-text">GRID SNAP [${ui.snapToGrid ? 'ON' : 'OFF'}]</span>
            <kbd class="status-kbd">G</kbd>
          </button>

          <!-- Ortho Lock Toggle -->
          <button class="status-toggle-btn ${ui.orthoLock ? 'active' : ''}" id="status-toggle-ortho" title="Toggle Ortho Angle Snap (F8 or Hold Shift)">
            <span class="status-indicator"></span>
            <span class="btn-text">ORTHO [${ui.orthoLock ? 'ON' : 'OFF'}]</span>
            <kbd class="status-kbd">F8</kbd>
          </button>

          <div class="status-divider"></div>

          <!-- Unit Selector Badge -->
          <button class="status-unit-badge" id="status-toggle-unit" title="Click to cycle units (mm -> m -> ft-in)">
            <span class="badge-label">UNIT:</span>
            <span class="badge-value">${unitLabels[ui.unitSystem] ?? 'MM'}</span>
          </button>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    this.element.querySelector('#status-toggle-grid')?.addEventListener('click', () => {
      uiStore.getState().toggleSnapToGrid();
    });

    this.element.querySelector('#status-toggle-ortho')?.addEventListener('click', () => {
      uiStore.getState().toggleOrthoLock();
    });

    this.element.querySelector('#status-toggle-unit')?.addEventListener('click', () => {
      uiStore.getState().cycleUnitSystem();
    });
  }

  private subscribeStores(): void {
    this.unsubscribeUI = uiStore.subscribe((state) => {
      const formattedX = formatLength(state.cursorWorldPos.x, state.unitSystem);
      const formattedY = formatLength(state.cursorWorldPos.y, state.unitSystem);
      const zoomPct = Math.round(state.zoom * 100);

      const coordsEl = this.element.querySelector('.status-coords .status-text');
      if (coordsEl) {
        coordsEl.innerHTML = `X: <strong>${formattedX}</strong> &nbsp;|&nbsp; Y: <strong>${formattedY}</strong>`;
      }

      const zoomEl = this.element.querySelector('.status-zoom .status-text');
      if (zoomEl) {
        zoomEl.innerHTML = `Zoom: <strong>${zoomPct}%</strong>`;
      }

      const gridBtn = this.element.querySelector('#status-toggle-grid');
      if (gridBtn) {
        gridBtn.classList.toggle('active', state.snapToGrid);
        const textSpan = gridBtn.querySelector('.btn-text');
        if (textSpan) textSpan.textContent = `GRID SNAP [${state.snapToGrid ? 'ON' : 'OFF'}]`;
      }

      const orthoBtn = this.element.querySelector('#status-toggle-ortho');
      if (orthoBtn) {
        orthoBtn.classList.toggle('active', state.orthoLock);
        const textSpan = orthoBtn.querySelector('.btn-text');
        if (textSpan) textSpan.textContent = `ORTHO [${state.orthoLock ? 'ON' : 'OFF'}]`;
      }

      const unitBadgeVal = this.element.querySelector('.status-unit-badge .badge-value');
      if (unitBadgeVal) {
        const unitLabels: Record<string, string> = {
          metric_mm: 'MM',
          metric_m: 'METERS',
          imperial_ft: 'FT-IN',
        };
        unitBadgeVal.textContent = unitLabels[state.unitSystem] ?? 'MM';
      }
    });
  }

  public setHint(hintText: string): void {
    const hintEl = this.element.querySelector('#status-hint-text');
    if (hintEl) {
      hintEl.textContent = hintText;
    }
  }

  public destroy(): void {
    this.unsubscribeUI?.();
  }
}
