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
import { t, onLangChange } from './i18n.js';

// ────────────────────────────────────────────────────────────────────
// DOM-Refs (werden in initTemplate() gesetzt, nicht beim Modul-Load —
// damit das HTML existiert wenn wir's brauchen)
// ────────────────────────────────────────────────────────────────────
/** @type {HTMLImageElement} */
let tplImg;
/** @type {HTMLInputElement} */
let tplFile, tplOpacity, tplOpacityNum, tplScale, tplScaleNum;
let tplClear, tplCenterBtn, tplTraceBtn, tplTraceRawBtn, tplQuantRow;

// Pixel-Offset gegenüber Mitte (state der Verschiebung)
let tplOffsetX = 0, tplOffsetY = 0;
let tplName = '';          // Dateiname der geladenen Schablone
let tplRestored = false;   // true = aus dem letzten Besuch wiederhergestellt

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
  tplImg.style.opacity = String(v / 100);
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
  return !!(tplImg && !tplImg.hidden && tplImg.getAttribute('src'));
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
  saveTplCfg();
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

// ────────────────────────────────────────────────────────────────────
// Auto-Trace: tastet die aktuell positionierte Schablone für ein W×H-Grid ab.
// Liefert eine 2D-Matrix mit { r, g, b, a } pro Zelle (oder null = außerhalb
// der Schablone). Respektiert Verschiebung, Skalierung und Letterbox genau wie
// sampleTplAt — arbeitet aber effizient mit EINER getImageData-Abfrage und
// mittelt alle Original-Pixel, die eine Zelle abdeckt (alpha-gewichtet).
// ────────────────────────────────────────────────────────────────────
export function sampleTemplateGrid(W, H) {
  if (!tplOffscreen) return null;
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('editor-canvas'));
  const cr = canvas.getBoundingClientRect();  // Zeichenfläche am Bildschirm
  const tr = tplImg.getBoundingClientRect();   // Schablonen-Box am Bildschirm
  if (!cr.width || !cr.height || !tr.width || !tr.height) return null;

  // Letterbox-Geometrie der Schablone innerhalb ihrer Box (object-fit:contain)
  const natW = tplImg.naturalWidth, natH = tplImg.naturalHeight;
  const aspectImg = natW / natH;
  const aspectBox = tr.width / tr.height;
  let dispW, dispH, offX, offY;
  if (aspectImg > aspectBox) {
    dispW = tr.width;  dispH = tr.width / aspectImg;
    offX = 0;          offY = (tr.height - dispH) / 2;
  } else {
    dispH = tr.height; dispW = tr.height * aspectImg;
    offY = 0;          offX = (tr.width - dispW) / 2;
  }

  const src = tplOffscreen.getContext('2d').getImageData(0, 0, natW, natH).data;

  // Bildschirm-Koordinate → Schablonen-Pixel-Koordinate
  const sx2ix = sx => (sx - tr.left - offX) / dispW * natW;
  const sy2iy = sy => (sy - tr.top  - offY) / dispH * natH;

  const cw = cr.width / W, ch = cr.height / H;  // Zellgröße am Bildschirm
  const out = [];
  for (let gy = 0; gy < H; gy++) {
    const row = [];
    for (let gx = 0; gx < W; gx++) {
      // Pixel-Bereich der Schablone, den diese Zelle abdeckt
      let ax = sx2ix(cr.left + gx * cw),       bx = sx2ix(cr.left + (gx + 1) * cw);
      let ay = sy2iy(cr.top  + gy * ch),       by = sy2iy(cr.top  + (gy + 1) * ch);
      let px0 = Math.floor(Math.min(ax, bx)),  px1 = Math.ceil(Math.max(ax, bx)) - 1;
      let py0 = Math.floor(Math.min(ay, by)),  py1 = Math.ceil(Math.max(ay, by)) - 1;
      px0 = Math.max(0, px0); py0 = Math.max(0, py0);
      px1 = Math.min(natW - 1, px1); py1 = Math.min(natH - 1, py1);
      if (px1 < px0 || py1 < py0) { row.push(null); continue; } // Zelle außerhalb

      // Alpha-gewichteter Farbmittelwert über den abgedeckten Bereich
      let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
      for (let py = py0; py <= py1; py++) {
        let o = (py * natW + px0) * 4;
        for (let px = px0; px <= px1; px++, o += 4) {
          const a = src[o + 3];
          sr += src[o] * a; sg += src[o + 1] * a; sb += src[o + 2] * a;
          sa += a; n++;
        }
      }
      const aAvg = n ? sa / n : 0;
      if (sa === 0) { row.push({ r: 0, g: 0, b: 0, a: 0 }); continue; }
      row.push({ r: Math.round(sr / sa), g: Math.round(sg / sa), b: Math.round(sb / sa), a: Math.round(aAvg) });
    }
    out.push(row);
  }
  return out;
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
// Shift+Alt-Foreground: bringt Bild über die Pixel mit voller Deckkraft
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
// Persistenz — Schablone überlebt Browser-Reload (localStorage)
// Bild als Data-URL unter eigenem Key (separat von den Sprites, damit ein
// großes Bild nicht den Haupt-Save sprengt). Config (Deckkraft/Größe/Position)
// klein und separat, damit Slider-Ziehen nicht jedes Mal das Bild neu schreibt.
// ────────────────────────────────────────────────────────────────────
const TPL_IMG_KEY = 'wb_sprite_template_img_v1';
const TPL_CFG_KEY = 'wb_sprite_template_cfg_v1';

