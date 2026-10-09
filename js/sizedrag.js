// ════════════════════════════════════════════════════════════════════
// SIZEDRAG — Werkzeuggröße mit Alt + rechter Maustaste ziehen
// ════════════════════════════════════════════════════════════════════
// Pinsel, Radierer und Spray: Alt + Rechts gedrückt halten und waagerecht
// ziehen — nach rechts größer, nach links kleiner, eine Stufe je STEP_PX
// Bildschirmpixel. Wie in der Desktop-Version (spritebit-rs, tools_ui.rs).
//
// Reine Rechnung ohne DOM — läuft unter Node (tests/sizedrag.test.js);
// die Bedienung steht in app.js.

/** Bildschirmpixel je Größenstufe. */
export const STEP_PX = 12;
export const MIN_SIZE = 1;
export const MAX_SIZE = 9;

/** Werkzeuge mit einstellbarer Größe. */
export const SIZED_TOOLS = ['brush', 'spray', 'eraser'];

/**
 * Neue Größe aus dem Mausweg seit dem Start.
 * @param {number} startSize
 * @param {number} dx  waagerechter Weg in Bildschirmpixeln
 * @returns {number}
 */
export function draggedSize(startSize, dx) {
  const n = startSize + Math.round(dx / STEP_PX);
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, n));
}
