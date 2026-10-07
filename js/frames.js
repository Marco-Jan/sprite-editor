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
import { state, getSprite, getPaletteByName, clearSelection, frameDuration, MAX_FPS, flatGrid, blankLike } from './state.js';
import { dc, cellToColor } from './data.js';
import { renderAll, renderEditor, renderCallbacks } from './render.js';
import { recordOp } from './history.js';
import { commitFloat } from './selection.js';
import { saveState } from './storage.js';
import { showInfoToast } from './toast.js';
import { iconSvg } from './icons.js';
import { t } from './i18n.js';
import { isMobileLayout } from './layout.js';

const $ = id => document.getElementById(id);
// Die Vorschaubilder wachsen mit dem Platz, den die Leiste hergibt: bei
// wenigen Frames werden sie groß, bei vielen schrumpfen sie bis CELL_MIN und
// die Reihe scrollt. CELL ist die Kantenlänge des ganzen Knopfes, das Bild
// sitzt abzüglich Rand und Polsterung darin.
const CELL_MIN = 30;
const CELL_MIN_TOUCH = 44;   // Handy: so groß wie die Styles es ohnehin erzwingen
const CELL_MAX = 56;    // waagerecht: mehr würde die Zeichenfläche beschneiden
const CELL_MAX_V = 80;  // senkrecht angeordnet ist Höhe kein Engpass
const CELL_PAD = 6;   // 1 px Rand + 2 px Polsterung je Seite
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

// Die Frames, auf die eine Aktion wirkt — immer aufsteigend.
function selectedFrames() {
  const sp = getSprite();
  if (!sp) return [];
  const ids = [...sel].filter(i => Number.isInteger(i) && i >= 0 && i < sp.frames.length);
  return ids.length > 1 ? ids.sort((a, b) => a - b) : [sp.frame];
}

const selectedCount = () => selectedFrames().length;

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

// Sprung auf eine eingetippte Nummer (1-basiert, wie in der Timeline).
export function goFrameNumber(v) {
  const sp = getSprite();
  if (!sp) return;
  const n = Math.round(Number(v));
  if (!n || n < 1 || n > sp.frames.length) { renderTimeline(); return; }
  resetSel();
  goFrame(n - 1);
  renderTimeline();
}
export function nextFrame() { const sp = getSprite(); if (sp) goFrame(sp.frame + 1); }
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
    const cels = sp.frames[sp.frame].cels.map(blankLike);
    sp.frames.splice(sp.frame + 1, 0, { cels, dur: 0 });
    sp.frame++;
  });
}

