// ════════════════════════════════════════════════════════════════════
// PREVIEW — der ganze Sprite, unabhängig vom Zoom der Zeichenfläche
// ════════════════════════════════════════════════════════════════════
// Beim Arbeiten ist man meist weit hineingezoomt und sieht einen Ausschnitt.
// Dieses Panel zeigt daneben immer das ganze Bild — und zwar so, wie es
// später wirklich aussieht: ohne Gitter, ohne Schachbrett-Hintergrund, ohne
// Hilfslinien, ohne Onion Skin. Es zeichnet dieselben Ebenen, die auch der
// Export nimmt.
//
// Die Pixelgröße ist einstellbar:
//   fit        so groß, wie das Panel hergibt (Standard)
//   1× 2× 4× 8×  feste Größe — 1× ist die Größe im Spiel
//
// Beim Abspielen läuft die Vorschau mit: jeder Frame-Wechsel zeichnet die
// Fläche neu, und daran hängt diese hier (renderCallbacks.onEditorRendered).
import { state, getSprite, getPaletteByName, flatGrid } from './state.js';
import { cellToColor } from './data.js';
import { renderCallbacks } from './render.js';
import { saveState } from './storage.js';
import { t } from './i18n.js';

/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);

// Mehr als das wird ein Pixel nie — darüber sieht man nur noch Klötze.
const MAX_SCALE = 8;

/**
 * Pixelgröße für die Vorschau.
 * @param {number} w        Breite des Sprites in Pixeln
 * @param {number} h        Höhe
 * @param {number} boxW     verfügbare Breite in Bildschirmpixeln
 * @param {number} boxH     verfügbare Höhe
 * @param {number|null} fixed  feste Größe, oder null für „einpassen"
 * @returns {number}        Bildschirmpixel je Sprite-Pixel, mindestens 1
 */
export function previewScale(w, h, boxW, boxH, fixed) {
  if (fixed) return fixed;
  if (!w || !h || boxW <= 0 || boxH <= 0) return 1;
  // Ganze Zahlen: ein halber Pixel wäre unscharf, und darum geht es hier.
  return Math.max(1, Math.min(MAX_SCALE, Math.floor(Math.min(boxW / w, boxH / h))));
}

/** Gewählte Pixelgröße, null = einpassen. */
function fixedScale() {
  const v = Number($('preview-scale')?.value || 0);
  return v > 0 ? v : null;
}

export function renderPreview() {
  const cv = $('preview-canvas');
  if (!cv || cv.offsetParent === null) return;   // Panel zu oder nicht sichtbar
  const sp = getSprite();
  const box = cv.parentElement;
  const info = $('preview-info');

  if (!sp) {
    cv.width = cv.height = 0;
    if (info) info.textContent = '';
    return;
  }

  const grid = flatGrid(sp);
  const pal = getPaletteByName(sp.palette);
  const H = grid.length, W = grid[0].length;
  const scale = previewScale(W, H, box.clientWidth, box.clientHeight || 240, fixedScale());

  // Gezeichnet wird in Sprite-Größe, vergrößert wird über die CSS-Breite —
  // so bleiben die Kanten hart, egal wie groß es steht.
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  cv.style.width = W * scale + 'px';
  cv.style.height = H * scale + 'px';
  // Schachbrett: ein Feld je Sprite-Pixel, bei winziger Darstellung gröber,
  // sonst flimmert es nur.
  cv.style.setProperty('--chk', Math.max(4, scale) * 2 + 'px');

  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const hex = cellToColor(grid[y][x], pal);
    if (!hex) continue;                      // transparent bleibt transparent
    const h = hex.length === 4 ? '#' + [...hex.slice(1)].map(c => c + c).join('') : hex;
    const o = (y * W + x) * 4;
    d[o]     = parseInt(h.slice(1, 3), 16);
    d[o + 1] = parseInt(h.slice(3, 5), 16);
    d[o + 2] = parseInt(h.slice(5, 7), 16);
    d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  if (info) info.textContent = t('pv.info', { w: W, h: H, scale });
}

export function initPreview() {
  const sel = $('preview-scale');
  if (!sel) return;
  if (typeof state.previewScale === 'number') sel.value = String(state.previewScale);
  sel.addEventListener('change', () => {
    state.previewScale = Number(sel.value) || 0;
    renderPreview();
    saveState();
  });

  // Mitzeichnen: bei jedem Strich, jedem Frame-Wechsel, jedem Abspiel-Schritt.
  const vorher = renderCallbacks.onEditorRendered;
  renderCallbacks.onEditorRendered = () => { vorher(); renderPreview(); };

  // Wird das Panel breiter oder schmaler, passt sich „fit" an.
  const box = $('preview-canvas')?.parentElement;
  if (box && window.ResizeObserver) new ResizeObserver(() => renderPreview()).observe(box);
  // Und sobald das Panel aufgeht: dock.js setzt dafuer eine Klasse. Ohne das
  // bliebe die Flaeche nach dem Oeffnen leer, bis man den ersten Strich zieht.
  const panel = document.querySelector('[data-panel="preview"]');
  if (panel && window.MutationObserver) {
    new MutationObserver(() => renderPreview())
      .observe(panel, { attributes: true, attributeFilter: ['class'] });
  }
}