function saveTplImg() {
  try { localStorage.setItem(TPL_IMG_KEY, tplImg.src || ''); }
  catch (e) { console.warn('Schablone: Bild zu groß für localStorage — wird nicht über Reload behalten', e); }
}
function saveTplCfg() {
  try {
    localStorage.setItem(TPL_CFG_KEY, JSON.stringify({
      opacity: tplOpacity.value, scale: tplScale.value,
      offsetX: tplOffsetX, offsetY: tplOffsetY, name: tplName,
    }));
  } catch (e) { /* Config ist klein — Fehler ignorieren */ }
}
function clearTplStorage() {
  try { localStorage.removeItem(TPL_IMG_KEY); localStorage.removeItem(TPL_CFG_KEY); } catch (e) {}
}
// Für "Zurücksetzen" in der Kopfzeile: die Schablone gehört zu "alles".
export function forgetTemplate() { clearTplStorage(); }

// Zeigt im Panel, ob und welche Schablone geladen ist — inklusive Hinweis,
// dass sie gespeichert bleibt, bis man sie entfernt.
function syncTplStatus() {
  const box = document.getElementById('template-status');
  if (!box) return;
  const loaded = !!tplImg.getAttribute('src');
  box.hidden = !loaded;
  document.getElementById('template-pick-label').textContent = t(loaded ? 'tpl.pickOther' : 'tpl.pick');
  if (!loaded) return;
  /** @type {HTMLImageElement} */ (document.getElementById('template-thumb')).src = tplImg.src;
  document.getElementById('template-name').textContent = tplName || t('tpl.unnamed');
  document.getElementById('template-note').textContent = t(tplRestored ? 'tpl.restored' : 'tpl.kept');
}

// Schablone-Bedienelemente ein-/ausblenden (Buttons + Quant-Zeile).
// Über das hidden-Attribut statt inline-display, damit das CSS die
// Darstellungsart (flex/inline) behält.
function showTplControls(show) {
  [tplClear, tplCenterBtn, tplTraceBtn, tplTraceRawBtn, tplQuantRow, document.getElementById('template-trace-head')]
    .forEach(el => { if (el) el.hidden = !show; });
}

