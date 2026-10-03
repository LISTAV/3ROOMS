import { DEFAULT_FURNITURE_CATALOG } from '../../core/assets/AssetManager.js';
import { uiStore } from '../../core/store/uiStore.js';
import { getIconSvg } from '../icons.js';
import type { FurnitureDefinition } from '../../core/types.js';

export class AssetCatalog {
  public element: HTMLElement;
  private searchTerm: string = '';
  private openSections: Set<string> = new Set(['living', 'bedroom', 'kitchen', 'bathroom']);
  private unsubscribeUI: (() => void) | null = null;

  constructor() {
    this.element = document.createElement('aside');
    this.element.className = 'asset-catalog-sidebar';
    this.render();
    this.subscribeStores();
  }

  private render(): void {
    const isVisible = uiStore.getState().showCatalog;
    this.element.classList.toggle('collapsed', !isVisible);

    const categories: Array<{ id: string; name: string; icon: string }> = [
      { id: 'living', name: 'Living Room', icon: getIconSvg('Sofa', 15) },
      { id: 'bedroom', name: 'Bedroom', icon: getIconSvg('Bed', 15) },
      { id: 'kitchen', name: 'Kitchen & Dining', icon: getIconSvg('Utensils', 15) },
      { id: 'bathroom', name: 'Bathroom & Sanitary', icon: getIconSvg('Bath', 15) },
    ];

    const filteredCatalog = DEFAULT_FURNITURE_CATALOG.filter((item) =>
      item.name.toLowerCase().includes(this.searchTerm.toLowerCase())
    );

    this.element.innerHTML = `
      <div class="catalog-header">
        <div class="catalog-title-row">
          <div class="catalog-title">
            <span class="catalog-header-icon">${getIconSvg('Layers', 16)}</span>
            <span>Asset Catalog</span>
          </div>
          <span class="catalog-badge">${DEFAULT_FURNITURE_CATALOG.length} items</span>
        </div>

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
  }

  public destroy(): void {
    this.unsubscribeUI?.();
  }
}
