// ════════════════════════════════════════════════════════════════════
// PIXELPERFECT — saubere 1-Pixel-Linien beim Freihandzeichnen (Aseprite)
// ════════════════════════════════════════════════════════════════════
// Zeichnet man mit 1 Pixel freihand eine Schräge, entstehen an jeder
// Treppenstufe L-Ecken: zwei Pixel, wo die Linie nur eins braucht — sie
// wirkt eckig und stellenweise doppelt dick. Pixel-perfect nimmt dieses
// Eckpixel während des Strichs wieder heraus:
//
//   Bilden die letzten drei Punkte des Pfads eine Ecke (erster und letzter
//   diagonal benachbart, der mittlere waagerecht/senkrecht neben beiden),
//   bekommt der mittlere seinen Wert von vor dem Strich zurück und fällt
//   aus dem Pfad.
//
// Reine Rechnung auf dem Grid, ohne DOM — läuft auch unter Node
// (tests/pixelperfect.test.js). Ein Strich = ein Objekt aus
// createPixelPerfect().

/** @typedef {{path: number[][], before: Map<string, any>}} PixelPerfect */

/** @returns {PixelPerfect} */
export function createPixelPerfect() {
  return { path: [], before: new Map() };
}

const inside = (g, x, y) => y >= 0 && x >= 0 && y < g.length && x < g[0].length;

/**
 * Punkt (x, y) mit `value` malen und L-Ecken entfernen.
 * @param {PixelPerfect} pp
 * @param {any[][]} grid
 * @param {(x: number, y: number) => number[][]} [mirror] Punkt plus Spiegelbilder (Symmetrie)
 * @returns {boolean} hat sich etwas geändert?
 */
export function ppAdd(pp, grid, x, y, value, mirror = (px, py) => [[px, py]]) {
  const last = pp.path[pp.path.length - 1];
  if (last && last[0] === x && last[1] === y) return false;
  let changed = false;
  for (const [px, py] of mirror(x, y)) {
    if (!inside(grid, px, py)) continue;
    const key = px + ',' + py;
    if (!pp.before.has(key)) pp.before.set(key, grid[py][px]);
    if (grid[py][px] !== value) { grid[py][px] = value; changed = true; }
  }
  pp.path.push([x, y]);
  const n = pp.path.length;
  if (n >= 3) {
    const [a, b, c] = [pp.path[n - 3], pp.path[n - 2], pp.path[n - 1]];
    const diagonal = Math.abs(a[0] - c[0]) === 1 && Math.abs(a[1] - c[1]) === 1;
    const corner = (b[0] === a[0] || b[1] === a[1]) && (b[0] === c[0] || b[1] === c[1]);
    if (diagonal && corner) {
      pp.path.splice(n - 2, 1);
      // Liegt der Punkt noch woanders im Pfad, bleibt er gemalt.
      if (!pp.path.some(p => p[0] === b[0] && p[1] === b[1])) {
        for (const [px, py] of mirror(b[0], b[1])) {
          const key = px + ',' + py;
          if (pp.before.has(key) && grid[py][px] !== pp.before.get(key)) {
            grid[py][px] = pp.before.get(key);
            changed = true;
          }
        }
      }
    }
  }
  return changed;
}
