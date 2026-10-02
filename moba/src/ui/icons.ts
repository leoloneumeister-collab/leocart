/** Inline SVG icons for abilities and items, generated from small path templates. */
import type { ItemCategory } from '../data/items.ts';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

const GLYPHS: Record<string, string> = {
  lunge: '<path d="M3 17l8-4-2-3 11 1-6 7-1-3z" /><path d="M4 21l7-3" stroke-width="2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  quake: '<path d="M2 16l4-3 3 2 3-5 3 5 3-2 4 3" fill="none" stroke-width="2"/><path d="M4 20h16" stroke-width="2"/><circle cx="12" cy="8" r="2"/>',
  leap: '<path d="M12 3l3 6h-2v6h2l-3 6-3-6h2V9H9z"/><path d="M5 20h14" stroke-width="2"/>',
  lance: '<path d="M2 12l9-3v6z"/><path d="M11 12h10" stroke-width="3"/><path d="M15 8l4 4-4 4" fill="none" stroke-width="2"/>',
  bloom: '<circle cx="12" cy="12" r="3"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" stroke-width="2"/>',
  blink: '<path d="M4 18l6-6-6-6" fill="none" stroke-width="2.5"/><path d="M12 18l6-6-6-6" fill="none" stroke-width="2.5"/><circle cx="20" cy="12" r="1.6"/>',
  meteor: '<circle cx="15" cy="15" r="5"/><path d="M3 3l8 8M3 9l5 5M9 3l5 5" stroke-width="2.4"/>',
  volley: '<path d="M3 6l9 3M3 12h10M3 18l9-3" stroke-width="2.4"/><path d="M14 4l7 8-7 8" fill="none" stroke-width="2.4"/>',
  bolt: '<path d="M2 12h17" stroke-width="2.6"/><path d="M15 6l6 6-6 6" fill="none" stroke-width="2.4"/><path d="M2 8l4 4-4 4" fill="none" stroke-width="2"/>',
  flip: '<path d="M20 12a8 8 0 1 1-4-7" fill="none" stroke-width="2.4"/><path d="M13 3h5v5"  fill="none" stroke-width="2.4"/>',
  arrow: '<path d="M2 20L20 4" stroke-width="2.6"/><path d="M12 4h8v8" fill="none" stroke-width="2.6"/><path d="M5 14l5 5M8 11l5 5" stroke-width="2"/>',
  roots: '<path d="M12 3v9M12 12c-3 1-5 4-5 9M12 12c3 1 5 4 5 9M12 12c0 3 0 6-1 9" fill="none" stroke-width="2.4"/><circle cx="12" cy="5" r="2.2"/>',
  bark: '<path d="M6 3h12l2 4-2 14H6L4 7z"/><path d="M9 6v13M13 6v13M16 8v10" stroke-width="1.3" fill="none"/>',
  stomp: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" fill="none" stroke-width="2"/><circle cx="12" cy="12" r="10" fill="none" stroke-width="1.4"/>',
  slide: '<path d="M2 19l7-10 4 5 3-4 6 9z"/><path d="M5 5l2 3M10 3l1 3M15 5l-1 3" stroke-width="2"/>',
  dart: '<path d="M3 21L14 10" stroke-width="2.4"/><path d="M14 10l-1-6 7 7-6-1z"/><circle cx="6" cy="18" r="1.6"/>',
  step: '<circle cx="8" cy="8" r="3.4" fill="none" stroke-width="2"/><path d="M11 11l8 8" stroke-width="3"/><path d="M15 19h5v-5" fill="none" stroke-width="2.4"/>',
  veil: '<path d="M4 18c0-6 4-12 8-12 5 0 8 5 8 12-3-2-5-2-8 0-3-2-5-2-8 0z"/>',
  mark: '<circle cx="12" cy="12" r="8" fill="none" stroke-width="2.2"/><circle cx="12" cy="12" r="2.6"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6" stroke-width="2.4"/>',
  passive: '<circle cx="12" cy="12" r="7" fill="none" stroke-width="2.4"/><circle cx="12" cy="12" r="2.8"/>',
};

export function abilityIconSvg(icon: string, color: number): string {
  const c = hex(color);
  const g = GLYPHS[icon] ?? GLYPHS.passive;
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="${c}" stroke="${c}" stroke-linecap="round" stroke-linejoin="round" stroke-width="1"><rect x="0" y="0" width="24" height="24" fill="#10141c" stroke="none"/><circle cx="12" cy="12" r="11" fill="${c}" fill-opacity="0.12" stroke="none"/>${g}</svg>`;
}

const ITEM_GLYPH: Record<ItemCategory, string> = {
  damage: '<path d="M4 20l10-10 3 3L7 23z" /><path d="M14 10l6-7 1 1-1 5z"/>',
  magic: '<circle cx="12" cy="8" r="5"/><path d="M12 13v9" stroke-width="2.4"/><path d="M9 22h6" stroke-width="2.4"/>',
  defense: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  health: '<path d="M12 21C5 15 3 11 3 8a5 5 0 0 1 9-2 5 5 0 0 1 9 2c0 3-2 7-9 13z"/>',
  boots: '<path d="M5 4h8v8l7 3v5H5z"/><path d="M5 17h15" stroke-width="2" stroke="#10141c"/>',
  speed: '<path d="M13 2L5 14h6l-2 8 10-13h-6z"/>',
};

export function itemIconSvg(category: ItemCategory, color: number, tier: number): string {
  const c = hex(color);
  const frame = tier === 3 ? '#e8c860' : tier === 2 ? '#a8b4c8' : '#6a7280';
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="${c}" stroke="${c}" stroke-linecap="round" stroke-linejoin="round" stroke-width="1"><rect x="0.5" y="0.5" width="23" height="23" rx="2" fill="#141922" stroke="${frame}" stroke-width="1.2"/>${ITEM_GLYPH[category]}</svg>`;
}

let iconSeq = 0;

export function champIconSvg(letter: string, primary: number, accent: number): string {
  const id = `cg${iconSeq++}`;
  return `<svg viewBox="0 0 48 48" width="100%" height="100%"><defs><radialGradient id="${id}" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="${hex(accent)}"/><stop offset="1" stop-color="${hex(primary)}"/></radialGradient></defs><rect width="48" height="48" fill="url(#${id})"/><text x="24" y="33" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="26" fill="#fff" fill-opacity="0.92">${letter}</text></svg>`;
}
