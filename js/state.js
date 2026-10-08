// ════════════════════════════════════════════════════════════════════
// STATE — Veränderlicher Zustand + Lookup-Helpers
// ════════════════════════════════════════════════════════════════════
// Alle anderen Module importieren von hier. Mutationen erfolgen über die
// exportierten Objekte (state.curSprite = …, sprites[id] = …), NICHT über
// lokale Re-Assignments — sonst sehen andere Module die Änderung nicht.
import { BUILTIN_PALETTES, DEFAULT_PALETTE, paletteSize, cellToColor } from './data.js';
import { t } from './i18n.js';

// ────────────────────────────────────────────────────────────────────
// Sprites — eine flache Sammlung. Jeder Sprite bringt seine Ebenen, Frames
// und seine eigene Palette mit; es gibt keine eingebauten Motive mehr.
//   sprites[id] = { name: 'Held', palette: 'golden', fps: 8, frame: 0, layer: 0,
//                   layers: [{ name, visible, locked, opacity }, …],   // unten → oben
//                   (Sprite-Ebene zusätzlich: ref, at — siehe unten)
//                   frames: [{ cels: [grid je Ebene], dur: 0 }, …] }
// `dur` ist die Dauer des Frames in ms, 0 = nach den fps des Sprites.
// `sp.grid` ist ein (nicht aufgezähltes) Kürzel auf das Bild der AKTIVEN
// Ebene im AKTUELLEN Frame — Werkzeuge, Auswahl und Effekte arbeiten damit
// unverändert dort, wo man gerade ist. Was den ganzen Sprite betrifft
// (Größe, Palette), geht über allGrids/mapFrames; was man SIEHT (Export,
// Vorschaubilder), über flatGrid.
// Die Reihenfolge der Keys ist die Anzeige-Reihenfolge (Insertion Order).
// ────────────────────────────────────────────────────────────────────
export const sprites = {};

// Eigene Paletten des Nutzers — flacher Namensraum neben den Built-ins.
//   customPalettes['neon'] = { 1:'#…', …, n:'#…' }   (n ≤ 255)
export const customPalettes = {};

// Material je Palettenfarbe — nur für den Export "JSON (Spiel)".
// Liegt NEBEN den Paletten statt darin, weil eine Palette überall als
// reines Index → Hex-Objekt gelesen wird. Gilt auch für eingebaute Paletten.
//   paletteMaterials['golden'] = { 1: 'sand', 5: 'stone' }
// Fehlende Einträge bedeuten "none" (siehe MATERIALS in gamejson.js).
export const paletteMaterials = {};

