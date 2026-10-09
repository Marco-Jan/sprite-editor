// ════════════════════════════════════════════════════════════════════
// GUIDELAYOUTS — eigene Hilfslinien-Layouts speichern und anwenden
// ════════════════════════════════════════════════════════════════════
// Ein Layout merkt sich die Linien und die Figur-Einteilung eines Sprites
// samt dessen Größe. Es gilt für alle Sprites (nicht je Sprite gespeichert):
// auf einen Sprite anderer Größe angewendet, wandern die Linien anteilig mit.
//
//   { name, width, height, guides: { h, v, heads, top, bottom } }
//
// Reine Rechnung ohne DOM — läuft unter Node (tests/guidelayouts.test.js).
// Die Desktop-Version rechnet und speichert genauso (spritebit-rs, guides_ui.rs).
import { normalizeGuides } from './state.js';

/** Liste aus dem Speicher prüfen; Unbrauchbares fällt weg. */
export function normalizeLayouts(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const l of list) {
    const name = typeof l?.name === 'string' ? l.name.trim() : '';
    const W = Math.round(Number(l?.width)), H = Math.round(Number(l?.height));
    if (!name || !(W >= 1 && H >= 1) || out.some(o => o.name === name)) continue;
    out.push({ name, width: W, height: H, guides: normalizeGuides(l.guides, W, H) });
  }
  return out;
}

/** Layout aus den Hilfslinien eines Sprites (W × H). */
export const makeLayout = (name, guides, W, H) =>
  ({ name: String(name).trim(), width: W, height: H, guides: normalizeGuides(JSON.parse(JSON.stringify(guides)), W, H) });

/** Speichern: gleicher Name ersetzt, sonst hinten anhängen. Gibt die neue Liste zurück. */
export function upsertLayout(list, layout) {
  const i = list.findIndex(l => l.name === layout.name);
  if (i < 0) return [...list, layout];
  const out = list.slice();
  out[i] = layout;
  return out;
}

/** Die Hilfslinien des Layouts für einen Sprite der Größe W × H (anteilig umgerechnet). */
export function fitLayout(layout, W, H) {
  const g = layout.guides;
  const sx = W / layout.width, sy = H / layout.height;
  const x = v => Math.round(v * sx), y = v => Math.round(v * sy);
  return normalizeGuides({
    h: g.h.map(y), v: g.v.map(x), heads: g.heads, top: y(g.top), bottom: y(g.bottom),
  }, W, H);
}
