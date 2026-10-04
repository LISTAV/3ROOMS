import type { UnitSystem } from '../types.js';

export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft' | 'ft_in';
export type AreaUnit = 'sq_m' | 'sq_cm' | 'sq_mm' | 'sq_ft' | 'sq_in';
export type FractionPrecision = 2 | 4 | 8 | 16; // 1/2, 1/4, 1/8, 1/16

export interface UnitSettings {
  lengthUnit: LengthUnit;
  areaUnit: AreaUnit;
  decimalPlaces: number; // For decimal formats (default: 2)
  fractionPrecision: FractionPrecision; // For 'ft_in' (default: 16)
}

export const DEFAULT_UNIT_SETTINGS: UnitSettings = {
  lengthUnit: 'mm',
  areaUnit: 'sq_m',
  decimalPlaces: 2,
  fractionPrecision: 16,
};

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/**
 * Formats canonical millimeters into the target unit string according to UnitSettings or UnitSystem.
 */
export function formatLength(
  mm: number,
  settingsOrSystem: Partial<UnitSettings> | UnitSystem = DEFAULT_UNIT_SETTINGS
): string {
  if (isNaN(mm) || !isFinite(mm)) return '0 mm';

  let resolved: UnitSettings;
  if (typeof settingsOrSystem === 'string') {
    switch (settingsOrSystem) {
      case 'metric_m':
        resolved = { ...DEFAULT_UNIT_SETTINGS, lengthUnit: 'm' };
        break;
      case 'imperial_ft': {
        const totalInches = mm / 25.4;
        const isNegative = totalInches < 0;
        const abs = Math.abs(totalInches);
        const feet = Math.floor(abs / 12);
        const inches = Math.round(abs % 12);
        return `${isNegative ? '-' : ''}${feet}' ${inches}"`;
      }
      case 'metric_mm':
      default:
        resolved = { ...DEFAULT_UNIT_SETTINGS, lengthUnit: 'mm' };
        break;
    }
  } else {
    resolved = { ...DEFAULT_UNIT_SETTINGS, ...settingsOrSystem };
  }

  const dec = resolved.decimalPlaces ?? 2;

  switch (resolved.lengthUnit) {
    case 'cm': {
      const cm = mm / 10;
      return `${cm.toFixed(dec)} cm`;
    }
    case 'm': {
      const m = mm / 1000;
      return `${m.toFixed(dec)} m`;
    }
    case 'in': {
      const inches = mm / 25.4;
      return `${inches.toFixed(dec)} in`;
    }
    case 'ft': {
      const feet = mm / 304.8;
      return `${feet.toFixed(dec)} ft`;
    }
    case 'ft_in': {
      // Architectural US standard: e.g. 7' - 10 1/2"
      const totalInches = mm / 25.4;
      const isNegative = totalInches < 0;
      const absInches = Math.abs(totalInches);

      let feet = Math.floor(absInches / 12);
      const remainingInches = absInches - feet * 12;

      let wholeInches = Math.floor(remainingInches);
      const fraction = remainingInches - wholeInches;
      const N = resolved.fractionPrecision || 16;

      let numerator = Math.round(fraction * N);

      // Handle round-up overflow
      if (numerator === N) {
        wholeInches += 1;
        numerator = 0;
        if (wholeInches === 12) {
          feet += 1;
          wholeInches = 0;
        }
      }

      let inchStr = '';
      if (numerator > 0) {
        const divisor = gcd(numerator, N);
        const simpNum = numerator / divisor;
        const simpDen = N / divisor;
        if (wholeInches > 0) {
          inchStr = `${wholeInches} ${simpNum}/${simpDen}`;
        } else {
          inchStr = `${simpNum}/${simpDen}`;
        }
      } else {
        inchStr = `${wholeInches}`;
      }

      const sign = isNegative ? '-' : '';
      return `${sign}${feet}' - ${inchStr}"`;
    }
    case 'mm':
    default: {
      return `${Math.round(mm).toLocaleString('en-US')} mm`;
    }
  }
}

/**
 * Parses user input string (e.g. "12' 4 1/2\"", "10' 6\"", "3.5m", "150cm", "2400mm", "94.5")
 * back to canonical millimeters.
 */
