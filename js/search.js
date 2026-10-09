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
      const inLabel = wordScore(q, lw, true);
      const inText = wordScore(q, tw, false);
      if (!inLabel && !inText) return; // ein Suchwort passt nirgends → raus
      total += inLabel * 3 + inText;
    }
    scored.push({ e, total, idx });
  });
  // Bessere zuerst; bei Gleichstand die Reihenfolge der Quelle.
  scored.sort((a, b) => b.total - a.total || a.idx - b.idx);
  return scored.slice(0, limit).map(s => s.e);
}
