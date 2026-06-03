// ════════════════════════════════════════════════════════════════════
// STATE — Veränderlicher Zustand + Lookup-Helpers
// ════════════════════════════════════════════════════════════════════
// Alle anderen Module importieren von hier. Mutationen erfolgen über das
// `state`-Objekt (z.B. state.curType = 'cat'), NICHT über lokale Re-Assignments
// — sonst sehen andere Module die Änderung nicht.
import {
  DOG_PALETTES, CAT_PALETTES, DOG_VARIANTS, CAT_VARIANTS,
  ORIG, dc,
} from './data.js';

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

// Metadaten für Custom-Sprites: key → { palType: 'dog'|'cat', name }
export const customMeta = {};

// Custom-Paletten pro Tierart: { dog: { name: {1:'#..', ...} }, cat: {...} }
export const customPalettes = { dog: {}, cat: {} };

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

// Palette für (type, variant): Custom-Palette hat Vorrang vor Built-in.
export function getPal(type, variant) {
  const t = type.startsWith('custom_')
    ? (customMeta[type]?.palType || 'dog')
    : type;
  if (customPalettes[t] && customPalettes[t][variant]) {
    return customPalettes[t][variant];
  }
  return t === 'dog' ? DOG_PALETTES[variant] : CAT_PALETTES[variant];
}

// Liste aller Varianten für einen Typ: Built-in + Custom-Paletten.
export function getVariants(type) {
  const t = type.startsWith('custom_')
    ? (customMeta[type]?.palType || 'dog')
    : type;
  const builtin = t === 'dog' ? DOG_VARIANTS : CAT_VARIANTS;
  const custom = customPalettes[t] ? Object.keys(customPalettes[t]) : [];
  return [...builtin, ...custom];
}

// True wenn variant eine User-erstellte Palette ist (für Edit/Delete-X).
export function isCustomVariant(type, variant) {
  const t = type.startsWith('custom_')
    ? (customMeta[type]?.palType || 'dog')
    : type;
  return !!(customPalettes[t] && customPalettes[t][variant]);
}

// Welcher Palette-Typ liegt dem aktuellen Sprite zugrunde?
export function getCurrentPalType() {
  return state.curType.startsWith('custom_')
    ? (customMeta[state.curType]?.palType || 'dog')
    : state.curType;
}

// Höchster gültiger Palette-Index für den aktuellen Typ (Katze=9, Hund=8).
export function getMaxIdx() {
  return getCurrentPalType() === 'cat' ? 9 : 8;
}
