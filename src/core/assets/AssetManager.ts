import type { FurnitureDefinition, FurnitureInstance } from '../types.js';

/**
 * Built-in default catalog containing standard 2D vector CAD architectural symbols.
 */
export const DEFAULT_FURNITURE_CATALOG: FurnitureDefinition[] = [
  // ----------------------------------------------------
  // LIVING ROOM
  // ----------------------------------------------------
  {
    id: 'sofa_3seater',
    name: '3-Seater Sofa',
    category: 'living',
    defaultWidthMm: 2200,
    defaultHeightMm: 900,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2200 900" width="2200" height="900">
  <rect x="10" y="10" width="2180" height="880" rx="30" ry="30" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <rect x="10" y="10" width="2180" height="240" rx="20" ry="20" fill="#e2e8f0" stroke="#334155" stroke-width="14" />
  <rect x="10" y="10" width="200" height="880" rx="25" ry="25" fill="#e2e8f0" stroke="#334155" stroke-width="14" />
  <rect x="1990" y="10" width="200" height="880" rx="25" ry="25" fill="#e2e8f0" stroke="#334155" stroke-width="14" />
  <rect x="230" y="270" width="560" height="600" rx="20" ry="20" fill="#f8fafc" stroke="#475569" stroke-width="12" />
  <rect x="820" y="270" width="560" height="600" rx="20" ry="20" fill="#f8fafc" stroke="#475569" stroke-width="12" />
  <rect x="1410" y="270" width="560" height="600" rx="20" ry="20" fill="#f8fafc" stroke="#475569" stroke-width="12" />
</svg>`,
  },
  {
    id: 'armchair',
    name: 'Armchair',
    category: 'living',
    defaultWidthMm: 900,
    defaultHeightMm: 900,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900" width="900" height="900">
  <rect x="10" y="10" width="880" height="880" rx="25" ry="25" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <rect x="10" y="10" width="880" height="220" rx="15" ry="15" fill="#e2e8f0" stroke="#334155" stroke-width="14" />
  <rect x="10" y="10" width="160" height="880" rx="20" ry="20" fill="#e2e8f0" stroke="#334155" stroke-width="14" />
  <rect x="730" y="10" width="160" height="880" rx="20" ry="20" fill="#e2e8f0" stroke="#334155" stroke-width="14" />
  <rect x="190" y="250" width="520" height="610" rx="15" ry="15" fill="#f8fafc" stroke="#64748b" stroke-width="12" />
</svg>`,
  },
  {
    id: 'coffee_table',
    name: 'Coffee Table',
    category: 'living',
    defaultWidthMm: 1100,
    defaultHeightMm: 600,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 600" width="1100" height="600">
  <rect x="10" y="10" width="1080" height="580" rx="20" ry="20" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <rect x="40" y="40" width="1020" height="520" rx="12" ry="12" fill="#f1f5f9" stroke="#94a3b8" stroke-width="8" stroke-dasharray="16,10" />
</svg>`,
  },
  {
    id: 'tv_unit',
    name: 'TV Unit',
    category: 'living',
    defaultWidthMm: 1800,
    defaultHeightMm: 450,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1800 450" width="1800" height="450">
  <rect x="10" y="10" width="1780" height="430" rx="10" ry="10" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <rect x="250" y="150" width="1300" height="150" rx="8" ry="8" fill="#334155" stroke="#1e293b" stroke-width="8" />
  <rect x="700" y="320" width="400" height="60" rx="6" ry="6" fill="#cbd5e1" stroke="#64748b" stroke-width="6" />
</svg>`,
  },

  // ----------------------------------------------------
  // BEDROOM
  // ----------------------------------------------------
  {
    id: 'bed_queen',
    name: 'Queen Bed',
    category: 'bedroom',
    defaultWidthMm: 1600,
    defaultHeightMm: 2000,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 2000" width="1600" height="2000">
  <rect x="10" y="10" width="1580" height="1980" rx="30" ry="30" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <rect x="10" y="10" width="1580" height="160" rx="10" ry="10" fill="#cbd5e1" stroke="#334155" stroke-width="16" />
  <rect x="120" y="220" width="600" height="400" rx="25" ry="25" fill="#ffffff" stroke="#64748b" stroke-width="12" />
  <rect x="880" y="220" width="600" height="400" rx="25" ry="25" fill="#ffffff" stroke="#64748b" stroke-width="12" />
  <path d="M 30,750 Q 800,820 1570,750" fill="none" stroke="#64748b" stroke-width="12" stroke-dasharray="24,12" />
  <rect x="30" y="780" width="1540" height="1180" rx="20" ry="20" fill="#f1f5f9" stroke="#94a3b8" stroke-width="10" />
</svg>`,
  },
  {
    id: 'bed_single',
    name: 'Single Bed',
    category: 'bedroom',
    defaultWidthMm: 1000,
    defaultHeightMm: 2000,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 2000" width="1000" height="2000">
  <rect x="10" y="10" width="980" height="1980" rx="25" ry="25" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <rect x="10" y="10" width="980" height="160" rx="10" ry="10" fill="#cbd5e1" stroke="#334155" stroke-width="16" />
  <rect x="150" y="220" width="700" height="400" rx="25" ry="25" fill="#ffffff" stroke="#64748b" stroke-width="12" />
  <path d="M 20,750 Q 500,820 980,750" fill="none" stroke="#64748b" stroke-width="12" stroke-dasharray="24,12" />
  <rect x="20" y="780" width="960" height="1180" rx="18" ry="18" fill="#f1f5f9" stroke="#94a3b8" stroke-width="10" />
</svg>`,
  },
  {
    id: 'wardrobe',
    name: 'Wardrobe',
    category: 'bedroom',
    defaultWidthMm: 1800,
    defaultHeightMm: 600,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1800 600" width="1800" height="600">
  <rect x="10" y="10" width="1780" height="580" rx="12" ry="12" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <line x1="600" y1="10" x2="600" y2="590" stroke="#64748b" stroke-width="12" />
  <line x1="1200" y1="10" x2="1200" y2="590" stroke="#64748b" stroke-width="12" />
  <line x1="10" y1="10" x2="1790" y2="590" stroke="#cbd5e1" stroke-width="8" stroke-dasharray="20,15" />
  <line x1="10" y1="590" x2="1790" y2="10" stroke="#cbd5e1" stroke-width="8" stroke-dasharray="20,15" />
</svg>`,
  },
  {
    id: 'nightstand',
    name: 'Nightstand',
    category: 'bedroom',
    defaultWidthMm: 500,
    defaultHeightMm: 450,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 450" width="500" height="450">
  <rect x="10" y="10" width="480" height="430" rx="10" ry="10" fill="#f8fafc" stroke="#334155" stroke-width="14" />
  <circle cx="250" cy="225" r="50" fill="#e2e8f0" stroke="#64748b" stroke-width="8" />
</svg>`,
  },

  // ----------------------------------------------------
  // KITCHEN
  // ----------------------------------------------------
  {
    id: 'counter_straight',
    name: 'Kitchen Counter',
    category: 'kitchen',
    defaultWidthMm: 1200,
    defaultHeightMm: 600,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" width="1200" height="600">
  <rect x="10" y="10" width="1180" height="580" rx="10" ry="10" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <line x1="10" y1="80" x2="1190" y2="80" stroke="#94a3b8" stroke-width="8" />
</svg>`,
  },
  {
    id: 'kitchen_sink_double',
    name: 'Double Sink',
    category: 'kitchen',
    defaultWidthMm: 800,
    defaultHeightMm: 500,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
  <rect x="10" y="10" width="780" height="480" rx="20" ry="20" fill="#f8fafc" stroke="#334155" stroke-width="14" />
  <rect x="40" y="40" width="330" height="420" rx="15" ry="15" fill="#e2e8f0" stroke="#475569" stroke-width="10" />
  <circle cx="205" cy="250" r="30" fill="#94a3b8" stroke="#334155" stroke-width="6" />
  <rect x="430" y="40" width="330" height="420" rx="15" ry="15" fill="#e2e8f0" stroke="#475569" stroke-width="10" />
  <circle cx="595" cy="250" r="30" fill="#94a3b8" stroke="#334155" stroke-width="6" />
  <circle cx="400" cy="50" r="22" fill="#64748b" stroke="#334155" stroke-width="8" />
  <line x1="400" y1="50" x2="400" y2="120" stroke="#334155" stroke-width="14" stroke-linecap="round" />
</svg>`,
  },
  {
    id: 'stove_4burner',
    name: 'Cooktop Stove',
    category: 'kitchen',
    defaultWidthMm: 750,
    defaultHeightMm: 600,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 600" width="750" height="600">
  <rect x="10" y="10" width="730" height="580" rx="15" ry="15" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <circle cx="220" cy="180" r="85" fill="#e2e8f0" stroke="#475569" stroke-width="10" />
  <circle cx="220" cy="180" r="35" fill="#334155" />
  <circle cx="530" cy="180" r="105" fill="#e2e8f0" stroke="#475569" stroke-width="10" />
  <circle cx="530" cy="180" r="45" fill="#334155" />
  <circle cx="220" cy="420" r="105" fill="#e2e8f0" stroke="#475569" stroke-width="10" />
  <circle cx="220" cy="420" r="45" fill="#334155" />
  <circle cx="530" cy="420" r="85" fill="#e2e8f0" stroke="#475569" stroke-width="10" />
  <circle cx="530" cy="420" r="35" fill="#334155" />
</svg>`,
  },
  {
    id: 'refrigerator',
    name: 'Refrigerator',
    category: 'kitchen',
    defaultWidthMm: 900,
    defaultHeightMm: 750,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 750" width="900" height="750">
  <rect x="10" y="10" width="880" height="730" rx="15" ry="15" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <line x1="450" y1="10" x2="450" y2="740" stroke="#64748b" stroke-width="12" />
  <rect x="420" y="650" width="60" height="60" rx="8" ry="8" fill="#334155" />
</svg>`,
  },
  {
    id: 'dining_table_6',
    name: 'Dining Table (6 seats)',
    category: 'kitchen',
    defaultWidthMm: 1800,
    defaultHeightMm: 900,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1800 900" width="1800" height="900">
  <rect x="150" y="150" width="1500" height="600" rx="30" ry="30" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <line x1="300" y1="450" x2="1500" y2="450" stroke="#cbd5e1" stroke-width="8" stroke-dasharray="30,20" />
  <rect x="260" y="20" width="380" height="110" rx="15" ry="15" fill="#e2e8f0" stroke="#475569" stroke-width="12" />
  <rect x="710" y="20" width="380" height="110" rx="15" ry="15" fill="#e2e8f0" stroke="#475569" stroke-width="12" />
  <rect x="1160" y="20" width="380" height="110" rx="15" ry="15" fill="#e2e8f0" stroke="#475569" stroke-width="12" />
  <rect x="260" y="770" width="380" height="110" rx="15" ry="15" fill="#e2e8f0" stroke="#475569" stroke-width="12" />
  <rect x="710" y="770" width="380" height="110" rx="15" ry="15" fill="#e2e8f0" stroke="#475569" stroke-width="12" />
  <rect x="1160" y="770" width="380" height="110" rx="15" ry="15" fill="#e2e8f0" stroke="#475569" stroke-width="12" />
</svg>`,
  },

  // ----------------------------------------------------
  // BATHROOM
  // ----------------------------------------------------
  {
    id: 'toilet',
    name: 'Toilet / WC',
    category: 'bathroom',
    defaultWidthMm: 450,
    defaultHeightMm: 700,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 700" width="450" height="700">
  <rect x="10" y="10" width="430" height="200" rx="15" ry="15" fill="#f8fafc" stroke="#334155" stroke-width="14" />
  <circle cx="225" cy="110" r="24" fill="#cbd5e1" stroke="#334155" stroke-width="6" />
  <path d="M 60,210 C 60,400 90,680 225,680 C 360,680 390,400 390,210 Z" fill="#f8fafc" stroke="#334155" stroke-width="14" />
  <path d="M 100,240 C 100,380 130,600 225,600 C 320,600 350,380 350,240 Z" fill="#e2e8f0" stroke="#64748b" stroke-width="10" />
</svg>`,
  },
  {
    id: 'bathtub',
    name: 'Bathtub',
    category: 'bathroom',
    defaultWidthMm: 1700,
    defaultHeightMm: 750,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1700 750" width="1700" height="750">
  <rect x="10" y="10" width="1680" height="730" rx="35" ry="35" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <rect x="60" y="60" width="1580" height="630" rx="100" ry="100" fill="#e2e8f0" stroke="#64748b" stroke-width="12" />
  <circle cx="200" cy="375" r="35" fill="#94a3b8" stroke="#334155" stroke-width="8" />
</svg>`,
  },
  {
    id: 'shower_cabin',
    name: 'Shower Cabin',
    category: 'bathroom',
    defaultWidthMm: 900,
    defaultHeightMm: 900,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900" width="900" height="900">
  <rect x="10" y="10" width="880" height="880" rx="20" ry="20" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <line x1="10" y1="10" x2="890" y2="890" stroke="#cbd5e1" stroke-width="10" />
  <line x1="10" y1="890" x2="890" y2="10" stroke="#cbd5e1" stroke-width="10" />
  <circle cx="450" cy="450" r="40" fill="#94a3b8" stroke="#334155" stroke-width="8" />
</svg>`,
  },
  {
    id: 'vanity_sink',
    name: 'Vanity Sink',
    category: 'bathroom',
    defaultWidthMm: 800,
    defaultHeightMm: 550,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 550" width="800" height="550">
  <rect x="10" y="10" width="780" height="530" rx="15" ry="15" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <ellipse cx="400" cy="275" rx="300" ry="180" fill="#e2e8f0" stroke="#475569" stroke-width="12" />
  <circle cx="400" cy="275" r="28" fill="#94a3b8" stroke="#334155" stroke-width="6" />
  <circle cx="400" cy="70" r="20" fill="#64748b" stroke="#334155" stroke-width="8" />
  <line x1="400" y1="70" x2="400" y2="130" stroke="#334155" stroke-width="12" stroke-linecap="round" />
</svg>`,
  },

  // ----------------------------------------------------
  // STAIRS & CIRCULATION
  // ----------------------------------------------------
  {
    id: 'staircase_straight',
    name: 'Straight Staircase',
    category: 'stairs',
    defaultWidthMm: 1000,
    defaultHeightMm: 3000,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 3000" width="1000" height="3000">
  <rect x="10" y="10" width="980" height="2980" rx="8" ry="8" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <line x1="10" y1="300" x2="990" y2="300" stroke="#64748b" stroke-width="12" />
  <line x1="10" y1="600" x2="990" y2="600" stroke="#64748b" stroke-width="12" />
  <line x1="10" y1="900" x2="990" y2="900" stroke="#64748b" stroke-width="12" />
  <line x1="10" y1="1200" x2="990" y2="1200" stroke="#64748b" stroke-width="12" />
  <line x1="10" y1="1500" x2="990" y2="1500" stroke="#64748b" stroke-width="12" />
  <line x1="10" y1="1800" x2="990" y2="1800" stroke="#64748b" stroke-width="12" />
  <line x1="10" y1="2100" x2="990" y2="2100" stroke="#64748b" stroke-width="12" />
  <line x1="10" y1="2400" x2="990" y2="2400" stroke="#64748b" stroke-width="12" />
  <line x1="10" y1="2700" x2="990" y2="2700" stroke="#64748b" stroke-width="12" />
  <line x1="60" y1="10" x2="60" y2="2990" stroke="#475569" stroke-width="14" />
  <line x1="940" y1="10" x2="940" y2="2990" stroke="#475569" stroke-width="14" />
  <circle cx="500" cy="2850" r="30" fill="#2563eb" />
  <line x1="500" y1="2850" x2="500" y2="220" stroke="#2563eb" stroke-width="14" stroke-dasharray="24,14" />
  <polygon points="500,100 450,220 550,220" fill="#2563eb" />
  <text x="500" y="2700" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="96" font-weight="800" fill="#2563eb" text-anchor="middle">UP</text>
</svg>`,
  },
  {
    id: 'staircase_l_shape',
    name: 'L-Shape Staircase',
    category: 'stairs',
    defaultWidthMm: 2000,
    defaultHeightMm: 2000,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 2000" width="2000" height="2000">
  <path d="M 10 10 L 1990 10 L 1990 990 L 990 990 L 990 1990 L 10 1990 Z" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <rect x="10" y="10" width="980" height="980" fill="#f1f5f9" stroke="#64748b" stroke-width="12" />
  <line x1="10" y1="1250" x2="990" y2="1250" stroke="#64748b" stroke-width="10" />
  <line x1="10" y1="1500" x2="990" y2="1500" stroke="#64748b" stroke-width="10" />
  <line x1="10" y1="1750" x2="990" y2="1750" stroke="#64748b" stroke-width="10" />
  <line x1="1250" y1="10" x2="1250" y2="990" stroke="#64748b" stroke-width="10" />
  <line x1="1500" y1="10" x2="1500" y2="990" stroke="#64748b" stroke-width="10" />
  <line x1="1750" y1="10" x2="1750" y2="990" stroke="#64748b" stroke-width="10" />
  <circle cx="500" cy="1880" r="28" fill="#2563eb" />
  <path d="M 500 1880 L 500 500 L 1850 500" fill="none" stroke="#2563eb" stroke-width="14" stroke-dasharray="24,14" />
  <polygon points="1930,500 1830,460 1830,540" fill="#2563eb" />
  <text x="500" y="1750" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="80" font-weight="800" fill="#2563eb" text-anchor="middle">UP</text>
</svg>`,
  },
  {
    id: 'staircase_u_shape',
    name: 'U-Shape Switchback',
    category: 'stairs',
    defaultWidthMm: 2000,
    defaultHeightMm: 3000,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 3000" width="2000" height="3000">
  <rect x="10" y="10" width="1980" height="2980" rx="8" ry="8" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <rect x="10" y="10" width="1980" height="1000" fill="#f1f5f9" stroke="#64748b" stroke-width="12" />
  <rect x="950" y="1000" width="100" height="1990" fill="#cbd5e1" stroke="#334155" stroke-width="14" />
  <line x1="10" y1="1300" x2="950" y2="1300" stroke="#64748b" stroke-width="10" />
  <line x1="10" y1="1600" x2="950" y2="1600" stroke="#64748b" stroke-width="10" />
  <line x1="10" y1="1900" x2="950" y2="1900" stroke="#64748b" stroke-width="10" />
  <line x1="10" y1="2200" x2="950" y2="2200" stroke="#64748b" stroke-width="10" />
  <line x1="10" y1="2500" x2="950" y2="2500" stroke="#64748b" stroke-width="10" />
  <line x1="10" y1="2800" x2="950" y2="2800" stroke="#64748b" stroke-width="10" />
  <line x1="1050" y1="1300" x2="1990" y2="1300" stroke="#64748b" stroke-width="10" />
  <line x1="1050" y1="1600" x2="1990" y2="1600" stroke="#64748b" stroke-width="10" />
  <line x1="1050" y1="1900" x2="1990" y2="1900" stroke="#64748b" stroke-width="10" />
  <line x1="1050" y1="2200" x2="1990" y2="2200" stroke="#64748b" stroke-width="10" />
  <line x1="1050" y1="2500" x2="1990" y2="2500" stroke="#64748b" stroke-width="10" />
  <line x1="1050" y1="2800" x2="1990" y2="2800" stroke="#64748b" stroke-width="10" />
  <circle cx="500" cy="2850" r="28" fill="#2563eb" />
  <path d="M 500 2850 L 500 500 L 1500 500 L 1500 2800" fill="none" stroke="#2563eb" stroke-width="14" stroke-dasharray="24,14" />
  <polygon points="1500,2920 1460,2820 1540,2820" fill="#2563eb" />
  <text x="500" y="2700" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="80" font-weight="800" fill="#2563eb" text-anchor="middle">UP</text>
</svg>`,
  },
  {
    id: 'staircase_spiral',
    name: 'Spiral Staircase',
    category: 'stairs',
    defaultWidthMm: 1600,
    defaultHeightMm: 1600,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1600" width="1600" height="1600">
  <circle cx="800" cy="800" r="780" fill="#f8fafc" stroke="#334155" stroke-width="16" />
  <line x1="800" y1="800" x2="1580" y2="800" stroke="#64748b" stroke-width="10" />
  <line x1="800" y1="800" x2="1475" y2="1190" stroke="#64748b" stroke-width="10" />
  <line x1="800" y1="800" x2="1190" y2="1475" stroke="#64748b" stroke-width="10" />
  <line x1="800" y1="800" x2="800" y2="1580" stroke="#64748b" stroke-width="10" />
  <line x1="800" y1="800" x2="410" y2="1475" stroke="#64748b" stroke-width="10" />
  <line x1="800" y1="800" x2="125" y2="1190" stroke="#64748b" stroke-width="10" />
  <line x1="800" y1="800" x2="20" y2="800" stroke="#64748b" stroke-width="10" />
  <line x1="800" y1="800" x2="125" y2="410" stroke="#64748b" stroke-width="10" />
  <line x1="800" y1="800" x2="410" y2="125" stroke="#64748b" stroke-width="10" />
  <line x1="800" y1="800" x2="800" y2="20" stroke="#64748b" stroke-width="10" />
  <line x1="800" y1="800" x2="1190" y2="125" stroke="#64748b" stroke-width="10" />
  <line x1="800" y1="800" x2="1475" y2="410" stroke="#64748b" stroke-width="10" />
  <circle cx="800" cy="800" r="140" fill="#334155" stroke="#1e293b" stroke-width="14" />
  <circle cx="800" cy="1400" r="24" fill="#2563eb" />
  <path d="M 800 1400 A 600 600 0 1 1 1400 800" fill="none" stroke="#2563eb" stroke-width="12" stroke-dasharray="20,12" />
  <polygon points="1400,720 1360,820 1440,820" fill="#2563eb" />
  <text x="800" y="1320" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="70" font-weight="800" fill="#2563eb" text-anchor="middle">UP</text>
</svg>`,
  },
];

const STORAGE_KEY_CUSTOM_ASSETS = '3rooms_custom_assets';

/**
 * Singleton managing furniture catalog definitions, SVG-to-Canvas Image conversions,
 * custom asset uploads, and high-performance in-memory texture caching.
 */
export class AssetManager {
  private static instance: AssetManager | null = null;

  private definitions: Map<string, FurnitureDefinition> = new Map();
  private imageCache: Map<string, HTMLImageElement> = new Map();
  private loadingPromises: Map<string, Promise<HTMLImageElement | null>> = new Map();
  private onAssetLoadedCallbacks: Set<() => void> = new Set();

  constructor() {
    this.registerCatalog(DEFAULT_FURNITURE_CATALOG);
    this.loadPersistedCustomAssets();
  }

  /**
   * Singleton accessor.
   */
  public static getInstance(): AssetManager {
    if (!AssetManager.instance) {
      AssetManager.instance = new AssetManager();
    }
    return AssetManager.instance;
  }

  private loadPersistedCustomAssets(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const data = localStorage.getItem(STORAGE_KEY_CUSTOM_ASSETS);
      if (data) {
        const customDefs: FurnitureDefinition[] = JSON.parse(data);
        if (Array.isArray(customDefs)) {
          for (const def of customDefs) {
            def.isCustom = true;
            this.registerDefinition(def);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load custom assets from localStorage:', e);
    }
  }

  public saveCustomAssets(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const customDefs = this.getAllDefinitions().filter((d) => d.isCustom);
      localStorage.setItem(STORAGE_KEY_CUSTOM_ASSETS, JSON.stringify(customDefs));
    } catch (e) {
      console.warn('Failed to save custom assets to localStorage:', e);
    }
  }

  public registerCustomDefinition(def: FurnitureDefinition): void {
    def.isCustom = true;
    this.registerDefinition(def);
    this.saveCustomAssets();
    this.notifyAssetLoaded();
  }

  public removeCustomDefinition(id: string): void {
    this.definitions.delete(id);
    this.imageCache.delete(id);
    this.loadingPromises.delete(id);
    this.saveCustomAssets();
    this.notifyAssetLoaded();
  }

  public notifyAssetLoaded(): void {
    for (const cb of this.onAssetLoadedCallbacks) {
      try {
        cb();
      } catch (err) {
        console.error('Error in onAssetLoaded callback:', err);
      }
    }
  }

  /**
   * Parses an uploaded SVG file, extracting dimensions, viewBox aspect ratio, and a clean suggested name.
   */
  public async parseSvgFile(file: File): Promise<{
    svgContent: string;
    viewBoxWidth: number;
    viewBoxHeight: number;
    suggestedWidthMm: number;
    suggestedHeightMm: number;
    suggestedName: string;
  }> {
    const rawText = await file.text();
    const cleanSvg = rawText.trim();
    if (!cleanSvg.includes('<svg')) {
      throw new Error('File does not appear to be a valid SVG document.');
    }

    let vbWidth = 1000;
    let vbHeight = 1000;

    const vbMatch = cleanSvg.match(/viewBox=["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*["']/i);
    if (vbMatch) {
      const w = parseFloat(vbMatch[3]);
      const h = parseFloat(vbMatch[4]);
      if (w > 0 && h > 0) {
        vbWidth = w;
        vbHeight = h;
      }
    } else {
      const wMatch = cleanSvg.match(/width=["']([-\d.]+)["']/i);
      const hMatch = cleanSvg.match(/height=["']([-\d.]+)["']/i);
      if (wMatch && hMatch) {
        const w = parseFloat(wMatch[1]);
        const h = parseFloat(hMatch[1]);
        if (w > 0 && h > 0) {
          vbWidth = w;
          vbHeight = h;
        }
      }
    }

    const aspect = vbWidth / vbHeight;
    let suggestedWidthMm = 1200;
    let suggestedHeightMm = Math.round(1200 / aspect);
    if (aspect < 0.5) {
      suggestedHeightMm = 2400;
      suggestedWidthMm = Math.round(2400 * aspect);
    } else if (aspect > 2.0) {
      suggestedWidthMm = 2400;
      suggestedHeightMm = Math.round(2400 / aspect);
    }

    const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    const suggestedName = baseName.charAt(0).toUpperCase() + baseName.slice(1);

    return {
      svgContent: cleanSvg,
      viewBoxWidth: vbWidth,
      viewBoxHeight: vbHeight,
      suggestedWidthMm,
      suggestedHeightMm,
      suggestedName,
    };
  }

  /**
   * Subscribes a callback to trigger re-renders when asynchronous SVG images finish loading.
   */
  public onAssetLoaded(callback: () => void): () => void {
    this.onAssetLoadedCallbacks.add(callback);
    return () => {
      this.onAssetLoadedCallbacks.delete(callback);
    };
  }

  /**
   * Registers a batch of definitions into the catalog.
   */
  public registerCatalog(catalog: FurnitureDefinition[]): void {
    for (const def of catalog) {
      this.registerDefinition(def);
    }
  }

  /**
   * Registers a single furniture definition and initiates asynchronous image conversion.
   */
  public registerDefinition(def: FurnitureDefinition): void {
    this.definitions.set(def.id, def);
    this.loadImageAsync(def.id, def.svgContent);
  }

  /**
   * Retrieves a furniture definition by its ID.
   */
  public getDefinition(id: string): FurnitureDefinition | undefined {
    return this.definitions.get(id);
  }

  /**
   * Returns all registered furniture definitions.
   */
  public getAllDefinitions(): FurnitureDefinition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * Filters furniture definitions by category.
   */
  public getDefinitionsByCategory(
    category: FurnitureDefinition['category']
  ): FurnitureDefinition[] {
    return this.getAllDefinitions().filter((def) => def.category === category);
  }

  /**
   * Retrieves the cached HTMLImageElement for a definition, or null if not yet loaded.
   */
  public getImage(defId: string): HTMLImageElement | null {
    return this.imageCache.get(defId) ?? null;
  }

  /**
   * Checks if an image has loaded and is ready for drawImage.
   */
  public isImageLoaded(defId: string): boolean {
    const img = this.imageCache.get(defId);
    return Boolean(img && img.complete && img.naturalWidth > 0);
  }

  /**
   * Converts SVG markup to an HTMLImageElement asynchronously and stores it in cache.
   */
  public async loadImageAsync(
    defId: string,
    svgContent: string
  ): Promise<HTMLImageElement | null> {
    if (this.imageCache.has(defId)) {
      return this.imageCache.get(defId)!;
    }

    if (this.loadingPromises.has(defId)) {
      return this.loadingPromises.get(defId)!;
    }

    // Guard against environments where HTMLImageElement is not available (e.g. Node tests)
    if (typeof Image === 'undefined') {
      return null;
    }

    const promise = new Promise<HTMLImageElement | null>((resolve) => {
      try {
        const img = new Image();
        let srcUrl: string;

        if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
          const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
          srcUrl = URL.createObjectURL(blob);
        } else {
          srcUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(svgContent);
        }

        img.onload = () => {
          this.imageCache.set(defId, img);
          this.loadingPromises.delete(defId);
          for (const cb of this.onAssetLoadedCallbacks) {
            cb();
          }
          resolve(img);
        };

        img.onerror = () => {
          this.loadingPromises.delete(defId);
          resolve(null);
        };

        img.src = srcUrl;
      } catch {
        this.loadingPromises.delete(defId);
        resolve(null);
      }
    });

    this.loadingPromises.set(defId, promise);
    return promise;
  }

  /**
   * Fallback rendering when an SVG image is loading or fails to load:
   * Renders a clean labeled placeholder rectangle with the dimensions (width, height)
   * centered at (0, 0) in local object coordinates.
   */
  public renderFallback(
    ctx: CanvasRenderingContext2D,
    instance: FurnitureInstance,
    def?: FurnitureDefinition,
    zoom: number = 1
  ): void {
    const w = instance.width;
    const h = instance.height;
    const screenPixel = 1 / zoom;

    ctx.save();

    // Semi-transparent placeholder body
    ctx.fillStyle = 'rgba(241, 245, 249, 0.9)'; // Slate-100
    ctx.strokeStyle = '#64748b'; // Slate-500
    ctx.lineWidth = 1.5 * screenPixel;

    ctx.beginPath();
    const r = Math.min(20, Math.min(w, h) * 0.1);
    ctx.roundRect?.(-w / 2, -h / 2, w, h, r);
    ctx.fill();
    ctx.stroke();

    // Subtle diagonal alignment lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)'; // Slate-400
    ctx.lineWidth = 1 * screenPixel;
    ctx.setLineDash([4 * screenPixel, 4 * screenPixel]);
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.moveTo(w / 2, -h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.stroke();

    // Centered label and dimension text
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.max(12 * screenPixel, Math.min(w, h) * 0.12)}px sans-serif`;

    const label = def?.name ?? instance.defId;
    ctx.fillText(label, 0, -8 * screenPixel);

    ctx.fillStyle = '#64748b';
    ctx.font = `normal ${Math.max(10 * screenPixel, Math.min(w, h) * 0.08)}px sans-serif`;
    ctx.fillText(`${Math.round(w)} × ${Math.round(h)} mm`, 0, 12 * screenPixel);

    ctx.restore();
  }
}

export const assetManager = AssetManager.getInstance();
