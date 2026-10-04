import { planStore } from '../store/planStore.js';
import { uiStore } from '../store/uiStore.js';
import { serializeProject, deserializeProject } from './schema.js';
import { exportToSvg } from '../export/svgExporter.js';
import { exportToDxf } from '../export/dxfExporter.js';
import { exportToPngBlob } from '../export/pngExporter.js';

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Downloads a Blob as a file in the browser environment.
 */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export class FileManager {
  public activeFilePath: string | null = null;
  public projectName: string = 'Untitled.floorplan';
  public isDirty: boolean = false;
  private browserFileHandle: any = null;
  private isInitializing: boolean = false;

  constructor() {
    this.updateWindowTitle();
    this.setupDirtyTracking();
  }

  private setupDirtyTracking(): void {
    let lastSnap = JSON.stringify(planStore.getState().getStateSnapshot());

    planStore.subscribe(() => {
      if (this.isInitializing) return;
      const currentSnap = JSON.stringify(planStore.getState().getStateSnapshot());
      if (currentSnap !== lastSnap) {
        lastSnap = currentSnap;
        if (!this.isDirty) {
          this.isDirty = true;
          this.updateWindowTitle();
        }
      }
    });
  }

  /**
   * Updates native Tauri window title and document.title with project name & dirty indicator.
   */
  public async updateWindowTitle(): Promise<void> {
    const dirtyMarker = this.isDirty ? ' *' : '';
    const title = `FloorPlan CAD - [${this.projectName}${dirtyMarker}]`;

    if (typeof document !== 'undefined') {
      document.title = title;
    }

    if (isTauriEnvironment()) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().setTitle(title);
      } catch (err) {
        console.warn('Could not update native Tauri window title:', err);
      }
    }
  }

  /**
   * Prompts user to confirm discarding unsaved changes if the project is dirty.
   */
  public promptIfDirty(): boolean {
    if (!this.isDirty) return true;
    if (typeof window !== 'undefined' && window.confirm) {
      return window.confirm(
        'You have unsaved changes in your floor plan. Are you sure you want to proceed without saving?'
      );
    }
    return true;
  }

  /**
   * 1. New File (Ctrl+N): Prompt if dirty, reset store & viewport.
   */
  public async newProject(): Promise<void> {
    if (!this.promptIfDirty()) return;

    this.isInitializing = true;
    planStore.getState().clear();
    this.activeFilePath = null;
    this.browserFileHandle = null;
    this.projectName = 'Untitled.floorplan';
    this.isDirty = false;
    this.isInitializing = false;

    uiStore.getState().requestResetZoom();
    await this.updateWindowTitle();
  }

  /**
   * 2. Open File (Ctrl+O): Open dialog, read file, deserialize, hydrate store, zoom to fit.
   */
  public async openProject(): Promise<void> {
    if (!this.promptIfDirty()) return;

    try {
      let fileContent: string | null = null;
      let filePath: string | null = null;
      let fileName: string = 'Untitled.floorplan';

      if (isTauriEnvironment()) {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const { readTextFile } = await import('@tauri-apps/plugin-fs');

        const selected = await open({
          multiple: false,
          directory: false,
          filters: [{ name: 'Floor Plan', extensions: ['floorplan', 'json'] }],
        });

        if (!selected || typeof selected !== 'string') return;
        filePath = selected;
        fileName = selected.split(/[\\/]/).pop() || 'Untitled.floorplan';
        fileContent = await readTextFile(selected);
      } else {
        // Browser Mode
        if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
          try {
            const [handle] = await (window as any).showOpenFilePicker({
              types: [
                {
                  description: 'Floor Plan Project',
                  accept: { 'application/json': ['.floorplan', '.json'] },
                },
              ],
              multiple: false,
            });
            this.browserFileHandle = handle;
            const file = await handle.getFile();
            fileName = file.name;
            fileContent = await file.text();
          } catch (pickerErr: any) {
            if (pickerErr.name === 'AbortError') return;
            // Fall through to input fallback
          }
        }

        if (!fileContent) {
          // Input element fallback
          fileContent = await new Promise<string | null>((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.floorplan,.json';
            input.onchange = async () => {
              const file = input.files?.[0];
              if (!file) {
                resolve(null);
                return;
              }
              fileName = file.name;
              const text = await file.text();
              resolve(text);
            };
            input.click();
          });
        }
      }

      if (!fileContent) return;

      const deserialized = deserializeProject(fileContent);

      this.isInitializing = true;
      planStore.getState().loadProject(deserialized);
      if (deserialized.metadata?.unitSystem) {
        uiStore.getState().setUnitSystem(deserialized.metadata.unitSystem);
      }

      this.activeFilePath = filePath;
      this.projectName = fileName;
      this.isDirty = false;
      this.isInitializing = false;

      await this.updateWindowTitle();

      // Trigger Zoom to Fit
      setTimeout(() => {
        uiStore.getState().requestZoomToFit();
      }, 50);
    } catch (err: any) {
      alert(`Failed to open project: ${err.message || String(err)}`);
    }
  }

  /**
   * 3. Save (Ctrl+S): Write directly to disk or delegate to Save As.
   */
  public async saveProject(): Promise<void> {
    if (this.activeFilePath || this.browserFileHandle) {
      await this.writeToActiveFile();
    } else {
      await this.saveProjectAs();
    }
  }

  /**
   * 4. Save As (Ctrl+Shift+S): Save dialog with default Untitled.floorplan.
   */
  public async saveProjectAs(): Promise<void> {
    const state = planStore.getState();
    const unitSystem = uiStore.getState().unitSystem;
    const jsonString = serializeProject(state, {
      title: this.projectName.replace(/\.floorplan$/i, ''),
      unitSystem,
    });

    try {
      if (isTauriEnvironment()) {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');

        const selectedPath = await save({
          defaultPath: this.projectName || 'Untitled.floorplan',
          filters: [{ name: 'Floor Plan', extensions: ['floorplan', 'json'] }],
        });

        if (!selectedPath) return;

        await writeTextFile(selectedPath, jsonString);
        this.activeFilePath = selectedPath;
        this.projectName = selectedPath.split(/[\\/]/).pop() || 'Untitled.floorplan';
        this.isDirty = false;
        await this.updateWindowTitle();
      } else {
        // Browser Mode
        if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
          try {
            const handle = await (window as any).showSaveFilePicker({
              suggestedName: this.projectName || 'Untitled.floorplan',
              types: [
                {
                  description: 'Floor Plan Project',
                  accept: { 'application/json': ['.floorplan', '.json'] },
                },
              ],
            });
            const writable = await handle.createWritable();
            await writable.write(jsonString);
            await writable.close();

            this.browserFileHandle = handle;
            this.projectName = handle.name;
            this.isDirty = false;
            await this.updateWindowTitle();
            return;
          } catch (pickerErr: any) {
            if (pickerErr.name === 'AbortError') return;
            // Fall through to download anchor
          }
        }

        // Anchor download fallback
        const blob = new Blob([jsonString], { type: 'application/json' });
        triggerBrowserDownload(blob, this.projectName || 'Untitled.floorplan');
        this.isDirty = false;
        await this.updateWindowTitle();
      }
    } catch (err: any) {
      alert(`Failed to save project: ${err.message || String(err)}`);
    }
  }

  private async writeToActiveFile(): Promise<void> {
    const state = planStore.getState();
    const unitSystem = uiStore.getState().unitSystem;
    const jsonString = serializeProject(state, {
      title: this.projectName.replace(/\.floorplan$/i, ''),
      unitSystem,
    });

    if (isTauriEnvironment() && this.activeFilePath) {
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      await writeTextFile(this.activeFilePath, jsonString);
      this.isDirty = false;
      await this.updateWindowTitle();
    } else if (this.browserFileHandle) {
      const writable = await this.browserFileHandle.createWritable();
      await writable.write(jsonString);
      await writable.close();
      this.isDirty = false;
      await this.updateWindowTitle();
    } else {
      await this.saveProjectAs();
    }
  }

  /**
   * Export standalone Vector SVG blueprint.
   */
  public async exportSvg(): Promise<void> {
    const state = planStore.getState();
    const svgString = exportToSvg(state);
    const baseName = this.projectName.replace(/\.(floorplan|json)$/i, '');
    const filename = `${baseName}.svg`;

    if (isTauriEnvironment()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');

        const selectedPath = await save({
          defaultPath: filename,
          filters: [{ name: 'SVG Vector Blueprint', extensions: ['svg'] }],
        });

        if (selectedPath) {
          await writeTextFile(selectedPath, svgString);
        }
      } catch (err: any) {
        alert(`Failed to export SVG: ${err.message || String(err)}`);
      }
    } else {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      triggerBrowserDownload(blob, filename);
    }
  }

  /**
   * Export AutoCAD DXF CAD drawing (AutoCAD 2000 format).
   */
  public async exportDxf(): Promise<void> {
    const state = planStore.getState();
    const dxfString = exportToDxf(state);
    const baseName = this.projectName.replace(/\.(floorplan|json)$/i, '');
    const filename = `${baseName}.dxf`;

    if (isTauriEnvironment()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');

        const selectedPath = await save({
          defaultPath: filename,
          filters: [{ name: 'AutoCAD DXF Drawing', extensions: ['dxf'] }],
        });

        if (selectedPath) {
          await writeTextFile(selectedPath, dxfString);
        }
      } catch (err: any) {
        alert(`Failed to export DXF: ${err.message || String(err)}`);
      }
    } else {
      const blob = new Blob([dxfString], { type: 'application/dxf;charset=utf-8' });
      triggerBrowserDownload(blob, filename);
    }
  }

  /**
   * Export high-resolution PNG rasterizer image.
   */
  public async exportPng(): Promise<void> {
    try {
      const state = planStore.getState();
      const blob = await exportToPngBlob(state, { scale: 2.0 });
      const baseName = this.projectName.replace(/\.(floorplan|json)$/i, '');
      const filename = `${baseName}.png`;

      if (isTauriEnvironment()) {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { writeFile } = await import('@tauri-apps/plugin-fs');

        const selectedPath = await save({
          defaultPath: filename,
          filters: [{ name: 'PNG Image', extensions: ['png'] }],
        });

        if (selectedPath) {
          const buffer = await blob.arrayBuffer();
          await writeFile(selectedPath, new Uint8Array(buffer));
        }
      } else {
        triggerBrowserDownload(blob, filename);
      }
    } catch (err: any) {
      alert(`Failed to export PNG: ${err.message || String(err)}`);
    }
  }
}

export const fileManager = new FileManager();
