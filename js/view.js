// ════════════════════════════════════════════════════════════════════
// VIEW — Ansicht der Zeichenfläche: zoomen, verschieben, Finger-Gesten
// ════════════════════════════════════════════════════════════════════
// Hier geht es nur darum, WIE man auf das Bild schaut — nie darum, was im
// Bild steht. Gezeichnet wird in app.js, und dieses Modul fasst keine Pixel
// an.
//
// Drei Wege, die Ansicht zu ändern:
//   Zoom      Mausrad mit Strg, der Regler in der Kopfzeile, zwei Finger
//   Schieben  Leertaste oder mittlere Maustaste, ein Finger neben dem Bild
//   Einpassen beim Start am Handy, damit der Sprite ganz ins Bild passt
//
// Die Zoom-Stufe (`state.cellSize`) ist Pixel je Zelle und gehört zum
// gespeicherten Zustand — wer herangezoomt aufhört, findet es so wieder.
import { state, getGrid } from './state.js';
import { renderEditor } from './render.js';
import { saveState } from './storage.js';
import { undoDepth } from './history.js';

/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);

const MIN_CELL = 2, MAX_CELL = 40;

// Leertaste gehalten? Dann schiebt die Maus, statt zu malen — app.js fragt
// das ab, bevor es einen Strich beginnt.
let panKeyHeld = false;
export const isPanKeyHeld = () => panKeyHeld;

/**
 * Zoomt um `step` Pixel je Zelle und hält dabei die Zelle unter dem Zeiger
 * fest — sonst rutscht einem beim Zoomen die Stelle weg, die man ansieht.
 * @param {number} step
 * @param {number} clientX
 * @param {number} clientY
 * @param {boolean} [save]  false während einer laufenden Geste
 */
export function zoomAt(step, clientX, clientY, save = true) {
  const next = Math.max(MIN_CELL, Math.min(MAX_CELL, state.cellSize + step));
  if (next === state.cellSize) return;
  const area = $('editor-canvas-area'), canvas = $('editor-canvas');
  const before = canvas.getBoundingClientRect();
  const fx = (clientX - before.left) / state.cellSize;   // Position in Zellen
  const fy = (clientY - before.top) / state.cellSize;
  setCellSize(next);
  const after = canvas.getBoundingClientRect();
  area.scrollLeft += (after.left + fx * next) - clientX;
  area.scrollTop  += (after.top  + fy * next) - clientY;
  if (save) saveState();
}

/** Zoom-Stufe setzen und die Kopfzeile mitführen. */
function setCellSize(next) {
  state.cellSize = next;
  $('cell-size').value = next;
  $('cell-size-val').textContent = next + 'px';
  renderEditor();
}

/**
 * So weit herauszoomen, dass der ganze Sprite ins Bild passt — nur
 * verkleinern. Wer schon kleiner schaut, soll nicht herangezogen werden.
 */
export function fitZoomToArea() {
  const area = $('editor-canvas-area');
  const grid = getGrid();
  if (!grid?.length || !area.clientWidth) return;
  const pad = 16;
  const fit = Math.floor(Math.min((area.clientWidth - pad) / grid[0].length,
                                  (area.clientHeight - pad) / grid.length));
  const next = Math.max(4, Math.min(state.cellSize, fit));
  if (next === state.cellSize) return;
  setCellSize(next);
}

/**
 * Verschieben mit Leertaste oder mittlerer Maustaste.
 * @param {object} [opts]
 * @param {(e: KeyboardEvent) => boolean} [opts.ignoreKey]
 *   true, wenn die Leertaste gerade jemand anderem gehört (Eingabefeld,
 *   offener Dialog). Die Entscheidung bleibt bei app.js, wo auch die
 *   übrigen Tastenregeln stehen.
 */
