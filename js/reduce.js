// ════════════════════════════════════════════════════════════════════
// REDUCE — Bildfarben in eine eigene Palette überführen
// ════════════════════════════════════════════════════════════════════
// Ein gemalter Sprite kann mehr Farben enthalten, als eine Palette fasst —
// etwa nachdem eine Schablone abgetastet wurde. Dieser Dialog fasst sie per
// Median-Cut zusammen, zeigt Vorher/Nachher und schreibt das Bild erst beim
// Bestätigen um: Palette anlegen und Indizes umschreiben sind dabei EIN
// Undo-Schritt, sonst bliebe nach einem Rückgängig ein Bild ohne Palette.
//
// Der Dialog liegt in editor.html (#reduce-modal-overlay), die Farbarbeit in
// spritefx.js. Hier steht nur, was beides verbindet.
import { state, customPalettes, getSprite, getPal, getGrid, allGrids, uniquePaletteName } from './state.js';
import { MAX_COLORS, cellToColor } from './data.js';
import { hexToRgb, rgbToHex, medianCut } from './spritefx.js';
import { recordOp } from './history.js';
import { renderAll } from './render.js';
import { saveState } from './storage.js';
import { showInfoToast } from './toast.js';
import { t, tn } from './i18n.js';

/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);

/** Index (1-basiert) der Palette-Farbe, die `rgb` am nächsten kommt. */
function nearestRgbIndex(rgb, list) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const d = (rgb.r - p.r) ** 2 + (rgb.g - p.g) ** 2 + (rgb.b - p.b) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best + 1;
}

// Was der offene Dialog gerade bearbeitet. null = kein Dialog offen.
/** @type {{px: any[], distinct: string[], cache: Map<number, any>}|null} */
let reduce = null;

function collectImageColors() {
  const sp = getSprite();
  if (!sp) return null;
  const pal = getPal();
  const counts = new Map();
  for (const row of allGrids(sp).flat()) for (const c of row) {
    const hex = cellToColor(c, pal);
    if (!hex) continue;
    const k = hex.toLowerCase();
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  // Für den Median-Cut zählt jede Farbe so oft, wie sie vorkommt.
  const px = [];
  for (const [hex, n] of counts) { const rgb = hexToRgb(hex); for (let i = 0; i < n; i++) px.push(rgb); }
  return { px, distinct: [...counts.keys()] };
}

function reduceColors(count) {
  if (reduce.cache.has(count)) return reduce.cache.get(count);
  const colors = count >= reduce.distinct.length
    ? reduce.distinct.map(hexToRgb)
    : medianCut(reduce.px, count);
  // Hell → dunkel sortieren, damit Index 1 der hellste Ton ist.
  const lum = c => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  colors.sort((a, b) => lum(b) - lum(a));
  // Jede Bildfarbe einmal zuordnen statt jedes Pixel einzeln.
  const map = new Map(reduce.distinct.map(hex => [hex, nearestRgbIndex(hexToRgb(hex), colors)]));
  const res = { colors, map };
  reduce.cache.set(count, res);
  return res;
}

function drawReduceCanvas(canvas, colorOf) {
  const grid = getGrid(), pal = getPal();
  const H = grid.length, W = grid[0].length;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const hex = cellToColor(grid[y][x], pal);
    if (!hex) continue;
    ctx.fillStyle = colorOf(hex.toLowerCase());
    ctx.fillRect(x, y, 1, 1);
  }
}

function renderReducePreview() {
  const count = Number($('reduce-count').value);
  const { colors, map } = reduceColors(count);
  const hexes = colors.map(c => rgbToHex(c.r, c.g, c.b));
  drawReduceCanvas($('reduce-after'), hex => hexes[map.get(hex) - 1]);
  $('reduce-after-cap').textContent = tn('red.after', colors.length);
  const sw = $('reduce-swatches');
  sw.innerHTML = '';
  sw.style.setProperty('--cols', colors.length > 16 ? '16' : '8');
  for (const hex of hexes) {
    const el = document.createElement('span');
    el.className = 'pal-sw';
    el.style.background = hex;
    el.title = hex;
    sw.appendChild(el);
  }
}

export function openReduceModal() {
  if (!getSprite()) { showInfoToast(t('tpl.needSprite')); return; }
  const data = collectImageColors();
  if (!data || !data.px.length) { showInfoToast(t('tpl.imageEmpty')); return; }
  reduce = { ...data, cache: new Map() };
  const n = data.distinct.length;

  const sel = $('reduce-count');
  sel.innerHTML = '';
  const add = (value, label) => {
    const o = document.createElement('option');
    o.value = value; o.textContent = label;
    sel.appendChild(o);
  };
  if (n <= MAX_COLORS) add(n, tn('red.all', n));
  for (const c of [255, 128, 64, 32, 16, 8, 4]) if (c < n) add(c, tn('red.count', c));
  sel.value = String(Math.min(n, MAX_COLORS));

  $('reduce-intro').textContent = tn('red.intro', n, { max: MAX_COLORS });
  drawReduceCanvas($('reduce-before'), hex => hex);
  renderReducePreview();
  $('reduce-modal-overlay').classList.add('open');
}

function applyReduce() {
  const sp = getSprite();
  if (!sp || !reduce) return;
  const { colors, map } = reduceColors(Number($('reduce-count').value));
  const pal = getPal();

  const name = uniquePaletteName('foto');
  const palObj = {};
  colors.forEach((c, i) => { palObj[i + 1] = rgbToHex(c.r, c.g, c.b); });
  customPalettes[name] = palObj;

  // Grid auf die neuen Indizes umschreiben — mit der Palette ein Undo-Schritt.
  recordOp(() => {
    for (const row of allGrids(sp).flat()) for (let x = 0; x < row.length; x++) {
      const hex = cellToColor(row[x], pal);
      row[x] = hex ? map.get(hex.toLowerCase()) : 0;
    }
    sp.palette = name;
  });

  $('reduce-modal-overlay').classList.remove('open');
  reduce = null;
  state.palPreview = null;
  if (typeof state.curColor !== 'number' || state.curColor > colors.length) state.curColor = 1;
  renderAll();
  saveState();
  showInfoToast(t('pal.fromImage', { name, n: colors.length }));
}

export function initReduceModal() {
  const overlay = $('reduce-modal-overlay');
  const close = () => { overlay.classList.remove('open'); reduce = null; };
  $('reduce-count').addEventListener('change', renderReducePreview);
  $('reduce-cancel').addEventListener('click', close);
  $('reduce-apply').addEventListener('click', applyReduce);
  // Kein Schließen per Klick daneben — ein Fehlklick (oder Text markieren und
  // außerhalb loslassen) soll die Eingaben nicht verwerfen. Abbrechen oder Esc.
}
