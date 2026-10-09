// ════════════════════════════════════════════════════════════════════
// SEARCH — Stichwortsuche für Bitty (js/helper.js)
// ════════════════════════════════════════════════════════════════════
// Durchsucht kleine Einträge { label, names, text }: Hilfe-Absätze,
// Werkzeuge, Panels, Menüpunkte. `names` und `text` tragen alle Sprachen —
// auf Deutsch findet „layer“ so auch „Ebenen“. Ohne DOM, damit es sich
// testen lässt.
//
// Verzeiht, was beim schnellen Tippen passiert: Groß/klein, Umlaute
// („farbe“ ↔ „Färben“), Wortanfänge („anim“ → „Animation“) und einen
// Tippfehler je Wort ab fünf Buchstaben („lassso“ → „Lasso“).
// Jedes Suchwort muss irgendwo passen; Treffer im Namen zählen mehr.

/** Kleinbuchstaben, Umlaute und Akzente weg, nur Buchstaben/Ziffern. */
export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const words = s => (s ? s.split(' ') : []);

// Wörter, die Leute tippen, die aber nirgends so in der Oberfläche stehen.
// Schlüssel normalisiert (klein, ohne Umlaute); Werte = Wörter, die dort
// tatsächlich vorkommen (Deutsch und Englisch). Ein Suchwort passt, wenn es
// selbst oder eins seiner Synonyme passt.
export const SYNONYMS = {
  radiergummi: ['radierer', 'eraser'],
  gummi: ['radierer', 'eraser'],
  loschen: ['radierer', 'eraser', 'entf', 'delete'],
  delete: ['eraser', 'entf', 'loschen'],
  speichern: ['sichern', 'export', 'exportieren'],
  save: ['export', 'sichern'],
  eimer: ['fullen', 'fill'],
  farbeimer: ['fullen', 'fill'],
  bucket: ['fill', 'fullen'],
  pipette: ['farbwahl', 'pipette', 'eyedropper'],
  eyedropper: ['pipette', 'farbwahl'],
  spiegeln: ['symmetrie', 'flip', 'mirror', 'spiegeln'],
  mirror: ['symmetrie', 'spiegeln'],
  drehen: ['rotate', 'drehen'],
  vergrossern: ['zoom', 'skalieren', 'scale'],
  grosse: ['skalieren', 'scale', 'leinwand', 'canvas', 'resize'],
  resize: ['skalieren', 'leinwand', 'grosse'],
  layer: ['ebene', 'ebenen'],
  ebene: ['layer', 'layers'],
  animation: ['frames', 'frame', 'timeline'],
  animieren: ['frames', 'animation', 'timeline'],
  bild: ['frame', 'frames'],
  gif: ['gif', 'animation'],
  png: ['png', 'export'],
  rueckgangig: ['undo'],
  ruckgangig: ['undo'],
  undo: ['ruckgangig'],
  hintergrund: ['transparent', 'background'],
  durchsichtig: ['transparent'],
  kachel: ['tiles', 'kacheln', 'tilemap'],
  tile: ['kacheln', 'tilemap'],
  foto: ['schablone', 'photo', 'template'],
  photo: ['schablone', 'foto', 'template'],
  vorlage: ['schablone', 'template'],
  linie: ['line', 'linie', 'hilfslinien'],
  raster: ['grid', 'hilfslinien', 'guides'],
  grid: ['raster', 'hilfslinien'],
  farbe: ['palette', 'farben', 'color'],
  colour: ['color', 'palette'],
};

/** Ein Suchwort samt Synonymen (bekanntes Wort oder dessen Anfang ab 6
 *  Zeichen — kürzer würde „anim“ über „animation“ schon alle Frames finden). */
function variants(q) {
  const out = [q];
  for (const [k, vs] of Object.entries(SYNONYMS)) {
    if (k === q || (q.length >= 6 && k.startsWith(q))) out.push(...vs);
  }
  return [...new Set(out)];
}

/** Höchstens ein Tippfehler (ersetzt, fehlt, zu viel, zwei vertauscht)? */
function oneEdit(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    // vertauschte Nachbarn: „exprot“ ↔ „export“
    let k = 0;
    while (k < la && a[k] === b[k]) k++;
    if (k < la - 1 && a[k] === b[k + 1] && a[k + 1] === b[k] && a.slice(k + 2) === b.slice(k + 2)) return true;
  }
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else { i++; j++; }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/**
 * Wie gut passt ein Suchwort zu einer Wortliste? 0 = gar nicht.
 * Ganzes Wort 3 · Wortanfang 2 · Tippfehler oder mitten im Wort 1.
 * Tippfehler nur bei `typos` (den Namen) — im Fließtext fände „lasso“
 * sonst auch „lässt“.
 */
function wordScore(q, list, typos) {
  let best = 0;
  for (const w of list) {
    if (w === q) return 3;
    if (w.startsWith(q)) best = Math.max(best, 2);
    else if (typos && q.length >= 5 && (oneEdit(q, w) || oneEdit(q, w.slice(0, q.length)))) best = Math.max(best, 1);
    else if (q.length >= 4 && w.includes(q)) best = Math.max(best, 1);
  }
  return best;
}

/**
 * Einträge zur Suche bewerten und sortiert zurückgeben.
 * `names` sind weitere Namen desselben Eintrags (andere Sprachen): sie
 * zählen wie `label`, angezeigt wird aber nur `label`.
 * @template {{ label: string, names?: string, text?: string }} T
 * @param {string} query
 * @param {T[]} entries
 * @param {number} [limit]
 * @returns {T[]}
 */
export function search(query, entries, limit = 8) {
  const qs = words(normalize(query));
  if (!qs.length) return [];
  const scored = [];
  entries.forEach((e, idx) => {
    const lw = words(normalize(`${e.label} ${e.names || ''}`));
    const tw = words(normalize(e.text));
    let total = 0;
    for (const q of qs) {
      // Das Wort selbst zählt voll, ein Synonym einen Hauch weniger.
      let best = 0;
      for (const v of variants(q)) {
        const s = wordScore(v, lw, v === q) * 3 + wordScore(v, tw, false);
        best = Math.max(best, v === q ? s : s * 0.9);
      }
      if (!best) return; // ein Suchwort passt nirgends → raus
      total += best;
    }
    scored.push({ e, total, idx });
  });
  // Bessere zuerst; bei Gleichstand die Reihenfolge der Quelle.
  scored.sort((a, b) => b.total - a.total || a.idx - b.idx);
  return scored.slice(0, limit).map(s => s.e);
}
