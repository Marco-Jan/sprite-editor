// ════════════════════════════════════════════════════════════════════
// STATE — Veränderlicher Zustand + Lookup-Helpers
// ════════════════════════════════════════════════════════════════════
// Alle anderen Module importieren von hier. Mutationen erfolgen über die
// exportierten Objekte (state.curSprite = …, sprites[id] = …), NICHT über
// lokale Re-Assignments — sonst sehen andere Module die Änderung nicht.
import { BUILTIN_PALETTES, DEFAULT_PALETTE, MAX_IDX } from './data.js';

// ────────────────────────────────────────────────────────────────────
// Sprites — eine flache Sammlung. Jeder Sprite bringt sein eigenes Grid
// und seine eigene Palette mit; es gibt keine eingebauten Motive mehr.
//   sprites[id] = { name: 'Held', palette: 'golden', grid: [[0,1,…], …] }
// Die Reihenfolge der Keys ist die Anzeige-Reihenfolge (Insertion Order).
// ────────────────────────────────────────────────────────────────────
export const sprites = {};

// Eigene Paletten des Nutzers — flacher Namensraum neben den Built-ins.
//   customPalettes['neon'] = { 1:'#…', …, 9:'#…' }
export const customPalettes = {};

// Material je Palettenfarbe — nur für den Export "JSON (Spiel)".
// Liegt NEBEN den Paletten statt darin, weil eine Palette überall als
// reines Index → Hex-Objekt gelesen wird. Gilt auch für eingebaute Paletten.
//   paletteMaterials['golden'] = { 1: 'sand', 5: 'stone' }
// Fehlende Einträge bedeuten "none" (siehe MATERIALS in gamejson.js).
export const paletteMaterials = {};

// UI-Zustand (alles veränderlich)
export const state = {
  curSprite:     null,     // id in `sprites`, null solange keiner existiert
  curColor:      1,        // Zahl = Palette-Index | String "#RRGGBB" = freie Farbe
  cellSize:      16,
  tool:          'pencil', // 'pencil' | 'brush' | 'spray' | 'fill' | 'eraser' | 'wand' | 'select'
  brushSize:     1,        // Kantenlänge / Radius in Zellen
  brushStrength: 80,       // 1–100 — Brush/Eraser: Dichte, Spray: Pixel/Event
  wandTolerance: 25,       // 0–100 % — Zauberstab: Farb-Ähnlichkeitsschwelle
  isDrawing:     false,
  isErasing:     false,
  editorBg:      'dark',   // 'dark' | 'bw'
  outputFormat:  'ts',     // Schlüssel aus CODE_FORMATS (codegen.js)
  mirror:        'off',    // 'off' | 'x' (senkrechte Achse) | 'y' | 'both'
  shapeFill:     false,    // Rechteck/Ellipse gefüllt statt nur Kontur

  // Referenz-Ebene: ein zweiter Sprite, der halbdurchsichtig mitgezeichnet
  // wird. Zum Abpausen und um Teile von einem Sprite in den anderen zu
  // übernehmen — bearbeitet wird immer nur der aktive Sprite.
  refSprite:     null,     // id in `sprites` | null
  refVisible:    true,
  refOpacity:    0.45,     // 0.05 – 1
  refFront:      false,    // true = über dem aktiven Sprite

  // Vorschau der Formen-Werkzeuge zwischen pointerdown und pointerup.
  // Liegt hier, damit renderEditor sie ohne Umweg zeichnen kann.
  shape: { cells: [], color: 0 },
};

// ────────────────────────────────────────────────────────────────────
// AUSWAHL — rechteckiger Bereich zum Ausschneiden/Verschieben
// ────────────────────────────────────────────────────────────────────
// `rect` ist die Wahrheit über Position und Größe — auch während eines
// Verschiebens (dann wandert rect mit dem Zeiger). `float` hält die
// herausgelösten Zellen, solange sie in der Luft hängen: das Grid ist an
// der Quelle bereits leer, gezeichnet wird der Block aus `float`.
// Bewusst nicht persistiert — eine Auswahl überlebt keinen Reload.
// `mask` macht aus dem Rechteck eine beliebige Form: null heißt "volles
// Rechteck", sonst ist es ein boolean-Raster relativ zu rect. Damit tragen
// Lasso und Farbauswahl dieselbe Mechanik wie die Rechteck-Auswahl.
export const selection = {
  rect:  null,   // {x, y, w, h} in Grid-Zellen (Bounding-Box)
  mask:  null,   // null | boolean[h][w] relativ zu rect
  float: null,   // 2D-Array der schwebenden Zellen | null
  owner: null,   // aus WELCHEM Sprite `float` gehoben wurde
  mode:  null,   // null | 'marquee' | 'lasso' | 'move'
  anchor: null,  // {x,y} — Startecke beim Aufziehen
  grab:  null,   // {dx,dy} — Griffversatz innerhalb der Auswahl beim Ziehen
  path:  null,   // Stützpunkte der Lasso-Spur, solange gezogen wird
};

