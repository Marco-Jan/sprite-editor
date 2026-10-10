// ════════════════════════════════════════════════════════════════════
// FRAMES — Animation: Frames anlegen, wechseln, abspielen, Timeline
// ════════════════════════════════════════════════════════════════════
// Jeder Sprite hat mindestens einen Frame (state.js). Gezeichnet wird immer
// in den aktuellen Frame — über sp.grid, deshalb wissen die Werkzeuge von
// alldem nichts. Hier liegt nur, was die Frames als Folge betrifft.
//
// Frame-Aktionen (anlegen, duplizieren, löschen, verschieben, Dauer, fps)
// laufen durch recordOp() und sind damit normale Undo-Schritte. Bloßes
// Wechseln des Frames ist keine Änderung.
//
// Abspielen läuft in der Zeichenfläche. Gezeichnet wird dabei nicht: ein
// Tipp auf die Fläche hält an (app.js), jede Frame-Aktion ebenso.
import { remapCells, samePalette } from './remap.js';
import { state, getSprite, getPaletteByName, clearSelection, frameDuration, MAX_FPS, thumbGrid, isLinked, newFrameCels } from './state.js';
import { cellToColor } from './data.js';
import { renderAll, renderEditor, renderCallbacks } from './render.js';
import { recordOp } from './history.js';
import { commitFloat } from './selection.js';
import { saveState } from './storage.js';
import { showInfoToast } from './toast.js';
import { iconSvg } from './icons.js';
import { t } from './i18n.js';
import { isMobileLayout } from './layout.js';
import {
  rangeOf, rangeSize, inRange, clampRange, canShift, shiftCels, clearCels, copyCels, pasteCels,
  linkCels, unlinkCels,
} from './cels.js';
import { frameLabel, THUMB_SIZE_MIN, THUMB_SIZE_MAX } from './onion.js';
import { TAG_COLORS, TAG_DIRS, tagsInsert, tagsDelete, tagAt, tagLanes, nextPlayFrame } from './tags.js';
import {
  setActiveLayer, toggleVisible, toggleLocked, toggleContinuous, addLayer, duplicateLayer, deleteLayer,
  moveLayer, renameLayer,
} from './layers.js';

/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);
// Die Vorschaubilder wachsen mit dem Platz, den die Leiste hergibt: bei
// wenigen Frames werden sie groß, bei vielen schrumpfen sie bis CELL_MIN und
// die Reihe scrollt. CELL ist die Kantenlänge des ganzen Knopfes, das Bild
// sitzt abzüglich Rand und Polsterung darin.
const CELL_MIN = 30;
const CELL_MIN_TOUCH = 34;   // Handy: so groß wie die Styles es ohnehin erzwingen
const CELL_MAX = 48;    // mehr würde die Zeichenfläche beschneiden — unter
                        // der Kopfzeile stehen ja noch die Ebenen
const CELL_PAD = 6;   // 1 px Rand + 2 px Polsterung je Seite
const VISIBLE_MAX = 20;         // so viele Frames passen höchstens nebeneinander
const VISIBLE_MAX_TOUCH = 6;    // Handy: lieber sechs kleine als zwei grosse
let cell = 44;        // zuletzt berechnete Kantenlänge

// ── Mehrfachauswahl ─────────────────────────────────────────────────
// Wie im Dateimanager: Strg/Cmd klickt einzelne Frames dazu, Shift eine
// Spanne, ein einfacher Klick setzt alles zurück. `sel` ist die *zusätzliche*
// Auswahl — zählt sie weniger als zwei Frames, gilt schlicht der aktive.
// Darum muss nichts synchron gehalten werden: eine veraltete Auswahl fällt
// von selbst auf den aktiven Frame zurück.
let sel = new Set();
let anchor = null;      // Ankerpunkt für Shift
let selSprite = null;   // zu welchem Sprite die Auswahl gehört

function resetSel() { sel = new Set(); anchor = null; }

// Am Handy gibt es weder Strg noch Shift. Statt dessen ein Schalter: ist er
// an, markiert ein Tipp den Frame, statt zu ihm zu wechseln — wie die
// Mehrfachauswahl in einer Foto-App. Am breiten Fenster bleibt es bei
// Strg/Shift, dort ist der Knopf ausgeblendet (styles.css).
let multiMode = false;

function setMultiMode(on) {
  multiMode = on;
  if (!on) resetSel();
  const b = $('tl-multi');
  if (b) {
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
    b.title = t(on ? 'tl.multiOff' : 'tl.multi');
    b.setAttribute('aria-label', b.title);
  }
  renderTimeline();
}

// Die Frames, auf die eine Aktion wirkt — immer aufsteigend.
function selectedFrames() {
  const sp = getSprite();
  if (!sp) return [];
  const ids = [...sel].filter(i => Number.isInteger(i) && i >= 0 && i < sp.frames.length);
  return ids.length > 1 ? ids.sort((a, b) => a - b) : [sp.frame];
}

const selectedCount = () => selectedFrames().length;

// Für den Export: auf welche Frames wirkt eine Aktion gerade? Ohne
// Mehrfachauswahl ist das schlicht der aktive Frame (js/export.js).
export const selectedFrameIndices = () => selectedFrames();

// Schwebender Inhalt und Auswahl gehören zum Frame, den man verlässt.
function leaveFrame() {
  commitFloat();
  clearSelection();
}

// ────────────────────────────────────────────────────────────────────
// Wechseln
// ────────────────────────────────────────────────────────────────────
// quiet: beim Abspielen — nur die Fläche und die Markierung neu zeichnen.
function showFrame(i, quiet = false) {
  const sp = getSprite();
  if (!sp) return;
  const n = sp.frames.length;
  i = ((i % n) + n) % n;
  if (i === sp.frame) return;
  if (quiet) {
    sp.frame = i;
    renderEditor();
    markActive();
    return;
  }
  leaveFrame();
  sp.frame = i;
  renderAll();
  saveState();
}

export function goFrame(i) { stop(); showFrame(i); }

// Sprung auf eine eingetippte Nummer — so gezählt wie in der Timeline
// (ab 0 oder ab 1, Timeline-Menü).
export function goFrameNumber(v) {
  const sp = getSprite();
  if (!sp) return;
  const i = Math.round(Number(v)) - frameLabel(0, state.tlOpts);
  if (v === '' || !Number.isFinite(i) || i < 0 || i >= sp.frames.length) { renderTimeline(); return; }
  resetSel();
  goFrame(i);
  renderTimeline();
}
export function nextFrame() { const sp = getSprite(); if (sp) goFrame(sp.frame + 1); }
// Ganz an den Anfang bzw. ans Ende — bei langen Animationen spart das
// vierzig Klicks. Die Auswahl fällt dabei weg, wie bei jedem einfachen Klick.
export function firstFrame() { const sp = getSprite(); if (sp) { resetSel(); goFrame(0); renderTimeline(); } }
export function lastFrame() { const sp = getSprite(); if (sp) { resetSel(); goFrame(sp.frames.length - 1); renderTimeline(); } }
export function prevFrame() { const sp = getSprite(); if (sp) goFrame(sp.frame - 1); }

