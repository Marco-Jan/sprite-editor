// ════════════════════════════════════════════════════════════════════
// TEMPLATE (Schablone) — Referenzbild zum Abzeichnen
// ════════════════════════════════════════════════════════════════════
// Features:
//   - Upload (lokale Datei via FileReader/ObjectURL)
//   - Deckkraft 0-100% (Slider + Number-Input synchron)
//   - Größe 10-200% (Slider + Number-Input synchron)
//   - Verschieben (Shift+Linksklick+drag auf Canvas)
//   - Zentrieren-Button
//   - Pipette (Shift+Rechtsklick): exakter Hex-Wert aus Bild
//   - Shift halten: in Vordergrund (volle Deckkraft, über die Pixel)
import { state } from './state.js';
import { syncColorActive } from './render.js';
import { saveState } from './storage.js';

// ────────────────────────────────────────────────────────────────────
// DOM-Refs (werden in initTemplate() gesetzt, nicht beim Modul-Load —
// damit das HTML existiert wenn wir's brauchen)
// ────────────────────────────────────────────────────────────────────
let tplImg, tplFile, tplOpacity, tplOpacityNum, tplScale, tplScaleNum, tplClear, tplCenterBtn;

// Pixel-Offset gegenüber Mitte (state der Verschiebung)
let tplOffsetX = 0, tplOffsetY = 0;

// Offscreen-Canvas mit dem Originalbild — Quelle für getImageData() bei der Pipette.
// Wird neu aufgebaut sobald `tplImg.onload` feuert.
let tplOffscreen = null;

// Drag-State (Shift+Linksklick auf Canvas → verschiebt Schablone)
let _tplDragging = false;
let _tplDragStart = { mx:0, my:0, ox:0, oy:0 };

