import { getIconSvg } from '../icons.js';
import { fileManager } from '../../core/io/fileManager.js';
import { planStore } from '../../core/store/planStore.js';
import { uiStore } from '../../core/store/uiStore.js';
import {
  STANDARD_PAPER_SIZES,
  type PaperSize,
  type SheetOrientation,
  type PdfExportOptions,
  renderSheetPreview,
} from '../../core/export/pdfExporter.js';

/**
 * Architectural PDF Sheet Export Modal Dialog.
 * Allows users to choose paper size (A4-A0, Letter, Tabloid, Arch D),
 * orientation, margins, border frames, title blocks, and inspect a live sheet preview.
 */
export class PdfExportModal {
  public element: HTMLElement;
  private isOpen: boolean = false;
  private selectedPaperSize: PaperSize = 'A3';
  private selectedOrientation: SheetOrientation = 'landscape';
  private selectedMarginMm: number = 15;
  private includeBorder: boolean = true;
  private includeTitleBlock: boolean = true;
  private includeDimensions: boolean = true;
  private includeCornerAngles: boolean = true;
  private includeLines: boolean = true;
  private includeRooms: boolean = true;
  private includeFurniture: boolean = true;
  private sheetTitle: string = 'Untitled Floor Plan';
  private sheetNumber: string = 'A-101';
  private isExporting: boolean = false;

  constructor() {
    this.element = document.createElement('div');
    this.element.id = 'pdf-export-modal-container';
    this.render();
  }

  public open(): void {
    this.isOpen = true;
    this.sheetTitle = fileManager.getProjectName().replace(/\.(floorplan|json)$/i, '') || 'Floor Plan';
    this.render();
    document.body.appendChild(this.element);
    this.attachEvents();
    this.updatePreview();
  }

  public close(): void {
    this.isOpen = false;
    this.element.remove();
  }

  private getCurrentOptions(): PdfExportOptions {
    return {
      paperSize: this.selectedPaperSize,
      orientation: this.selectedOrientation,
      marginMm: this.selectedMarginMm,
      includeBorder: this.includeBorder,
      includeTitleBlock: this.includeTitleBlock,
      includeDimensions: this.includeDimensions,
      includeCornerAngles: this.includeCornerAngles,
      includeLines: this.includeLines,
      includeRooms: this.includeRooms,
      includeFurniture: this.includeFurniture,
      includeImages: true,
      projectName: this.sheetTitle,
      sheetNumber: this.sheetNumber,
      unitSettings: uiStore.getState().unitSettings,
    };
  }

  private updatePreview(): void {
    const canvas = this.element.querySelector<HTMLCanvasElement>('#pdf-preview-canvas');
    if (!canvas) return;

    const state = planStore.getState();
    const options = this.getCurrentOptions();
    renderSheetPreview(canvas, state, options);

    // Update footer summary text
    const summaryEl = this.element.querySelector('#pdf-sheet-summary');
    if (summaryEl) {
      const paper = STANDARD_PAPER_SIZES[this.selectedPaperSize] || STANDARD_PAPER_SIZES.A3;
      const orientLabel = this.selectedOrientation.toUpperCase();
      summaryEl.textContent = `${paper.name} (${Math.round(paper.widthMm)} × ${Math.round(paper.heightMm)} mm) • ${orientLabel} • 300 DPI`;
    }
  }

