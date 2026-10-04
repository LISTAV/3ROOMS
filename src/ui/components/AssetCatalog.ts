import { AssetManager } from '../../core/assets/AssetManager.js';
import { uiStore } from '../../core/store/uiStore.js';
import { getIconSvg } from '../icons.js';
import type { FurnitureDefinition, AssetCategory } from '../../core/types.js';

interface PendingSvgImport {
  svgContent: string;
  aspect: number;
  widthMm: number;
  heightMm: number;
  name: string;
  category: AssetCategory;
  lockAspect: boolean;
}

export class AssetCatalog {
  public element: HTMLElement;
  private searchTerm: string = '';
  private openSections: Set<string> = new Set(['stairs', 'living', 'bedroom', 'kitchen', 'bathroom', 'custom']);
  private unsubscribeUI: (() => void) | null = null;
  private unsubscribeAsset: (() => void) | null = null;
  private pendingImport: PendingSvgImport | null = null;

  constructor() {
    this.element = document.createElement('aside');
    this.element.className = 'asset-catalog-sidebar';
    this.render();
    this.subscribeStores();
  }

  private render(): void {
    const isVisible = uiStore.getState().showCatalog;
    this.element.classList.toggle('collapsed', !isVisible);

    const categories: Array<{ id: AssetCategory; name: string; icon: string }> = [
      { id: 'stairs', name: 'Stairs & Circulation', icon: getIconSvg('Layers', 15) },
      { id: 'living', name: 'Living Room', icon: getIconSvg('Sofa', 15) },
      { id: 'bedroom', name: 'Bedroom', icon: getIconSvg('Bed', 15) },
      { id: 'kitchen', name: 'Kitchen & Dining', icon: getIconSvg('Utensils', 15) },
      { id: 'bathroom', name: 'Bathroom & Sanitary', icon: getIconSvg('Bath', 15) },
      { id: 'custom', name: 'Custom Imports', icon: getIconSvg('Upload', 15) },
    ];

    const allDefinitions = AssetManager.getInstance().getAllDefinitions();
    const filteredCatalog = allDefinitions.filter((item) =>
      item.name.toLowerCase().includes(this.searchTerm.toLowerCase())
    );

    this.element.innerHTML = `
      <div class="catalog-header">
        <div class="catalog-title-row">
          <div class="catalog-title">
            <span class="catalog-header-icon">${getIconSvg('Layers', 16)}</span>
            <span>Asset Catalog</span>
          </div>
          <div class="catalog-actions-row">
            <button class="catalog-import-btn" id="btn-import-svg" title="Import Custom SVG Symbol (Staircase, Furniture, CAD Symbol)">
              ${getIconSvg('Upload', 13)}
              <span>Import SVG</span>
            </button>
            <span class="catalog-badge">${allDefinitions.length}</span>
          </div>
        </div>

        <input type="file" id="catalog-svg-file-input" accept=".svg,image/svg+xml" style="display: none;" />

        <div class="catalog-search-wrapper">
          <span class="search-icon">${getIconSvg('Search', 14)}</span>
          <input type="text" 
                 class="catalog-search-input" 
                 placeholder="Search symbols..." 
                 value="${this.searchTerm}" 
                 id="catalog-search" />
          ${
            this.searchTerm
              ? `<button class="search-clear-btn" id="search-clear">${getIconSvg('X', 12)}</button>`
              : ''
          }
        </div>
      </div>

      <div class="catalog-content">
        ${categories
          .map((cat) => {
            const items = filteredCatalog.filter((item) => item.category === cat.id);
            if (this.searchTerm && items.length === 0) return '';
            // Only hide empty custom section if not searching and no items
            if (cat.id === 'custom' && items.length === 0 && !this.searchTerm) return '';

            const isOpen = this.openSections.has(cat.id);

            return `
            <div class="catalog-accordion ${isOpen ? 'open' : ''}" data-cat="${cat.id}">
              <button class="accordion-header" data-cat="${cat.id}">
                <div class="accordion-title">
                  <span class="cat-icon">${cat.icon}</span>
                  <span class="cat-name">${cat.name}</span>
                </div>
                <div class="accordion-meta">
                  <span class="item-count">${items.length}</span>
                  <span class="chevron-icon">${getIconSvg(isOpen ? 'ChevronDown' : 'ChevronRight', 14)}</span>
                </div>
              </button>

              <div class="accordion-body ${isOpen ? '' : 'collapsed'}">
                <div class="item-grid">
                  ${items.map((item) => this.renderItemCard(item)).join('')}
                </div>
              </div>
            </div>
          `;
          })
          .join('')}

        ${
          filteredCatalog.length === 0
            ? `
          <div class="catalog-empty-state">
            <p>No matching symbols found.</p>
          </div>
        `
            : ''
        }
      </div>

      <div class="catalog-footer">
        <small>💡 Click or drag symbol onto canvas</small>
      </div>

      <!-- SVG Import Modal Dialog -->
      ${this.renderImportModal()}
    `;

    this.bindEvents();
  }

