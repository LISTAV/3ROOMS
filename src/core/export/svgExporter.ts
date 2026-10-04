import type { FloorPlanState, Point2D, Vertex, Wall } from '../types.js';
import { generateWallPolygons, WallPolygon } from '../geometry/miter.js';
import { generateWallPolygonsWithOpenings, computeOpeningGeometry } from '../geometry/openings.js';
import {
  computeDimensionLine,
  formatDimension,
  normalizeTextAngle,
  computeCornerAngleDeg,
} from '../../engine/renderer/DimensionRenderer.js';
import { normal, scale, add, sub, distance } from '../math/vector.js';
import { assetManager } from '../assets/AssetManager.js';
import { formatArea, type UnitSettings } from '../units/unitFormatter.js';
import { uiStore } from '../store/uiStore.js';

export interface SvgExportOptions {
  paddingMm?: number;
  includeDimensions?: boolean;
  includeFurniture?: boolean;
  includeRooms?: boolean;
  includeLines?: boolean;
  includeCornerAngles?: boolean;
  wallFill?: string;
  wallStroke?: string;
  unitSettings?: UnitSettings;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Calculates global bounding box of all vertices, furniture items, and drafting lines.
 */
export function calculateProjectBounds(
  state: FloorPlanState,
  paddingMm: number = 600
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const vertices = Object.values(state.vertices || {});
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }

  const furniture = Object.values(state.furniture || {});
  for (const f of furniture) {
    const hw = f.width / 2;
    const hh = f.height / 2;
    if (f.x - hw < minX) minX = f.x - hw;
    if (f.y - hh < minY) minY = f.y - hh;
    if (f.x + hw > maxX) maxX = f.x + hw;
    if (f.y + hh > maxY) maxY = f.y + hh;
  }

  const images = Object.values(state.images || {});
  for (const img of images) {
    const hw = img.width / 2;
    const hh = img.height / 2;
    if (img.x - hw < minX) minX = img.x - hw;
    if (img.y - hh < minY) minY = img.y - hh;
    if (img.x + hw > maxX) maxX = img.x + hw;
    if (img.y + hh > maxY) maxY = img.y + hh;
  }

  const lines = Object.values(state.lines || {});
  for (const l of lines) {
    if (l.start.x < minX) minX = l.start.x;
    if (l.start.y < minY) minY = l.start.y;
    if (l.start.x > maxX) maxX = l.start.x;
    if (l.start.y > maxY) maxY = l.start.y;
    if (l.end.x < minX) minX = l.end.x;
    if (l.end.y < minY) minY = l.end.y;
    if (l.end.x > maxX) maxX = l.end.x;
    if (l.end.y > maxY) maxY = l.end.y;
  }

  if (minX === Infinity || maxX === -Infinity) {
    // Default 5000 x 4000 mm scene if canvas is empty
    minX = 0;
    minY = 0;
    maxX = 5000;
    maxY = 4000;
  }

  minX -= paddingMm;
  minY -= paddingMm;
  maxX += paddingMm;
  maxY += paddingMm;

  return {
    minX: Math.round(minX),
    minY: Math.round(minY),
    maxX: Math.round(maxX),
    maxY: Math.round(maxY),
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
  };
}

/**
 * Generates an architectural-grade SVG document string from a FloorPlanState.
 */