export function initPan({ ignoreKey = () => false } = {}) {
  const area = $('editor-canvas-area');
  const setHeld = on => {
    panKeyHeld = on;
    area.classList.toggle('is-pannable', on);
  };
  window.addEventListener('keydown', e => {
    if (e.code !== 'Space' || ignoreKey(e)) return;
    e.preventDefault();          // sonst scrollt/klickt der Browser
    if (!e.repeat) setHeld(true);
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space') setHeld(false); });
  window.addEventListener('blur', () => setHeld(false));

  area.addEventListener('pointerdown', e => {
    if (!(panKeyHeld || e.button === 1)) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, l0 = area.scrollLeft, t0 = area.scrollTop;
    area.classList.add('is-panning');
    try { area.setPointerCapture(e.pointerId); } catch {}
    const move = ev => {
      area.scrollLeft = l0 - (ev.clientX - sx);
      area.scrollTop  = t0 - (ev.clientY - sy);
    };
    const up = () => {
      area.classList.remove('is-panning');
      area.removeEventListener('pointermove', move);
      area.removeEventListener('pointerup', up);
      area.removeEventListener('pointercancel', up);
    };
    area.addEventListener('pointermove', move);
    area.addEventListener('pointerup', up);
    area.addEventListener('pointercancel', up);
  });
  // Mittlere Taste: kein Auto-Scroll-Symbol des Browsers.
  area.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
}

// ── Finger: zwei zum Zoomen und Verschieben, einer neben dem Bild schiebt ──
// Der erste Finger hat beim Aufsetzen schon gemalt (oder gefüllt, eine Form
// begonnen …). Kommt kurz danach ein zweiter, war es eine Zoom-Geste — dann
// muss zurückgenommen werden, was der erste angerichtet hat. Läuft in der
// Capture-Phase vor den Canvas-Handlern, damit die Bewegung nicht weitermalt.
const PINCH_GRACE = 400;   // ms: so spät darf der zweite Finger kommen

/**
 * @param {object} [opts]
 * @param {(sinceDepth: number, quick: boolean) => void} [opts.cancelFirstFinger]
 *   Wird gerufen, sobald aus der Berührung eine Zoom-Geste wird. `quick`
 *   heißt: der zweite Finger kam schnell genug, dass der erste Strich als
 *   Versehen gilt und bis `sinceDepth` zurückgenommen werden soll. Was dabei
 *   genau zurückzunehmen ist, weiß app.js — nicht die Ansicht.
 */
export function initPinch({ cancelFirstFinger = () => {} } = {}) {
  const area = $('editor-canvas-area');
  const pts = new Map();
  let pinch = null, slide = null;
  let depth0 = 0, t0 = 0;

  const two = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  area.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      depth0 = undoDepth();
      t0 = e.timeStamp;
      // Neben dem Bild: mit einem Finger verschieben.
      if (e.target === area || !(/** @type {HTMLElement} */ (e.target)).closest('#editor-canvas')) {
        slide = { x: e.clientX, y: e.clientY, l: area.scrollLeft, t: area.scrollTop };
      }
      return;
    }
    if (pts.size !== 2) return;
    e.stopPropagation();
    e.preventDefault();
    slide = null;
    cancelFirstFinger(depth0, e.timeStamp - t0 < PINCH_GRACE);
    const g = two();
    pinch = { d0: g.d, c0: state.cellSize, x: g.x, y: g.y };
  }, true);

  area.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (slide) {
      area.scrollLeft = slide.l - (e.clientX - slide.x);
      area.scrollTop  = slide.t - (e.clientY - slide.y);
      return;
    }
    if (!pinch) return;
    e.stopPropagation();
    const g = two();
    const target = Math.round(pinch.c0 * g.d / pinch.d0);
    if (target !== state.cellSize) zoomAt(target - state.cellSize, g.x, g.y, false);
    area.scrollLeft -= g.x - pinch.x;
    area.scrollTop  -= g.y - pinch.y;
    pinch.x = g.x;
    pinch.y = g.y;
  }, true);

  const lift = e => {
    if (!pts.delete(e.pointerId)) return;
    if (pinch && pts.size < 2) { pinch = null; saveState(); }
    if (!pts.size) slide = null;
  };
  // Am Fenster, nicht nur an der Fläche: ein Finger, der woanders losgelassen
  // oder vom Browser abgebrochen wird, darf nicht als "noch aufgesetzt"
  // hängen bleiben — sonst gälte der nächste einzelne Finger als zweiter.
  window.addEventListener('pointerup', lift, true);
  window.addEventListener('pointercancel', lift, true);
}
