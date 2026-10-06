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

const $ = id => document.getElementById(id);
const THUMB = 32;   // Kantenlänge der Vorschaubilder in px

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
  edit(sp => {
    const cels = sp.frames[sp.frame].cels.map(blankLike);
    sp.frames.splice(sp.frame + 1, 0, { cels, dur: 0 });
    sp.frame++;
  });
}

export function duplicateFrame() {
  edit(sp => {
    const f = sp.frames[sp.frame];
    sp.frames.splice(sp.frame + 1, 0, { cels: f.cels.map(dc), dur: f.dur });
    sp.frame++;
  });
}

export function deleteFrame() {
  const sp = getSprite();
  if (!sp) return;
  if (sp.frames.length < 2) { showInfoToast(t('tl.lastFrame')); return; }
  edit(s => {
    s.frames.splice(s.frame, 1);
    s.frame = Math.min(s.frame, s.frames.length - 1);
  });
}

export function moveFrame(from, to) {
  const sp = getSprite();
  if (!sp || from === to || to < 0 || to >= sp.frames.length) return;
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

function drawThumb(cv, grid, pal) {
  const H = grid.length, W = grid[0].length;
  if (cv.width !== W || cv.height !== H) {
    cv.width = W;
    cv.height = H;
    const k = THUMB / Math.max(W, H);
    cv.style.width = Math.max(1, Math.round(W * k)) + 'px';
    cv.style.height = Math.max(1, Math.round(H * k)) + 'px';
  }
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
  const pal = getPaletteByName(sp.palette);
  const n = sp.frames.length;
  while (box.children.length > n) box.lastChild.remove();
  while (box.children.length < n) box.append(makeThumb());

  sp.frames.forEach((f, i) => {
    const b = box.children[i];
    b.dataset.i = i;
    drawThumb(b.firstChild, flatGrid(sp, i), pal);
    b.lastChild.textContent = i + 1;
    b.classList.toggle('has-dur', !!f.dur);
    b.title = t('tl.frameTitle', { i: i + 1, ms: frameDuration(sp, i) });
  });
  markActive();

  const fps = $('tl-fps'), dur = $('tl-dur');
  if (document.activeElement !== fps) fps.value = sp.fps;
  if (document.activeElement !== dur) dur.value = sp.frames[sp.frame].dur || '';
  dur.placeholder = Math.round(1000 / sp.fps);
  for (const id of ['tl-play', 'tl-prev', 'tl-next', 'tl-del']) $(id).disabled = n < 2;
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
  [...box.children].forEach((b, i) => {
    const on = i === sp.frame;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', String(on));
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
  const dur = $('tl-dur');
  if (sp && dur && document.activeElement !== dur) dur.value = sp.frames[sp.frame].dur || '';
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
  b.addEventListener('click', () => { if (!b.dataset.dragged) goFrame(Number(b.dataset.i)); });
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
  for (const id of ['tl-fps', 'tl-dur']) {
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  }
  renderCallbacks.onRenderTimeline = renderTimeline;
  renderCallbacks.onEditorRendered = refreshCurrentThumb;
}