// ────────────────────────────────────────────────────────────────────
// Initialisierung — Event-Bindings aufsetzen
// ────────────────────────────────────────────────────────────────────
export function initTemplate() {
  tplImg        = /** @type {HTMLImageElement} */ (document.getElementById('template-overlay'));
  tplFile       = /** @type {HTMLInputElement} */ (document.getElementById('template-file'));
  tplOpacity    = /** @type {HTMLInputElement} */ (document.getElementById('template-opacity'));
  tplOpacityNum = /** @type {HTMLInputElement} */ (document.getElementById('template-opacity-num'));
  tplScale      = /** @type {HTMLInputElement} */ (document.getElementById('template-scale'));
  tplScaleNum   = /** @type {HTMLInputElement} */ (document.getElementById('template-scale-num'));
  tplClear      = document.getElementById('template-clear');
  tplCenterBtn  = document.getElementById('template-center');
  tplTraceBtn    = document.getElementById('template-trace');
  tplTraceRawBtn = document.getElementById('template-trace-raw');
  tplQuantRow    = document.getElementById('tpl-quant-row');

  tplImg.addEventListener('load', buildTplOffscreen);

  tplFile.addEventListener('change', e => {
    const files = /** @type {HTMLInputElement} */ (e.target).files;
    const file = files && files[0];
    if (!file) return;
    // Als Data-URL einlesen (statt ObjectURL) — überlebt Reload & taintet
    // den Canvas nicht (getImageData für Pipette/Trace bleibt erlaubt).
    const reader = new FileReader();
    reader.onload = ev => {
      tplName = file.name;
      tplRestored = false;
      tplImg.src = /** @type {string} */ (ev.target.result); // readAsDataURL liefert Text
      tplImg.hidden = false;
      centerTpl();
      applyTplOpacity();
      applyTplScale();
      showTplControls(true);
      saveTplImg();
      saveTplCfg();
      syncTplStatus();
      tplFile.value = '';   // gleiche Datei nochmal wählen löst wieder 'change' aus
    };
    reader.readAsDataURL(file);
  });

  tplOpacity.addEventListener('input',    () => { applyTplOpacity('range'); saveTplCfg(); });
  tplOpacityNum.addEventListener('input', () => { applyTplOpacity('num');   saveTplCfg(); });
  tplScale.addEventListener('input',      () => { applyTplScale('range');   saveTplCfg(); });
  tplScaleNum.addEventListener('input',   () => { applyTplScale('num');     saveTplCfg(); });

  tplClear.addEventListener('click', () => {
    tplImg.removeAttribute('src');
    tplImg.hidden = true;
    tplFile.value = '';
    showTplControls(false);
    tplOffscreen = null;
    centerTpl();
    clearTplStorage();
    tplName = '';
    syncTplStatus();
  });

  tplCenterBtn.addEventListener('click', () => { centerTpl(); saveTplCfg(); });

  // Shift+Alt halten (egal in welcher Reihenfolge): Schablone in den
  // Vordergrund. Shift allein ist fürs seitliche Scrollen da.
  document.addEventListener('keydown', e => {
    if ((e.key === 'Shift' || e.key === 'Alt') && e.shiftKey && e.altKey && !e.repeat) {
      // Nicht triggern wenn Fokus in einem Input — sonst kann man nicht tippen
      const tag = /** @type {HTMLElement} */ (e.target).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();   // Alt soll nicht das Browser-Menü ansteuern
      bringTplToFront();
    }
  });
  document.addEventListener('keyup', e => {
    if (e.key === 'Shift' || e.key === 'Alt') restoreTpl();
  });
  // Falls Fokus weg geht während Shift gehalten — Reset
  window.addEventListener('blur', restoreTpl);

  // Gespeicherte Schablone wiederherstellen (überlebt Browser-Reload).
  try {
    const src = localStorage.getItem(TPL_IMG_KEY);
    if (src) {
      const cfg = JSON.parse(localStorage.getItem(TPL_CFG_KEY) || '{}');
      if (cfg.opacity != null) { tplOpacity.value = cfg.opacity; tplOpacityNum.value = cfg.opacity; }
      if (cfg.scale != null)   { tplScale.value = cfg.scale; tplScaleNum.value = cfg.scale; }
      tplOffsetX = cfg.offsetX || 0;
      tplOffsetY = cfg.offsetY || 0;
      tplName = cfg.name || '';
      tplRestored = true;
      tplImg.src = src;                 // löst 'load' → buildTplOffscreen aus
      tplImg.hidden = false;
      applyTplOpacity();
      applyTplScale();
      applyTplPosition();
      showTplControls(true);
    }
  } catch (e) {
    console.warn('Schablone: Wiederherstellen fehlgeschlagen', e);
  }
  syncTplStatus();
  onLangChange(syncTplStatus);
}