// ────────────────────────────────────────────────────────────────────
// Bearbeiten — jeweils ein Undo-Schritt
// ────────────────────────────────────────────────────────────────────
function edit(fn) {
  const sp = getSprite();
  if (!sp) return;
  stop();
  leaveFrame();
  recordOp(() => fn(sp));
  renderAll();
  saveState();
}

export function addFrame() {
  resetSel();
  edit(sp => {
    // Leer — außer auf durchgehenden Ebenen, dort verknüpft (state.js).
    const cels = newFrameCels(sp, sp.frame);
    sp.frames.splice(sp.frame + 1, 0, { cels, dur: 0 });
    tagsInsert(sp.tags, sp.frame + 1);
    sp.frame++;
  });
}

export function duplicateFrame() {
  resetSel();
  edit(sp => {
    const f = sp.frames[sp.frame];
    sp.frames.splice(sp.frame + 1, 0, { cels: newFrameCels(sp, sp.frame, true), dur: f.dur });
    tagsInsert(sp.tags, sp.frame + 1);
    sp.frame++;
  });
}

// Löscht die markierten Frames (oder, ohne Mehrfachauswahl, den aktiven).
// Ein Undo-Schritt für alle. Danach steht der Frame dort, wo der erste
// gelöschte war — das ist die Stelle, auf die man schaut.
export function deleteFrame() {
  const sp = getSprite();
  if (!sp) return;
  const ids = selectedFrames();
  if (sp.frames.length - ids.length < 1) { showInfoToast(t('tl.lastFrame')); return; }
  resetSel();
  edit(s => {
    for (const i of [...ids].reverse()) s.frames.splice(i, 1);
    tagsDelete(s.tags, ids);
    s.frame = Math.min(ids[0], s.frames.length - 1);
  });
}

export function moveFrame(from, to) {
  const sp = getSprite();
  if (!sp || from === to || to < 0 || to >= sp.frames.length) return;
  resetSel();
  edit(s => {
    const [f] = s.frames.splice(from, 1);
    s.frames.splice(to, 0, f);
    s.frame = to;
  });
}

export function setFps(v) {
  const fps = Math.max(1, Math.min(MAX_FPS, Math.round(Number(v)) || 0));
  const sp = getSprite();
  if (!sp || !fps || fps === sp.fps) { renderTimeline(); return; }
  edit(s => { s.fps = fps; });
}

// 0 / leer = Dauer nach fps.
export function setDuration(v) {
  const sp = getSprite();
  if (!sp) return;
  const ms = v === '' || v == null ? 0 : Math.max(10, Math.min(10000, Math.round(Number(v)) || 0));
  if (ms === (sp.frames[sp.frame].dur || 0)) { renderTimeline(); return; }
  edit(s => { s.frames[s.frame].dur = ms; });
}

// ────────────────────────────────────────────────────────────────────
// Abspielen
// ────────────────────────────────────────────────────────────────────
let timer = null;
let playingId = null;
// Steht man beim Start in einem Tag, läuft nur dieser — in seiner Richtung.
// Eine Kopie: wer den Tag währenddessen ändert, stört die Runde nicht.
let playTag = null;
let playStep = 0;

export function isPlaying() { return state.playing; }

export function play() {
  const sp = getSprite();
  if (!sp || sp.frames.length < 2 || state.playing) return;
  leaveFrame();
  state.playing = true;
  playingId = state.curSprite;
  const g = tagAt(sp.tags, sp.frame);
  playTag = g && g.to > g.from ? { ...g } : null;
  playStep = 0;
  syncPlayButton();
  renderEditor();       // ohne Onion Skin
  schedule();
}

function schedule() {
  const sp = getSprite();
  if (!sp || state.curSprite !== playingId) { stop(); return; }
  timer = setTimeout(() => {
    if (!state.playing) return;
    if (state.curSprite !== playingId || !getSprite()) { stop(); return; }
    const cur = getSprite();
    const next = nextPlayFrame(playTag, cur.frames.length, cur.frame, playStep);
    playStep = next.step;
    showFrame(next.frame, true);
    schedule();
  }, frameDuration(sp, sp.frame));
}

export function stop() {
  if (!state.playing) return;
  state.playing = false;
  clearTimeout(timer);
  timer = null;
  playingId = null;
  syncPlayButton();
  renderAll();
  saveState();
}

export function togglePlay() {
  if (state.playing) stop(); else play();
}

function syncPlayButton() {
  const b = $('tl-play');
  if (!b) return;
  b.innerHTML = iconSvg(state.playing ? 'pause' : 'play');
  b.classList.toggle('is-active', state.playing);
  b.setAttribute('aria-pressed', String(state.playing));
}

export function toggleOnion() {
  state.onion = !state.onion;
  renderEditor();
  renderTimeline();
  saveState();
}

// ────────────────────────────────────────────────────────────────────
// Timeline — ein Raster aus Ebenen × Frames
// ────────────────────────────────────────────────────────────────────
// Spalten sind Frames, Zeilen Ebenen (oberste oben, wie im Ebenen-Panel).
//
//            │ [1] [2] [3] …   ← Vorschaubild je Frame: alle sichtbaren
//   ─────────┼──────────────      Ebenen übereinander; anklicken wählt den
//   👁 🔒 Held │  ●   ●   ○         Frame, ziehen verschiebt ihn
//   👁 🔒 Grund│  ●   ●   ●
//
// Links je Ebene Auge, Schloss und Name. In den Zellen ein Punkt: gefüllt,
// wenn die Ebene in diesem Frame etwas enthält, hohl, wenn sie dort leer
// ist. Ein Klick auf eine Zelle wählt Frame UND Ebene auf einmal.
//
// Das Raster ist ein CSS-Grid in einem Scroll-Behälter (#tl-frames). Die
// Kopfzeile und die Ebenen-Spalte kleben am Rand (position: sticky), so
// bleiben beim Scrollen beide sichtbar.

// Vorschaubild per ImageData — bei 256×256 und vielen Frames deutlich
// schneller als ein fillRect pro Pixel.
const rgbCache = new Map();
function rgbOf(hex) {
  let v = rgbCache.get(hex);
  if (!v) {
    const h = hex.length === 4 ? '#' + [...hex.slice(1)].map(c => c + c).join('') : hex;
    v = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    rgbCache.set(hex, v);
  }
  return v;
}

// Die Knöpfe der Kopfzeile bleiben über alle Aufrufe erhalten: das Zeichnen
// der Bildchen ist das Teure, die Zellen darunter sind billig und werden
// jedes Mal neu gebaut.
/** @type {HTMLButtonElement[]} */
let thumbs = [];
/** @type {HTMLElement|null} */
let corner = null;
/** @type {HTMLElement[][]} */
let celEls = [];      // celEls[ebene][frame]
/** @type {HTMLElement[]} */
let rowEls = [];      // rowEls[ebene] — Auge, Schloss, Name

/** Enthält das Bild überhaupt einen Pixel? */
export function celHasPixels(grid) {
  for (const row of grid) for (const v of row) if (v !== 0) return true;
  return false;
}