export function exportToSvg(state: FloorPlanState, options: SvgExportOptions = {}): string {
  const padding = options.paddingMm ?? 600;
  const includeDimensions = options.includeDimensions ?? true;
  const includeFurniture = options.includeFurniture ?? true;
  const includeRooms = options.includeRooms ?? true;
  const includeLines = options.includeLines ?? true;
  const includeCornerAngles = options.includeCornerAngles ?? true;
  const wallFill = options.wallFill ?? '#334155'; // Slate-700
  const wallStroke = options.wallStroke ?? '#0f172a'; // Slate-900
  const unitSettings = options.unitSettings || uiStore.getState().unitSettings;

  const bbox = calculateProjectBounds(state, padding);
  const { minX, minY, width, height } = bbox;

  const svgParts: string[] = [];

  // XML declaration & root SVG tag
  svgParts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="100%" height="100%" style="background:#ffffff; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">`
  );

  // Background rectangle
  svgParts.push(`  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#ffffff" />`);

  svgParts.push(`  <defs>`);
  svgParts.push(`    <style>`);
  svgParts.push(`      .room-label { font-size: 160px; font-weight: 600; fill: #0f172a; text-anchor: middle; dominant-baseline: central; }`);
  svgParts.push(`      .room-area { font-size: 130px; font-weight: 400; fill: #64748b; text-anchor: middle; dominant-baseline: central; }`);
  svgParts.push(`      .dim-text { font-size: 120px; font-weight: 600; fill: #0f172a; text-anchor: middle; dominant-baseline: central; }`);
  svgParts.push(`      .dim-line { stroke: #64748b; stroke-width: 14; }`);
  svgParts.push(`      .dim-witness { stroke: #94a3b8; stroke-width: 12; }`);
  svgParts.push(`      .dim-tick { stroke: #334155; stroke-width: 18; stroke-linecap: round; }`);
  svgParts.push(`      .opening-jamb { stroke: #0f172a; stroke-width: 14; stroke-linecap: butt; }`);
  svgParts.push(`      .door-leaf { fill: #ffffff; stroke: #0f172a; stroke-width: 12; stroke-linejoin: miter; }`);
  svgParts.push(`      .door-arc { stroke: #94a3b8; stroke-width: 10; stroke-dasharray: 40,40; fill: none; }`);
  svgParts.push(`      .window-sill { stroke: #64748b; stroke-width: 12; }`);
  svgParts.push(`      .window-glass { stroke: #38bdf8; stroke-width: 10; }`);
  svgParts.push(`    </style>`);
  svgParts.push(`  </defs>`);

  // ---------------------------------------------------------
  // 0. REFERENCE / UNDERLAY IMAGES (<g id="images">)
  // ---------------------------------------------------------
  if (state.images && Object.keys(state.images).length > 0) {
    svgParts.push(`  <g id="images">`);
    const imgList = Object.values(state.images);
    imgList.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    for (const img of imgList) {
      if (!img.src) continue;
      const opacity = Math.max(0, Math.min(1, img.opacity ?? 1.0));
      const deg = ((img.rotation * 180) / Math.PI).toFixed(2);
      const hw = (img.width / 2).toFixed(1);
      const hh = (img.height / 2).toFixed(1);
      const w = img.width.toFixed(1);
      const h = img.height.toFixed(1);

      svgParts.push(
        `    <g transform="translate(${img.x.toFixed(1)}, ${img.y.toFixed(1)}) rotate(${deg})">`
      );
      svgParts.push(
        `      <image href="${escapeXml(img.src)}" x="-${hw}" y="-${hh}" width="${w}" height="${h}" opacity="${opacity}" preserveAspectRatio="none" />`
      );
      svgParts.push(`    </g>`);
    }
    svgParts.push(`  </g>`);
  }

  // ---------------------------------------------------------
  // 1. ROOMS LAYER (<g id="rooms">)
  // ---------------------------------------------------------
  if (includeRooms && Object.keys(state.rooms || {}).length > 0) {
    svgParts.push(`  <g id="rooms">`);
    for (const room of Object.values(state.rooms)) {
      // Collect polygon points
      let pts: Point2D[] = [];
      if (room.points && room.points.length >= 3) {
        pts = room.points;
      } else if (room.vertexIds && room.vertexIds.length >= 3) {
        pts = room.vertexIds.map((id) => state.vertices[id]).filter(Boolean);
      }

      if (pts.length < 3) continue;

      const pointsAttr = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const fill = room.color || 'rgba(241, 245, 249, 0.75)';

      svgParts.push(`    <polygon points="${pointsAttr}" fill="${fill}" stroke="none" />`);

      // Centroid & Badges
      let centroid = room.centroid;
      if (!centroid) {
        let cx = 0;
        let cy = 0;
        for (const p of pts) {
          cx += p.x;
          cy += p.y;
        }
        centroid = { x: cx / pts.length, y: cy / pts.length };
      }

      const areaText = formatArea(room.areaMm2, unitSettings);
      const roomName = escapeXml(room.name || 'Room');

      svgParts.push(`    <g transform="translate(${centroid.x.toFixed(1)}, ${centroid.y.toFixed(1)})">`);
      svgParts.push(`      <text x="0" y="-80" class="room-label" text-anchor="middle" dominant-baseline="central">${roomName}</text>`);
      svgParts.push(`      <text x="0" y="90" class="room-area" text-anchor="middle" dominant-baseline="central">${escapeXml(areaText)}</text>`);
      svgParts.push(`    </g>`);
    }
    svgParts.push(`  </g>`);
  }

  // ---------------------------------------------------------
  // 2. WALLS LAYER (<g id="walls">)
  // ---------------------------------------------------------
  svgParts.push(`  <g id="walls">`);
  const hasOpenings = Object.keys(state.openings || {}).length > 0;
  const wallPolygons: WallPolygon[] = hasOpenings
    ? generateWallPolygonsWithOpenings(state.vertices, state.walls, state.openings)
    : Object.values(generateWallPolygons(state.vertices, state.walls));

  for (const wp of wallPolygons) {
    if (wp.polygon.length < 3) continue;
    const pointsAttr = wp.polygon.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    svgParts.push(
      `    <polygon points="${pointsAttr}" fill="${wallFill}" stroke="${wallStroke}" stroke-width="10" stroke-linejoin="miter" />`
    );
  }
  svgParts.push(`  </g>`);

  // ---------------------------------------------------------
  // 3. OPENINGS LAYER (<g id="openings">)
  // ---------------------------------------------------------
  if (Object.keys(state.openings || {}).length > 0) {
    svgParts.push(`  <g id="openings">`);
    for (const opening of Object.values(state.openings)) {
      const wall = state.walls[opening.wallId];
      if (!wall) continue;

      const geom = computeOpeningGeometry(opening, wall, state.vertices);
      if (!geom) continue;

      const wallNorm = normal(geom.unitVector);
      const halfThick = geom.wallThickness / 2;

      const sLeft = add(geom.spanStart, scale(wallNorm, halfThick));
      const sRight = sub(geom.spanStart, scale(wallNorm, halfThick));
      const eLeft = add(geom.spanEnd, scale(wallNorm, halfThick));
      const eRight = sub(geom.spanEnd, scale(wallNorm, halfThick));

      // Jamb end caps
      svgParts.push(
        `    <line x1="${sLeft.x.toFixed(1)}" y1="${sLeft.y.toFixed(1)}" x2="${sRight.x.toFixed(1)}" y2="${sRight.y.toFixed(1)}" class="opening-jamb" />`
      );
      svgParts.push(
        `    <line x1="${eLeft.x.toFixed(1)}" y1="${eLeft.y.toFixed(1)}" x2="${eRight.x.toFixed(1)}" y2="${eRight.y.toFixed(1)}" class="opening-jamb" />`
      );

      if (geom.type === 'single_door') {
        const leafThickness = 35;
        const width = geom.width;
        const hinge = geom.flipH ? geom.spanEnd : geom.spanStart;
        const dWall = geom.flipH ? scale(geom.unitVector, -1) : geom.unitVector;
        const dOpen = geom.normalVector;

        const p1 = hinge;
        const p2 = add(hinge, scale(dOpen, width));
        const p3 = add(p2, scale(dWall, leafThickness));
        const p4 = add(hinge, scale(dWall, leafThickness));

        svgParts.push(
          `    <polygon points="${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} ${p3.x.toFixed(1)},${p3.y.toFixed(1)} ${p4.x.toFixed(1)},${p4.y.toFixed(1)}" class="door-leaf" />`
        );

        // 90 deg swing arc
        const alphaClosed = Math.atan2(dWall.y, dWall.x);
        const alphaOpen = Math.atan2(dOpen.y, dOpen.x);
        let delta = (alphaOpen - alphaClosed) % (Math.PI * 2);
        if (delta < 0) delta += Math.PI * 2;
        const sweepFlag = delta > Math.PI ? 0 : 1;

        const arcStart = add(hinge, scale(dWall, width));
        const arcEnd = add(hinge, scale(dOpen, width));

        svgParts.push(
          `    <path d="M ${arcStart.x.toFixed(1)} ${arcStart.y.toFixed(1)} A ${width.toFixed(1)} ${width.toFixed(1)} 0 0 ${sweepFlag} ${arcEnd.x.toFixed(1)} ${arcEnd.y.toFixed(1)}" class="door-arc" />`
        );
      } else if (geom.type === 'double_door') {
        const leafThickness = 35;
        const halfWidth = geom.width / 2;
        const dOpen = geom.normalVector;

        // Leaf 1
        const hinge1 = geom.spanStart;
        const dWall1 = geom.unitVector;
        const p1 = hinge1;
        const p2 = add(hinge1, scale(dOpen, halfWidth));
        const p3 = add(p2, scale(dWall1, leafThickness));
        const p4 = add(hinge1, scale(dWall1, leafThickness));

        svgParts.push(
          `    <polygon points="${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} ${p3.x.toFixed(1)},${p3.y.toFixed(1)} ${p4.x.toFixed(1)},${p4.y.toFixed(1)}" class="door-leaf" />`
        );

        // Leaf 2
        const hinge2 = geom.spanEnd;
        const dWall2 = scale(geom.unitVector, -1);
        const q1 = hinge2;
        const q2 = add(hinge2, scale(dOpen, halfWidth));
        const q3 = add(q2, scale(dWall2, leafThickness));
        const q4 = add(hinge2, scale(dWall2, leafThickness));

        svgParts.push(
          `    <polygon points="${q1.x.toFixed(1)},${q1.y.toFixed(1)} ${q2.x.toFixed(1)},${q2.y.toFixed(1)} ${q3.x.toFixed(1)},${q3.y.toFixed(1)} ${q4.x.toFixed(1)},${q4.y.toFixed(1)}" class="door-leaf" />`
        );

        // Arcs
        const arcStart1 = add(hinge1, scale(dWall1, halfWidth));
        const arcEnd1 = add(hinge1, scale(dOpen, halfWidth));
        svgParts.push(
          `    <path d="M ${arcStart1.x.toFixed(1)} ${arcStart1.y.toFixed(1)} A ${halfWidth.toFixed(1)} ${halfWidth.toFixed(1)} 0 0 1 ${arcEnd1.x.toFixed(1)} ${arcEnd1.y.toFixed(1)}" class="door-arc" />`
        );

        const arcStart2 = add(hinge2, scale(dWall2, halfWidth));
        const arcEnd2 = add(hinge2, scale(dOpen, halfWidth));
        svgParts.push(
          `    <path d="M ${arcStart2.x.toFixed(1)} ${arcStart2.y.toFixed(1)} A ${halfWidth.toFixed(1)} ${halfWidth.toFixed(1)} 0 0 0 ${arcEnd2.x.toFixed(1)} ${arcEnd2.y.toFixed(1)}" class="door-arc" />`
        );
      } else if (
        geom.type === 'window' ||
        geom.type === 'sliding_window' ||
        geom.type === 'fixed_window'
      ) {
        // Outer sills
        svgParts.push(
          `    <line x1="${sLeft.x.toFixed(1)}" y1="${sLeft.y.toFixed(1)}" x2="${eLeft.x.toFixed(1)}" y2="${eLeft.y.toFixed(1)}" class="window-sill" />`
        );
        svgParts.push(
          `    <line x1="${sRight.x.toFixed(1)}" y1="${sRight.y.toFixed(1)}" x2="${eRight.x.toFixed(1)}" y2="${eRight.y.toFixed(1)}" class="window-sill" />`
        );

        // Glass panes
        const glassOffset = Math.min(15, halfThick * 0.3);
        const g1Start = add(geom.spanStart, scale(wallNorm, glassOffset));
        const g1End = add(geom.spanEnd, scale(wallNorm, glassOffset));
        const g2Start = sub(geom.spanStart, scale(wallNorm, glassOffset));
        const g2End = sub(geom.spanEnd, scale(wallNorm, glassOffset));

        svgParts.push(
          `    <line x1="${g1Start.x.toFixed(1)}" y1="${g1Start.y.toFixed(1)}" x2="${g1End.x.toFixed(1)}" y2="${g1End.y.toFixed(1)}" class="window-glass" />`
        );
        svgParts.push(
          `    <line x1="${g2Start.x.toFixed(1)}" y1="${g2Start.y.toFixed(1)}" x2="${g2End.x.toFixed(1)}" y2="${g2End.y.toFixed(1)}" class="window-glass" />`
        );
      }
    }
    svgParts.push(`  </g>`);
  }

  // ---------------------------------------------------------
  // 4. FURNITURE LAYER (<g id="furniture">)
  // ---------------------------------------------------------
  if (includeFurniture && Object.keys(state.furniture || {}).length > 0) {
    svgParts.push(`  <g id="furniture">`);
    const furnitureList = Object.values(state.furniture).sort(
      (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
    );

    for (const inst of furnitureList) {
      const def = assetManager.getDefinition(inst.defId);
      const rotDeg = ((inst.rotation * 180) / Math.PI).toFixed(2);
      const halfW = inst.width / 2;
      const halfH = inst.height / 2;

      svgParts.push(
        `    <g transform="translate(${inst.x.toFixed(1)}, ${inst.y.toFixed(1)}) rotate(${rotDeg})">`
      );

      if (def?.svgContent) {
        // Embed nested SVG maintaining exact dimensions
        // Strip xml declaration if present
        let cleanSvg = def.svgContent.replace(/<\?xml.*?\?>/gi, '').trim();
        // Replace outer <svg ...> tag with custom width/height/x/y
        cleanSvg = cleanSvg.replace(
          /<svg\b([^>]*)>/i,
          `<svg x="${(-halfW).toFixed(1)}" y="${(-halfH).toFixed(1)}" width="${inst.width.toFixed(1)}" height="${inst.height.toFixed(1)}" $1>`
        );
        svgParts.push(`      ${cleanSvg}`);
      } else {
        // Fallback rectangle
        svgParts.push(
          `      <rect x="${(-halfW).toFixed(1)}" y="${(-halfH).toFixed(1)}" width="${inst.width.toFixed(1)}" height="${inst.height.toFixed(1)}" rx="20" ry="20" fill="#f8fafc" stroke="#475569" stroke-width="12" />`
        );
      }

      svgParts.push(`    </g>`);
    }
    svgParts.push(`  </g>`);
  }

  // ---------------------------------------------------------
  // 4.5. PARAMETRIC DRAFTING LINES (<g id="lines">)
  // ---------------------------------------------------------
  if (includeLines && state.lines && Object.keys(state.lines).length > 0) {
    svgParts.push(`  <g id="lines">`);
    for (const line of Object.values(state.lines)) {
      const len = Math.sqrt(
        (line.end.x - line.start.x) ** 2 + (line.end.y - line.start.y) ** 2
      );
      if (len < 1e-3) continue;

      const thickness = Math.max(14, line.thickness || 30);
      let dashAttr = '';
      if (line.style === 'dashed') {
        dashAttr = ` stroke-dasharray="${thickness * 3},${thickness * 1.5}"`;
      } else if (line.style === 'dotted') {
        dashAttr = ` stroke-dasharray="${thickness},${thickness}"`;
      }

      svgParts.push(
        `    <line x1="${line.start.x.toFixed(1)}" y1="${line.start.y.toFixed(1)}" x2="${line.end.x.toFixed(1)}" y2="${line.end.y.toFixed(1)}" stroke="${escapeXml(line.color || '#334155')}" stroke-width="${thickness}" stroke-linecap="round"${dashAttr} />`
      );

      // Arrowheads
      const dirX = (line.end.x - line.start.x) / len;
      const dirY = (line.end.y - line.start.y) / len;
      const arrowL = thickness * 3;
      const arrowW = thickness * 2;

      const renderSvgArrowhead = (tip: Point2D, dir: Point2D) => {
        const perpX = -dir.y;
        const perpY = dir.x;
        const baseCenterX = tip.x - dir.x * arrowL;
        const baseCenterY = tip.y - dir.y * arrowL;
        const p1X = baseCenterX + perpX * (arrowW / 2);
        const p1Y = baseCenterY + perpY * (arrowW / 2);
        const p2X = baseCenterX - perpX * (arrowW / 2);
        const p2Y = baseCenterY - perpY * (arrowW / 2);
        return `    <polygon points="${tip.x.toFixed(1)},${tip.y.toFixed(1)} ${p1X.toFixed(1)},${p1Y.toFixed(1)} ${p2X.toFixed(1)},${p2Y.toFixed(1)}" fill="${escapeXml(line.color || '#334155')}" class="line-arrowhead" />`;
      };

      if (line.arrows === 'start' || line.arrows === 'both') {
        svgParts.push(renderSvgArrowhead(line.start, { x: -dirX, y: -dirY }));
      }
      if (line.arrows === 'end' || line.arrows === 'both') {
        svgParts.push(renderSvgArrowhead(line.end, { x: dirX, y: dirY }));
      }

      // Measurement tag
      if (line.showMeasurement !== false) {
        const midX = (line.start.x + line.end.x) / 2;
        const midY = (line.start.y + line.end.y) / 2;
        const normX = -dirY;
        const normY = dirX;
        const offsetMm = 180;
        const tagX = midX + normX * offsetMm;
        const tagY = midY + normY * offsetMm;

        let angle = Math.atan2(line.end.y - line.start.y, line.end.x - line.start.x);
        angle = normalizeTextAngle(angle).angle;
        const deg = ((angle * 180) / Math.PI).toFixed(1);

        const tagLabel = formatDimension(len, unitSettings);
        const maskW = Math.max(300, tagLabel.length * 85);
        const maskH = 150;

        svgParts.push(`    <g transform="translate(${tagX.toFixed(1)}, ${tagY.toFixed(1)}) rotate(${deg})" class="line-measurement">`);
        svgParts.push(`      <rect x="${(-maskW / 2).toFixed(1)}" y="${(-maskH / 2).toFixed(1)}" width="${maskW}" height="${maskH}" rx="24" fill="#ffffff" stroke="${escapeXml(line.color || '#334155')}" stroke-width="12" opacity="0.96" />`);
        svgParts.push(`      <text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="110" font-weight="600" fill="${escapeXml(line.color || '#0f172a')}">${escapeXml(tagLabel)}</text>`);
        svgParts.push(`    </g>`);
      }
    }
    svgParts.push(`  </g>`);
  }

  // ---------------------------------------------------------
  // 5. DIMENSIONS & CORNER ANGLES LAYER (<g id="dimensions">)
  // ---------------------------------------------------------
  if (includeDimensions && Object.keys(state.walls || {}).length > 0) {
    svgParts.push(`  <g id="dimensions">`);
    for (const wall of Object.values(state.walls)) {
      const startV = state.vertices[wall.startId];
      const endV = state.vertices[wall.endId];
      if (!startV || !endV) continue;

      const geom = computeDimensionLine(startV, endV, 350);
      if (geom.length < 1e-3) continue;

      const { dimStart, dimEnd } = geom;

      // 1. Witness extension lines
      svgParts.push(
        `    <line x1="${startV.x.toFixed(1)}" y1="${startV.y.toFixed(1)}" x2="${dimStart.x.toFixed(1)}" y2="${dimStart.y.toFixed(1)}" class="dim-witness" />`
      );
      svgParts.push(
        `    <line x1="${endV.x.toFixed(1)}" y1="${endV.y.toFixed(1)}" x2="${dimEnd.x.toFixed(1)}" y2="${dimEnd.y.toFixed(1)}" class="dim-witness" />`
      );

      // 2. Baseline
      svgParts.push(
        `    <line x1="${dimStart.x.toFixed(1)}" y1="${dimStart.y.toFixed(1)}" x2="${dimEnd.x.toFixed(1)}" y2="${dimEnd.y.toFixed(1)}" class="dim-line" />`
      );

      // 3. 45-degree ticks (length 100mm in world space)
      const dir: Point2D = { x: endV.x - startV.x, y: endV.y - startV.y };
      const baselineAngle = Math.atan2(dir.y, dir.x);
      const tickAngle = baselineAngle + Math.PI / 4;
      const tickHalfLen = 45;
      const tickDx = tickHalfLen * Math.cos(tickAngle);
      const tickDy = tickHalfLen * Math.sin(tickAngle);

      svgParts.push(
        `    <line x1="${(dimStart.x - tickDx).toFixed(1)}" y1="${(dimStart.y - tickDy).toFixed(1)}" x2="${(dimStart.x + tickDx).toFixed(1)}" y2="${(dimStart.y + tickDy).toFixed(1)}" class="dim-tick" />`
      );
      svgParts.push(
        `    <line x1="${(dimEnd.x - tickDx).toFixed(1)}" y1="${(dimEnd.y - tickDy).toFixed(1)}" x2="${(dimEnd.x + tickDx).toFixed(1)}" y2="${(dimEnd.y + tickDy).toFixed(1)}" class="dim-tick" />`
      );

      // 4. Upright centered text label
      const mid: Point2D = {
        x: (dimStart.x + dimEnd.x) / 2,
        y: (dimStart.y + dimEnd.y) / 2,
      };
      const label = formatDimension(geom.length, unitSettings);
      const { angle: textAngle } = normalizeTextAngle(baselineAngle);
      const textDeg = ((textAngle * 180) / Math.PI).toFixed(1);

      // White background mask behind dimension text
      const maskWidth = Math.max(300, label.length * 85);
      const maskHeight = 160;

      svgParts.push(`    <g transform="translate(${mid.x.toFixed(1)}, ${mid.y.toFixed(1)}) rotate(${textDeg})">`);
      svgParts.push(
        `      <rect x="${(-maskWidth / 2).toFixed(1)}" y="${(-maskHeight / 2).toFixed(1)}" width="${maskWidth}" height="${maskHeight}" rx="20" fill="#ffffff" stroke="none" />`
      );
      svgParts.push(`      <text x="0" y="0" text-anchor="middle" dominant-baseline="central" class="dim-text" font-size="120" font-weight="600" fill="#0f172a">${escapeXml(label)}</text>`);
      svgParts.push(`    </g>`);
    }

    // 5. Corner Angle Indicators in SVG
    if (includeCornerAngles) {
      svgParts.push(`    <g id="corner-angles">`);
      const vertexWallMap: Record<string, Wall[]> = {};
      for (const wall of Object.values(state.walls)) {
        if (!vertexWallMap[wall.startId]) vertexWallMap[wall.startId] = [];
        if (!vertexWallMap[wall.endId]) vertexWallMap[wall.endId] = [];
        vertexWallMap[wall.startId].push(wall);
        vertexWallMap[wall.endId].push(wall);
      }

      for (const [vId, connected] of Object.entries(vertexWallMap)) {
        if (connected.length === 2) {
          const cornerV = state.vertices[vId];
          if (!cornerV) continue;

          const w1 = connected[0];
          const w2 = connected[1];
          const p1Id = w1.startId === vId ? w1.endId : w1.startId;
          const p2Id = w2.startId === vId ? w2.endId : w2.startId;
          const p1 = state.vertices[p1Id];
          const p2 = state.vertices[p2Id];
          if (!p1 || !p2) continue;

          const d1 = distance(p1, cornerV);
          const d2 = distance(p2, cornerV);
          if (d1 < 10 || d2 < 10) continue;

          const u1 = { x: (p1.x - cornerV.x) / d1, y: (p1.y - cornerV.y) / d1 };
          const u2 = { x: (p2.x - cornerV.x) / d2, y: (p2.y - cornerV.y) / d2 };

          const { angleDeg, isRightAngle, isStraight, is45Multiple } = computeCornerAngleDeg(p1, cornerV, p2);
          if (isStraight) continue;

          const maxArm = Math.min(d1, d2) * 0.35;
          const size = Math.max(70, Math.min(160, maxArm));

          if (isRightAngle) {
            // Perpendicular CAD square ∟
            const c1 = { x: cornerV.x + u1.x * size, y: cornerV.y + u1.y * size };
            const c2 = { x: cornerV.x + (u1.x + u2.x) * size, y: cornerV.y + (u1.y + u2.y) * size };
            const c3 = { x: cornerV.x + u2.x * size, y: cornerV.y + u2.y * size };

            svgParts.push(`    <polygon points="${cornerV.x.toFixed(1)},${cornerV.y.toFixed(1)} ${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${c3.x.toFixed(1)},${c3.y.toFixed(1)}" fill="rgba(16, 185, 129, 0.2)" stroke="#10b981" stroke-width="12" stroke-linejoin="miter" />`);

            // Right-angle badge
            const bisectorLen = Math.hypot(u1.x + u2.x, u1.y + u2.y);
            const bisector = bisectorLen > 1e-4
              ? { x: (u1.x + u2.x) / bisectorLen, y: (u1.y + u2.y) / bisectorLen }
              : { x: -u1.y, y: u1.x };
            const bx = cornerV.x + bisector.x * (size * 1.5 + 70);
            const by = cornerV.y + bisector.y * (size * 1.5 + 70);
            const badgeW = 280;
            const badgeH = 130;

            svgParts.push(`    <g transform="translate(${bx.toFixed(1)}, ${by.toFixed(1)})">`);
            svgParts.push(`      <rect x="${(-badgeW / 2).toFixed(1)}" y="${(-badgeH / 2).toFixed(1)}" width="${badgeW}" height="${badgeH}" rx="20" fill="rgba(15, 23, 42, 0.94)" stroke="#10b981" stroke-width="10" />`);
            svgParts.push(`      <text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="95" font-weight="700" fill="#10b981">90.0°</text>`);
            svgParts.push(`    </g>`);
          } else {
            // Angle arc
            const a1 = Math.atan2(u1.y, u1.x);
            const a2 = Math.atan2(u2.y, u2.x);
            let sweep = a2 - a1;
            while (sweep > Math.PI) sweep -= 2 * Math.PI;
            while (sweep < -Math.PI) sweep += 2 * Math.PI;
            const sweepFlag = sweep > 0 ? 1 : 0;

            const arcStartX = cornerV.x + Math.cos(a1) * size;
            const arcStartY = cornerV.y + Math.sin(a1) * size;
            const arcEndX = cornerV.x + Math.cos(a2) * size;
            const arcEndY = cornerV.y + Math.sin(a2) * size;

            const strokeColor = is45Multiple ? '#38bdf8' : '#94a3b8';
            const fillColor = is45Multiple ? 'rgba(56, 189, 248, 0.15)' : 'rgba(148, 163, 184, 0.12)';

            svgParts.push(`    <path d="M ${cornerV.x.toFixed(1)} ${cornerV.y.toFixed(1)} L ${arcStartX.toFixed(1)} ${arcStartY.toFixed(1)} A ${size.toFixed(1)} ${size.toFixed(1)} 0 0 ${sweepFlag} ${arcEndX.toFixed(1)} ${arcEndY.toFixed(1)} Z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="12" />`);

            // Badge
            const midAngle = a1 + sweep / 2;
            const bx = cornerV.x + Math.cos(midAngle) * (size + 110);
            const by = cornerV.y + Math.sin(midAngle) * (size + 110);
            const degText = `${angleDeg.toFixed(Math.abs(angleDeg - Math.round(angleDeg)) < 0.05 ? 0 : 1)}°`;
            const badgeW = 260;
            const badgeH = 130;

            svgParts.push(`    <g transform="translate(${bx.toFixed(1)}, ${by.toFixed(1)})">`);
            svgParts.push(`      <rect x="${(-badgeW / 2).toFixed(1)}" y="${(-badgeH / 2).toFixed(1)}" width="${badgeW}" height="${badgeH}" rx="20" fill="rgba(15, 23, 42, 0.94)" stroke="${strokeColor}" stroke-width="10" />`);
            svgParts.push(`      <text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="95" font-weight="700" fill="${strokeColor}">${degText}</text>`);
            svgParts.push(`    </g>`);
          }
        }
      }
      svgParts.push(`    </g>`);
    }

    svgParts.push(`  </g>`);
  }

  svgParts.push(`</svg>`);
  return svgParts.join('\n');
}
