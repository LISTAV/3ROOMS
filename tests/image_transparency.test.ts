import { describe, it, expect, beforeEach } from 'vitest';
import { createPlanStore, planStore } from '../src/core/store/planStore.js';
import { isPointInImageBox, isPointInImageRotationHandle, getImageCornerHandleHit } from '../src/engine/layers/ImageLayer.js';
import { SelectTool } from '../src/engine/tools/SelectTool.js';
import { serializeProject, deserializeProject } from '../src/core/io/schema.js';
import { exportToSvg } from '../src/core/export/svgExporter.js';

describe('Image with Transparency & Trace Mode', () => {
  let store: ReturnType<typeof createPlanStore>;

  beforeEach(() => {
    store = createPlanStore();
    planStore.getState().clear();
  });

  it('adds an image with default transparency and properties', () => {
    const img = store.getState().addImage({
      src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      name: 'Site Blueprint',
      x: 1000,
      y: 2000,
      width: 4000,
      height: 3000,
      rotation: 0,
      opacity: 0.6,
      locked: false,
      aspectRatio: 4 / 3,
    });

    expect(img.id).toBeDefined();
    expect(img.opacity).toBe(0.6);
    expect(img.locked).toBe(false);
    expect(img.width).toBe(4000);
    expect(img.height).toBe(3000);

    const state = store.getState();
    expect(state.images[img.id]).toBeDefined();
    expect(state.selectedImageId).toBe(img.id);
  });

  it('updates image opacity / transparency slider value correctly', () => {
    const img = store.getState().addImage({
      src: 'data:image/png;base64,sample',
      name: 'Plan',
      x: 0,
      y: 0,
      width: 2000,
      height: 2000,
      opacity: 1.0,
    });

    store.getState().setImageOpacity(img.id, 0.35);
    expect(store.getState().images[img.id].opacity).toBe(0.35);

    // Clamping checks
    store.getState().setImageOpacity(img.id, 1.5);
    expect(store.getState().images[img.id].opacity).toBe(1.0);

    store.getState().setImageOpacity(img.id, -0.2);
    expect(store.getState().images[img.id].opacity).toBe(0.0);
  });

  it('toggles lock state for trace mode', () => {
    const img = store.getState().addImage({
      src: 'data:image/png;base64,sample',
      name: 'Trace Underlay',
      x: 0,
      y: 0,
      width: 3000,
      height: 2000,
      locked: false,
    });

    expect(store.getState().images[img.id].locked).toBe(false);

    store.getState().toggleImageLock(img.id);
    expect(store.getState().images[img.id].locked).toBe(true);

    store.getState().toggleImageLock(img.id);
    expect(store.getState().images[img.id].locked).toBe(false);
  });

  it('hit-tests image body, corners, and rotation handle correctly', () => {
    const img = store.getState().addImage({
      src: 'data:image/png;base64,sample',
      name: 'Hit Test Image',
      x: 0,
      y: 0,
      width: 2000,
      height: 1000,
      rotation: 0,
    });

    // Center point inside box
    expect(isPointInImageBox({ x: 0, y: 0 }, img)).toBe(true);
    // Point outside box
    expect(isPointInImageBox({ x: 1500, y: 0 }, img)).toBe(false);

    // Corner handle hit test: Top-Left is (-1000, -500)
    expect(getImageCornerHandleHit({ x: -1000, y: -500 }, img, 40)).toBe(0);
    // Top-Right is (1000, -500)
    expect(getImageCornerHandleHit({ x: 1000, y: -500 }, img, 40)).toBe(1);
    // Bottom-Right is (1000, 500)
    expect(getImageCornerHandleHit({ x: 1000, y: 500 }, img, 40)).toBe(2);
    // Bottom-Left is (-1000, 500)
    expect(getImageCornerHandleHit({ x: -1000, y: 500 }, img, 40)).toBe(3);

    // Rotation handle is at top (0, -halfH - 300) = (0, -800)
    expect(isPointInImageRotationHandle({ x: 0, y: -800 }, img)).toBe(true);
    expect(isPointInImageRotationHandle({ x: 500, y: 0 }, img)).toBe(false);
  });

  it('select tool ignores locked images so clicks pass through to trace walls', () => {
    const selectTool = new SelectTool();
    const img = planStore.getState().addImage({
      src: 'data:image/png;base64,sample',
      name: 'Locked Underlay',
      x: 0,
      y: 0,
      width: 2000,
      height: 2000,
      locked: true, // PINNED / TRACE MODE
    });

    // When locked, hit-test over the image returns null so wall drawing is unobstructed
    const hit = selectTool.hitTest({ x: 0, y: 0 }, 1.0);
    expect(hit).toBeNull();

    // Now unlock the image
    planStore.getState().toggleImageLock(img.id);
    const hitUnlocked = selectTool.hitTest({ x: 0, y: 0 }, 1.0);
    expect(hitUnlocked).not.toBeNull();
    expect(hitUnlocked?.type).toBe('image');
    expect(hitUnlocked?.id).toBe(img.id);
  });

  it('supports undo and redo for image operations', () => {
    const img = store.getState().addImage({
      src: 'data:image/png;base64,sample',
      name: 'Undoable Image',
      x: 100,
      y: 100,
      width: 1000,
      height: 1000,
      opacity: 0.8,
    });

    expect(store.getState().images[img.id]).toBeDefined();

    // Undo add
    store.getState().undo();
    expect(store.getState().images[img.id]).toBeUndefined();

    // Redo add
    store.getState().redo();
    expect(store.getState().images[img.id]).toBeDefined();

    // Change opacity and undo
    store.getState().setImageOpacity(img.id, 0.2);
    expect(store.getState().images[img.id].opacity).toBe(0.2);

    store.getState().undo();
    expect(store.getState().images[img.id].opacity).toBe(0.8);
  });

  it('serializes and deserializes floor plan with image transparency', () => {
    store.getState().addImage({
      src: 'data:image/png;base64,sample123',
      name: 'Ground Floor Blueprint',
      x: 500,
      y: 750,
      width: 5000,
      height: 3500,
      rotation: 0.15,
      opacity: 0.45,
      locked: true,
      layerId: 'layer-rooms',
    });

    const state = store.getState();
    const json = serializeProject(state, { title: 'Blueprint Project' });
    expect(json).toContain('"opacity": 0.45');
    expect(json).toContain('Ground Floor Blueprint');

    const deserialized = deserializeProject(json);
    expect(deserialized.images).toBeDefined();
    const imgs = Object.values(deserialized.images!);
    expect(imgs.length).toBe(1);
    expect(imgs[0].opacity).toBe(0.45);
    expect(imgs[0].locked).toBe(true);
    expect(imgs[0].name).toBe('Ground Floor Blueprint');
  });

  it('exports images to SVG with opacity preserved', () => {
    store.getState().addImage({
      src: 'data:image/png;base64,sample',
      name: 'SVG Underlay',
      x: 100,
      y: 200,
      width: 2000,
      height: 1500,
      opacity: 0.5,
      rotation: 0,
    });

    const svg = exportToSvg(store.getState());
    expect(svg).toContain('<g id="images">');
    expect(svg).toContain('opacity="0.5"');
    expect(svg).toContain('<image');
  });
});
