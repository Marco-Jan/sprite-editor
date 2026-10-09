// ════════════════════════════════════════════════════════════════════
// FROMSTART — das Bild vom Probier-Raster der Startseite übernehmen
// ════════════════════════════════════════════════════════════════════
// „Im Editor weitermalen“ (js/landing-demo.js) hängt das Bild an den Link:
//   editor.html#start=eis.14213d,2d4870,6ea8fe,a9d1ff,f2f8ff.0000…0123…
// Palettenname · ihre Farben (ohne #) · N×N Ziffern Zeile für Zeile
// (0 = transparent, sonst Index in die Palette). Hier nur das Lesen —
// ohne DOM und ohne Zustand, damit es sich testen lässt.

/**
 * Hash lesen. Gibt null zurück, wenn er nicht passt.
 * @param {string} hash  location.hash, mit oder ohne '#'
 * @returns {{ name: string, palette: Record<number, string>, grid: number[][] } | null}
 */
export function parseStartHash(hash) {
  const m = /^#?start=([a-z0-9_-]{1,24})\.((?:[0-9a-f]{6},){0,8}[0-9a-f]{6})\.([0-9]+)$/i.exec(hash || '');
  if (!m) return null;
  const colors = m[2].split(',');
  const digits = m[3];
  const n = Math.round(Math.sqrt(digits.length));
  if (n < 1 || n > 64 || n * n !== digits.length) return null;

  /** @type {Record<number, string>} */
  const palette = {};
  colors.forEach((c, i) => { palette[i + 1] = '#' + c.toLowerCase(); });

  const grid = [];
  for (let y = 0; y < n; y++) {
    const row = [];
    for (let x = 0; x < n; x++) {
      const v = Number(digits[y * n + x]);
      if (v > colors.length) return null; // Index ohne Farbe
      row.push(v);
    }
    grid.push(row);
  }
  return { name: m[1].toLowerCase(), palette, grid };
}
