// ════════════════════════════════════════════════════════════════════
// DATA — Konstanten: Farb-Labels + eingebaute Farbpaletten
// ════════════════════════════════════════════════════════════════════
// Das Palettensystem ist bewusst generisch: eine Palette ist nichts weiter
// als ein Mapping Index → Hex-Farbe. Index 0 ist immer transparent, 1–9 sind
// frei belegbar. Es gibt keine an ein Motiv gebundenen Slots mehr.

// Deep-Copy Helper für Grids (2D-Arrays).
export function dc(a) { return a.map(r => [...r]); }

// Höchster belegbarer Palette-Index. 0 = transparent, 1..MAX_IDX = Farben.
export const MAX_IDX = 9;

// Semantische Bedeutung der Palette-Indizes (UI-Labels).
// 1–4 sind die "Tonleiter" (hell → dunkel) eines Materials, 5 die Kontur,
// 6–9 freie Akzente. Das ist eine Konvention, keine technische Vorgabe —
// jeder Index kann jede Farbe tragen.
export const COLOR_LABELS = {
  0: 'Transparent',
  1: 'Ton 1 — hellster',
  2: 'Ton 2',
  3: 'Ton 3',
  4: 'Ton 4 — dunkelster',
  5: 'Outline / Kontur',
  6: 'Akzent A',
  7: 'Highlight',
  8: 'Akzent B',
  9: 'Akzent C',
};

// Kurzform der Labels für enge Stellen (Quick-Palette-Tooltip).
export const COLOR_LABELS_SHORT = {
  0: 'Transparent',
  1: 'Ton 1', 2: 'Ton 2', 3: 'Ton 3', 4: 'Ton 4',
  5: 'Outline', 6: 'Akzent A', 7: 'Highlight', 8: 'Akzent B', 9: 'Akzent C',
};

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
};

// Palette, die neue Sprites bekommen wenn nichts anderes gewählt wurde.
export const DEFAULT_PALETTE = 'graustufen';

// Fallback-Farben für leere Slots beim Anlegen einer neuen Palette.
export const NEW_PALETTE_DEFAULTS = BUILTIN_PALETTES.graustufen;

// Eine Palette auf alle Indizes 1..MAX_IDX auffüllen.
// Lückenhafte Paletten kommen aus Migration und Import; ohne Auffüllen würden
// Pixel mit einem fehlenden Index unsichtbar gerendert statt in einer Farbe.
export function completePalette(pal) {
  const out = {};
  for (let i = 1; i <= MAX_IDX; i++) {
    out[i] = pal?.[i] || NEW_PALETTE_DEFAULTS[i];
  }
  return out;
}
