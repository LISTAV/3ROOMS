import type { FurnitureInstance } from '../../core/types.js';
import { AssetManager, assetManager } from '../../core/assets/AssetManager.js';

export interface FurnitureLayerOptions {
  assetManager?: AssetManager;
}

/**
 * Immediate-mode 2D layer rendering placed furniture instances and architectural symbols
 * on the floor plan canvas between the room floor fills and solid wall polygons.
 */
export class FurnitureLayer {
  public assetManager: AssetManager;

  constructor(options: FurnitureLayerOptions = {}) {
    this.assetManager = options.assetManager ?? assetManager;
  }

  /**
   * Renders all furniture instances in world coordinate space according to z-index.
   */
  public render(
    ctx: CanvasRenderingContext2D,
    furniture: Record<string, FurnitureInstance>,
    zoom: number,
    _selectedFurnitureId?: string | null
  ): void {
    const instances = Object.values(furniture);
    if (instances.length === 0) return;

    // Stacking order: lower zIndex rendered first
    instances.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

    for (const inst of instances) {
      ctx.save();

      // 1. Translate to item world center
      ctx.translate(inst.x, inst.y);

      // 2. Apply item rotation
      ctx.rotate(inst.rotation);

      // 3. Draw cached SVG image or fallback placeholder
      const img = this.assetManager.getImage(inst.defId);
      const isLoaded = this.assetManager.isImageLoaded(inst.defId);

      if (img && isLoaded) {
        ctx.drawImage(img, -inst.width / 2, -inst.height / 2, inst.width, inst.height);
      } else {
        const def = this.assetManager.getDefinition(inst.defId);
        this.assetManager.renderFallback(ctx, inst, def, zoom);
      }

      ctx.restore();
    }
  }
}