// Anzeigegröße des Bildchens: größte Kante auf `cell` minus Polsterung,
// das Seitenverhältnis des Sprites bleibt erhalten.
function sizeThumb(cv) {
  const W = cv.width, H = cv.height;
  if (!W || !H) return;
  const k = (cell - CELL_PAD) / Math.max(W, H);
  cv.style.width = Math.max(1, Math.round(W * k)) + 'px';
  cv.style.height = Math.max(1, Math.round(H * k)) + 'px';
}

function drawThumb(cv, grid, pal) {
  const H = grid.length, W = grid[0].length;
  if (cv.width !== W || cv.height !== H) {
    cv.width = W;
    cv.height = H;
  }
  sizeThumb(cv);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const hex = cellToColor(grid[y][x], pal);
    if (!hex) continue;
    const [r, g, b] = rgbOf(hex);
    const o = (y * W + x) * 4;
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// Platz aufteilen: die Frames teilen sich, was neben der Ebenen-Spalte
// übrig bleibt. Mehr als CELL_MAX wird es nie — sonst frisst die Leiste
// die Zeichenfläche.
//
// Nach unten ist bei VISIBLE_MAX Schluss: die Bildchen schrumpfen nur so weit,
// bis zwanzig nebeneinander stehen. Ab dem einundzwanzigsten Frame bleibt die
// Größe, wie sie ist, und das Raster scrollt — sonst würde eine lange
// Animation die Vorschau zu Briefmarken zusammenquetschen.
//
// Hat man die Größe am Griff der Timeline gezogen (tlOpts.thumbSize), gilt
// die — dann scrollt die Reihe eben früher.
function fitThumbs() {
  const box = $('tl-frames');
  const sp = getSprite();
  if (!box || !sp || !corner) return;
  const w = box.clientWidth - corner.offsetWidth - 4;
  if (w <= 0 || !corner.offsetWidth) return;   // noch nicht sichtbar — beim nächsten Mal
  const mobile = isMobileLayout();
  const k = Math.min(sp.frames.length, mobile ? VISIBLE_MAX_TOUCH : VISIBLE_MAX);
  const gap = 2;
  const room = Math.floor((w - gap * k) / k);
  const min = mobile ? CELL_MIN_TOUCH : CELL_MIN;
  const fixed = !mobile && state.tlOpts.thumbSize;
  const next = fixed || Math.max(min, Math.min(CELL_MAX, room));
  if (next === cell) return;
  cell = next;
  box.style.setProperty('--tl-cell', cell + 'px');
  thumbs.forEach(b => sizeThumb(b.firstChild));
}

function makeThumb() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tl-frame';
  b.setAttribute('role', 'option');
  const cv = document.createElement('canvas');
  const num = document.createElement('span');
  num.className = 'tl-n';
  b.append(cv, num);
  initThumbDrag(b);
  return b;
}

// Ecke links oben: Überschrift und die Knöpfe für Ebenen — dieselben
// Aktionen wie im Ebenen-Panel, nur dort, wo man die Ebenen gerade sieht.
function makeCorner() {
  const c = document.createElement('div');
  c.className = 'tl-corner';
  c.innerHTML = '<span class="tl-corner-label"></span><span class="tl-corner-btns">'
    + '<button type="button" class="icon-btn" data-act="add"></button>'
    + '<button type="button" class="icon-btn" data-act="dup"></button>'
    + '<button type="button" class="icon-btn" data-act="del"></button></span>';
  const acts = { add: [addLayer, 'plus', 'ly.add'], dup: [duplicateLayer, 'copy', 'ly.dup'], del: [deleteLayer, 'trash', 'ly.del'] };
  c.querySelectorAll('button').forEach(b => {
    const [fn, icon] = acts[/** @type {HTMLElement} */ (b).dataset.act];
    b.innerHTML = iconSvg(icon);
    b.addEventListener('click', () => fn());
  });
  return c;
}

// Texte der Ecke — bei jedem Zeichnen, damit ein Sprachwechsel greift.
function syncCorner(sp) {
  corner.querySelector('.tl-corner-label').textContent = t('tl.layers');
  corner.querySelectorAll('button').forEach(b => {
    const act = /** @type {HTMLElement} */ (b).dataset.act;
    b.title = t({ add: 'tl.lyAdd', dup: 'tl.lyDup', del: 'tl.lyDel' }[act]);
    b.setAttribute('aria-label', b.title);
    if (act === 'del') /** @type {HTMLButtonElement} */ (b).disabled = sp.layers.length < 2;
  });
}

// Doppelklick von Hand: der erste Klick wählt die Ebene und baut das Raster
// neu — der zweite träfe dann ein anderes Element, und der Browser meldete
// keinen dblclick.
let lastRowClick = { li: -1, t: 0 };

// Eine Ebene: Auge, Schloss, Name. Ein Klick auf die Zeile wählt die
// Ebene, ohne den Frame zu wechseln; ein Doppelklick benennt um, Ziehen
// nach oben oder unten ordnet sie um.
function makeLayerRow(sp, li) {
  const L = sp.layers[li];
  const row = document.createElement('div');
  row.className = 'tl-layer';
  row.dataset.l = String(li);
  row.classList.toggle('is-hidden', !L.visible);
  row.title = t('ly.rowTitle', { name: L.name });
  row.innerHTML = '<button type="button" class="icon-btn tl-eye"></button>'
    + '<button type="button" class="icon-btn tl-lock"></button>'
    + '<button type="button" class="icon-btn tl-cont"></button>'
    + '<span class="tl-lname"></span>';
  const eye = /** @type {HTMLElement} */ (row.children[0]);
  const lock = /** @type {HTMLElement} */ (row.children[1]);
  const cont = /** @type {HTMLElement} */ (row.children[2]);
  cont.innerHTML = iconSvg(L.continuous ? 'contOn' : 'contOff');
  cont.title = t(L.continuous ? 'tl.contOn' : 'tl.contOff');
  cont.setAttribute('aria-pressed', String(!!L.continuous));
  cont.classList.toggle('is-on', !!L.continuous);
  cont.addEventListener('click', e => { e.stopPropagation(); toggleContinuous(li); });
  eye.innerHTML = iconSvg(L.visible ? 'eye' : 'eyeOff');
  eye.title = t(L.visible ? 'ly.hide' : 'ly.show');
  eye.setAttribute('aria-pressed', String(L.visible));
  lock.innerHTML = iconSvg(L.locked ? 'lock' : 'unlock');
  lock.title = t(L.locked ? 'ly.unlock' : 'ly.lock');
  lock.setAttribute('aria-pressed', String(L.locked));
  lock.classList.toggle('is-on', L.locked);
  row.querySelector('.tl-lname').textContent = L.name;
  eye.addEventListener('click', e => { e.stopPropagation(); toggleVisible(li); });
  lock.addEventListener('click', e => { e.stopPropagation(); toggleLocked(li); });
  row.addEventListener('click', e => {
    if (row.dataset.dragged || /** @type {HTMLElement} */ (e.target).closest('button, input')) return;
    const now = performance.now();
    if (lastRowClick.li === li && now - lastRowClick.t < 400) {
      lastRowClick = { li: -1, t: 0 };
      startLayerRename(li);
      return;
    }
    lastRowClick = { li, t: now };
    setActiveLayer(li);
  });
  initLayerDrag(row, li);
  return row;
}

