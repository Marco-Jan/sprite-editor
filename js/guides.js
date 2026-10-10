// ════════════════════════════════════════════════════════════════════
// GUIDES — Hilfslinien: freie Linien und Figuren-Proportionen
// ════════════════════════════════════════════════════════════════════
// Reine Zeichenhilfe: nur in der Zeichenfläche zu sehen, nie im Export,
// kein Undo. Gespeichert je Sprite (state.js: sp.guides).
//
//   Freie Linien  — waagerecht (h, y-Werte) und senkrecht (v, x-Werte),
//                   immer auf einer Pixelgrenze.
//   Figur         — heads Kopfhöhen zwischen top und bottom, mit den
//                   üblichen Marken (Kinn, Brust, Hüfte, Knie …) und der
//                   Körperachse in der Mitte.
//
// Verschoben wird im Verschieben-Modus (state.guideEdit): dann gehört die
// Zeichenfläche den Linien, gemalt wird nicht. Eine freie Linie, die man
// aus dem Bild hinauszieht, ist gelöscht.
import { state, getSprite, flatGrid, FIGURE_HEADS } from './state.js';
import { renderEditor, renderCallbacks } from './render.js';
import { contentBounds } from './transform.js';
import { saveState } from './storage.js';
import { t, onLangChange } from './i18n.js';
import { showInfoToast } from './toast.js';
import { normalizeLayouts, makeLayout, upsertLayout, fitLayout, evenLines } from './guidelayouts.js';

/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);
const FREE = 'rgba(47, 211, 255, 0.9)';
const FIG = 'rgba(255, 128, 200, 0.9)';

// Marken je Einteilung: [Kopfhöhen von oben, i18n-Schlüssel]. Angelehnt an
// die gängigen Figuren-Kanons; bei kleinen Figuren sitzt alles höher.
const MARKS = {
  2: [[1, 'gd.chin']],
  3: [[1, 'gd.chin'], [2, 'gd.hip']],
  4: [[1, 'gd.chin'], [2, 'gd.hip'], [3, 'gd.knee']],
  6: [[1, 'gd.chin'], [2, 'gd.chest'], [3, 'gd.hip'], [4.5, 'gd.knee']],
  8: [[1, 'gd.chin'], [2, 'gd.chest'], [3, 'gd.navel'], [4, 'gd.crotch'], [6, 'gd.knee']],
};

const guides = () => getSprite()?.guides || null;