export function parseLengthToMm(input: string, fallbackUnit: LengthUnit = 'mm'): number | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  // 1. Check for feet and inches format: e.g. 10' 6", 10' - 6", 12' 4 1/2", 5', 6"
  const ftInRegex = /^(?:(-?\d+(?:\.\d+)?)\s*')?\s*(?:-?\s*)?(?:(\d+(?:\.\d+)?)\s*)?(?:(\d+)\/(\d+))?\s*(?:"|in|'')?$/i;
  if (trimmed.includes("'") || (trimmed.includes('"') && !trimmed.toLowerCase().includes('in'))) {
    // Attempt parse as architectural feet and inches
    const clean = trimmed.replace(/"$/, '').trim();
    // Matches like 10' 6, 10' - 6, 12' 4 1/2, 10', 6"
    const match = clean.match(/^(?:(-?\d+(?:\.\d+)?)\s*')?\s*(?:-\s*)?(?:(\d+(?:\.\d+)?)\s*)?(?:(\d+)\/(\d+))?$/);
    if (match && (match[1] !== undefined || match[2] !== undefined || match[3] !== undefined)) {
      const feet = match[1] ? parseFloat(match[1]) : 0;
      const wholeInches = match[2] ? parseFloat(match[2]) : 0;
      const fracNum = match[3] ? parseFloat(match[3]) : 0;
      const fracDen = match[4] ? parseFloat(match[4]) : 1;
      const fraction = fracDen !== 0 ? fracNum / fracDen : 0;

      const totalInches = (feet < 0 ? -1 : 1) * (Math.abs(feet) * 12 + wholeInches + fraction);
      return Math.round(totalInches * 25.4 * 10000) / 10000;
    }
  }

  // 2. Check for explicit unit suffix: mm, cm, m, in, ft
  const unitMatch = trimmed.match(/^([+-]?\d+(?:\.\d+)?)\s*(mm|cm|m|in|ft|")?$/i);
  if (unitMatch) {
    const val = parseFloat(unitMatch[1]);
    if (isNaN(val)) return null;

    const unit = (unitMatch[2] || '').toLowerCase();
    if (unit === 'mm') return Math.round(val * 10000) / 10000;
    if (unit === 'cm') return Math.round(val * 10 * 10000) / 10000;
    if (unit === 'm') return Math.round(val * 1000 * 10000) / 10000;
    if (unit === 'in' || unit === '"') return Math.round(val * 25.4 * 10000) / 10000;
    if (unit === 'ft') return Math.round(val * 304.8 * 10000) / 10000;

    // No suffix provided: apply fallback unit
    switch (fallbackUnit) {
      case 'cm':
        return Math.round(val * 10 * 10000) / 10000;
      case 'm':
        return Math.round(val * 1000 * 10000) / 10000;
      case 'in':
        return Math.round(val * 25.4 * 10000) / 10000;
      case 'ft':
      case 'ft_in':
        return Math.round(val * 304.8 * 10000) / 10000;
      case 'mm':
      default:
        return Math.round(val * 10000) / 10000;
    }
  }

  // 3. Fallback: Try general feet + inches regex
  const parts = trimmed.match(/^(\d+(?:\.\d+)?)\s*'\s*(?:-\s*)?(\d+(?:\.\d+)?)\s*(?:(\d+)\/(\d+))?\s*"?$/);
  if (parts) {
    const ft = parseFloat(parts[1]) || 0;
    const inch = parseFloat(parts[2]) || 0;
    const num = parseFloat(parts[3]) || 0;
    const den = parseFloat(parts[4]) || 1;
    const totalInches = ft * 12 + inch + (den !== 0 ? num / den : 0);
    return totalInches * 25.4;
  }

  return null;
}

/**
 * Formats canonical square millimeters (mm²) into the target area unit string.
 */
export function formatArea(
  mm2: number,
  settingsOrSystem: Partial<UnitSettings> | UnitSystem = DEFAULT_UNIT_SETTINGS
): string {
  if (isNaN(mm2) || !isFinite(mm2)) return '0 m²';

  let resolved: UnitSettings;
  let customDec: number | undefined;

  if (typeof settingsOrSystem === 'string') {
    switch (settingsOrSystem) {
      case 'imperial_ft':
        resolved = { ...DEFAULT_UNIT_SETTINGS, areaUnit: 'sq_ft' };
        customDec = 1;
        break;
      case 'metric_mm':
        resolved = { ...DEFAULT_UNIT_SETTINGS, areaUnit: 'sq_mm' };
        break;
      case 'metric_m':
      default:
        resolved = { ...DEFAULT_UNIT_SETTINGS, areaUnit: 'sq_m' };
        break;
    }
  } else {
    resolved = { ...DEFAULT_UNIT_SETTINGS, ...settingsOrSystem };
    customDec = settingsOrSystem.decimalPlaces;
  }

  const dec = customDec ?? (resolved.areaUnit === 'sq_ft' ? 1 : (resolved.decimalPlaces ?? 2));

  switch (resolved.areaUnit) {
    case 'sq_mm': {
      return `${Math.round(mm2).toLocaleString('en-US')} mm²`;
    }
    case 'sq_cm': {
      const cm2 = mm2 / 100;
      return `${cm2.toFixed(dec)} cm²`;
    }
    case 'sq_ft': {
      // 1 sq ft = 92903.04 mm²
      const sqFt = mm2 / 92903.04;
      return `${sqFt.toFixed(dec)} sq ft`;
    }
    case 'sq_in': {
      // 1 sq in = 645.16 mm²
      const sqIn = mm2 / 645.16;
      return `${sqIn.toFixed(dec)} sq in`;
    }
    case 'sq_m':
    default: {
      const m2 = mm2 / 1_000_000;
      return `${m2.toFixed(dec)} m²`;
    }
  }
}
