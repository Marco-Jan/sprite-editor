// ════════════════════════════════════════════════════════════════════
// FULLSCREEN — Vollbild: nur Zeichenfläche und die Leisten zum Arbeiten
// ════════════════════════════════════════════════════════════════════
// Im Vollbild verschwinden Menüleiste, die Kopfzeile über der Fläche und die
// beiden Seitenleisten; Werkzeugleiste, Farbzeile und Timeline bleiben.
// Dazu geht auch der Browser ins Vollbild (Fullscreen API) — wo er es kann.
// iPhone/iPad-Safari erlaubt das Webseiten nicht; dort bleibt es beim
// Ausblenden.
//
// Die Seitenleisten kommen bei Bedarf zurück: Maus an den linken oder
// rechten Rand, und sie gleitet herein (body.fs-peek-left / -right). Ohne
// Maus gibt es dafür einen schmalen Griff am Rand. Ein offenes Panel hält
// seine Leiste, bis es zu ist.
//
// Beendet wird mit Esc, mit dem Knopf oben rechts (erscheint, sobald sich
// die Maus bewegt) oder über Ansicht → Vollbild. Beendet der Browser sein
// Vollbild selbst (Esc, F11), endet auch der Vollbild-Modus des Editors.

/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);
const EDGE = 6;            // so nah am Rand (px) zeigt sich eine Leiste
const HIDE_MS = 350;       // so lange bleibt sie, nachdem die Maus weg ist
const BTN_IDLE_MS = 2500;  // so lange bleibt der Beenden-Knopf ohne Bewegung

let onChange = () => {};   // app.js: Knopf-Beschriftung nachziehen
let hideTimer = null, btnTimer = null;

export const isFullscreen = () => document.body.classList.contains('editor-fullscreen');

export function enterFullscreen() {
  document.body.classList.add('editor-fullscreen');
  // Browser-Vollbild braucht einen Klick als Auslöser; beim Wiederherstellen
  // nach einem Neuladen gibt es den nicht — dann eben nur die Leisten.
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) {
    el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
  showExitButton();
  onChange();
}

export function exitFullscreen() {
  document.body.classList.remove('editor-fullscreen');
  peek(null);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  onChange();
}

// ── Seitenleisten am Rand ───────────────────────────────────────────
function peek(side) {
  clearTimeout(hideTimer);
  document.body.classList.toggle('fs-peek-left', side === 'left');
  document.body.classList.toggle('fs-peek-right', side === 'right');
}
const peeking = () => document.body.classList.contains('fs-peek-left') ? 'left'
  : document.body.classList.contains('fs-peek-right') ? 'right' : null;

// Eine Leiste mit offenem Panel bleibt — sonst verschwände das Panel unter
// der Hand, während man darin arbeitet.
const railBusy = side => !!$(`rail-${side}`)?.querySelector(':scope > .panel.is-shown');

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    const side = peeking();
    if (side && !railBusy(side)) peek(null);
  }, HIDE_MS);
}

// ── Beenden-Knopf ───────────────────────────────────────────────────
// Er sitzt in der oberen rechten Ecke der Zeichenfläche — über den Leisten
// würde er Werkzeuge verdecken, solange sich die Maus bewegt.
function showExitButton() {
  const b = $('fs-exit');
  if (!b || !isFullscreen()) return;
  const area = $('editor-canvas-area')?.getBoundingClientRect();
  if (area) {
    b.style.top = Math.round(area.top + 10) + 'px';
    b.style.right = Math.round(innerWidth - area.right + 10) + 'px';
  }
  b.classList.add('is-visible');
  clearTimeout(btnTimer);
  btnTimer = setTimeout(() => b.classList.remove('is-visible'), BTN_IDLE_MS);
}

export function initFullscreen({ onToggle }) {
  onChange = onToggle || onChange;

  // Browser-Vollbild von außen beendet (Esc, F11) → Editor-Vollbild auch.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isFullscreen()) exitFullscreen();
  });

  document.addEventListener('pointermove', e => {
    if (!isFullscreen()) return;
    showExitButton();
    if (e.pointerType !== 'mouse') return;
    const side = peeking();
    const tgt = /** @type {HTMLElement} */ (e.target);
    if (e.clientX <= EDGE) { peek('left'); return; }
    if (e.clientX >= innerWidth - 1 - EDGE) { peek('right'); return; }
    if (!side) return;
    // Über der Leiste (oder ihrem offenen Panel) bleibt sie, sonst geht sie.
    if (tgt.closest?.(`#rail-${side}`)) clearTimeout(hideTimer);
    else scheduleHide();
  }, { passive: true });

  // Griffe für Finger: antippen zeigt bzw. versteckt die Leiste.
  for (const side of ['left', 'right']) {
    $(`fs-grip-${side}`)?.addEventListener('click', () => peek(peeking() === side ? null : side));
  }
  // Ein Tipp daneben schließt eine per Griff gezeigte Leiste.
  document.addEventListener('pointerdown', e => {
    if (!isFullscreen()) return;
    showExitButton();
    const side = peeking();
    const tgt = /** @type {HTMLElement} */ (e.target);
    if (!side || e.pointerType === 'mouse') return;
    if (!tgt.closest?.(`#rail-${side}, .fs-grip, .modal-overlay, #confirm-toast, #info-toast`)) peek(null);
  });

  $('fs-exit')?.addEventListener('click', exitFullscreen);
}