// ────────────────────────────────────────────────────────────────────
// Zeichnen (über Gitter und Auswahl, unter nichts)
// ────────────────────────────────────────────────────────────────────
function drawOverlay(ctx, W, H, cs) {
  const g = guides();
  if (!g || !state.showGuides) return;
  const wide = state.guideEdit ? 2 : 1;
  ctx.save();

  // Figur
  if (g.heads) {
    const top = Math.min(g.top, H - 1), bottom = Math.min(Math.max(g.bottom, top + 1), H);
    const unit = (bottom - top) / g.heads;
    const yOf = k => Math.round((top + k * unit) * cs) + 0.5;
    ctx.strokeStyle = FIG;
    ctx.lineWidth = wide;
    // Ober- und Unterkante durchgezogen
    ctx.beginPath();
    ctx.moveTo(0, top * cs + 0.5); ctx.lineTo(W * cs, top * cs + 0.5);
    ctx.moveTo(0, bottom * cs + 0.5); ctx.lineTo(W * cs, bottom * cs + 0.5);
    ctx.stroke();
    // Kopfhöhen gestrichelt
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (let k = 1; k < g.heads; k++) { ctx.moveTo(0, yOf(k)); ctx.lineTo(W * cs, yOf(k)); }
    // Körperachse
    ctx.moveTo(W * cs / 2 + 0.5, top * cs); ctx.lineTo(W * cs / 2 + 0.5, bottom * cs);
    ctx.stroke();
    // Marken zwischen zwei Kopfhöhen (z. B. Knie bei 4,5) bekommen eine eigene Linie.
    ctx.setLineDash([1, 3]);
    ctx.beginPath();
    for (const [k] of MARKS[g.heads]) {
      if (Number.isInteger(k)) continue;
      ctx.moveTo(0, yOf(k)); ctx.lineTo(W * cs, yOf(k));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // Beschriftung: Kopfnummern links, Marken rechts
    if (cs >= 4) {
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.fillStyle = FIG;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      for (let k = 0; k < g.heads; k++) {
        const y = yOf(k) + 2;
        ctx.strokeText(String(k + 1), 3, y);
        ctx.fillText(String(k + 1), 3, y);
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      for (const [k, key] of MARKS[g.heads]) {
        const y = yOf(k) - 2;
        ctx.strokeText(t(key), W * cs - 3, y);
        ctx.fillText(t(key), W * cs - 3, y);
      }
    }
  }

  // Freie Linien
  ctx.strokeStyle = FREE;
  ctx.lineWidth = wide;
  ctx.beginPath();
  for (const y of g.h) if (y <= H) { ctx.moveTo(0, y * cs + 0.5); ctx.lineTo(W * cs, y * cs + 0.5); }
  for (const x of g.v) if (x <= W) { ctx.moveTo(x * cs + 0.5, 0); ctx.lineTo(x * cs + 0.5, H * cs); }
  ctx.stroke();
  ctx.restore();
}

// ────────────────────────────────────────────────────────────────────
// Verschieben
// ────────────────────────────────────────────────────────────────────
// Welche Linie liegt unter dem Zeiger? → { kind: 'h'|'v'|'top'|'bottom', i }
function hitTest(e) {
  const g = guides();
  if (!g || !state.showGuides) return null;
  const cv = $('editor-canvas');
  const r = cv.getBoundingClientRect();
  const cs = state.cellSize;
  const px = e.clientX - r.left, py = e.clientY - r.top;
  const tol = Math.max(6, cs / 2);
  let best = null, bestD = tol + 1;
  const take = (d, hit) => { if (d < bestD) { bestD = d; best = hit; } };
  g.h.forEach((y, i) => take(Math.abs(py - y * cs), { kind: 'h', i }));
  g.v.forEach((x, i) => take(Math.abs(px - x * cs), { kind: 'v', i }));
  if (g.heads) {
    take(Math.abs(py - g.top * cs), { kind: 'top' });
    take(Math.abs(py - g.bottom * cs), { kind: 'bottom' });
  }
  return best;
}

/** Liegt der Zeiger auf einer Hilfslinie? (Hand-Werkzeug: Linie ziehen statt verschieben) */
export const guideAt = e => !!hitTest(e);

// Vom Canvas aufgerufen (app.js), solange der Verschieben-Modus läuft.
// Gibt immer true zurück: im Modus wird nicht gemalt. Ein Tipp neben die
// Linien beendet den Modus — auf dem Handy gibt es kein Esc.
export function guidePointerDown(e) {
  const hit = hitTest(e);
  if (!hit) { e.preventDefault(); toggleEdit(false); return true; }
  e.preventDefault();
  const sp = getSprite();
  const g = sp.guides;
  const cv = $('editor-canvas');
  const W = sp.grid[0].length, H = sp.grid.length;
  try { cv.setPointerCapture(e.pointerId); } catch {}

  const move = ev => {
    const r = cv.getBoundingClientRect();
    const cs = state.cellSize;
    const x = Math.round((ev.clientX - r.left) / cs), y = Math.round((ev.clientY - r.top) / cs);
    if (hit.kind === 'h') g.h[hit.i] = y;
    else if (hit.kind === 'v') g.v[hit.i] = x;
    else if (hit.kind === 'top') g.top = Math.max(0, Math.min(g.bottom - 1, y));
    else g.bottom = Math.max(g.top + 1, Math.min(H, y));
    renderEditor();
  };
  const up = ev => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    // Freie Linie aus dem Bild gezogen → weg. Sonst auf das Bild begrenzen.
    if (hit.kind === 'h' || hit.kind === 'v') {
      const list = g[hit.kind], max = hit.kind === 'h' ? H : W;
      if (list[hit.i] < 0 || list[hit.i] > max) {
        list.splice(hit.i, 1);
        renderCallbacks.onGuideInfo(t('gd.removed'));
      }
      const uniq = [...new Set(list)].sort((a, b) => a - b);
      list.length = 0;
      list.push(...uniq);
    }
    renderEditor();
    saveState();
    leaveIfEmpty();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  return true;
}

// Zeiger-Form im Verschieben-Modus: zeigt, was sich ziehen lässt.
function hoverCursor(e) {
  const wrap = $('editor-canvas-wrap');
  // Mit dem Hand-Werkzeug lassen sich Linien auch ohne den Modus greifen.
  const hand = state.tool === 'pan';
  if (!state.guideEdit && !hand) { wrap.style.cursor = ''; return; }
  const hit = hitTest(e);
  if (!state.guideEdit) { wrap.style.cursor = hit ? (hit.kind === 'v' ? 'ew-resize' : 'ns-resize') : ''; return; }
  wrap.style.cursor = !hit ? 'default' : (hit.kind === 'v' ? 'ew-resize' : 'ns-resize');
}

// ────────────────────────────────────────────────────────────────────
// Aktionen
// ────────────────────────────────────────────────────────────────────
function changed() {
  renderEditor();
  renderGuides();
  saveState();
}

export function toggleShow() {
  state.showGuides = !state.showGuides;
  if (!state.showGuides && state.guideEdit) { toggleEdit(false); return; }
  changed();
}

// Beim Beenden wird die Statuszeile geleert — der Hinweis gilt nicht mehr.
export function toggleEdit(on = !state.guideEdit) {
  state.guideEdit = on;
  if (on) state.showGuides = true;
  $('editor-canvas-wrap').classList.toggle('is-guide-edit', on);
  if (!on) $('editor-canvas-wrap').style.cursor = '';
  renderCallbacks.onGuideInfo(on ? t('gd.editInfo') : '');
  changed();
}

// Nichts mehr zu verschieben → zurück zum Malen.
function leaveIfEmpty() {
  const g = guides();
  if (state.guideEdit && g && !g.h.length && !g.v.length && !g.heads) toggleEdit(false);
}

// Neue Linie in der Mitte; danach gleich verschiebbar.
function addLine(kind) {
  const sp = getSprite();
  if (!sp) return;
  const W = sp.grid[0].length, H = sp.grid.length;
  const list = sp.guides[kind];
  let pos = Math.round((kind === 'h' ? H : W) / 2);
  while (list.includes(pos) && pos < (kind === 'h' ? H : W)) pos++;
  list.push(pos);
  list.sort((a, b) => a - b);
  state.showGuides = true;
  toggleEdit(true);
}

// Gleichmäßig verteilen: die Linien dieser Richtung werden ersetzt —
// jede Änderung der Zahl wirkt sofort.
function setEven(kind, n) {
  const sp = getSprite();
  if (!sp) return;
  const size = kind === 'h' ? sp.grid.length : sp.grid[0].length;
  const list = sp.guides[kind];
  list.length = 0;
  list.push(...evenLines(n, size));
  if (list.length) state.showGuides = true;
  changed();
  leaveIfEmpty();
}

function clearLines() {
  const g = guides();
  if (!g) return;
  g.h.length = 0;
  g.v.length = 0;
  changed();
  leaveIfEmpty();
}

function setHeads(n) {
  const g = guides();
  if (!g) return;
  g.heads = FIGURE_HEADS.includes(n) ? n : 0;
  if (g.heads) state.showGuides = true;
  changed();
  leaveIfEmpty();
}

// Ober- und Unterkante auf den gezeichneten Inhalt (was man sieht).
function fitFigure() {
  const sp = getSprite();
  if (!sp) return;
  const b = contentBounds(flatGrid(sp));
  const g = sp.guides;
  if (!b) { g.top = 0; g.bottom = sp.grid.length; }
  else { g.top = b.y; g.bottom = b.y + b.h; }
  if (!g.heads) g.heads = 6;
  state.showGuides = true;
  changed();
}

// ── Eigene Layouts (guidelayouts.js) ────────────────────────────────
// Für alle Sprites — darum in einem eigenen Eintrag im Browser, nicht im Sprite.
const LAYOUT_KEY = 'spritebit_guide_layouts';
let layouts = [];

function loadLayouts() {
  try { layouts = normalizeLayouts(JSON.parse(localStorage.getItem(LAYOUT_KEY) || '[]')); } catch { layouts = []; }
}
function storeLayouts() {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layouts)); } catch { /* privates Fenster o. Ä. */ }
}

