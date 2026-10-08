// ════════════════════════════════════════════════════════════════════
// PALORDER — Farben einer Palette umsortieren, ohne dass sich das Bild ändert
// ════════════════════════════════════════════════════════════════════
// Die Pixel speichern die NUMMER einer Farbe (Palette-Index). Zieht man in
// der Farbzeile eine Farbe auf einen anderen Platz, bekommt sie eine andere
// Nummer — damit das Bild gleich bleibt, müssen alle Pixel mit umgeschrieben
// werden. Das beschreibt eine Permutation:
//
//   perm[alt] = neu      (perm[0] = 0: Transparent bleibt immer vorn)
//
// Hier steht nur die Rechnung ohne DOM; ausgeführt wird in palettes.js
// (reorderPalette), dort auch als ein Undo-Schritt.

/**
 * Neue Reihenfolge → Permutation.
 * @param {number[]} order  alte Nummern in neuer Reihenfolge, für die Plätze 1..n
 * @returns {number[]}      perm[alt] = neu, Länge n + 1
 */
export function permFromOrder(order) {
  const perm = [0];
  order.forEach((old, k) => { perm[old] = k + 1; });
  for (let i = 1; i <= order.length; i++) if (perm[i] == null) perm[i] = i;
  return perm;
}

export function invertPerm(perm) {
  const inv = [];
  perm.forEach((n, o) => { inv[n] = o; });
  return inv;
}

export const isIdentity = perm => perm.every((n, o) => n === o);

/** Eine Farbe von Platz `from` auf Platz `to` (beide 1..n) — die Reihenfolge danach. */
export function moveColor(n, from, to) {
  const order = Array.from({ length: n }, (_, k) => k + 1);
  const [c] = order.splice(from - 1, 1);
  order.splice(to - 1, 0, c);
  return order;
}

/** Palette (Objekt Nummer → Hex) mit neuen Nummern. Andere Schlüssel bleiben. */
export function permutePalette(pal, perm) {
  const out = { ...pal };
  for (let o = 1; o < perm.length; o++) delete out[o];
  for (let o = 1; o < perm.length; o++) if (pal[o] !== undefined) out[perm[o]] = pal[o];
  return out;
}

/** Materialien (Nummer → Material) wandern mit ihrer Farbe. */
export function permuteMaterials(mats, perm) {
  if (!mats) return mats;
  const out = {};
  for (const [k, v] of Object.entries(mats)) {
    const o = Number(k);
    out[o < perm.length ? perm[o] : o] = v;
  }
  return out;
}

/** Pixel in place umnummerieren. Freie Farben (Hex-Text) bleiben, wie sie sind. */
export function remapGrid(g, perm) {
  for (const row of g) for (let x = 0; x < row.length; x++) {
    const v = row[x];
    if (typeof v === 'number' && v > 0 && v < perm.length) row[x] = perm[v];
  }
}

// ── Nach Farbstufen ─────────────────────────────────────────────────
function hsl(hex) {
  const h = hex.length === 4 ? '#' + [...hex.slice(1)].map(c => c + c).join('') : hex;
  const r = parseInt(h.slice(1, 3), 16) / 255, g = parseInt(h.slice(3, 5), 16) / 255, b = parseInt(h.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { h: hue, s, l };
}

// Ab dieser Sättigung zählt eine Farbe als bunt — darunter ist sie ein Grau.
const GRAY_SAT = 0.15;
// Ein Farbton-Bereich je 30°: Rot, Orange, Gelb, … — eine „Stufe".
const SECTOR = 30;

/**
 * Reihenfolge nach Farbstufen: erst die Grautöne von dunkel nach hell, dann
 * je Farbton (Rot, Orange, Gelb, Grün, …) eine Gruppe, jeweils von dunkel
 * nach hell. So liegen die Abstufungen einer Farbe nebeneinander.
 * @param {Record<number, string>} pal
 * @param {number} n  Zahl der Farben (Plätze 1..n)
 * @returns {number[]} alte Nummern in neuer Reihenfolge
 */
export function shadeOrder(pal, n) {
  const items = [];
  const missing = [];
  for (let i = 1; i <= n; i++) {
    const hex = pal[i];
    if (typeof hex !== 'string' || !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) { missing.push(i); continue; }
    const c = hsl(hex);
    // Sektor so verschoben, dass Rot (um 0°) nicht in zwei Gruppen zerfällt.
    const group = c.s < GRAY_SAT ? -1 : Math.floor(((c.h + SECTOR / 2) % 360) / SECTOR);
    items.push({ i, group, l: c.l });
  }
  items.sort((a, b) => a.group - b.group || a.l - b.l || a.i - b.i);
  return [...items.map(x => x.i), ...missing];
}
