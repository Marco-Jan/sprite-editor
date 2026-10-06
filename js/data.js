// ════════════════════════════════════════════════════════════════════
// DATA — Konstanten: Farb-Labels + eingebaute Farbpaletten
// ════════════════════════════════════════════════════════════════════
// Das Palettensystem ist bewusst generisch: eine Palette ist nichts weiter
// als ein Mapping Index → Hex-Farbe. Index 0 ist immer transparent, 1..n sind
// frei belegbar (n bis 255). Es gibt keine an ein Motiv gebundenen Slots mehr.

// Deep-Copy Helper für Grids (2D-Arrays).
export function dc(a) { return a.map(r => [...r]); }

// ────────────────────────────────────────────────────────────────────
// Eine Grid-Zelle → CSS-Farbe (oder null = nichts zeichnen).
//   0          → transparent
//   1..n       → Palette-Index
//   "#RRGGBB"  → freie Farbe (Pipette / Rohfarben-Trace)
// Liegt hier unten, weil sowohl das Rendering als auch die Code-Erzeugung
// sie brauchen — so bleibt der Abhängigkeitsgraph zyklenfrei.
// ────────────────────────────────────────────────────────────────────
export function cellToColor(c, palette) {
  if (c === 0) return null;
  if (typeof c === 'string' && c[0] === '#') return c;
  return palette[c] || null;
}

// Eine Palette hat so viele Farben, wie sie braucht: Index 1..n, n ≤ MAX_COLORS.
// 255 Farben + Transparent = 256 Werte — die übliche Grenze indizierter
// Pixel-Art (GIF, PNG-8) und genau ein Byte im C-Export.
export const MAX_COLORS = 255;

// Größe der klassischen Palette: die eingebauten haben genau so viele Farben,
// und nur 1–9 tragen Namen (Tonleiter, Kontur, Akzente) und eine Taste.
export const BASE_SIZE = 9;

// Anzahl Farben einer Palette = höchster belegter Index.
export function paletteSize(pal) {
  let n = 0;
  for (const k in pal) {
    const i = Number(k);
    if (Number.isInteger(i) && i > n && i <= MAX_COLORS && pal[k]) n = i;
  }
  return n;
}

// Die Beschriftungen der Palette-Indizes sind Oberflächentext und stehen
// deshalb zweisprachig in i18n.js — colorLabel(i) und colorLabelShort(i).
// Gemeint ist: 1–4 die "Tonleiter" (hell → dunkel) eines Materials, 5 die
// Kontur, 6–9 freie Akzente. Das ist eine Konvention, keine technische
// Vorgabe — jeder Index kann jede Farbe tragen.

// Trennstrich in der Palette-Anzeige nach diesem Index (Töne | Details).
export const PALETTE_GROUP_SPLIT = 4;