  private renderItemCard(item: FurnitureDefinition): string {
    const isPlacing = uiStore.getState().activePlacementDefId === item.id;

    return `
      <div class="catalog-item-card ${isPlacing ? 'active-placing' : ''}" 
           data-def-id="${item.id}" 
           draggable="true" 
           title="Click to place or drag onto canvas">
        ${
          item.isCustom
            ? `<button class="delete-custom-asset-btn" data-del-id="${item.id}" title="Delete Custom Symbol">
                ${getIconSvg('Trash2', 12)}
               </button>`
            : ''
        }
        <div class="item-thumb-container">
          <div class="item-thumb-svg">
            ${item.svgContent}
          </div>
        </div>
        <div class="item-info">
          <div class="item-name">${item.name}</div>
          <div class="item-dims">${item.defaultWidthMm} × ${item.defaultHeightMm} mm</div>
        </div>
      </div>
    `;
  }

  private renderImportModal(): string {
    if (!this.pendingImport) return '';

    return `
      <div class="modal-backdrop" id="svg-import-modal">
        <div class="modal-card svg-import-modal-card">
          <div class="modal-header">
            <h3>📐 Import SVG CAD Asset</h3>
            <button class="modal-close-btn" id="modal-import-close">${getIconSvg('X', 16)}</button>
          </div>
          <div class="modal-body">
            <div class="svg-import-preview-box">
              ${this.pendingImport.svgContent}
            </div>

            <div class="svg-import-form-grid">
              <div class="svg-import-field full-width">
                <label for="import-asset-name">Asset Name</label>
                <input type="text" id="import-asset-name" value="${this.pendingImport.name}" placeholder="e.g. Spiral Staircase" />
              </div>

              <div class="svg-import-field full-width">
                <label for="import-asset-category">Category</label>
                <select id="import-asset-category">
                  <option value="stairs" ${this.pendingImport.category === 'stairs' ? 'selected' : ''}>Stairs & Circulation</option>
                  <option value="living" ${this.pendingImport.category === 'living' ? 'selected' : ''}>Living Room</option>
                  <option value="bedroom" ${this.pendingImport.category === 'bedroom' ? 'selected' : ''}>Bedroom</option>
                  <option value="kitchen" ${this.pendingImport.category === 'kitchen' ? 'selected' : ''}>Kitchen & Dining</option>
                  <option value="bathroom" ${this.pendingImport.category === 'bathroom' ? 'selected' : ''}>Bathroom & Sanitary</option>
                  <option value="custom" ${this.pendingImport.category === 'custom' ? 'selected' : ''}>Custom Imports</option>
                </select>
              </div>

              <div class="svg-import-field">
                <label for="import-asset-width">Real-World Width (mm)</label>
                <input type="number" id="import-asset-width" min="50" step="50" value="${this.pendingImport.widthMm}" />
              </div>

              <div class="svg-import-field">
                <label for="import-asset-height">Real-World Length / Depth (mm)</label>
                <input type="number" id="import-asset-height" min="50" step="50" value="${this.pendingImport.heightMm}" />
              </div>

              <label class="svg-aspect-lock-row">
                <input type="checkbox" id="import-aspect-lock" ${this.pendingImport.lockAspect ? 'checked' : ''} />
                <span>Keep original SVG aspect ratio</span>
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="modal-btn secondary" id="modal-import-cancel">Cancel</button>
            <button class="modal-btn primary" id="modal-import-confirm">Add to Catalog</button>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    // Search input
    const searchInput = this.element.querySelector<HTMLInputElement>('#catalog-search');
    searchInput?.addEventListener('input', (e) => {
      this.searchTerm = (e.target as HTMLInputElement).value;
      this.render();
      const updatedInput = this.element.querySelector<HTMLInputElement>('#catalog-search');
      if (updatedInput) {
        updatedInput.focus();
        updatedInput.setSelectionRange(this.searchTerm.length, this.searchTerm.length);
      }
    });

    this.element.querySelector('#search-clear')?.addEventListener('click', () => {
      this.searchTerm = '';
      this.render();
    });

    // Import SVG Trigger
    const importBtn = this.element.querySelector('#btn-import-svg');
    const fileInput = this.element.querySelector<HTMLInputElement>('#catalog-svg-file-input');

    importBtn?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (file) {
        try {
          const parsed = await AssetManager.getInstance().parseSvgFile(file);
          const aspect = parsed.viewBoxWidth / parsed.viewBoxHeight;

          // If the file name contains "stair" or "step", default category to 'stairs'
          const lowerName = file.name.toLowerCase();
          const category: AssetCategory =
            lowerName.includes('stair') || lowerName.includes('step') || lowerName.includes('spiral')
              ? 'stairs'
              : 'custom';

          this.pendingImport = {
            svgContent: parsed.svgContent,
            aspect,
            widthMm: parsed.suggestedWidthMm,
            heightMm: parsed.suggestedHeightMm,
            name: parsed.suggestedName,
            category,
            lockAspect: true,
          };

          this.render();
        } catch (err) {
          alert(`Failed to parse SVG: ${(err as Error).message}`);
        }
        fileInput.value = '';
      }
    });

    // Modal Events
    if (this.pendingImport) {
      const modal = this.element.querySelector('#svg-import-modal');
      const closeBtn = this.element.querySelector('#modal-import-close');
      const cancelBtn = this.element.querySelector('#modal-import-cancel');
      const confirmBtn = this.element.querySelector('#modal-import-confirm');
      const widthInput = this.element.querySelector<HTMLInputElement>('#import-asset-width');
      const heightInput = this.element.querySelector<HTMLInputElement>('#import-asset-height');
      const lockCheckbox = this.element.querySelector<HTMLInputElement>('#import-aspect-lock');
      const nameInput = this.element.querySelector<HTMLInputElement>('#import-asset-name');
      const catSelect = this.element.querySelector<HTMLSelectElement>('#import-asset-category');

      const closeModal = () => {
        this.pendingImport = null;
        this.render();
      };

      closeBtn?.addEventListener('click', closeModal);
      cancelBtn?.addEventListener('click', closeModal);
      modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      lockCheckbox?.addEventListener('change', () => {
        if (this.pendingImport) {
          this.pendingImport.lockAspect = lockCheckbox.checked;
        }
      });

      widthInput?.addEventListener('input', () => {
        if (!this.pendingImport) return;
        const w = parseFloat(widthInput.value) || 0;
        this.pendingImport.widthMm = w;
        if (this.pendingImport.lockAspect && this.pendingImport.aspect > 0 && heightInput) {
          const h = Math.round(w / this.pendingImport.aspect);
          this.pendingImport.heightMm = h;
          heightInput.value = String(h);
        }
      });

      heightInput?.addEventListener('input', () => {
        if (!this.pendingImport) return;
        const h = parseFloat(heightInput.value) || 0;
        this.pendingImport.heightMm = h;
        if (this.pendingImport.lockAspect && this.pendingImport.aspect > 0 && widthInput) {
          const w = Math.round(h * this.pendingImport.aspect);
          this.pendingImport.widthMm = w;
          widthInput.value = String(w);
        }
      });

      nameInput?.addEventListener('input', () => {
        if (this.pendingImport) {
          this.pendingImport.name = nameInput.value;
        }
      });

      catSelect?.addEventListener('change', () => {
        if (this.pendingImport) {
          this.pendingImport.category = catSelect.value as AssetCategory;
        }
      });

      confirmBtn?.addEventListener('click', () => {
        if (!this.pendingImport) return;
        const finalName = nameInput?.value.trim() || this.pendingImport.name || 'Custom Symbol';
        const finalCategory = (catSelect?.value as AssetCategory) || this.pendingImport.category || 'custom';
        const finalWidth = Math.max(50, Math.round(parseFloat(widthInput?.value || '') || this.pendingImport.widthMm));
        const finalHeight = Math.max(50, Math.round(parseFloat(heightInput?.value || '') || this.pendingImport.heightMm));

        const newDef: FurnitureDefinition = {
          id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: finalName,
          category: finalCategory,
          defaultWidthMm: finalWidth,
          defaultHeightMm: finalHeight,
          svgContent: this.pendingImport.svgContent,
          isCustom: true,
        };

        AssetManager.getInstance().registerCustomDefinition(newDef);
        this.openSections.add(finalCategory);
        this.pendingImport = null;
        this.render();

        // Immediately start placement mode so the user can stamp it onto the canvas!
        uiStore.getState().startFurniturePlacement(newDef.id);
      });
    }

    // Delete custom item
    const deleteBtns = this.element.querySelectorAll<HTMLButtonElement>('.delete-custom-asset-btn');
    deleteBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const delId = btn.dataset.delId;
        if (delId && confirm('Delete this custom asset from your catalog?')) {
          AssetManager.getInstance().removeCustomDefinition(delId);
          this.render();
        }
      });
    });

    // Accordion toggles
    const accordionHeaders = this.element.querySelectorAll<HTMLButtonElement>('.accordion-header');
    accordionHeaders.forEach((btn) => {
      btn.addEventListener('click', () => {
        const catId = btn.dataset.cat;
        if (catId) {
          if (this.openSections.has(catId)) {
            this.openSections.delete(catId);
          } else {
            this.openSections.add(catId);
          }
          this.render();
        }
      });
    });

    // Item click (stamp mode)
    const itemCards = this.element.querySelectorAll<HTMLElement>('.catalog-item-card');
    itemCards.forEach((card) => {
      const defId = card.dataset.defId;
      if (!defId) return;

      card.addEventListener('click', () => {
        uiStore.getState().startFurniturePlacement(defId);
      });

      // HTML5 Drag & Drop
      card.addEventListener('dragstart', (e: DragEvent) => {
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', defId);
          e.dataTransfer.setData('application/json', JSON.stringify({ defId }));
          e.dataTransfer.effectAllowed = 'copy';
        }
      });
    });
  }

  private subscribeStores(): void {
    this.unsubscribeUI = uiStore.subscribe((state) => {
      this.element.classList.toggle('collapsed', !state.showCatalog);

      // Highlight active placing card
      const cards = this.element.querySelectorAll<HTMLElement>('.catalog-item-card');
      cards.forEach((card) => {
        const isPlacing = card.dataset.defId === state.activePlacementDefId;
        card.classList.toggle('active-placing', isPlacing);
      });
    });

    this.unsubscribeAsset = AssetManager.getInstance().onAssetLoaded(() => {
      this.render();
    });
  }

  public destroy(): void {
    this.unsubscribeUI?.();
    this.unsubscribeAsset?.();
  }
}
