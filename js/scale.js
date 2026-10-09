// ════════════════════════════════════════════════════════════════════
// SCALE — Auswahl mit Anfassern skalieren
// ════════════════════════════════════════════════════════════════════
// An einer Auswahl sitzen acht Anfasser: Ecken ändern Breite und Höhe,
// Kanten nur eine davon. Mit Umschalt bleibt das Seitenverhältnis. Skaliert
// wird mit nächstem Nachbarn — Pixel bleiben scharf, es entstehen keine
// Mischfarben. Jede Vorschau rechnet vom Original (wie beim freien Drehen),
// mehrmals Ziehen verwäscht also nichts.
//
// Reine Rechnung ohne DOM — läuft unter Node (tests/scale.test.js).
// Die Desktop-Version rechnet genauso (spritebit-rs, selection::scale_*).

/** Die acht Anfasser: n, ne, e, se, s, sw, w, nw. */
export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Wo ein Anfasser am Rechteck sitzt (in Zellen, Kanten der Zellen). */
export function handlePos(r, h) {
  const x = h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2;
  const y = h.includes('n') ? r.y : h.includes('s') ? r.y + r.h : r.y + r.h / 2;
  return { x, y };
}

/**
 * Neues Rechteck, wenn Anfasser `h` auf die Gitterlinie (gx, gy) gezogen wird.
 * Die gegenüberliegende Seite bleibt stehen. Nie kleiner als 1 × 1, kein
 * Umklappen über die gegenüberliegende Seite. `keep` = Seitenverhältnis halten.
 * @param {{x:number,y:number,w:number,h:number}} r  Rechteck beim Anfassen
 */
export function dragHandle(r, h, gx, gy, keep = false) {
  let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
  if (h.includes('w')) x0 = Math.min(Math.round(gx), x1 - 1);
  if (h.includes('e')) x1 = Math.max(Math.round(gx), x0 + 1);
  if (h.includes('n')) y0 = Math.min(Math.round(gy), y1 - 1);
  if (h.includes('s')) y1 = Math.max(Math.round(gy), y0 + 1);
  let w = x1 - x0, hh = y1 - y0;
  if (keep && r.w > 0 && r.h > 0) {
    const corner = h.length === 2;
    // Ecke: die stärker gezogene Richtung bestimmt. Kante: die andere Seite wächst mit.
    const k = corner ? Math.max(w / r.w, hh / r.h)
      : (h === 'n' || h === 's') ? hh / r.h : w / r.w;
    w = Math.max(1, Math.round(r.w * k));
    hh = Math.max(1, Math.round(r.h * k));
    if (h.includes('w')) x0 = x1 - w; else if (!h.includes('e')) x0 = Math.round(r.x + (r.w - w) / 2);
    if (h.includes('n')) y0 = y1 - hh; else if (!h.includes('s')) y0 = Math.round(r.y + (r.h - hh) / 2);
  }
  return { x: x0, y: y0, w, h: hh };
}

/** Raster (Zellen oder Maske) auf w × h bringen — nächster Nachbar. */
export function scaleGrid(g, w, h) {
  const H = g.length, W = g[0]?.length || 0;
  return Array.from({ length: h }, (_, y) => {
    const row = g[Math.min(H - 1, Math.floor(((y + 0.5) * H) / h))];
    return Array.from({ length: w }, (_, x) => row[Math.min(W - 1, Math.floor(((x + 0.5) * W) / w))]);
  });
}