function saveLayout() {
  const sp = getSprite();
  const inp = $('gd-layout-name');
  const name = inp.value.trim();
  if (!sp) return;
  if (!name) { renderCallbacks.onGuideInfo(t('gd.layoutNeedName')); inp.focus(); return; }
  const had = layouts.some(l => l.name === name);
  layouts = upsertLayout(layouts, makeLayout(name, sp.guides, sp.grid[0].length, sp.grid.length));
  storeLayouts();
  inp.value = '';
  renderGuides();
  $('gd-layouts').value = name;
  showInfoToast(t(had ? 'gd.layoutReplaced' : 'gd.layoutSaved', { name }));
}

function applyLayout() {
  const sp = getSprite();
  const l = layouts.find(x => x.name === $('gd-layouts').value);
  if (!sp || !l) return;
  const W = sp.grid[0].length, H = sp.grid.length;
  sp.guides = fitLayout(l, W, H);
  state.showGuides = true;
  changed();
  showInfoToast(t(l.width === W && l.height === H ? 'gd.layoutApplied' : 'gd.layoutScaled', { name: l.name, w: l.width, h: l.height }));
}

function deleteLayout() {
  const name = $('gd-layouts').value;
  if (!layouts.some(l => l.name === name)) return;
  layouts = layouts.filter(l => l.name !== name);
  storeLayouts();
  renderGuides();
  showInfoToast(t('gd.layoutDeleted', { name }));
}