// UI-Zustand (alles veränderlich)
export const state = {
  /** @type {string|null} id in `sprites`, null solange keiner existiert */
  curSprite:     null,
  /** @type {number|string} Zahl = Palette-Index | String "#RRGGBB" = freie Farbe */
  curColor:      1,
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
  showColor:     false,    // aktuelle Farbe im Bild hervorheben (alles andere abgedunkelt)
  // Palette, die das Paletten-Panel gerade ZEIGT. null = die des Sprites.
  // Anschauen ändert nichts am Sprite — zugewiesen wird nur per Knopf.
  /** @type {string|null} */
  palPreview:    null,

  // Vorschau-Panel: Pixelgröße, 0 = einpassen (js/preview.js).
  previewScale:  0,

  // Animation: Nachbar-Frames durchscheinen lassen; Abspielen läuft gerade.
  onion:         false,
  playing:       false,

  // Hilfslinien (js/guides.js): anzeigen; Verschieben-Modus (nicht gespeichert).
  showGuides:    true,
  guideEdit:     false,

  // Vorschau der Formen-Werkzeuge zwischen pointerdown und pointerup.
  // Liegt hier, damit renderEditor sie ohne Umweg zeichnen kann.
  /** @type {{cells: [number, number][], color: number|string}} Zellen als [x, y] */
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

// ── Frames ──────────────────────────────────────────────────────────
export const DEFAULT_FPS = 8;
export const MAX_FPS = 60;

// `sp.grid` als Kürzel auf das aktive Bild einrichten. Nicht aufgezählt,
// damit es weder im Speicherstand noch in Kopien doppelt auftaucht.
export function attachGrid(sp) {
  Object.defineProperty(sp, 'grid', {
    get() { return this.frames[this.frame].cels[this.layer]; },
    set(g) { this.frames[this.frame].cels[this.layer] = g; },
    enumerable: false,
    configurable: true,
  });
  return sp;
}

// ── Ebenen ──────────────────────────────────────────────────────────
export function defaultLayer(n = 1) {
  return { name: t('ly.name', { n }), visible: true, locked: false, opacity: 1 };
}

export function normalizeLayer(l, n) {
  const op = Number(l?.opacity);
  const out = {
    name: typeof l?.name === 'string' && l.name.trim() ? l.name.trim() : t('ly.name', { n }),
    visible: l?.visible !== false,
    locked: !!l?.locked,
    opacity: Number.isFinite(op) ? Math.max(0, Math.min(1, op)) : 1,
  };
  if (typeof l?.ref === 'string' && l.ref) {
    out.ref = l.ref;
    out.at = (Array.isArray(l.at) ? l.at : []).map(normalizePlace);
  }
  return out;
}

// ── Sprite-Ebenen ───────────────────────────────────────────────────
// Eine Ebene kann statt eigener Pixel einen ANDEREN Sprite zeigen — einen
// Arm, einen Kopf, den man für sich gezeichnet hat. So setzt man eine Figur
// aus Teilen zusammen und animiert sie, indem man die Teile je Frame
// verschiebt. Es ist ein Verweis, keine Kopie: malt man am Arm weiter,
// ändert er sich in jeder Figur mit.
//
//   layer.ref    id des gezeigten Sprites
//   layer.at[f]  wie er in Frame f liegt: { x, y, f, rot, fx, fy }
//                  x, y    linke obere Ecke (darf auch außerhalb liegen)
//                  f       welcher Frame des Teils — so blinzelt ein Auge
//                  rot     Vierteldrehungen im Uhrzeigersinn (0–3)
//                  fx, fy  waagerecht / senkrecht gespiegelt
//
// Die Ebene behält trotzdem in jedem Frame ein (leeres) eigenes Bild. Alles,
// was über alle Bilder läuft — Größe ändern, Undo, Speichern —, muss so von
// Sprite-Ebenen nichts wissen. Gemalt wird in sie nicht (app.js
// layerBlocked); was sie zeigt, liefert layerGrid().
export const defaultPlace = () => ({ x: 0, y: 0, f: 0, rot: 0, fx: false, fy: false });

export function normalizePlace(p) {
  const int = v => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
  return {
    x: int(p?.x),
    y: int(p?.y),
    f: Math.max(0, int(p?.f)),
    rot: ((int(p?.rot) % 4) + 4) % 4,
    fx: !!p?.fx,
    fy: !!p?.fy,
  };
}

export const isRefLayer = L => typeof L?.ref === 'string';

// Ebene kopieren — die Positionen einer Sprite-Ebene dürfen sich Original
// und Kopie nicht teilen (Undo, Ebene duplizieren, Sprite duplizieren).
export function copyLayer(L) {
  return isRefLayer(L) ? { ...L, at: L.at.map(p => ({ ...p })) } : { ...L };
}

// Die Positions-Listen aller Sprite-Ebenen — Frame-Aktionen (anlegen,
// löschen, verschieben) müssen sie genauso umordnen wie die Frames.
export function refPlaceLists(sp) {
  return sp.layers.filter(isRefLayer).map(L => L.at);
}

// Bild drehen und spiegeln: erst spiegeln, dann `rot` Vierteldrehungen im
// Uhrzeigersinn. Liefert immer ein neues Grid.
export function transformGrid(g, rot = 0, fx = false, fy = false) {
  let out = g.map(row => (fx ? [...row].reverse() : [...row]));
  if (fy) out.reverse();
  for (let k = 0; k < (((rot % 4) + 4) % 4); k++) {
    const H = out.length, W = out[0].length;
    out = Array.from({ length: W }, (_, y) => Array.from({ length: H }, (_, x) => out[H - 1 - x][y]));
  }
  return out;
}

// Gerade aufgelöste Verweise: zeigt A auf B und B wieder auf A, bricht die
// Kette hier ab, statt endlos zu laufen.
const resolving = new Set();

// Was Ebene `li` in Frame `f` zeigt. Normale Ebene: ihr Bild. Sprite-Ebene:
// das Teil, an seine Stelle gesetzt, in der Größe des Sprites. Hat das Teil
// eine andere Palette, kommen seine Farben als freie Farben herüber — ein
// Index meinte dort eine andere Farbe.
export function layerGrid(sp, li, f = sp.frame) {
  const L = sp.layers[li];
  const own = sp.frames[f].cels[li];
  if (!isRefLayer(L)) return own;
  const H = own.length, W = own[0].length;
  const out = Array.from({ length: H }, () => Array(W).fill(0));
  const src = sprites[L.ref];
  if (!src || resolving.has(L.ref)) return out;
  const p = L.at[f] || defaultPlace();
  let g;
  resolving.add(L.ref);
  try { g = flatGrid(src, Math.min(p.f, src.frames.length - 1)); } finally { resolving.delete(L.ref); }
  g = transformGrid(g, p.rot, p.fx, p.fy);
  const same = src.palette === sp.palette;
  const spal = same ? null : getPaletteByName(src.palette);
  for (let y = 0; y < g.length; y++) {
    const ty = p.y + y;
    if (ty < 0 || ty >= H) continue;
    for (let x = 0; x < g[y].length; x++) {
      const tx = p.x + x, v = g[y][x];
      if (v === 0 || tx < 0 || tx >= W) continue;
      out[ty][tx] = same ? v : (cellToColor(v, spal) || '#000000').toLowerCase();
    }
  }
  return out;
}

// Zeigt Sprite `id` — direkt oder über weitere Sprite-Ebenen — auf `target`?
// Dann darf `target` nicht als Ebene in `id` landen: es zeigte sich selbst.
export function refersTo(id, target, seen = new Set()) {
  if (id === target) return true;
  if (seen.has(id)) return false;
  seen.add(id);
  const sp = sprites[id];
  return !!sp && sp.layers.some(L => isRefLayer(L) && refersTo(L.ref, target, seen));
}

// Leeres Bild in der Größe eines vorhandenen.
export const blankLike = g => g.map(row => row.map(() => 0));

// ── Hilfslinien ─────────────────────────────────────────────────────
// Je Sprite: freie Linien auf Pixelgrenzen (h = y-Werte, v = x-Werte) und
// die Figuren-Einteilung (heads Kopfhöhen zwischen top und bottom).
// Reine Anzeige — kein Undo, kein Export.
export const FIGURE_HEADS = [2, 3, 4, 6, 8];

export function normalizeGuides(g, W, H) {
  const ints = (a, max) => [...new Set((Array.isArray(a) ? a : []).map(Number)
    .filter(v => Number.isInteger(v) && v >= 0 && v <= max))].sort((a, b) => a - b);
  const heads = FIGURE_HEADS.includes(Number(g?.heads)) ? Number(g.heads) : 0;
  const top = Math.max(0, Math.min(H - 1, Number.isInteger(g?.top) ? g.top : 0));
  const bottom = Math.max(top + 1, Math.min(H, Number.isInteger(g?.bottom) ? g.bottom : H));
  return { h: ints(g?.h, H), v: ints(g?.v, W), heads, top, bottom };
}

// Sprite-Datensatz aus Rohdaten bauen (Anlegen, Laden, Import).
// Frames als { cels: [grid, …], dur } oder — eine Ebene — als { grid, dur }.
export function makeSprite({ name, palette, frames, fps = DEFAULT_FPS, frame = 0, layers = null, layer = 0, guides = null }) {
  const fr = frames.map(f => ({ cels: f.cels ? [...f.cels] : [f.grid], dur: Math.max(0, Math.round(f.dur) || 0) }));
  const n = Math.max(...fr.map(f => f.cels.length));
  for (const f of fr) while (f.cels.length < n) f.cels.push(blankLike(f.cels[0]));
  const ly = Array.from({ length: n }, (_, i) => normalizeLayer(layers?.[i], i + 1));
  // Je Frame eine Position — fehlende übernehmen die letzte bekannte.
  for (const L of ly) if (isRefLayer(L)) {
    L.at.length = Math.min(L.at.length, fr.length);
    while (L.at.length < fr.length) L.at.push({ ...(L.at[L.at.length - 1] || defaultPlace()) });
  }
  return attachGrid({
    name,
    palette,
    fps: Math.max(1, Math.min(MAX_FPS, Math.round(fps) || DEFAULT_FPS)),
    frame: Math.max(0, Math.min(fr.length - 1, frame | 0)),
    layer: Math.max(0, Math.min(n - 1, layer | 0)),
    layers: ly,
    frames: fr,
    guides: normalizeGuides(guides, fr[0].cels[0][0].length, fr[0].cels[0].length),
  });
}

// Alle Bilder eines Sprites (jeder Frame, jede Ebene) — für alles, was den
// ganzen Sprite betrifft: Palette umfärben, Bildfarben, Begrenzung.
export function allGrids(sp) {
  return sp.frames.flatMap(f => f.cels);
}

// Jedes Bild (jeder Frame, jede Ebene) durch fn(grid) ersetzen — Größe
// ändern, drehen, spiegeln …
export function mapFrames(sp, fn) {
  sp.frames.forEach(f => { f.cels = f.cels.map(g => fn(g)); });
}

// Zwei Farben mischen: `top` mit Deckkraft a über `below`.
function mixHex(below, top, a) {
  const c = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const v = i => Math.round(c(below, i) * (1 - a) + c(top, i) * a).toString(16).padStart(2, '0');
  return '#' + v(0) + v(1) + v(2);
}

// Was man in Frame f SIEHT: alle sichtbaren Ebenen übereinander. Bei voller
// Deckkraft bleibt der Wert (Palette-Index oder freie Farbe) erhalten; eine
// halbdurchsichtige Ebene wird mit dem Pixel darunter zu einer freien Farbe
// gemischt. Über leerem Grund bleibt sie deckend — Pixel kennen keine
// Transparenz-Stufen. Mit einer einzigen, sichtbaren, deckenden Ebene ist
// das Ergebnis das Bild selbst (nicht verändern!).
export function flatGrid(sp, f = sp.frame) {
  const cels = sp.frames[f].cels;
  const L0 = sp.layers[0];
  if (cels.length === 1 && L0.visible && L0.opacity >= 1 && !isRefLayer(L0)) return cels[0];
  const H = cels[0].length, W = cels[0][0].length;
  const pal = getPaletteByName(sp.palette);
  const out = Array.from({ length: H }, () => Array(W).fill(0));
  sp.layers.forEach((L, li) => {
    if (!L.visible || L.opacity <= 0) return;
    const g = layerGrid(sp, li, f);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = g[y][x];
      if (v === 0) continue;
      if (L.opacity >= 1 || out[y][x] === 0) { out[y][x] = L.opacity >= 1 ? v : (cellToColor(v, pal) || '#000000').toLowerCase(); continue; }
      const top = cellToColor(v, pal), below = cellToColor(out[y][x], pal);
      out[y][x] = top && below ? mixHex(below.toLowerCase(), top.toLowerCase(), L.opacity) : v;
    }
  });
  return out;
}

