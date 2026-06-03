// ════════════════════════════════════════════════════════════════════
// STATE — Veränderlicher Zustand + Lookup-Helpers
// ════════════════════════════════════════════════════════════════════
// Alle anderen Module importieren von hier. Mutationen erfolgen über das
// `state`-Objekt (z.B. state.curType = 'cat'), NICHT über lokale Re-Assignments
// — sonst sehen andere Module die Änderung nicht.
import { PALETTE_SETS, ORIG, dc } from './data.js';

// UI-Zustand (alles veränderlich)
export const state = {
  curType:    'dog',
  curState:   'normal',
  curVariant: 'golden',
  curColor:   1,        // Zahl = Palette-Index | String "#RRGGBB" = freie Pipette-Farbe
  cellSize:   16,
  tool:         'pencil', // 'pencil' | 'brush' | 'spray' | 'fill' | 'eraser'
  brushSize:    1,        // Radius / Breite in Zellen
  brushStrength: 80,      // 1–100 — Brush/Eraser: Dichte, Spray: Pixel/Event
  isDrawing:    false,
  isErasing:    false,
  editorBg:     'dark',   // 'dark' | 'bw'
  openGroupKey: null,     // welche Sprite-Gruppe aufgeklappt ist
};

// Working Grids — Kopien der ORIG, werden vom User editiert.
// Custom-Sprites werden als `grids['custom_NAME'] = grid` ergänzt.
export const grids = {
  dog: { normal: dc(ORIG.dog.normal), happy: dc(ORIG.dog.happy), sad: dc(ORIG.dog.sad) },
  cat: { normal: dc(ORIG.cat.normal), happy: dc(ORIG.cat.happy), sad: dc(ORIG.cat.sad) },
};

// Metadaten für Custom-Sprites: key → { palType: 'dog'|'cat'|'neutral', name }
export const customMeta = {};

// Custom-Paletten pro Typ: { dog: { name: {1:'#..', ...} }, cat: {...}, neutral: {...} }
export const customPalettes = { dog: {}, cat: {}, neutral: {} };

// ────────────────────────────────────────────────────────────────────
// Helpers — gehen davon aus dass state/grids/customMeta/customPalettes
// die einzige Wahrheit sind.
// ────────────────────────────────────────────────────────────────────

// Aktuelles Grid: built-in dog/cat hat 3 States (normal/happy/sad),
// Custom hat nur ein Grid.
export function getGrid() {
  if (state.curType.startsWith('custom_')) return grids[state.curType];
  return grids[state.curType][state.curState];
}

// Palette-Typ eines Sprites: Custom liest palType aus den Metadaten,
// Built-in (dog/cat) ist selbst schon der Typ.
export function palTypeOf(type) {
  return type.startsWith('custom_')
    ? (customMeta[type]?.palType || 'dog')
    : type;
}

// Palette für (type, variant): Custom-Palette hat Vorrang vor Built-in.
export function getPal(type, variant) {
  const t = palTypeOf(type);
  if (customPalettes[t] && customPalettes[t][variant]) {
    return customPalettes[t][variant];
  }
  return PALETTE_SETS[t].palettes[variant];
}

// Liste aller Varianten für einen Typ: Built-in + Custom-Paletten.
export function getVariants(type) {
  const t = palTypeOf(type);
  const builtin = PALETTE_SETS[t].variants;
  const custom = customPalettes[t] ? Object.keys(customPalettes[t]) : [];
  return [...builtin, ...custom];
}

// True wenn variant eine User-erstellte Palette ist (für Edit/Delete-X).
export function isCustomVariant(type, variant) {
  const t = palTypeOf(type);
  return !!(customPalettes[t] && customPalettes[t][variant]);
}

// Welcher Palette-Typ liegt dem aktuellen Sprite zugrunde?
export function getCurrentPalType() {
  return palTypeOf(state.curType);
}

// Höchster gültiger Palette-Index für den aktuellen Typ (Katze/Neutral=9, Hund=8).
export function getMaxIdx() {
  return PALETTE_SETS[getCurrentPalType()].maxIdx;
}
