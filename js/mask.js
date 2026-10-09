// ════════════════════════════════════════════════════════════════════
// MASK — Ebenenmasken: Teile einer Ebene ausblenden, ohne sie zu löschen
// ════════════════════════════════════════════════════════════════════
// Wie in Photoshop, für Pixel-Art auf „sichtbar / ausgeblendet“ verkürzt:
// eine Maske je Ebene, gültig für alle Frames.
//
//   layer.mask = { on, hide }
//     on    false = Maske vorübergehend aus (alles sichtbar)
//     hide  Raster in Sprite-Größe: 0 = sichtbar, alles andere = ausgeblendet
//
// „alles andere“ ist Absicht: im Modus „Maske bearbeiten“ malen die
// Werkzeuge direkt in hide (state.js getGrid) — Malen schreibt eine Farbe
// (blendet aus), Radieren schreibt 0 (blendet ein). So funktionieren Stift,
// Pinsel, Füllen, Formen und Auswahl in der Maske ohne Sonderfall.
//
// Gespeichert wird die Maske als Lauflängen (encodeMask): abwechselnd
// sichtbar/ausgeblendet, zeilenweise, mit „sichtbar“ beginnend — klein und
// von der Desktop-Version (spritebit-rs) genauso lesbar.
//
// Reine Rechnung ohne DOM — läuft unter Node (tests/mask.test.js).

/** Neue Maske: alles sichtbar. */
export function blankMask(W, H) {
  return { on: true, hide: Array.from({ length: H }, () => Array(W).fill(0)) };
}

/** Tiefe Kopie (Undo, Duplizieren). */
export function copyMask(m) {
  return m ? { on: !!m.on, hide: m.hide.map(r => r.slice()) } : null;
}

/** Wirkt die Maske gerade? */
export const maskActive = L => !!(L?.mask && L.mask.on);

/**
 * Bild einer Ebene, wie man es sieht: ausgeblendete Pixel werden 0.
 * Ohne (aktive) Maske kommt dasselbe Objekt zurück.
 */
export function maskedCel(L, g) {
  if (!maskActive(L)) return g;
  const hide = L.mask.hide;
  return g.map((row, y) => row.map((v, x) => (hide[y]?.[x] ? 0 : v)));
}

/** Für den Speicherstand: { on, runs } statt des ganzen Rasters. */
export function encodeMask(m) {
  if (!m) return null;
  const runs = [];
  let hidden = false, n = 0;
  for (const row of m.hide) {
    for (const v of row) {
      const h = !!v;
      if (h === hidden) n++;
      else { runs.push(n); hidden = h; n = 1; }
    }
  }
  runs.push(n);
  return { on: !!m.on, runs };
}

/**
 * Aus dem Speicherstand (oder einer fremden Datei) — { on, runs } oder
 * { on, hide }. Passt etwas nicht zur Größe W × H, gibt es keine Maske.
 * @returns {{on: boolean, hide: number[][]} | null}
 */
export function decodeMask(spec, W, H) {
  if (!spec || typeof spec !== 'object') return null;
  const on = spec.on !== false;
  if (Array.isArray(spec.hide)) {
    if (spec.hide.length !== H || spec.hide.some(r => !Array.isArray(r) || r.length !== W)) return null;
    return { on, hide: spec.hide.map(r => r.map(v => (v ? 1 : 0))) };
  }
  if (!Array.isArray(spec.runs) || !spec.runs.every(n => Number.isInteger(n) && n >= 0)) return null;
  if (spec.runs.reduce((a, b) => a + b, 0) !== W * H) return null;
  const flat = [];
  spec.runs.forEach((n, i) => { for (let k = 0; k < n; k++) flat.push(i % 2); });
  return { on, hide: Array.from({ length: H }, (_, y) => flat.slice(y * W, (y + 1) * W)) };
}

/** Maske fest ins Bild übernehmen: ausgeblendete Pixel werden gelöscht. */
export function bakeMask(g, hide) {
  return g.map((row, y) => row.map((v, x) => (hide[y]?.[x] ? 0 : v)));
}

/** Ebene für den Speicherstand (Maske als Lauflängen). */
export const layerForSave = l => (l.mask ? { ...l, mask: encodeMask(l.mask) } : l);
