// ════════════════════════════════════════════════════════════════════
// LOCK — mit Umschalt nur waagerecht, senkrecht oder im 45°-Winkel malen
// ════════════════════════════════════════════════════════════════════
// Wie in Photoshop: Umschalt halten und malen — sobald der Strich ein paar
// Pixel weit ist, rastet seine Richtung auf eine der acht Richtungen ein
// (0°, 45°, 90° …) und bleibt dort, bis man loslässt. Beim Linien-Werkzeug
// rastet Umschalt den Endpunkt auf dieselben Winkel ein.
//
// Reine Rechnung ohne DOM — läuft unter Node (tests/lock.test.js).
// Die Desktop-Version rechnet genauso (spritebit-rs, tools::snap_dir …).

/** Ab so vielen Pixeln Abstand wird die Richtung festgelegt. */
export const LOCK_AFTER = 3;

/**
 * Nächste der acht Richtungen für (dx, dy) — als [ux, uy] mit -1/0/1 —
 * oder null, solange der Zeiger noch zu nah am Start ist.
 */
export function snapDir(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_AFTER) return null;
  const a = Math.atan2(dy, dx);
  const k = Math.round(a / (Math.PI / 4));
  const ux = Math.round(Math.cos(k * Math.PI / 4)), uy = Math.round(Math.sin(k * Math.PI / 4));
  return [ux, uy];
}

/** Punkt p auf die Linie durch `start` in Richtung `dir` legen (nächster Gitterpunkt). */
export function project(start, dir, p) {
  const [ux, uy] = dir;
  const t = Math.round(((p.x - start.x) * ux + (p.y - start.y) * uy) / (ux * ux + uy * uy));
  return { x: start.x + t * ux, y: start.y + t * uy };
}

/** Linien-Werkzeug mit Umschalt: Endpunkt auf 0°, 45° oder 90° einrasten. */
export function snapEnd(start, p) {
  const dir = snapDir(p.x - start.x, p.y - start.y);
  return dir ? project(start, dir, p) : { x: p.x, y: p.y };
}