export function duplicateFrame() {
  resetSel();
  edit(sp => {
    const f = sp.frames[sp.frame];
    sp.frames.splice(sp.frame + 1, 0, { cels: f.cels.map(dc), dur: f.dur });
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

export function isPlaying() { return state.playing; }

export function play() {
  const sp = getSprite();
  if (!sp || sp.frames.length < 2 || state.playing) return;
  leaveFrame();
  state.playing = true;
  playingId = state.curSprite;
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
    showFrame(getSprite().frame + 1, true);
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
// Timeline
// ────────────────────────────────────────────────────────────────────
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

// Platz aufteilen: waagerecht teilen sich alle Frames die Breite der Reihe,
// senkrecht gibt die Spaltenbreite das Maß. Mehr als CELL_MAX wird es nie —
// sonst frisst die Leiste die Zeichenfläche. Passen die Frames nicht mehr,
// bleibt es bei CELL_MIN und die Reihe scrollt wie bisher.
function fitThumbs() {
  const box = $('tl-frames');
  const sp = getSprite();
  if (!box || !sp) return;
  const w = box.clientWidth;
  if (!w) return;   // noch nicht sichtbar — beim nächsten Mal
  const n = sp.frames.length;
  const gap = 4;
  const vertical = getComputedStyle(box).flexDirection === 'column';
  const room = vertical ? w - gap : Math.floor((w - gap * (n - 1)) / n);
  const min = isMobileLayout() ? CELL_MIN_TOUCH : CELL_MIN;
  const next = Math.max(min, Math.min(vertical ? CELL_MAX_V : CELL_MAX, room));
  if (next === cell) return;
  cell = next;
  box.style.setProperty('--tl-cell', cell + 'px');
  [...box.children].forEach(b => sizeThumb(b.firstChild));
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

export function renderTimeline() {
  const box = $('tl-frames');
  if (!box) return;
  const sp = getSprite();
  if (!sp) { box.innerHTML = ''; return; }
  // Die Auswahl gehört zu einem Sprite, nicht zur Timeline.
  if (selSprite !== state.curSprite) { resetSel(); selSprite = state.curSprite; }
  const pal = getPaletteByName(sp.palette);
  const n = sp.frames.length;
  while (box.children.length > n) box.lastChild.remove();
  while (box.children.length < n) box.append(makeThumb());
  fitThumbs();

  sp.frames.forEach((f, i) => {
    const b = box.children[i];
    b.dataset.i = i;
    drawThumb(b.firstChild, flatGrid(sp, i), pal);
    b.lastChild.textContent = i + 1;
    b.classList.toggle('has-dur', !!f.dur);
    b.title = t('tl.frameTitle', { i: i + 1, ms: frameDuration(sp, i) });
  });
  markActive();

  const fps = $('tl-fps'), dur = $('tl-dur'), go = $('tl-go');
  if (document.activeElement !== fps) fps.value = sp.fps;
  if (document.activeElement !== dur) dur.value = sp.frames[sp.frame].dur || '';
  dur.placeholder = Math.round(1000 / sp.fps);
  if (go) {
    go.max = n;
    if (document.activeElement !== go) go.value = sp.frame + 1;
    $('tl-total').textContent = '/ ' + n;
  }
  for (const id of ['tl-play', 'tl-prev', 'tl-next', 'tl-del']) $(id).disabled = n < 2;
  // Der Löschen-Knopf sagt, wie viele Frames er mitnimmt.
  const m = selectedCount();
  $('tl-del').title = m > 1 ? t('tl.delMany', { n: m }) : t('tl.delOne');
  const onion = $('tl-onion');
  onion.classList.toggle('is-active', state.onion);
  onion.setAttribute('aria-pressed', String(state.onion));
  syncPlayButton();
}

// Nur das Bild des aktuellen Frames — läuft bei jedem Zeichnen mit.
export function refreshCurrentThumb() {
  const sp = getSprite();
  const b = sp && $('tl-frames')?.children[sp.frame];
  if (b) drawThumb(b.firstChild, flatGrid(sp), getPaletteByName(sp.palette));
}

function markActive() {
  const box = $('tl-frames');
  const sp = getSprite();
  if (!box || !sp) return;
  const marked = sel.size > 1 ? sel : null;
  [...box.children].forEach((b, i) => {
    const on = i === sp.frame;
    b.classList.toggle('is-active', on);
    b.classList.toggle('is-marked', !!marked && marked.has(i));
    b.setAttribute('aria-selected', String(on || (!!marked && marked.has(i))));
    // Sichtbar halten, ohne die Seite zu scrollen.
    if (on) {
      const vertical = box.scrollHeight > box.clientHeight + 1 && box.scrollWidth <= box.clientWidth + 1;
      if (vertical) {
        if (b.offsetTop < box.scrollTop) box.scrollTop = b.offsetTop;
        else if (b.offsetTop + b.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = b.offsetTop + b.offsetHeight - box.clientHeight;
      } else {
        if (b.offsetLeft < box.scrollLeft) box.scrollLeft = b.offsetLeft;
        else if (b.offsetLeft + b.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = b.offsetLeft + b.offsetWidth - box.clientWidth;
      }
    }
  });
  updateFrameLabel();
}

function updateFrameLabel() {
  const sp = getSprite();
  const dur = $('tl-dur'), go = $('tl-go');
  if (sp && dur && document.activeElement !== dur) dur.value = sp.frames[sp.frame].dur || '';
  if (sp && go && document.activeElement !== go) go.value = sp.frame + 1;
}

// Ziehen sortiert um, ein Tipp wählt den Frame. Erst ab ein paar Pixeln
// Bewegung wird gezogen — die Leiste selbst scrollt auf dem Handy waagerecht,
// darum zählt dort nur eine Bewegung entlang der Leiste.
function initThumbDrag(b) {
  b.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const box = $('tl-frames');
    const vertical = getComputedStyle(box).flexDirection === 'column';
    const from = Number(b.dataset.i);
    const sx = e.clientX, sy = e.clientY;
    let dragging = false, target = from;

    const move = ev => {
      const d = vertical ? ev.clientY - sy : ev.clientX - sx;
      if (!dragging) {
        if (Math.abs(d) < 8) return;
        dragging = true;
        stop();
        resetSel();
        b.classList.add('is-dragging');
        try { b.setPointerCapture(ev.pointerId); } catch {}
      }
      ev.preventDefault();
      b.style.transform = vertical ? `translateY(${d}px)` : `translateX(${d}px)`;
      // Ziel: hinter dem letzten Frame, dessen Mitte der Zeiger passiert hat.
      const p = vertical ? ev.clientY : ev.clientX;
      target = 0;
      [...box.children].forEach((c, i) => {
        if (c === b) return;
        const r = c.getBoundingClientRect();
        const mid = vertical ? r.top + r.height / 2 : r.left + r.width / 2;
        if (p > mid) target = i < from ? i + 1 : i;
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
    const i = Number(b.dataset.i);
    const sp = getSprite();
    if (!sp) return;
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
  });
}

export function initFrames() {
  $('tl-prev').addEventListener('click', prevFrame);
  $('tl-next').addEventListener('click', nextFrame);
  $('tl-play').addEventListener('click', togglePlay);
  $('tl-add').addEventListener('click', addFrame);
  $('tl-dup').addEventListener('click', duplicateFrame);
  $('tl-del').addEventListener('click', deleteFrame);
  $('tl-onion').addEventListener('click', toggleOnion);
  $('tl-fps').addEventListener('change', e => setFps(e.target.value));
  $('tl-dur').addEventListener('change', e => setDuration(e.target.value));
  $('tl-go').addEventListener('change', e => goFrameNumber(e.target.value));
  for (const id of ['tl-fps', 'tl-dur', 'tl-go']) {
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  }
  // Wird die Leiste breiter oder schmaler (Fenster, Schublade, senkrechte
  // Anordnung), bekommen die Bildchen die neue Größe.
  const box = $('tl-frames');
  if (box && window.ResizeObserver) new ResizeObserver(() => fitThumbs()).observe(box);

  renderCallbacks.onRenderTimeline = renderTimeline;
  renderCallbacks.onEditorRendered = refreshCurrentThumb;
}
