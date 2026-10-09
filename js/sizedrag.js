// ════════════════════════════════════════════════════════════════════
// SIZEDRAG — Werkzeuggröße mit Alt + rechter Maustaste ziehen
// ════════════════════════════════════════════════════════════════════
// Pinsel, Radierer und Spray: Alt + Rechts gedrückt halten und waagerecht
// ziehen — nach rechts größer, nach links kleiner, eine Stufe je STEP_PX
// Bildschirmpixel (fein genug, dass auch große Größen ohne meterlangen
// Mausweg erreichbar sind). Wie in der Desktop-Version (spritebit-rs, tools_ui.rs).
//
// Reine Rechnung ohne DOM — läuft unter Node (tests/sizedrag.test.js);
// die Bedienung steht in app.js.

/** Bildschirmpixel je Größenstufe. */
export const STEP_PX = 6;
export const MIN_SIZE = 1;
export const MAX_SIZE = 64;

/** Werkzeuge mit einstellbarer Größe. */
export const SIZED_TOOLS = ['brush', 'spray', 'eraser'];

/**
 * Neue Größe aus dem Mausweg seit dem Start.
 * @param {number} startSize
 * @param {number} dx  waagerechter Weg in Bildschirmpixeln
 * @returns {number}
 */
export function draggedSize(startSize, dx) {
  return clampSize(startSize + Math.round(dx / STEP_PX));
}

/** Größe auf 1 … MAX_SIZE begrenzen (auch für eingetippte Werte). */
export function clampSize(n) {
  n = Math.round(Number(n));
  if (!Number.isFinite(n)) return MIN_SIZE;
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, n));
}