// Umbenennen an Ort und Stelle. Solange das Feld offen ist, baut
// renderTimeline() das Raster nicht neu — sonst wäre es mitten im Tippen weg.
function startLayerRename(li) {
  const row = rowEls[li];
  const span = row?.querySelector('.tl-lname');
  const sp = getSprite();
  if (!span || !sp) return;
  const inp = document.createElement('input');
  inp.className = 'input input--sm tl-rename';
  inp.value = sp.layers[li].name;
  span.replaceWith(inp);
  inp.focus();
  inp.select();
  let done = false;
  const finish = ok => {
    if (done) return;
    done = true;
    inp.remove();
    if (ok) renameLayer(li, inp.value); else renderTimeline();
  };
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  inp.addEventListener('blur', () => finish(true));
}

// Ebene nach oben oder unten ziehen. Die Zeilen stehen auf dem Kopf (oben =
// oberste Ebene), darum wird die Zielposition umgerechnet — wie im Panel.
function initLayerDrag(row, from) {
  row.addEventListener('pointerdown', e => {
    if (e.button !== 0 || /** @type {HTMLElement} */ (e.target).closest('button, input')) return;
    const sy = e.clientY;
    let dragging = false, slot = null;
    const move = ev => {
      const d = ev.clientY - sy;
      if (!dragging) {
        if (Math.abs(d) < 6) return;
        dragging = true;
        row.classList.add('is-dragging');
        try { row.setPointerCapture(ev.pointerId); } catch {}
      }
      ev.preventDefault();
      row.style.transform = `translateY(${d}px)`;
      // Anzeige-Position (0 = oben) → Ebenen-Index (0 = unten).
      const others = rowEls.filter(r => r && r !== row).sort((a, b) => Number(b.dataset.l) - Number(a.dataset.l));
      let pos = 0;
      others.forEach((r, k) => {
        const rc = r.getBoundingClientRect();
        if (ev.clientY > rc.top + rc.height / 2) pos = k + 1;
      });
      slot = others.length - pos;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!dragging) return;
      row.classList.remove('is-dragging');
      row.style.transform = '';
      row.dataset.dragged = '1';
      setTimeout(() => { delete row.dataset.dragged; }, 0);
      if (slot != null && slot !== from) moveLayer(from, slot);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}

function makeCel(fi, li) {
  const c = document.createElement('button');
  c.type = 'button';
  c.className = 'tl-cel';
  c.dataset.i = String(fi);
  c.dataset.l = String(li);
  initCelPointer(c, fi, li);
  return c;
}

function setCelFill(c, grid) {
  c.classList.toggle('is-filled', celHasPixels(grid));
}

export function renderTimeline() {
  const box = $('tl-frames');
  if (!box) return;
  const sp = getSprite();
  if (!sp) { box.innerHTML = ''; thumbs = []; celEls = []; rowEls = []; return; }
  // Die Auswahl gehört zu einem Sprite, nicht zur Timeline.
  if (selSprite !== state.curSprite) { resetSel(); selSprite = state.curSprite; }
  const pal = getPaletteByName(sp.palette);
  const n = sp.frames.length, L = sp.layers.length;
  // Eine offene Umbenennung nicht mitten im Tippen wegwerfen.
  if (box.querySelector('.tl-rename')) return;
  if (!corner) corner = makeCorner();
  syncCorner(sp);
  while (thumbs.length > n) thumbs.pop();
  while (thumbs.length < n) thumbs.push(makeThumb());

  // Der Bereich gehört zu einem Sprite und muss ins Raster passen.
  range = rangeSprite === state.curSprite ? clampRange(sp, range) : null;

  // Tags über den Vorschaubildern, überlappende auf eigenen Spuren.
  const lanes = tagLanes(sp.tags);
  const nl = sp.tags.length ? Math.max(...lanes) + 1 : 0;
  const tagEls = sp.tags.map((g, k) => {
    const b = makeTagBar(sp, g, k);
    b.style.gridRow = String(lanes[k] + 1);
    b.style.gridColumn = `${g.from + 2} / ${g.to + 3}`;
    b.style.top = lanes[k] * (TAG_ROW + 2) + 'px';
    return b;
  });
  // Jedes Element bekommt seinen Platz im Raster ausdrücklich — mit den
  // Tag-Spuren obendrauf ginge die automatische Anordnung durcheinander.
  corner.style.gridRow = `1 / ${nl + 2}`;
  corner.style.gridColumn = '1';
  thumbs.forEach((b, i) => { b.style.gridRow = String(nl + 1); b.style.gridColumn = String(i + 2); });

  // Zeilen von oben nach unten: oberste Ebene zuerst.
  rowEls = [];
  celEls = sp.layers.map(() => []);
  /** @type {HTMLElement[]} */
  const body = [];
  for (let li = L - 1; li >= 0; li--) {
    const row = makeLayerRow(sp, li);
    const gr = String(nl + 2 + (L - 1 - li));
    row.style.gridRow = gr;
    row.style.gridColumn = '1';
    rowEls[li] = row;
    body.push(row);
    for (let fi = 0; fi < n; fi++) {
      const c = makeCel(fi, li);
      c.style.gridRow = gr;
      c.style.gridColumn = String(fi + 2);
      setCelFill(c, sp.frames[fi].cels[li]);
      c.classList.toggle('is-hidden', !sp.layers[li].visible);
      c.title = t('tl.celTitle', { i: frameLabel(fi, state.tlOpts), name: sp.layers[li].name });
      // Verknüpft mit dem Nachbarn: ein Strich zwischen den Punkten.
      const g = sp.frames[fi].cels[li];
      c.classList.toggle('link-l', fi > 0 && sp.frames[fi - 1].cels[li] === g);
      c.classList.toggle('link-r', fi < n - 1 && sp.frames[fi + 1].cels[li] === g);
      c.classList.toggle('is-linked', isLinked(sp, fi, li));
      celEls[li][fi] = c;
      body.push(c);
    }
  }
  // Vorhandene Knöpfe werden dabei nur umgehängt, nicht neu gebaut.
  box.replaceChildren(corner, ...tagEls, ...thumbs, ...body);
  box.style.setProperty('--tl-n', String(n));
  box.style.setProperty('--tl-l', String(L));
  box.style.setProperty('--tl-tagh', nl * (TAG_ROW + 2) + 'px');
  // Ohne Vorschaubilder bleibt von der Kopfzeile nur die Nummer.
  const thumbsOn = state.tlOpts.thumbs;
  box.classList.toggle('no-thumbs', !thumbsOn);
  box.style.gridTemplateRows = (nl ? `repeat(${nl}, ${TAG_ROW}px) ` : '')
    + (thumbsOn ? 'var(--tl-cell, 44px)' : '18px') + ` repeat(${L}, var(--tl-row))`;
  if (tagEdIndex >= 0) syncTagEditor();
  fitThumbs();

  sp.frames.forEach((f, i) => {
    const b = thumbs[i];
    b.dataset.i = String(i);
    if (thumbsOn) drawThumb(b.firstChild, thumbGrid(sp, i), pal);
    b.lastChild.textContent = String(frameLabel(i, state.tlOpts));
    b.classList.toggle('has-dur', !!f.dur);
    b.title = t('tl.frameTitle', { i: frameLabel(i, state.tlOpts), ms: frameDuration(sp, i) });
  });
  markActive();

  const fps = $('tl-fps'), dur = $('tl-dur'), go = $('tl-go');
  if (document.activeElement !== fps) fps.value = sp.fps;
  if (document.activeElement !== dur) dur.value = sp.frames[sp.frame].dur || '';
  dur.placeholder = Math.round(1000 / sp.fps);
  if (go) {
    go.min = frameLabel(0, state.tlOpts);
    go.max = frameLabel(n - 1, state.tlOpts);
    if (document.activeElement !== go) go.value = frameLabel(sp.frame, state.tlOpts);
    $('tl-total').textContent = '/ ' + frameLabel(n - 1, state.tlOpts);
  }
  for (const id of ['tl-play', 'tl-prev', 'tl-next', 'tl-del', 'tl-first', 'tl-last']) $(id).disabled = n < 2;
  // Der Löschen-Knopf sagt, wie viele Frames er mitnimmt — und der
  // Export-Bereich, auf wie viele er sich bezieht.
  const m = selectedCount();
  $('tl-del').title = m > 1 ? t('tl.delMany', { n: m }) : t('tl.delOne');
  renderCallbacks.onFrameSelection?.(m);
  const onion = $('tl-onion');
  onion.classList.toggle('is-active', state.onion);
  onion.setAttribute('aria-pressed', String(state.onion));
  syncPlayButton();
}

// Nur das, was der aktuelle Strich verändert: das Bild des Frames und der
// Punkt der aktiven Ebene darin — läuft bei jedem Zeichnen mit.
export function refreshCurrentThumb() {
  const sp = getSprite();
  if (!sp) return;
  const b = thumbs[sp.frame];
  if (b && state.tlOpts.thumbs) drawThumb(b.firstChild, thumbGrid(sp), getPaletteByName(sp.palette));
  const c = celEls[sp.layer]?.[sp.frame];
  if (c) setCelFill(c, sp.grid);
}

function markActive() {
  const box = $('tl-frames');
  const sp = getSprite();
  if (!box || !sp) return;
  const marked = sel.size > 1 ? sel : null;
  const isMarked = i => !!marked && marked.has(i);
  thumbs.forEach((b, i) => {
    const on = i === sp.frame;
    b.classList.toggle('is-active', on);
    b.classList.toggle('is-marked', isMarked(i));
    b.setAttribute('aria-selected', String(on || isMarked(i)));
  });
  celEls.forEach((cels, li) => cels.forEach((c, fi) => {
    c.classList.toggle('is-col', fi === sp.frame);
    c.classList.toggle('is-row', li === sp.layer);
    c.classList.toggle('is-marked', isMarked(fi));
    c.classList.toggle('is-active', fi === sp.frame && li === sp.layer);
    c.classList.toggle('is-range', !!range && rangeSize(range) > 1 && inRange(range, fi, li));
  }));
  syncCelButtons();
  rowEls.forEach((r, li) => r?.classList.toggle('is-active', li === sp.layer));

  // Den aktiven Frame sichtbar halten, ohne die Seite zu scrollen. Links
  // klebt die Ebenen-Spalte darüber — die zählt nicht als sichtbar.
  const b = thumbs[sp.frame];
  if (b) {
    const lw = corner?.offsetWidth || 0;
    if (b.offsetLeft - lw < box.scrollLeft) box.scrollLeft = b.offsetLeft - lw;
    else if (b.offsetLeft + b.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = b.offsetLeft + b.offsetWidth - box.clientWidth;
  }
  updateFrameLabel();
}

function updateFrameLabel() {
  const sp = getSprite();
  const dur = $('tl-dur'), go = $('tl-go');
  if (sp && dur && document.activeElement !== dur) dur.value = sp.frames[sp.frame].dur || '';
  if (sp && go && document.activeElement !== go) go.value = frameLabel(sp.frame, state.tlOpts);
}

// Ein Frame wurde angeklickt — in der Kopfzeile oder in einer Zelle.
// Strg/Shift (am Handy der Auswahl-Schalter) markieren mehrere Frames,
// ein einfacher Klick wechselt nur.
function clickFrame(i, e) {
  const sp = getSprite();
  if (!sp) return;
  if (multiMode) {
    // Auswahl-Modus: jeder Tipp nimmt einen Frame dazu oder wieder weg.
    // Der erste Tipp erbt den aktiven Frame, damit er nicht verloren geht.
    if (sel.size < 2) sel = new Set([sp.frame]);
    if (sel.has(i) && sel.size > 1) sel.delete(i);
    else { sel.add(i); anchor = i; goFrame(i); }
    renderTimeline();
    return;
  }
  if (e.shiftKey) {
    // Spanne vom Anker bis hierher. Ohne Anker gilt der aktive Frame.
    const a = anchor != null && anchor < sp.frames.length ? anchor : sp.frame;
    sel = new Set();
    for (let k = Math.min(a, i); k <= Math.max(a, i); k++) sel.add(k);
    anchor = a;
    goFrame(i);
  } else if (e.ctrlKey || e.metaKey) {
    // Einzeln dazu oder weg. Der erste Strg-Klick erbt den aktiven Frame,
    // damit nicht die bisherige Auswahl verloren geht.
    if (sel.size < 2) sel = new Set([sp.frame]);
    if (sel.has(i) && sel.size > 1) sel.delete(i);
    else { sel.add(i); anchor = i; goFrame(i); }
  } else {
    resetSel();
    anchor = i;
    goFrame(i);
  }
  renderTimeline();
}

// ────────────────────────────────────────────────────────────────────
// Zellen: wählen, Bereich aufziehen, ziehen, kopieren (js/cels.js)
// ────────────────────────────────────────────────────────────────────
// Ein Klick wählt Frame UND Ebene. Shift-Klick (am Handy: Auswahl-Schalter)
// spannt einen Bereich vom letzten Klick bis hierher; Ziehen über andere
// Zellen tut dasselbe. Ziehen IM Bereich verschiebt ihn, mit Strg oder Alt
// wird kopiert. Ohne Bereich gilt die aktive Zelle als Bereich.
let range = null;          // CelRange | null
let rangeSprite = null;    // zu welchem Sprite er gehört
let celAnchor = null;      // { f, l } — Ausgangspunkt für Shift
let celClip = null;        // Zwischenablage für Zellen
let celFocus = false;      // zuletzt in der Timeline geklickt → Tasten gehören den Zellen

/** Der Bereich, auf den Zellen-Aktionen wirken. */
function curRange() {
  const sp = getSprite();
  if (!sp) return null;
  return clampRange(sp, range) || { f0: sp.frame, f1: sp.frame, l0: sp.layer, l1: sp.layer };
}

function setRange(r) { range = r; rangeSprite = state.curSprite; }

// Frame und Ebene setzen — eine Änderung nur, wenn sich etwas ändert.
function goCel(fi, li) {
  const sp = getSprite();
  if (!sp) return;
  stop();
  if (fi === sp.frame && li === sp.layer) { renderTimeline(); return; }
  leaveFrame();
  sp.frame = fi;
  sp.layer = li;
  renderAll();
  saveState();
}

function clickCel(fi, li, e) {
  const sp = getSprite();
  if (!sp) return;
  if (e.shiftKey || multiMode) {
    const a = celAnchor && celAnchor.f < sp.frames.length && celAnchor.l < sp.layers.length
      ? celAnchor : { f: sp.frame, l: sp.layer };
    celAnchor = a;
    setRange(rangeOf(a.f, a.l, fi, li));
    goCel(fi, li);
    return;
  }
  setRange(null);
  celAnchor = { f: fi, l: li };
  resetSel();
  goCel(fi, li);
}

// Welche Zelle liegt unter dem Zeiger?
function celAt(x, y) {
  const el = /** @type {HTMLElement|null} */ (document.elementFromPoint(x, y)?.closest('.tl-cel'));
  return el ? { f: Number(el.dataset.i), l: Number(el.dataset.l) } : null;
}

// Vorschau beim Ziehen: wo der Bereich landen würde.
function markDrop(r, df, dl) {
  const sp = getSprite();
  const ok = !!sp && canShift(sp, r, df, dl);
  celEls.forEach((cels, li) => cels.forEach((c, fi) => {
    c.classList.toggle('is-drop', !!(df || dl) && inRange(r, fi - df, li - dl));
    c.classList.toggle('is-drop-bad', !ok);
  }));
}

const gridBox = () => $('tl-frames');

function initCelPointer(c, fi, li) {
  c.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    celFocus = true;
    const r = curRange();
    if (!r) return;
    const grab = inRange(r, fi, li);
    const sx = e.clientX, sy = e.clientY;
    let mode = null, hit = { f: fi, l: li }, copy = false;
    const move = ev => {
      if (!mode) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        mode = grab ? 'move' : 'select';
        stop();
        try { c.setPointerCapture(ev.pointerId); } catch {}
      }
      ev.preventDefault();
      hit = celAt(ev.clientX, ev.clientY) || hit;
      copy = ev.ctrlKey || ev.metaKey || ev.altKey;
      if (mode === 'select') {
        setRange(rangeOf(fi, li, hit.f, hit.l));
        markActive();
      } else {
        markDrop(r, hit.f - fi, hit.l - li);
        gridBox().classList.toggle('is-copying', copy);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!mode) return;
      // Der folgende click darf nicht nochmal wählen.
      c.dataset.dragged = '1';
      setTimeout(() => { delete c.dataset.dragged; }, 0);
      gridBox().classList.remove('is-copying');
      if (mode === 'select') { celAnchor = { f: fi, l: li }; goCel(fi, li); return; }
      moveRange(r, hit.f - fi, hit.l - li, copy);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
  c.addEventListener('click', e => {
    if (c.dataset.dragged) return;
    clickCel(fi, li, e);
  });
}

// Ein Undo-Schritt für eine Zellen-Aktion. `after` darf danach Frame,
// Ebene und Bereich neu setzen.
function celEdit(fn, after) {
  const sp = getSprite();
  if (!sp) return;
  stop();
  leaveFrame();
  let res;
  recordOp(() => { res = fn(sp); });
  after?.(sp, res);
  renderAll();
  saveState();
  return res;
}

function moveRange(r, df, dl, copy) {
  const sp = getSprite();
  if (!sp || (!df && !dl) || !canShift(sp, r, df, dl)) { renderTimeline(); return; }
  celEdit(s => shiftCels(s, r, df, dl, copy), s => {
    setRange(rangeSize(r) > 1 ? { f0: r.f0 + df, f1: r.f1 + df, l0: r.l0 + dl, l1: r.l1 + dl } : null);
    if (inRange(r, s.frame, s.layer)) { s.frame += df; s.layer += dl; }
    celAnchor = { f: s.frame, l: s.layer };
  });
}

export function copyCelRange() {
  const sp = getSprite();
  const r = curRange();
  if (!sp || !r) return;
  celClip = copyCels(sp, r);
  celClip.pal = { ...getPaletteByName(sp.palette) }; // für Einfügen in andere Paletten (remap.js)
  showInfoToast(t('tl.celsCopied', { n: rangeSize(r) }));
  syncCelButtons();
}

export function cutCelRange() {
  const r = curRange();
  if (!r) return;
  copyCelRange();
  celEdit(s => clearCels(s, r));
}

export function clearCelRange() {
  const r = curRange();
  if (r) celEdit(s => clearCels(s, r));
}

// Einfügen an der aktiven Zelle: erster Frame und oberste Ebene der Kopie
// landen dort.
export function pasteCelRange() {
  const sp = getSprite();
  if (!sp || !celClip) return;
  // Andere Palette im Ziel: nach der Farbe übertragen (wie beim Einfügen einer
  // Auswahl). Geteilte Bilder werden einmal umgerechnet und bleiben geteilt.
  let clip = celClip, free = 0;
  const toPal = getPaletteByName(sp.palette);
  if (celClip.pal && !samePalette(celClip.pal, toPal)) {
    const memo = new Map();
    const conv = g => {
      if (!memo.has(g)) { const r = remapCells(g, celClip.pal, toPal); free = Math.max(free, r.free); memo.set(g, r.cells); }
      return memo.get(g);
    };
    clip = { ...celClip, cels: celClip.cels.map(row => row.map(conv)) };
  }
  const used = celEdit(s => pasteCels(s, clip, s.frame, s.layer), (s, u) => {
    if (u) setRange(rangeSize(u) > 1 ? u : null);
  });
  if (!used) showInfoToast(t('tl.pasteNone'));
  else if (clip !== celClip) showInfoToast(free ? t('tl.pasteFree', { n: free }) : t('tl.pasteMapped'));
}

export function linkCelRange() {
  const r = curRange();
  if (!r || r.f1 === r.f0) { showInfoToast(t('tl.linkNeedsTwo')); return; }
  celEdit(s => linkCels(s, r));
}

export function unlinkCelRange() {
  const r = curRange();
  if (r) celEdit(s => unlinkCels(s, r));
}

// Tasten für die Zellen — nur, wenn zuletzt in der Timeline geklickt wurde.
// Sonst gehören Strg+C/V/X und Entf der Auswahl auf der Zeichenfläche.
export function celKeyDown(e) {
  if (!celFocus || !getSprite()) return false;
  const k = e.key.toLowerCase();
  const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
  if (mod && k === 'c') { e.preventDefault(); copyCelRange(); return true; }
  if (mod && k === 'x') { e.preventDefault(); cutCelRange(); return true; }
  if (mod && k === 'v') { e.preventDefault(); pasteCelRange(); return true; }
  if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); clearCelRange(); return true; }
  return false;
}

function syncCelButtons() {
  const sp = getSprite();
  const r = curRange();
  const paste = $('tl-cpaste'), link = $('tl-clink'), unlink = $('tl-cunlink');
  if (!sp || !r || !paste) return;
  paste.disabled = !celClip;
  link.disabled = r.f1 === r.f0;
  let anyLinked = false;
  for (let l = r.l0; l <= r.l1 && !anyLinked; l++) {
    for (let f = r.f0; f <= r.f1; f++) if (isLinked(sp, f, l)) { anyLinked = true; break; }
  }
  unlink.disabled = !anyLinked;
}

// Ziehen sortiert um, ein Tipp wählt den Frame. Erst ab ein paar Pixeln
// Bewegung wird gezogen — das Raster selbst scrollt auf dem Handy, darum
// zählt dort nur eine Bewegung entlang der Kopfzeile.
function initThumbDrag(b) {
  b.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const from = Number(b.dataset.i);
    const sx = e.clientX;
    let dragging = false, target = from;

    const move = ev => {
      const d = ev.clientX - sx;
      if (!dragging) {
        if (Math.abs(d) < 8) return;
        dragging = true;
        stop();
        resetSel();
        b.classList.add('is-dragging');
        try { b.setPointerCapture(ev.pointerId); } catch {}
      }
      ev.preventDefault();
      b.style.transform = `translateX(${d}px)`;
      // Ziel: hinter dem letzten Frame, dessen Mitte der Zeiger passiert hat.
      target = 0;
      thumbs.forEach((c, i) => {
        if (c === b) return;
        const r = c.getBoundingClientRect();
        if (ev.clientX > r.left + r.width / 2) target = i < from ? i + 1 : i;
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!dragging) return;
      b.classList.remove('is-dragging');
      b.style.transform = '';
      // Der folgende click darf den Frame nicht nochmal wählen.
      b.dataset.dragged = '1';
      setTimeout(() => { delete b.dataset.dragged; }, 0);
      moveFrame(from, target);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
  b.addEventListener('click', e => {
    if (b.dataset.dragged) return;
    clickFrame(Number(b.dataset.i), e);
  });
}

// ────────────────────────────────────────────────────────────────────
// Tags in der Timeline (js/tags.js)
// ────────────────────────────────────────────────────────────────────
// Über den Vorschaubildern liegt je Tag ein farbiger Balken mit Namen und
// Richtung. Ein Klick darauf öffnet den kleinen Bearbeiter: Name, Frames,
// Richtung, Farbe, Abspielen, Löschen. „Tag" in der Knopfleiste legt einen
// neuen an — über die markierten Frames, den Zellen-Bereich oder den
// aktiven Frame.
const TAG_ROW = 16;   // Höhe einer Tag-Spur in px (styles.css: .tl-tag)
const DIR_MARK = { forward: '→', reverse: '←', pingpong: '↔' };

function makeTagBar(sp, g, k) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tl-tag';
  b.style.setProperty('--tag', g.color);
  b.textContent = (g.dir !== 'forward' ? DIR_MARK[g.dir] + ' ' : '') + g.name;
  b.title = t('tg.barTitle', { name: g.name, a: frameLabel(g.from, state.tlOpts), b: frameLabel(g.to, state.tlOpts), dir: t('tg.dir.' + g.dir) });
  b.addEventListener('click', () => openTagEditor(k, b));
  return b;
}

// Welche Frames bekommt ein neuer Tag? Markierte Frames, sonst der
// Zellen-Bereich, sonst der aktive Frame.
function framesForNewTag(sp) {
  const ids = selectedFrames();
  if (ids.length > 1) return [ids[0], ids[ids.length - 1]];
  const r = clampRange(sp, range);
  if (r && r.f1 > r.f0) return [r.f0, r.f1];
  return [sp.frame, sp.frame];
}

export function addTag() {
  const sp = getSprite();
  if (!sp) return;
  const [from, to] = framesForNewTag(sp);
  const k = sp.tags.length;
  edit(s => {
    s.tags.push({
      name: t('tg.defaultName', { n: k + 1 }), from, to,
      color: TAG_COLORS[k % TAG_COLORS.length], dir: 'forward',
    });
  });
  openTagEditor(k, $('tl-tag'));
}

// ── Bearbeiter ──────────────────────────────────────────────────────
let tagEd = null;        // das Element, einmal gebaut
let tagEdIndex = -1;     // welcher Tag gerade offen ist

function changeTag(fn) {
  const sp = getSprite();
  const g = sp?.tags[tagEdIndex];
  if (!g) return;
  stop();
  recordOp(() => fn(g, sp));
  renderAll();
  saveState();
  syncTagEditor();
}

function buildTagEditor() {
  const el = document.createElement('div');
  el.className = 'tag-editor';
  el.setAttribute('role', 'dialog');
  el.hidden = true;
  el.innerHTML = ''
    + '<input class="input input--sm tg-name" type="text" maxlength="40">'
    + '<div class="tg-row"><span class="field-label tg-l-frames"></span>'
    + '<input class="input input--sm tg-from" type="number" step="1"> – '
    + '<input class="input input--sm tg-to" type="number" step="1"></div>'
    + '<div class="tg-row"><span class="field-label tg-l-dir"></span><select class="input input--sm tg-dir"></select></div>'
    + '<div class="tg-colors"></div>'
    + '<div class="tg-row tg-actions">'
    + '<button type="button" class="btn tg-play"></button>'
    + '<button type="button" class="btn btn--danger-soft tg-del"></button>'
    + '<button type="button" class="btn tg-done"></button></div>';
  const q = sel => /** @type {any} */ (el.querySelector(sel));
  q('.tg-name').addEventListener('change', e => {
    const v = e.target.value.trim();
    if (v) changeTag(g => { g.name = v; }); else syncTagEditor();
  });
  const range2 = () => {
    // Die Felder zählen wie die Timeline (ab 0 oder ab 1).
    const n = getSprite()?.frames.length || 1, k = frameLabel(0, state.tlOpts);
    const idx = sel => Math.max(0, Math.min(n - 1, (Math.round(Number(q(sel).value)) || 0) - k));
    const a = idx('.tg-from'), b = idx('.tg-to');
    changeTag(g => { g.from = Math.min(a, b); g.to = Math.max(a, b); });
  };
  q('.tg-from').addEventListener('change', range2);
  q('.tg-to').addEventListener('change', range2);
  q('.tg-dir').addEventListener('change', e => changeTag(g => { g.dir = e.target.value; }));
  TAG_COLORS.forEach(c => {
    const s = document.createElement('button');
    s.type = 'button';
    s.className = 'tg-swatch';
    s.style.background = c;
    s.dataset.color = c;
    s.addEventListener('click', () => changeTag(g => { g.color = c; }));
    q('.tg-colors').append(s);
  });
  q('.tg-play').addEventListener('click', () => {
    const g = getSprite()?.tags[tagEdIndex];
    if (!g) return;
    closeTagEditor();
    resetSel();
    goFrame(g.from);
    play();
  });
  q('.tg-del').addEventListener('click', () => {
    const k = tagEdIndex;
    closeTagEditor();
    edit(s => { s.tags.splice(k, 1); });
  });
  q('.tg-done').addEventListener('click', closeTagEditor);
  el.addEventListener('keydown', e => {
    e.stopPropagation();   // Tippen im Namen soll keine Werkzeuge wechseln
    if (e.key === 'Escape') closeTagEditor();
    const tg = /** @type {HTMLElement} */ (e.target);
    if (e.key === 'Enter' && tg.tagName === 'INPUT') tg.blur();
  });
  document.addEventListener('pointerdown', e => {
    if (el.hidden) return;
    const tg = /** @type {HTMLElement} */ (e.target);
    if (!el.contains(tg) && !tg.closest?.('.tl-tag, #tl-tag')) closeTagEditor();
  }, true);
  document.body.append(el);
  return el;
}

function syncTagEditor() {
  const sp = getSprite();
  const g = sp?.tags[tagEdIndex];
  if (!tagEd || !g) { closeTagEditor(); return; }
  const q = sel => /** @type {any} */ (tagEd.querySelector(sel));
  const set = (sel, v) => { const i = q(sel); if (document.activeElement !== i) i.value = v; };
  set('.tg-name', g.name);
  set('.tg-from', frameLabel(g.from, state.tlOpts));
  set('.tg-to', frameLabel(g.to, state.tlOpts));
  q('.tg-from').min = q('.tg-to').min = frameLabel(0, state.tlOpts);
  q('.tg-from').max = q('.tg-to').max = frameLabel(sp.frames.length - 1, state.tlOpts);
  const dir = q('.tg-dir');
  if (!dir.options.length) {
    for (const d of TAG_DIRS) { const o = document.createElement('option'); o.value = d; dir.append(o); }
  }
  [...dir.options].forEach(o => { o.textContent = t('tg.dir.' + o.value); });
  dir.value = g.dir;
  tagEd.querySelectorAll('.tg-swatch').forEach(s => {
    const on = /** @type {HTMLElement} */ (s).dataset.color === g.color;
    s.classList.toggle('is-active', on);
    s.setAttribute('aria-pressed', String(on));
  });
  q('.tg-name').setAttribute('aria-label', t('tg.name'));
  q('.tg-l-frames').textContent = t('tg.frames');
  q('.tg-l-dir').textContent = t('tg.dir');
  q('.tg-play').textContent = t('tg.play');
  q('.tg-del').textContent = t('tg.del');
  q('.tg-done').textContent = t('tg.done');
  tagEd.setAttribute('aria-label', g.name);
}

function openTagEditor(k, anchor) {
  if (!tagEd) tagEd = buildTagEditor();
  tagEdIndex = k;
  tagEd.hidden = false;
  syncTagEditor();
  // Unter oder über dem Anker, im Fenster gehalten.
  const r = anchor?.getBoundingClientRect() || { left: 20, top: 20, bottom: 40 };
  const w = tagEd.offsetWidth, h = tagEd.offsetHeight;
  const left = Math.max(8, Math.min(innerWidth - w - 8, r.left));
  const below = r.bottom + 6 + h < innerHeight;
  tagEd.style.left = left + 'px';
  tagEd.style.top = (below ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + 'px';
  const name = tagEd.querySelector('.tg-name');
  name.focus();
  name.select();
}

function closeTagEditor() {
  if (tagEd) tagEd.hidden = true;
  tagEdIndex = -1;
}

// Griff am Rand der Timeline (oben, wenn sie unten liegt — und umgekehrt):
// Ziehen macht die Leiste höher oder flacher, und die Vorschaubilder wachsen
// mit. Doppelklick stellt wieder „passend zur Breite“ ein.
function initThumbGrip() {
  const tl = $('timeline');
  if (!tl) return;
  const grip = document.createElement('div');
  grip.className = 'tl-grip';
  grip.setAttribute('role', 'separator');
  grip.setAttribute('aria-orientation', 'horizontal');
  grip.title = t('tl.gripTitle');
  tl.prepend(grip);
  grip.addEventListener('pointerdown', e => {
    e.preventDefault();
    const atTop = !!tl.closest('[data-zone="top"]');
    const sy = e.clientY, s0 = cell;
    document.body.classList.add('is-dragging-ui', 'is-resizing-ui');
    const move = ev => {
      const dy = ev.clientY - sy;
      const size = Math.round(Math.min(THUMB_SIZE_MAX, Math.max(THUMB_SIZE_MIN, s0 + (atTop ? dy : -dy))));
      if (size === state.tlOpts.thumbSize) return;
      state.tlOpts.thumbSize = size;
      fitThumbs();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('is-dragging-ui', 'is-resizing-ui');
      saveState();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  grip.addEventListener('dblclick', () => {
    state.tlOpts.thumbSize = 0;
    fitThumbs();
    saveState();
  });
}

export function initFrames() {
  $('tl-first').addEventListener('click', firstFrame);
  $('tl-prev').addEventListener('click', prevFrame);
  $('tl-next').addEventListener('click', nextFrame);
  $('tl-last').addEventListener('click', lastFrame);
  $('tl-play').addEventListener('click', togglePlay);
  $('tl-add').addEventListener('click', addFrame);
  $('tl-dup').addEventListener('click', duplicateFrame);
  $('tl-del').addEventListener('click', deleteFrame);
  $('tl-multi').addEventListener('click', () => setMultiMode(!multiMode));
  $('tl-onion').addEventListener('click', toggleOnion);
  $('tl-fps').addEventListener('change', e => setFps(e.target.value));
  $('tl-dur').addEventListener('change', e => setDuration(e.target.value));
  $('tl-go').addEventListener('change', e => goFrameNumber(e.target.value));
  $('tl-tag').addEventListener('click', addTag);
  $('tl-ccopy').addEventListener('click', copyCelRange);
  $('tl-cpaste').addEventListener('click', pasteCelRange);
  $('tl-cclear').addEventListener('click', clearCelRange);
  $('tl-clink').addEventListener('click', linkCelRange);
  $('tl-cunlink').addEventListener('click', unlinkCelRange);
  // Wer woanders hinklickt, meint mit Strg+C wieder die Zeichenfläche.
  document.addEventListener('pointerdown', e => {
    if (!/** @type {HTMLElement} */ (e.target).closest?.('#timeline')) celFocus = false;
  }, true);
  for (const id of ['tl-fps', 'tl-dur', 'tl-go']) {
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  }
  // Wird die Leiste breiter oder schmaler (Fenster, Schublade, senkrechte
  // Anordnung), bekommen die Bildchen die neue Größe.
  const box = $('tl-frames');
  if (box && window.ResizeObserver) new ResizeObserver(() => fitThumbs()).observe(box);
  initThumbGrip();

  renderCallbacks.onRenderTimeline = renderTimeline;
  renderCallbacks.onEditorRendered = refreshCurrentThumb;
}