  private render(): void {
    const paper = STANDARD_PAPER_SIZES[this.selectedPaperSize] || STANDARD_PAPER_SIZES.A3;

    this.element.innerHTML = `
      <div class="modal-backdrop" id="pdf-modal-backdrop">
        <div class="modal-card pdf-export-modal-card">
          <!-- Header -->
          <div class="modal-header">
            <div class="modal-title-with-icon">
              <span class="modal-icon-badge">${getIconSvg('FileText', 18)}</span>
              <div>
                <h3>Architectural Sheet Export</h3>
                <span class="modal-subtitle">Generate print-ready vector/raster PDF blueprint sheet</span>
              </div>
            </div>
            <button class="modal-close-btn" id="pdf-modal-close" title="Close Dialog">
              ${getIconSvg('X', 16)}
            </button>
          </div>

          <!-- Body: Two-Column Layout -->
          <div class="modal-body pdf-modal-body">
            <!-- Left: Settings & Options -->
            <div class="pdf-settings-column">
              <!-- 1. Paper Size -->
              <div class="form-group">
                <label class="form-label" for="pdf-paper-size">
                  <span>Paper Sheet Size</span>
                  <span class="label-hint">${paper.description}</span>
                </label>
                <select class="form-select" id="pdf-paper-size">
                  <optgroup label="ISO Metric (International Standard)">
                    <option value="A4" ${this.selectedPaperSize === 'A4' ? 'selected' : ''}>A4 (210 × 297 mm) — Standard Office</option>
                    <option value="A3" ${this.selectedPaperSize === 'A3' ? 'selected' : ''}>A3 (297 × 420 mm) — Presentation Sheet</option>
                    <option value="A2" ${this.selectedPaperSize === 'A2' ? 'selected' : ''}>A2 (420 × 594 mm) — Working Drawing</option>
                    <option value="A1" ${this.selectedPaperSize === 'A1' ? 'selected' : ''}>A1 (594 × 841 mm) — Construction Plan</option>
                    <option value="A0" ${this.selectedPaperSize === 'A0' ? 'selected' : ''}>A0 (841 × 1189 mm) — Master Site Plan</option>
                  </optgroup>
                  <optgroup label="US / ANSI / Architectural">
                    <option value="Letter" ${this.selectedPaperSize === 'Letter' ? 'selected' : ''}>US Letter (8.5 × 11 in)</option>
                    <option value="Tabloid" ${this.selectedPaperSize === 'Tabloid' ? 'selected' : ''}>US Tabloid / ANSI B (11 × 17 in)</option>
                    <option value="ArchD" ${this.selectedPaperSize === 'ArchD' ? 'selected' : ''}>Arch D (24 × 36 in) — Construction</option>
                    <option value="ArchE" ${this.selectedPaperSize === 'ArchE' ? 'selected' : ''}>Arch E (36 × 48 in) — Large Format</option>
                  </optgroup>
                </select>
              </div>

              <!-- 2. Orientation -->
              <div class="form-group">
                <label class="form-label">Sheet Orientation</label>
                <div class="segmented-control" id="pdf-orientation-group">
                  <button type="button" class="segment-btn ${this.selectedOrientation === 'landscape' ? 'active' : ''}" data-orientation="landscape">
                    ${getIconSvg('Maximize2', 13)}
                    <span>Landscape</span>
                  </button>
                  <button type="button" class="segment-btn ${this.selectedOrientation === 'portrait' ? 'active' : ''}" data-orientation="portrait">
                    ${getIconSvg('Minimize2', 13)}
                    <span>Portrait</span>
                  </button>
                  <button type="button" class="segment-btn ${this.selectedOrientation === 'auto' ? 'active' : ''}" data-orientation="auto">
                    ${getIconSvg('RotateCcw', 13)}
                    <span>Auto (Fit)</span>
                  </button>
                </div>
              </div>

              <!-- 3. Margins -->
              <div class="form-group">
                <label class="form-label" for="pdf-margins">Sheet Margin</label>
                <select class="form-select" id="pdf-margins">
                  <option value="8" ${this.selectedMarginMm === 8 ? 'selected' : ''}>Compact (8 mm)</option>
                  <option value="15" ${this.selectedMarginMm === 15 ? 'selected' : ''}>Standard (15 mm)</option>
                  <option value="25" ${this.selectedMarginMm === 25 ? 'selected' : ''}>Wide Architectural (25 mm)</option>
                </select>
              </div>

              <!-- 4. Architectural Elements -->
              <div class="form-group">
                <label class="form-label">Architectural Sheet Elements</label>
                <div class="checkbox-group">
                  <label class="checkbox-label">
                    <input type="checkbox" id="pdf-inc-border" ${this.includeBorder ? 'checked' : ''} />
                    <span>Double-line Architectural Border Frame</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" id="pdf-inc-titleblock" ${this.includeTitleBlock ? 'checked' : ''} />
                    <span>Title Block Banner (Project & Sheet Info)</span>
                  </label>
                </div>
              </div>

              <!-- 5. Drawing Content -->
              <div class="form-group">
                <label class="form-label">Drawing Content Layers</label>
                <div class="checkbox-grid">
                  <label class="checkbox-label">
                    <input type="checkbox" id="pdf-inc-dim" ${this.includeDimensions ? 'checked' : ''} />
                    <span>Wall Dimensions</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" id="pdf-inc-angles" ${this.includeCornerAngles ? 'checked' : ''} />
                    <span>Corner Angles</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" id="pdf-inc-rooms" ${this.includeRooms ? 'checked' : ''} />
                    <span>Rooms & Areas</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" id="pdf-inc-lines" ${this.includeLines ? 'checked' : ''} />
                    <span>Drafting Lines</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" id="pdf-inc-furn" ${this.includeFurniture ? 'checked' : ''} />
                    <span>Furniture Assets</span>
                  </label>
                </div>
              </div>

              <!-- 6. Metadata -->
              <div class="form-row">
                <div class="form-group form-col-8">
                  <label class="form-label" for="pdf-project-title">Sheet Project Title</label>
                  <input type="text" class="form-input" id="pdf-project-title" value="${this.sheetTitle}" />
                </div>
                <div class="form-group form-col-4">
                  <label class="form-label" for="pdf-sheet-num">Sheet #</label>
                  <input type="text" class="form-input" id="pdf-sheet-num" value="${this.sheetNumber}" />
                </div>
              </div>
            </div>

            <!-- Right: Interactive Live Sheet Preview -->
            <div class="pdf-preview-column">
              <div class="preview-header">
                <span class="preview-title">${getIconSvg('Eye', 14)} Live Sheet Preview</span>
                <span class="preview-badge" id="pdf-preview-badge">300 DPI Vector/Raster</span>
              </div>
              <div class="preview-canvas-container">
                <canvas id="pdf-preview-canvas" width="520" height="380"></canvas>
              </div>
              <span class="preview-caption">Shows true physical page aspect ratio, outer borders, title block, and plan fit.</span>
            </div>
          </div>

          <!-- Footer -->
          <div class="modal-footer pdf-modal-footer">
            <div class="pdf-footer-meta" id="pdf-sheet-summary">
              ${paper.name} (${Math.round(paper.widthMm)} × ${Math.round(paper.heightMm)} mm) • LANDSCAPE • 300 DPI
            </div>
            <div class="modal-footer-actions">
              <button class="modal-btn secondary" id="pdf-modal-cancel">Cancel</button>
              <button class="modal-btn primary" id="pdf-modal-confirm" ${this.isExporting ? 'disabled' : ''}>
                ${this.isExporting ? getIconSvg('RotateCcw', 15) : getIconSvg('Download', 15)}
                <span>${this.isExporting ? 'Exporting...' : 'Export PDF'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private attachEvents(): void {
    // Close / Cancel
    this.element.querySelector('#pdf-modal-close')?.addEventListener('click', () => this.close());
    this.element.querySelector('#pdf-modal-cancel')?.addEventListener('click', () => this.close());

    const backdrop = this.element.querySelector('#pdf-modal-backdrop');
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    // Paper Size
    const paperSelect = this.element.querySelector<HTMLSelectElement>('#pdf-paper-size');
    paperSelect?.addEventListener('change', () => {
      this.selectedPaperSize = paperSelect.value as PaperSize;
      const hint = this.element.querySelector('.label-hint');
      const p = STANDARD_PAPER_SIZES[this.selectedPaperSize];
      if (hint && p) hint.textContent = p.description;
      this.updatePreview();
    });

    // Orientation
    const orientationBtns = this.element.querySelectorAll<HTMLButtonElement>('.segment-btn');
    orientationBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        orientationBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedOrientation = btn.dataset.orientation as SheetOrientation;
        this.updatePreview();
      });
    });

    // Margins
    const marginSelect = this.element.querySelector<HTMLSelectElement>('#pdf-margins');
    marginSelect?.addEventListener('change', () => {
      this.selectedMarginMm = parseInt(marginSelect.value, 10) || 15;
      this.updatePreview();
    });

    // Checkboxes
    const borderCb = this.element.querySelector<HTMLInputElement>('#pdf-inc-border');
    borderCb?.addEventListener('change', () => {
      this.includeBorder = borderCb.checked;
      this.updatePreview();
    });

    const tbCb = this.element.querySelector<HTMLInputElement>('#pdf-inc-titleblock');
    tbCb?.addEventListener('change', () => {
      this.includeTitleBlock = tbCb.checked;
      this.updatePreview();
    });

    const dimCb = this.element.querySelector<HTMLInputElement>('#pdf-inc-dim');
    dimCb?.addEventListener('change', () => {
      this.includeDimensions = dimCb.checked;
      this.updatePreview();
    });

    const angleCb = this.element.querySelector<HTMLInputElement>('#pdf-inc-angles');
    angleCb?.addEventListener('change', () => {
      this.includeCornerAngles = angleCb.checked;
      this.updatePreview();
    });

    const roomCb = this.element.querySelector<HTMLInputElement>('#pdf-inc-rooms');
    roomCb?.addEventListener('change', () => {
      this.includeRooms = roomCb.checked;
      this.updatePreview();
    });

    const lineCb = this.element.querySelector<HTMLInputElement>('#pdf-inc-lines');
    lineCb?.addEventListener('change', () => {
      this.includeLines = lineCb.checked;
      this.updatePreview();
    });

    const furnCb = this.element.querySelector<HTMLInputElement>('#pdf-inc-furn');
    furnCb?.addEventListener('change', () => {
      this.includeFurniture = furnCb.checked;
      this.updatePreview();
    });

    // Text inputs
    const titleInput = this.element.querySelector<HTMLInputElement>('#pdf-project-title');
    titleInput?.addEventListener('input', () => {
      this.sheetTitle = titleInput.value.trim() || 'Floor Plan';
      this.updatePreview();
    });

    const sheetNumInput = this.element.querySelector<HTMLInputElement>('#pdf-sheet-num');
    sheetNumInput?.addEventListener('input', () => {
      this.sheetNumber = sheetNumInput.value.trim() || 'A-101';
      this.updatePreview();
    });

    // Confirm Export
    const confirmBtn = this.element.querySelector<HTMLButtonElement>('#pdf-modal-confirm');
    confirmBtn?.addEventListener('click', async () => {
      if (this.isExporting) return;
      this.isExporting = true;
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `${getIconSvg('RotateCcw', 15)} <span>Generating PDF...</span>`;

      try {
        const options = this.getCurrentOptions();
        await fileManager.exportPdf(options);
        this.close();
      } catch (err: any) {
        alert(`Failed to export PDF: ${err.message || String(err)}`);
      } finally {
        this.isExporting = false;
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = `${getIconSvg('Download', 15)} <span>Export PDF</span>`;
        }
      }
    });
  }
}

export const pdfExportModal = new PdfExportModal();