// ────────────────────────────────────────────────────────────────────
// Eingebaute Paletten — reine Farbschemata, jeweils Index 1–9 vollständig.
// Reihenfolge hier = Reihenfolge in den Dropdowns.
// ────────────────────────────────────────────────────────────────────
export const BUILTIN_PALETTES = {
  graustufen: { 1:'#FFFFFF', 2:'#CCCCCC', 3:'#999999', 4:'#666666', 5:'#000000', 6:'#FF8080', 7:'#FFFFFF', 8:'#808080', 9:'#404040' },
  golden:     { 1:'#F5D98A', 2:'#E8B84B', 3:'#C89030', 4:'#956020', 5:'#1A0800', 6:'#FF9898', 7:'#FFFFFF', 8:'#5A3010', 9:'#3A2410' },
  braun:      { 1:'#D4A882', 2:'#B07848', 3:'#8A5A28', 4:'#6A3E18', 5:'#1A0800', 6:'#FF9898', 7:'#FFFFFF', 8:'#5A3010', 9:'#3A2410' },
  kohle:      { 1:'#707070', 2:'#4A4A4A', 3:'#303030', 4:'#1A1A1A', 5:'#000000', 6:'#FF9898', 7:'#FFFFFF', 8:'#282828', 9:'#111111' },
  creme:      { 1:'#FFFAF0', 2:'#F0E8D8', 3:'#D8CDB8', 4:'#B8A890', 5:'#1A0800', 6:'#FF9898', 7:'#FFFFFF', 8:'#5A3010', 9:'#8A7A60' },
  schiefer:   { 1:'#F2F2F2', 2:'#D4D4E4', 3:'#A0A0B8', 4:'#606074', 5:'#1A1828', 6:'#FFB0C8', 7:'#FFFFFF', 8:'#88CCFF', 9:'#444455' },
  orange:     { 1:'#FFE090', 2:'#F0A838', 3:'#D07820', 4:'#A05010', 5:'#1A1828', 6:'#FFB0C8', 7:'#FFFFFF', 8:'#66BB44', 9:'#B86020' },
  tinte:      { 1:'#686868', 2:'#484848', 3:'#2A2A2A', 4:'#181818', 5:'#1A1828', 6:'#FFB0C8', 7:'#FFFFFF', 8:'#FFDD44', 9:'#111111' },
  schnee:     { 1:'#FFFFFF', 2:'#F0F0F8', 3:'#DCDCE8', 4:'#B8B8CC', 5:'#1A1828', 6:'#FFB0C8', 7:'#FFFFFF', 8:'#88CCFF', 9:'#D0D0E0' },

  // ── Helden ────────────────────────────────────────────────────────
  // Farbschemata im Geist bekannter Spiel- und Comicfiguren: die Toene
  // sind so gewaehlt, dass die Figur wiedererkennbar wird, die Namen
  // sind beschreibend statt geliehen.
  // Aufbau wie oben: 1-4 Tonleiter hell zu dunkel, 5 Kontur, 6-9 Akzente.
  // Jede Kontur hebt sich vom mittleren Ton mindestens 3:1 ab, sonst
  // verschwindet sie beim Zeichnen.
  blitz:      { 1:'#FFF6BC', 2:'#FFE14A', 3:'#EFBE12', 4:'#A87608', 5:'#2B1C05', 6:'#E8453C', 7:'#FFFFFF', 8:'#7A4A12', 9:'#120C04' },
  klempner:   { 1:'#FF9A8E', 2:'#E8453C', 3:'#B4271F', 4:'#701410', 5:'#1C1216', 6:'#2A4FBF', 7:'#FFD9B0', 8:'#F5C518', 9:'#16307A' },
  igel:       { 1:'#8FC2FF', 2:'#3C7DE8', 3:'#2450B4', 4:'#132C64', 5:'#080E1F', 6:'#E8453C', 7:'#FFFFFF', 8:'#F0C9A0', 9:'#101820' },
  held:       { 1:'#B4E88A', 2:'#6FBF3C', 3:'#42862A', 4:'#254E16', 5:'#111E0B', 6:'#F0C9A0', 7:'#FFFFFF', 8:'#8A5A28', 9:'#F5C518' },
  roboter:    { 1:'#D2EFFF', 2:'#71C6F5', 3:'#2E7FD4', 4:'#153F76', 5:'#091524', 6:'#F5C518', 7:'#FFFFFF', 8:'#E8453C', 9:'#22304A' },
  puff:       { 1:'#FFDCE9', 2:'#FF9EC4', 3:'#DE5E97', 4:'#93305C', 5:'#2A0E1C', 6:'#E8453C', 7:'#FFFFFF', 8:'#5B2440', 9:'#7A2848' },
  geist:      { 1:'#E4D2FF', 2:'#B98CF0', 3:'#8452C4', 4:'#4E2B7A', 5:'#180C28', 6:'#7CF5C0', 7:'#FFFFFF', 8:'#F5C518', 9:'#2E1848' },
  // Tonleiter bewusst heller als bei kohle/tinte — sonst verschwindet
  // die fast schwarze Kontur in den dunklen Toenen.
  ninja:      { 1:'#A2A8BA', 2:'#727A90', 3:'#464D60', 4:'#282D3A', 5:'#07080C', 6:'#E8453C', 7:'#FFFFFF', 8:'#F0C9A0', 9:'#0E1018' },
};

// Palette, die neue Sprites bekommen wenn nichts anderes gewählt wurde.
export const DEFAULT_PALETTE = 'graustufen';

// Fallback-Farben für leere Slots beim Anlegen einer neuen Palette.
export const NEW_PALETTE_DEFAULTS = BUILTIN_PALETTES.graustufen;

// Lücken einer Palette füllen (1..n, mindestens `minSize`).
// Lückenhafte Paletten kommen aus Migration und Import; ohne Auffüllen würden
// Pixel mit einem fehlenden Index unsichtbar gerendert statt in einer Farbe.
export function completePalette(pal, minSize = 1) {
  const n = Math.min(MAX_COLORS, Math.max(minSize, paletteSize(pal || {})));
  const out = {};
  for (let i = 1; i <= n; i++) {
    out[i] = pal?.[i] || NEW_PALETTE_DEFAULTS[i] || '#888888';
  }
  return out;
}