function renderLayouts() {
  const sel = $('gd-layouts');
  if (!sel) return;
  const keep = sel.value;
  sel.innerHTML = layouts.length
    ? layouts.map(l => `<option value="${esc(l.name)}">${esc(l.name)} (${l.width} × ${l.height})</option>`).join('')
    : `<option value="">${esc(t('gd.layoutNone'))}</option>`;
  if (layouts.some(l => l.name === keep)) sel.value = keep;
  sel.disabled = !layouts.length;
  $('gd-layout-apply').disabled = !layouts.length || !getSprite();
  $('gd-layout-del').disabled = !layouts.length;
  $('gd-layout-save').disabled = !getSprite();
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderGuides() {
  const g = guides();
  const show = $('gd-show'), edit = $('gd-edit');
  if (!show) return;
  show.classList.toggle('is-active', state.showGuides);
  show.setAttribute('aria-pressed', String(state.showGuides));
  // Sagt, was ein Klick tut — „Anzeigen“ las sich, als wären sie gerade aus.
  show.textContent = t(state.showGuides ? 'gd.hideBtn' : 'gd.showBtn');
  edit.classList.toggle('is-active', state.guideEdit);
  edit.setAttribute('aria-pressed', String(state.guideEdit));
  const sel = $('gd-heads');
  if (g && document.activeElement !== sel) sel.value = String(g.heads);
  $('gd-fit').disabled = !g;
  $('gd-clear').disabled = !g || (!g.h.length && !g.v.length);
  // Die Felder zeigen, wie viele Linien es gerade gibt (außer beim Tippen).
  for (const k of ['h', 'v']) {
    const inp = $('gd-even-' + k);
    if (inp && document.activeElement !== inp) inp.value = String(g ? g[k].length : 0);
  }
  renderLayouts();
}

export function initGuides() {
  $('gd-show').addEventListener('click', toggleShow);
  $('gd-edit').addEventListener('click', () => toggleEdit());
  $('gd-add-h').addEventListener('click', () => addLine('h'));
  $('gd-add-v').addEventListener('click', () => addLine('v'));
  for (const k of ['h', 'v']) {
    $('gd-even-' + k).addEventListener('input', e => {
      if (e.target.value === '') return;
      setEven(k, Math.max(0, Math.min(64, Math.round(Number(e.target.value)) || 0)));
    });
  }
  $('gd-clear').addEventListener('click', clearLines);
  $('gd-heads').addEventListener('change', e => setHeads(Number(e.target.value)));
  $('gd-fit').addEventListener('click', fitFigure);
  loadLayouts();
  $('gd-layout-save').addEventListener('click', saveLayout);
  $('gd-layout-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveLayout(); });
  $('gd-layout-apply').addEventListener('click', applyLayout);
  $('gd-layout-del').addEventListener('click', deleteLayout);
  onLangChange(renderLayouts);
  onLangChange(renderGuides);
  $('editor-canvas').addEventListener('pointermove', hoverCursor);
  renderCallbacks.onDrawOverlay = drawOverlay;
  renderCallbacks.onRenderGuides = renderGuides;
}
