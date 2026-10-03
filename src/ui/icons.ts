import { icons } from 'lucide';

export type IconName = keyof typeof icons;

/**
 * Renders an inline Lucide SVG string given an icon definition.
 */
export function getIconSvg(
  name: IconName,
  size: number = 16,
  strokeWidth: number = 2,
  className: string = ''
): string {
  const iconNode = icons[name];
  if (!iconNode || !Array.isArray(iconNode)) {
    return `<span class="icon-fallback">${name}</span>`;
  }

  const innerSvg = (iconNode as Array<[string, Record<string, unknown>]>)
    .map(([tag, attrs]) => {
      const attrEntries = Object.entries(attrs)
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${attrEntries}></${tag}>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-${name.toLowerCase()} ${className}" aria-hidden="true">${innerSvg}</svg>`;
}
