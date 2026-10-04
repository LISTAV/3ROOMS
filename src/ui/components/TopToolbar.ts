import { uiStore, type ToolType } from '../../core/store/uiStore.js';
import { planStore } from '../../core/store/planStore.js';
import { fileManager } from '../../core/io/fileManager.js';
import { importImageFromFile } from '../../core/io/imageLoader.js';
import { getIconSvg } from '../icons.js';

export class TopToolbar {
  public element: HTMLElement;
  private unsubscribeUI: (() => void) | null = null;
  private unsubscribePlan: (() => void) | null = null;
  private documentClickHandler: ((e: MouseEvent) => void) | null = null;

  constructor() {
    this.element = document.createElement('header');
    this.element.className = 'top-toolbar-container';
    this.render();
    this.bindEvents();
    this.subscribeStores();
  }

  private render(): void {
    const ui = uiStore.getState();
    const plan = planStore.getState();

    const tools: Array<{ id: ToolType; label: string; shortcut: string; icon: string }> = [
      { id: 'select', label: 'Select', shortcut: 'V', icon: getIconSvg('MousePointer', 16) },
      { id: 'wall', label: 'Wall', shortcut: 'W', icon: getIconSvg('SquareDashed', 16) },
      { id: 'door', label: 'Door', shortcut: 'D', icon: getIconSvg('DoorClosed', 16) },
      { id: 'window', label: 'Window', shortcut: 'O', icon: getIconSvg('AppWindow', 16) },
      { id: 'line', label: 'Line', shortcut: 'L', icon: getIconSvg('PenTool', 16) },
      { id: 'pan', label: 'Pan', shortcut: 'H', icon: getIconSvg('Hand', 16) },
    ];

    this.element.innerHTML = `
      <div class="top-toolbar">
        <div class="toolbar-left">
          <!-- Brand / Logo -->
          <div class="toolbar-brand">
            <span class="brand-icon">${getIconSvg('Layers', 18)}</span>
            <span class="brand-name">3ROOMS</span>
            <span class="brand-badge">CAD</span>
          </div>

          <div class="toolbar-divider"></div>

          <!-- Project File Controls -->
          <div class="toolbar-group file-group">
            <button class="tb-btn" id="tb-file-new" title="New Floor Plan (Ctrl+N)">
              ${getIconSvg('FilePlus', 15)}
              <span>New</span>
            </button>
            <button class="tb-btn" id="tb-file-open" title="Open Floor Plan (Ctrl+O)">
              ${getIconSvg('FolderOpen', 15)}
              <span>Open</span>
            </button>
            <button class="tb-btn" id="tb-file-save" title="Save Project (Ctrl+S)">
              ${getIconSvg('Save', 15)}
              <span>Save</span>
            </button>
          </div>

          <div class="toolbar-divider"></div>

          <!-- Add Image / Blueprint Underlay Button -->
          <button class="tb-btn" id="tb-add-image" title="Add Reference Image / Blueprint with Transparency">
            ${getIconSvg('Image', 15)}
            <span>Add Image</span>
          </button>
          <input type="file" id="image-file-input" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="display: none;" />

          <div class="toolbar-divider"></div>

          <!-- Sidebar Catalog Toggle -->
          <button class="tb-btn toggle-btn ${ui.showCatalog ? 'active' : ''}" id="tb-toggle-catalog" title="Toggle Asset Catalog (B)">
            ${getIconSvg('PanelLeft', 16)}
            <span>Catalog</span>
          </button>
        </div>

        <div class="toolbar-center">
          <!-- Tool Switcher Radio Group -->
          <div class="toolbar-group tool-radio-group" role="radiogroup" aria-label="Drawing Tools">
            ${tools
              .map(
                (t) => `
              <button class="tb-btn tool-radio-btn ${ui.activeTool === t.id ? 'active' : ''}" 
                      data-tool="${t.id}" 
                      role="radio" 
                      aria-checked="${ui.activeTool === t.id}"
                      title="${t.label} Tool (${t.shortcut})">
                <span class="tb-icon">${t.icon}</span>
                <span class="tb-label">${t.label}</span>
                <kbd class="tb-kbd">${t.shortcut}</kbd>
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="toolbar-right">
          <!-- History Controls -->
          <div class="toolbar-group history-group">
            <button class="tb-btn icon-only-btn" id="tb-undo" title="Undo (Ctrl+Z)" ${!plan.canUndo() ? 'disabled' : ''}>
              ${getIconSvg('Undo2', 16)}
            </button>
            <button class="tb-btn icon-only-btn" id="tb-redo" title="Redo (Ctrl+Y)" ${!plan.canRedo() ? 'disabled' : ''}>
              ${getIconSvg('Redo2', 16)}
            </button>
          </div>

          <div class="toolbar-divider"></div>

          <!-- Viewport Controls -->
          <div class="toolbar-group viewport-group">
            <button class="tb-btn" id="tb-zoom-fit" title="Zoom to Fit All Walls (Shift+1)">
              ${getIconSvg('Maximize', 15)}
              <span>Zoom Fit</span>
            </button>
            <button class="tb-btn" id="tb-reset-zoom" title="Reset Zoom to 100% (Shift+0)">
              ${getIconSvg('RotateCcw', 15)}
              <span>100%</span>
            </button>
            <button class="tb-btn tb-danger" id="tb-clear-canvas" title="Clear Canvas">
              ${getIconSvg('Trash2', 15)}
              <span>Clear</span>
            </button>
          </div>

          <div class="toolbar-divider"></div>

          <!-- Export Dropdown -->
          <div class="dropdown-container">
            <button class="tb-btn" id="tb-export-btn" title="Export Floor Plan">
              ${getIconSvg('Download', 15)}
              <span>Export</span>
              ${getIconSvg('ChevronDown', 12)}
            </button>
            <div class="dropdown-menu hidden" id="export-dropdown-menu">
              <button class="dropdown-item" id="export-png-btn" title="Export High-Res Architectural Blueprint Image">
                ${getIconSvg('Image', 15)}
                <span>Architectural Blueprint</span>
                <span class="item-desc">.PNG</span>
              </button>
              <button class="dropdown-item" id="export-dxf-btn" title="Export AutoCAD 2000 Drawing">
                ${getIconSvg('Layers', 15)}
                <span>AutoCAD CAD</span>
                <span class="item-desc">.DXF</span>
              </button>
            </div>
          </div>

          <!-- Layers Panel Toggle -->
          <button class="tb-btn toggle-btn ${ui.showLayers ? 'active' : ''}" id="tb-toggle-layers" title="Toggle Photoshop-Style Layer Panel (L)">
            ${getIconSvg('Layers', 16)}
            <span>Layers</span>
          </button>

          <!-- Properties Inspector Toggle -->
          <button class="tb-btn toggle-btn ${ui.showInspector ? 'active' : ''}" id="tb-toggle-inspector" title="Toggle Properties Inspector">
            ${getIconSvg('PanelRight', 16)}
            <span>Inspector</span>
          </button>
        </div>
      </div>

      <!-- Confirmation Modal Container -->
      <div id="clear-confirm-modal" class="modal-backdrop hidden">
        <div class="modal-card">
          <div class="modal-header">
            <h3>⚠️ Clear Floor Plan</h3>
          </div>
          <p class="modal-body">
            Are you sure you want to clear the entire canvas? All walls, openings, rooms, and placed furniture will be permanently removed.
          </p>
          <div class="modal-footer">
            <button class="modal-btn secondary" id="modal-cancel-btn">Cancel</button>
            <button class="modal-btn danger" id="modal-confirm-clear-btn">Clear All</button>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    // File I/O Actions
    this.element.querySelector('#tb-file-new')?.addEventListener('click', () => {
      fileManager.newProject();
    });

    this.element.querySelector('#tb-file-open')?.addEventListener('click', () => {
      fileManager.openProject();
    });

    this.element.querySelector('#tb-file-save')?.addEventListener('click', () => {
      fileManager.saveProject();
    });

    // Add Image / Blueprint Action
    const addImageBtn = this.element.querySelector('#tb-add-image');
    const imageFileInput = this.element.querySelector<HTMLInputElement>('#image-file-input');

    addImageBtn?.addEventListener('click', () => {
      imageFileInput?.click();
    });

    imageFileInput?.addEventListener('change', async () => {
      const file = imageFileInput.files?.[0];
      if (file) {
        try {
          await importImageFromFile(file);
        } catch (err) {
          console.error('Failed to import image:', err);
          alert(`Failed to import image: ${(err as Error).message}`);
        }
        imageFileInput.value = '';
      }
    });

    // Export Dropdown
    const exportBtn = this.element.querySelector('#tb-export-btn');
    const exportMenu = this.element.querySelector('#export-dropdown-menu');

    exportBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMenu?.classList.toggle('hidden');
    });

    this.element.querySelector('#export-png-btn')?.addEventListener('click', () => {
      exportMenu?.classList.add('hidden');
      fileManager.exportPng();
    });

    this.element.querySelector('#export-dxf-btn')?.addEventListener('click', () => {
      exportMenu?.classList.add('hidden');
      fileManager.exportDxf();
    });

    // Close export dropdown when clicking elsewhere
    this.documentClickHandler = (e: MouseEvent) => {
      if (exportMenu && !exportMenu.classList.contains('hidden')) {
        if (!this.element.querySelector('.dropdown-container')?.contains(e.target as Node)) {
          exportMenu.classList.add('hidden');
        }
      }
    };
    document.addEventListener('click', this.documentClickHandler);

    // Tool buttons
    const toolBtns = this.element.querySelectorAll<HTMLButtonElement>('.tool-radio-btn');
    toolBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool as ToolType;
        if (tool) {
          uiStore.getState().setActiveTool(tool);
        }
      });
    });

    // Sidebar toggles
    this.element.querySelector('#tb-toggle-catalog')?.addEventListener('click', () => {
      uiStore.getState().toggleCatalog();
    });

    this.element.querySelector('#tb-toggle-layers')?.addEventListener('click', () => {
      uiStore.getState().toggleLayers();
    });

    this.element.querySelector('#tb-toggle-inspector')?.addEventListener('click', () => {
      uiStore.getState().toggleInspector();
    });

    // History controls
    this.element.querySelector('#tb-undo')?.addEventListener('click', () => {
      planStore.getState().undo();
    });

    this.element.querySelector('#tb-redo')?.addEventListener('click', () => {
      planStore.getState().redo();
    });

    // Viewport controls
    this.element.querySelector('#tb-zoom-fit')?.addEventListener('click', () => {
      uiStore.getState().requestZoomToFit();
    });

    this.element.querySelector('#tb-reset-zoom')?.addEventListener('click', () => {
      uiStore.getState().requestResetZoom();
    });

    // Clear canvas modal
    const modal = this.element.querySelector('#clear-confirm-modal') as HTMLElement;
    const cancelBtn = this.element.querySelector('#modal-cancel-btn');
    const confirmBtn = this.element.querySelector('#modal-confirm-clear-btn');

    this.element.querySelector('#tb-clear-canvas')?.addEventListener('click', () => {
      modal?.classList.remove('hidden');
    });

    cancelBtn?.addEventListener('click', () => {
      modal?.classList.add('hidden');
    });

    confirmBtn?.addEventListener('click', () => {
      planStore.getState().clear();
      modal?.classList.add('hidden');
    });
  }

  private subscribeStores(): void {
    // UI Store subscription
    this.unsubscribeUI = uiStore.subscribe((state) => {
      const toolBtns = this.element.querySelectorAll<HTMLButtonElement>('.tool-radio-btn');
      toolBtns.forEach((btn) => {
        const isActive = btn.dataset.tool === state.activeTool;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      });

      const catalogBtn = this.element.querySelector('#tb-toggle-catalog');
      catalogBtn?.classList.toggle('active', state.showCatalog);

      const layersBtn = this.element.querySelector('#tb-toggle-layers');
      layersBtn?.classList.toggle('active', state.showLayers);

      const inspectorBtn = this.element.querySelector('#tb-toggle-inspector');
      inspectorBtn?.classList.toggle('active', state.showInspector);
    });

    // Plan Store subscription
    this.unsubscribePlan = planStore.subscribe((state) => {
      const undoBtn = this.element.querySelector<HTMLButtonElement>('#tb-undo');
      const redoBtn = this.element.querySelector<HTMLButtonElement>('#tb-redo');

      if (undoBtn) undoBtn.disabled = !state.canUndo();
      if (redoBtn) redoBtn.disabled = !state.canRedo();
    });
  }

  public destroy(): void {
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler);
    }
    this.unsubscribeUI?.();
    this.unsubscribePlan?.();
  }
}