// Auswahl vergessen. Wirft einen schwebenden Inhalt WEG — Aufrufer müssen
// ihn vorher mit commitFloat() absetzen, sonst fehlt er hinterher im Bild.
// Wer sich da nicht sicher ist, nimmt deselect() aus selection.js.
export function clearSelection() {
  selection.rect = null;
  selection.mask = null;
  selection.float = null;
  selection.owner = null;
  selection.mode = null;
  selection.anchor = null;
  selection.grab = null;
  selection.path = null;
}

export function isInSelection(x, y) {
  const r = selection.rect;
  if (!r || x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) return false;
  return !selection.mask || !!selection.mask[y - r.y][x - r.x];
}

// ────────────────────────────────────────────────────────────────────
// Sprite-Helpers
// ────────────────────────────────────────────────────────────────────

// Eindeutige Sprite-ID aus einem Anzeigenamen ableiten.
export function makeSpriteId(name) {
  const base = (name || 'sprite').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '') || 'sprite';
  if (!sprites[base]) return base;
  let i = 2;
  while (sprites[base + '_' + i]) i++;
  return base + '_' + i;
}

// Leeres Grid der Kantenlänge `size`.
export function emptyGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

// Sprite anlegen und zurückgeben. Setzt ihn NICHT automatisch aktiv.
export function createSprite({ name, size = 24, palette = DEFAULT_PALETTE, grid = null }) {
  const id = makeSpriteId(name);
  sprites[id] = {
    name: (name || id).trim() || id,
    palette: paletteExists(palette) ? palette : DEFAULT_PALETTE,
    grid: grid || emptyGrid(size),
  };
  return id;
}

// Aktueller Sprite-Datensatz (oder null wenn keiner existiert).
export function getSprite() {
  return state.curSprite ? sprites[state.curSprite] || null : null;
}

// Aktuelles Grid. Fällt auf ein leeres 24×24-Grid zurück, damit Render-Code
// nie gegen null läuft (passiert nur im Moment zwischen Löschen und Neuwahl).
export function getGrid() {
  return getSprite()?.grid || emptyGrid(24);
}

// Sortierte Liste aller Sprites für die Übersicht: [{ id, name, palette, grid }]
export function listSprites() {
  return Object.keys(sprites).map(id => ({ id, ...sprites[id] }));
}

// Ersten verfügbaren Sprite aktiv setzen (nach Löschen o.ä.).
export function selectFirstSprite() {
  state.curSprite = Object.keys(sprites)[0] || null;
}

// ────────────────────────────────────────────────────────────────────
// Paletten-Helpers
// ────────────────────────────────────────────────────────────────────

export function paletteExists(name) {
  return !!(customPalettes[name] || BUILTIN_PALETTES[name]);
}

export function isCustomPalette(name) {
  return !!customPalettes[name];
}

// Palette-Objekt nach Namen. Eigene Paletten haben Vorrang vor Built-ins,
// damit man eine gleichnamige Built-in überschreiben kann.
export function getPaletteByName(name) {
  return customPalettes[name] || BUILTIN_PALETTES[name] || BUILTIN_PALETTES[DEFAULT_PALETTE];
}

// Palette des aktuellen Sprites.
export function getPal() {
  return getPaletteByName(getSprite()?.palette || DEFAULT_PALETTE);
}

// Materialien der Palette des aktuellen Sprites (nie null).
export function getPalMaterials() {
  return paletteMaterials[getPaletteName()] || {};
}

// Name der aktuell aktiven Palette.
export function getPaletteName() {
  return getSprite()?.palette || DEFAULT_PALETTE;
}

// Alle wählbaren Paletten: erst Built-ins, dann eigene.
//   → [{ name, isCustom }]
export function getAllPaletteOptions() {
  return [
    ...Object.keys(BUILTIN_PALETTES).map(name => ({ name, isCustom: false })),
    ...Object.keys(customPalettes).map(name => ({ name, isCustom: true })),
  ];
}

// Eindeutigen Palettennamen finden (foto, foto2, …).
export function uniquePaletteName(base) {
  if (!paletteExists(base)) return base;
  let i = 2;
  while (paletteExists(base + i)) i++;
  return base + i;
}

// Höchster gültiger Palette-Index — im generischen System immer gleich.
export function getMaxIdx() {
  return MAX_IDX;
}
