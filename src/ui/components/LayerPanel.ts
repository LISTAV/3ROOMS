import { planStore } from '../../core/store/planStore.js';
import { uiStore } from '../../core/store/uiStore.js';
import type { Layer } from '../../core/types.js';
import type { LengthUnit } from '../../core/units/unitFormatter.js';
import { getIconSvg } from '../icons.js';

export class LayerPanel {
  public element: HTMLElement;
  private unsubscribePlan: (() => void) | null = null;
  private unsubscribeUI: (() => void) | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'layer-panel-container hidden';
    this.render();
    this.bindEvents();
    this.subscribeStores();
  }

  public toggle(): void {
    uiStore.getState().toggleLayers();
  }

  public show(): void {
    this.element.classList.remove('hidden');
  }

  public hide(): void {
    this.element.classList.add('hidden');
  }

  private render(): void {
    const plan = planStore.getState();
    const ui = uiStore.getState();

    // Render layers top-to-bottom (highest order to lowest order)
    const reversedOrder = [...plan.layerOrder].reverse();

    const unitOptions: Array<{ id: LengthUnit; label: string }> = [
      { id: 'mm', label: 'Millimeters (mm)' },
      { id: 'cm', label: 'Centimeters (cm)' },
      { id: 'm', label: 'Meters (m)' },
      { id: 'in', label: 'Inches (in)' },
      { id: 'ft', label: 'Feet (ft)' },
      { id: 'ft_in', label: 'Feet & Inches (ft - in)' },
    ];

    this.element.innerHTML = `
      <div class="layer-panel-header">
        <div class="layer-header-title">
          <span class="header-icon">${getIconSvg('Layers', 16)}</span>
          <span class="header-text">Layers</span>
          <span class="layer-count-badge">${plan.layerOrder.length}</span>
        </div>

        <div class="layer-header-controls">
          <select id="layer-unit-select" class="layer-unit-dropdown" title="Select Dimension Units">
            ${unitOptions
              .map(
                (u) =>
                  `<option value="${u.id}" ${ui.unitSettings.lengthUnit === u.id ? 'selected' : ''}>${u.label}</option>`
              )
              .join('')}
          </select>
          <button class="layer-btn-icon close-btn" id="layer-close-btn" title="Close Panel">
            ${getIconSvg('X', 15)}
          </button>
        </div>
      </div>

      <div class="layer-list-scrollable" id="layer-items-container">
        ${reversedOrder
          .map((layerId, visualIdx) => {
            const layer = plan.layers[layerId];
            if (!layer) return '';
            const isActive = plan.activeLayerId === layerId;
            const opacityPercent = Math.round(layer.opacity * 100);

            return `
            <div class="layer-row ${isActive ? 'active' : ''} ${layer.locked ? 'locked' : ''} ${!layer.visible ? 'hidden-layer' : ''}" 
                 data-layer-id="${layer.id}">
              
              <!-- Active Target Indicator -->
              <div class="layer-active-indicator" title="${isActive ? 'Active Drawing Layer' : 'Click to Make Active'}"></div>

              <!-- Visibility Toggle -->
              <button class="layer-btn-icon vis-toggle" data-action="toggle-vis" title="${layer.visible ? 'Hide Layer' : 'Show Layer'}">
                ${getIconSvg(layer.visible ? 'Eye' : 'EyeOff', 15)}
              </button>

              <!-- Lock Toggle -->
              <button class="layer-btn-icon lock-toggle" data-action="toggle-lock" title="${layer.locked ? 'Unlock Layer' : 'Lock Layer'}">
                ${getIconSvg(layer.locked ? 'Lock' : 'Unlock', 15)}
              </button>

              <!-- Color Dot -->
              <span class="layer-color-tag" style="background-color: ${layer.colorTag || '#3b82f6'};"></span>

              <!-- Name (Editable) -->
              <div class="layer-name-container">
                <span class="layer-name-label" title="Double click to rename">${layer.name}</span>
                <input type="text" class="layer-name-input hidden" value="${layer.name}" />
              </div>

              <!-- Reorder Buttons -->
              <div class="layer-reorder-group">
                <button class="layer-btn-mini" data-action="move-up" title="Move Up in Stack" ${visualIdx === 0 ? 'disabled' : ''}>
                  ${getIconSvg('ArrowUp', 12)}
                </button>
                <button class="layer-btn-mini" data-action="move-down" title="Move Down in Stack" ${visualIdx === reversedOrder.length - 1 ? 'disabled' : ''}>
                  ${getIconSvg('ArrowDown', 12)}
                </button>
              </div>

              <!-- Opacity Slider -->
              <div class="layer-opacity-wrap" title="Layer Opacity: ${opacityPercent}%">
                <input type="range" class="layer-opacity-slider" min="0" max="100" value="${opacityPercent}" />
                <span class="layer-opacity-text">${opacityPercent}%</span>
              </div>
            </div>
          `;
          })
          .join('')}
      </div>

      <div class="layer-panel-footer">
        <button class="layer-footer-btn" id="layer-btn-add" title="Create New Layer">
          ${getIconSvg('Plus', 14)}
          <span>New Layer</span>
        </button>

        <button class="layer-footer-btn" id="layer-btn-move-selected" title="Move selected elements into active layer">
          ${getIconSvg('Check', 14)}
          <span>Assign Selected</span>
        </button>

        <button class="layer-footer-btn danger" id="layer-btn-delete" title="Delete current active layer" ${plan.layerOrder.length <= 1 ? 'disabled' : ''}>
          ${getIconSvg('Trash2', 14)}
        </button>
      </div>
    `;
  }

  private bindEvents(): void {
    // Unit Switcher
    this.element.addEventListener('change', (e) => {
      const target = e.target as HTMLElement;
      if (target && target.id === 'layer-unit-select') {
        const selected = (target as HTMLSelectElement).value as LengthUnit;
        uiStore.getState().setLengthUnit(selected);
      }
    });

    // Close button
    this.element.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('#layer-close-btn');
      if (target) {
        uiStore.getState().toggleLayers();
      }
    });

    // Footer actions
    this.element.addEventListener('click', (e) => {
      const addBtn = (e.target as HTMLElement).closest('#layer-btn-add');
      if (addBtn) {
        const count = planStore.getState().layerOrder.length + 1;
        const colors = ['#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fb923c', '#4ade80'];
        const color = colors[count % colors.length];
        planStore.getState().createLayer(`Layer ${count}`, { colorTag: color });
        return;
      }

      const moveBtn = (e.target as HTMLElement).closest('#layer-btn-move-selected');
      if (moveBtn) {
        const activeId = planStore.getState().activeLayerId;
        planStore.getState().moveSelectedToLayer(activeId);
        return;
      }

      const delBtn = (e.target as HTMLElement).closest('#layer-btn-delete');
      if (delBtn) {
        const state = planStore.getState();
        if (state.layerOrder.length <= 1) return;
        const activeId = state.activeLayerId;
        const layer = state.layers[activeId];
        const confirmMsg = `Are you sure you want to delete layer "${layer?.name || activeId}"? Elements will be reassigned to the default layer.`;
        if (typeof window !== 'undefined' && window.confirm(confirmMsg)) {
          planStore.getState().deleteLayer(activeId);
        }
        return;
      }
    });

    // Delegated Row Actions
    this.element.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const row = target.closest('.layer-row') as HTMLElement | null;
      if (!row) return;

      const layerId = row.dataset.layerId;
      if (!layerId) return;

      // Visibility Toggle
      if (target.closest('[data-action="toggle-vis"]')) {
        e.stopPropagation();
        planStore.getState().toggleLayerVisibility(layerId);
        return;
      }

      // Lock Toggle
      if (target.closest('[data-action="toggle-lock"]')) {
        e.stopPropagation();
        planStore.getState().toggleLayerLock(layerId);
        return;
      }

      // Move Up (visual up = higher order)
      if (target.closest('[data-action="move-up"]')) {
        e.stopPropagation();
        this.moveLayerInStack(layerId, 1);
        return;
      }

      // Move Down (visual down = lower order)
      if (target.closest('[data-action="move-down"]')) {
        e.stopPropagation();
        this.moveLayerInStack(layerId, -1);
        return;
      }

      // Click row to activate
      if (!target.closest('.layer-opacity-wrap') && !target.closest('.layer-name-input')) {
        planStore.getState().setActiveLayer(layerId);
      }
    });

    // Opacity Slider Input
    this.element.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      if (target && target.classList.contains('layer-opacity-slider')) {
        const row = target.closest('.layer-row') as HTMLElement | null;
        const layerId = row?.dataset.layerId;
        if (layerId) {
          const val = parseInt(target.value, 10) / 100;
          planStore.getState().setLayerOpacity(layerId, val);
          const textSpan = row?.querySelector('.layer-opacity-text');
          if (textSpan) textSpan.textContent = `${target.value}%`;
        }
      }
    });

    // Double-click to rename layer
    this.element.addEventListener('dblclick', (e) => {
      const label = (e.target as HTMLElement).closest('.layer-name-label') as HTMLElement | null;
      if (!label) return;
      const container = label.parentElement;
      const input = container?.querySelector('.layer-name-input') as HTMLInputElement | null;
      if (input) {
        label.classList.add('hidden');
        input.classList.remove('hidden');
        input.focus();
        input.select();

        const commitName = () => {
          const row = label.closest('.layer-row') as HTMLElement | null;
          const layerId = row?.dataset.layerId;
          const newName = input.value.trim();
          if (layerId && newName) {
            planStore.getState().updateLayer(layerId, { name: newName });
          }
          label.classList.remove('hidden');
          input.classList.add('hidden');
        };

        input.onblur = commitName;
        input.onkeydown = (ke) => {
          if (ke.key === 'Enter') {
            commitName();
          } else if (ke.key === 'Escape') {
            label.classList.remove('hidden');
            input.classList.add('hidden');
          }
        };
      }
    });
  }

  private moveLayerInStack(layerId: string, delta: number): void {
    const state = planStore.getState();
    const order = [...state.layerOrder];
    const currentIndex = order.indexOf(layerId);
    if (currentIndex === -1) return;

    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= order.length) return;

    // Swap positions
    const temp = order[currentIndex];
    order[currentIndex] = order[targetIndex];
    order[targetIndex] = temp;

    planStore.getState().reorderLayers(order);
  }

  private subscribeStores(): void {
    this.unsubscribePlan = planStore.subscribe(() => {
      this.render();
    });

    this.unsubscribeUI = uiStore.subscribe((state, prev) => {
      if (state.showLayers !== prev.showLayers) {
        if (state.showLayers) {
          this.show();
        } else {
          this.hide();
        }
      }
      if (state.unitSettings.lengthUnit !== prev.unitSettings.lengthUnit) {
        const select = this.element.querySelector('#layer-unit-select') as HTMLSelectElement | null;
        if (select) {
          select.value = state.unitSettings.lengthUnit;
        }
      }
    });
  }

  public destroy(): void {
    this.unsubscribePlan?.();
    this.unsubscribeUI?.();
  }
}
