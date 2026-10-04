import { planStore } from '../store/planStore.js';
import { uiStore } from '../store/uiStore.js';
import type { ImageInstance, Point2D } from '../types.js';

export interface ImageImportOptions {
  worldPosition?: Point2D;
  targetWidthMm?: number;
  initialOpacity?: number;
}

/**
 * Loads an image file (PNG, JPG, SVG, WebP, etc.) and instantiates it on the CAD plan
 * with transparency and transform gizmos ready for tracing blueprints/site plans.
 */
export async function importImageFromFile(
  file: File,
  options?: ImageImportOptions
): Promise<ImageInstance> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error(`Selected file is not an image: ${file.type}`));
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error(`Failed to read image file: ${file.name}`));
    };

    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (!src) {
        reject(new Error('Failed to obtain image data URL'));
        return;
      }

      const imgObj = new Image();

      imgObj.onerror = () => {
        reject(new Error(`Could not decode image: ${file.name}`));
      };

      imgObj.onload = () => {
        const naturalW = imgObj.naturalWidth || 800;
        const naturalH = imgObj.naturalHeight || 600;
        const aspect = naturalW / naturalH;

        // Default world width: 4000mm or proportional to current drawing bounds
        let widthMm = options?.targetWidthMm ?? 4000;
        const plan = planStore.getState();
        const walls = Object.values(plan.walls);
        const verts = plan.vertices;

        let centerX = 0;
        let centerY = 0;

        if (walls.length > 0) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const w of walls) {
            const v1 = verts[w.startId];
            const v2 = verts[w.endId];
            if (v1) {
              minX = Math.min(minX, v1.x);
              maxX = Math.max(maxX, v1.x);
              minY = Math.min(minY, v1.y);
              maxY = Math.max(maxY, v1.y);
            }
            if (v2) {
              minX = Math.min(minX, v2.x);
              maxX = Math.max(maxX, v2.x);
              minY = Math.min(minY, v2.y);
              maxY = Math.max(maxY, v2.y);
            }
          }
          if (minX !== Infinity) {
            centerX = (minX + maxX) / 2;
            centerY = (minY + maxY) / 2;
            const spanX = maxX - minX;
            if (spanX > 500 && !options?.targetWidthMm) {
              widthMm = Math.max(2000, spanX * 0.8);
            }
          }
        }

        const heightMm = widthMm / aspect;

        const posX = options?.worldPosition ? options.worldPosition.x : centerX;
        const posY = options?.worldPosition ? options.worldPosition.y : centerY;

        // Underlay reference images sit on the bottom layer
        const layerId = plan.layerOrder?.[0] || 'layer-rooms';

        const cleanName = file.name.replace(/\.[^/.]+$/, '');

        const newImg = planStore.getState().addImage({
          src,
          name: cleanName || 'Underlay Image',
          x: posX,
          y: posY,
          width: widthMm,
          height: heightMm,
          rotation: 0,
          opacity: options?.initialOpacity ?? 0.6, // Default 60% opacity for instant blueprint tracing!
          locked: false,
          layerId,
          aspectRatio: aspect,
        });

        // Select the newly added image so the user immediately sees the gizmo and properties
        planStore.getState().selectImage(newImg.id);
        uiStore.getState().setActiveTool('select');
        uiStore.getState().setInspectorVisible(true);

        resolve(newImg);
      };

      imgObj.src = src;
    };

    reader.readAsDataURL(file);
  });
}
