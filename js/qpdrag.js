// ════════════════════════════════════════════════════════════════════
// QPDRAG — Farben in der Farbzeile ziehen und so die Palette umsortieren
// ════════════════════════════════════════════════════════════════════
// Eine Farbe auf ein anderes Feld ziehen: sie bekommt dessen Platz, die
// dazwischen rücken auf. Die Pixel werden mit umnummeriert, das Bild bleibt
// gleich (palettes.js reorderPalette). Transparent (Platz 0) bleibt vorn.
//
// Maus: ziehen ab ein paar Pixeln. Finger: erst kurz halten, dann ziehen —
// sonst gehört das Wischen dem Scrollen der Leiste.
import { getMaxIdx } from './state.js';
import { moveColor } from './palorder.js';
import { reorderPalette, sortPaletteByShades } from './palettes.js';

/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);
const HOLD_MS = 320;

export function initQuickPaletteDrag() {
  const qp = $('quick-palette');
  if (!qp) return;
  $('qp-sort')?.addEventListener('click', sortPaletteByShades);

  // Nach dem Halten darf die Leiste nicht mehr scrollen. Das geht nur über
  // einen nicht-passiven touchmove, der dann preventDefault ruft.
  let armed = false;
  qp.addEventListener('touchmove', e => { if (armed) e.preventDefault(); }, { passive: false });

  qp.addEventListener('pointerdown', e => {
    const src = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-idx]'));
    if (!src || e.button !== 0) return;
    const from = Number(src.dataset.idx);
    if (!from) return;
    const touch = e.pointerType !== 'mouse';
    const sx = e.clientX, sy = e.clientY;
    let dragging = false, to = 0, mark = null, timer = null;

    const begin = () => {
      dragging = true;
      armed = true;
      src.classList.add('is-lifted');
      document.body.classList.add('is-dragging-ui');
      if (touch) navigator.vibrate?.(10);
    };
    const unmark = () => { mark?.classList.remove('is-drop-l', 'is-drop-r'); mark = null; };
    const stop = () => {
      clearTimeout(timer);
      armed = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    const move = ev => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        if (touch) { stop(); return; }   // gewischt statt gehalten: scrollen lassen
        begin();
      }
      ev.preventDefault();
      const el = /** @type {HTMLElement|null} */ (document.elementFromPoint(ev.clientX, ev.clientY)?.closest('#quick-palette [data-idx]'));
      unmark();
      to = el ? Math.max(1, Number(el.dataset.idx)) : 0;
      if (el && to !== from) {
        mark = el;
        // Der Strich zeigt, auf welcher Seite die Farbe landet.
        el.classList.add(to > from ? 'is-drop-r' : 'is-drop-l');
      }
    };
    const up = () => {
      stop();
      if (!dragging) return;
      unmark();
      src.classList.remove('is-lifted');
      document.body.classList.remove('is-dragging-ui');
      // Der Klick nach dem Ziehen soll keine Farbe wählen.
      const swallow = ev => { ev.stopImmediatePropagation(); ev.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      if (to && to !== from) reorderPalette(moveColor(getMaxIdx(), from, to));
    };
    if (touch) timer = setTimeout(begin, HOLD_MS);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}