// Dauer eines Frames in ms (eigene Dauer oder nach den fps des Sprites).
export function frameDuration(sp, i) {
  return sp.frames[i]?.dur || Math.round(1000 / (sp.fps || DEFAULT_FPS));
}

// Sprite anlegen und zurückgeben. Setzt ihn NICHT automatisch aktiv.
// `frames` ([{ grid | cels, dur }]) geht vor `grid` (ein einzelnes Bild).
export function createSprite({ name, size = 24, palette = DEFAULT_PALETTE, grid = null, frames = null, fps = DEFAULT_FPS, layers = null, layer = 0, guides = null }) {
  const id = makeSpriteId(name);
  sprites[id] = makeSprite({
    name: (name || id).trim() || id,
    palette: paletteExists(palette) ? palette : DEFAULT_PALETTE,
    frames: frames && frames.length ? frames : [{ grid: grid || emptyGrid(size), dur: 0 }],
    fps,
    layers,
    layer,
    guides,
  });
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

// Sortierte Liste aller Sprites für die Übersicht: [{ id, name, palette, grid, frames, … }]
// `grid` ist der aktuelle Frame (das Kürzel überlebt das Ausbreiten nicht).
export function listSprites() {
  return Object.keys(sprites).map(id => ({ id, ...sprites[id], grid: sprites[id].grid }));
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

// Höchster gültiger Palette-Index = Anzahl Farben der Sprite-Palette.
export function getMaxIdx() {
  return paletteSize(getPal());
}

// Name der Palette, die das Paletten-Panel gerade zeigt.
export function getPreviewName() {
  const n = state.palPreview;
  return n && paletteExists(n) ? n : getPaletteName();
}
