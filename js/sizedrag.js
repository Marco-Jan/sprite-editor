// ════════════════════════════════════════════════════════════════════
// SIZEDRAG — Werkzeuggröße mit Alt + rechter Maustaste ziehen
// ════════════════════════════════════════════════════════════════════
// Pinsel, Radierer und Spray: Alt + Rechts gedrückt halten und waagerecht
// ziehen — nach rechts größer, nach links kleiner. Kleine Größen gehen in
// Einerschritten (eine Stufe je STEP_PX Bildschirmpixel), große wachsen
// schneller: alle DOUBLE_PX verdoppelt sich die Größe — so ist auch 300 ohne
// meterlangen Mausweg erreichbar. Wie in der Desktop-Version
// (spritebit-rs, tools_ui.rs, dort bis 1000).
//
// Der Regler im Werkzeug-Menü läuft logarithmisch (sliderToSize): 1–10
// bleiben gut zu treffen, trotzdem reicht er bis MAX_SIZE.
//
// Reine Rechnung ohne DOM — läuft unter Node (tests/sizedrag.test.js);
// die Bedienung steht in app.js.

/** Bildschirmpixel je Größenstufe (kleine Größen). */
export const STEP_PX = 6;
/** Bildschirmpixel, nach denen sich die Größe verdoppelt (große Größen). */
export const DOUBLE_PX = 160;
export const MIN_SIZE = 1;
export const MAX_SIZE = 300;
/** Stufen des Reglers (input type=range, 0 … SLIDER_STEPS). */
export const SLIDER_STEPS = 1000;

/** Werkzeuge mit einstellbarer Größe. */
export const SIZED_TOOLS = ['brush', 'spray', 'eraser'];

/**
 * Neue Größe aus dem Mausweg seit dem Start.
 * @param {number} startSize
 * @param {number} dx  waagerechter Weg in Bildschirmpixeln
 * @returns {number}
 */
export function draggedSize(startSize, dx) {
  const steps = startSize + dx / STEP_PX;
  const grow = startSize * 2 ** (dx / DOUBLE_PX);
  // Was schneller vorankommt: bei kleinen Größen die Stufen, bei großen das Verdoppeln.
  return clampSize(dx >= 0 ? Math.max(steps, grow) : Math.min(steps, grow));
}

/** Reglerstellung (0 … SLIDER_STEPS) → Größe, logarithmisch. */
export function sliderToSize(v) {
  const t = Math.max(0, Math.min(1, Number(v) / SLIDER_STEPS));
  return clampSize(Math.exp(t * Math.log(MAX_SIZE)));
}

/** Größe → Reglerstellung (Umkehrung von sliderToSize). */
export function sizeToSlider(n) {
  return Math.round(Math.log(clampSize(n)) / Math.log(MAX_SIZE) * SLIDER_STEPS);
}

/** Größe auf 1 … MAX_SIZE begrenzen (auch für eingetippte Werte). */
export function clampSize(n) {
  n = Math.round(Number(n));
  if (!Number.isFinite(n)) return MIN_SIZE;
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, n));
}
