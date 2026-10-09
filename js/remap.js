// ════════════════════════════════════════════════════════════════════
// REMAP — Pixel zwischen Paletten übertragen, so dass sie gleich aussehen
// ════════════════════════════════════════════════════════════════════
// Pixel speichern nur die Nummer ihrer Farbe. Kopiert man aus einem Sprite
// mit anderer Palette, sähe Nummer 3 im Ziel anders aus. Beim Einfügen wird
// darum nach der FARBE übertragen: gibt es sie in der Ziel-Palette, wird
// deren Nummer genommen, sonst kommt sie als freie Farbe ("#rrggbb") hinein.
//
// Reine Rechnung ohne DOM — läuft unter Node (tests/remap.test.js).
// Die Desktop-Version rechnet genauso (spritebit-rs, selection::remap_clip).
import { cellToColor } from './data.js';

/**
 * @param {any[][]} cells   Pixel (Nummern oder "#rrggbb", 0 = leer)
 * @param {Record<number,string>} fromPal  Palette, aus der sie stammen
 * @param {Record<number,string>} toPal    Palette, in die sie kommen
 * @returns {{cells: any[][], mapped: number, free: number}}
 *   mapped = wie viele verschiedene Farben eine andere Nummer bekamen,
 *   free   = wie viele verschiedene Farben es im Ziel nicht gibt (freie Farben)
 */
export function remapCells(cells, fromPal, toPal) {
  const index = new Map();
  for (const [k, hex] of Object.entries(toPal || {})) {
    const n = Number(k);
    if (n > 0 && typeof hex === 'string' && !index.has(hex.toLowerCase())) index.set(hex.toLowerCase(), n);
  }
  const mapped = new Set(), free = new Set();
  const out = cells.map(row => row.map(v => {
    if (v === 0) return 0;
    const hex = cellToColor(v, fromPal);
    if (!hex) return v; // unbekannte Nummer: lieber so lassen als verlieren
    const key = hex.toLowerCase();
    const n = index.get(key);
    if (n !== undefined) {
      if (n !== v) mapped.add(key);
      return n;
    }
    free.add(key);
    return key;
  }));
  return { cells: out, mapped: mapped.size, free: free.size };
}

/** Sind zwei Paletten Farbe für Farbe gleich? (Dann gibt es nichts umzurechnen.) */
export function samePalette(a, b) {
  const ka = Object.keys(a || {}), kb = Object.keys(b || {});
  return ka.length === kb.length && ka.every(k => String(a[k]).toLowerCase() === String(b[k] ?? '').toLowerCase());
}