// Shift-Foreground-State (Shift halten → Schablone opaque + on top)
let _shiftHeld = false;
let _savedTplOpacity = null;
let _savedTplZ = null;

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────
function clamp(v, min, max) {
  v = Number(v);
  if (!Number.isFinite(v)) v = min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function applyTplOpacity(source) {
  const raw = source === 'num' ? tplOpacityNum.value : tplOpacity.value;
  const v = clamp(raw, 0, 100);
  tplOpacity.value    = v;
  tplOpacityNum.value = v;
  tplImg.style.opacity = v / 100;
}

function applyTplScale(source) {
  const raw = source === 'num' ? tplScaleNum.value : tplScale.value;
  const v = clamp(raw, 10, 200);
  tplScale.value    = v;
  tplScaleNum.value = v;
  tplImg.style.width  = v + '%';
  tplImg.style.height = v + '%';
}

function applyTplPosition() {
  tplImg.style.transform = `translate(calc(-50% + ${tplOffsetX}px), calc(-50% + ${tplOffsetY}px))`;
}

export function centerTpl() {
  tplOffsetX = 0; tplOffsetY = 0;
  applyTplPosition();
}

function buildTplOffscreen() {
  if (!tplImg.src || !tplImg.complete || !tplImg.naturalWidth) { tplOffscreen = null; return; }
  tplOffscreen = document.createElement('canvas');
  tplOffscreen.width  = tplImg.naturalWidth;
  tplOffscreen.height = tplImg.naturalHeight;
  try {
    tplOffscreen.getContext('2d').drawImage(tplImg, 0, 0);
  } catch (e) {
    // CORS-Schutz blockt getImageData() bei Cross-Origin-Bildern —
    // bei lokal hochgeladenen Bildern (ObjectURL) ist das nicht relevant.
    console.warn('Schablone: Offscreen-Canvas fehlgeschlagen', e);
    tplOffscreen = null;
  }
}

// ────────────────────────────────────────────────────────────────────
// Öffentliche Status-Abfragen (für andere Module)
// ────────────────────────────────────────────────────────────────────
export function tplLoaded() {
  return tplImg && tplImg.style.display !== 'none' && tplImg.src;
}

export function tplHasOffscreen() {
  return tplOffscreen !== null;
}

// ────────────────────────────────────────────────────────────────────
// Drag-API (wird von events.js / app.js bei mousedown/move/up aufgerufen)
// ────────────────────────────────────────────────────────────────────
export function startTplDrag(e) {
  _tplDragging = true;
  _tplDragStart = { mx: e.clientX, my: e.clientY, ox: tplOffsetX, oy: tplOffsetY };
  document.body.style.cursor = 'move';
}
export function tplDragging() { return _tplDragging; }
export function updateTplDrag(e) {
  if (!_tplDragging) return;
  tplOffsetX = _tplDragStart.ox + (e.clientX - _tplDragStart.mx);
  tplOffsetY = _tplDragStart.oy + (e.clientY - _tplDragStart.my);
  applyTplPosition();
}
export function endTplDrag() {
  if (!_tplDragging) return;
  _tplDragging = false;
  document.body.style.cursor = '';
}
export function getTplOffset() {
  return { x: tplOffsetX, y: tplOffsetY };
}

// ────────────────────────────────────────────────────────────────────
// Pipette: Maus-Position → Pixel im Schablonen-Bild → RGB
// Achtet auf object-fit:contain (Letterbox/Pillarbox-Ränder)
// ────────────────────────────────────────────────────────────────────
export function sampleTplAt(clientX, clientY) {
  if (!tplOffscreen) return null;
  const r = tplImg.getBoundingClientRect();
  const lx = clientX - r.left;
  const ly = clientY - r.top;
  if (lx < 0 || ly < 0 || lx >= r.width || ly >= r.height) return null;

  const natW = tplImg.naturalWidth, natH = tplImg.naturalHeight;
  const aspectImg = natW / natH;
  const aspectBox = r.width / r.height;
  let dispW, dispH, offX, offY;
  if (aspectImg > aspectBox) {
    // letterboxed top/bottom
    dispW = r.width;  dispH = r.width / aspectImg;
    offX = 0;          offY = (r.height - dispH) / 2;
  } else {
    // pillarboxed left/right
    dispH = r.height; dispW = r.height * aspectImg;
    offY = 0;          offX = (r.width - dispW) / 2;
  }
  const ix = lx - offX, iy = ly - offY;
  if (ix < 0 || iy < 0 || ix >= dispW || iy >= dispH) return null;

  const px = Math.floor(ix / dispW * natW);
  const py = Math.floor(iy / dispH * natH);
  const data = tplOffscreen.getContext('2d').getImageData(px, py, 1, 1).data;
  return { r: data[0], g: data[1], b: data[2], a: data[3] };
}

// Schablone-Pipette aufrufen — setzt state.curColor auf exakten Hex.
// Rückgabe: 'ok' | 'outside' | 'transparent'
export function doTemplatePipette(e) {
  const rgb = sampleTplAt(e.clientX, e.clientY);
  if (!rgb) return { status: 'outside' };
  if (rgb.a === 0) return { status: 'transparent' };
  const hex = '#' + [rgb.r, rgb.g, rgb.b].map(v => v.toString(16).padStart(2, '0')).join('');
  state.curColor = hex;
  syncColorActive();
  saveState();
  return { status: 'ok', hex };
}

// ────────────────────────────────────────────────────────────────────
// Shift-Foreground: bringt Bild über die Pixel mit voller Deckkraft
// ────────────────────────────────────────────────────────────────────
function bringTplToFront() {
  if (!tplLoaded() || _shiftHeld) return;
  _shiftHeld = true;
  _savedTplOpacity = tplImg.style.opacity;
  _savedTplZ = tplImg.style.zIndex;
  tplImg.style.opacity = '1';
  tplImg.style.zIndex = '10';
}
function restoreTpl() {
  if (!_shiftHeld) return;
  _shiftHeld = false;
  if (_savedTplOpacity !== null) tplImg.style.opacity = _savedTplOpacity;
  if (_savedTplZ !== null)       tplImg.style.zIndex  = _savedTplZ;
  _savedTplOpacity = _savedTplZ = null;
}

// ────────────────────────────────────────────────────────────────────
// Initialisierung — Event-Bindings aufsetzen
// ────────────────────────────────────────────────────────────────────
export function initTemplate() {
  tplImg        = document.getElementById('template-overlay');
  tplFile       = document.getElementById('template-file');
  tplOpacity    = document.getElementById('template-opacity');
  tplOpacityNum = document.getElementById('template-opacity-num');
  tplScale      = document.getElementById('template-scale');
  tplScaleNum   = document.getElementById('template-scale-num');
  tplClear      = document.getElementById('template-clear');
  tplCenterBtn  = document.getElementById('template-center');

  tplImg.addEventListener('load', buildTplOffscreen);

  tplFile.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (tplImg.dataset.objectUrl) URL.revokeObjectURL(tplImg.dataset.objectUrl);
    const url = URL.createObjectURL(file);
    tplImg.dataset.objectUrl = url;
    tplImg.src = url;
    tplImg.style.display = 'block';
    centerTpl();
    applyTplOpacity();
    applyTplScale();
    tplClear.style.display = 'inline-block';
    tplCenterBtn.style.display = 'inline-block';
  });

  tplOpacity.addEventListener('input',    () => applyTplOpacity('range'));
  tplOpacityNum.addEventListener('input', () => applyTplOpacity('num'));
  tplScale.addEventListener('input',      () => applyTplScale('range'));
  tplScaleNum.addEventListener('input',   () => applyTplScale('num'));

  tplClear.addEventListener('click', () => {
    if (tplImg.dataset.objectUrl) URL.revokeObjectURL(tplImg.dataset.objectUrl);
    tplImg.removeAttribute('src');
    delete tplImg.dataset.objectUrl;
    tplImg.style.display = 'none';
    tplFile.value = '';
    tplClear.style.display = 'none';
    tplCenterBtn.style.display = 'none';
    tplOffscreen = null;
    centerTpl();
  });

  tplCenterBtn.addEventListener('click', centerTpl);

  // Shift-Hold global: bringt Schablone in den Vordergrund
  document.addEventListener('keydown', e => {
    if (e.key === 'Shift' && !e.repeat) {
      // Nicht triggern wenn Fokus in einem Input — sonst kann man kein Shift+Buchstabe tippen
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      bringTplToFront();
    }
  });
  document.addEventListener('keyup', e => {
    if (e.key === 'Shift') restoreTpl();
  });
  // Falls Fokus weg geht während Shift gehalten — Reset
  window.addEventListener('blur', restoreTpl);
}
