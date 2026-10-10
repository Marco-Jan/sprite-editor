// ════════════════════════════════════════════════════════════════════
// NOTES — die Versions-Notizen lesen (notes/web.md)
// ════════════════════════════════════════════════════════════════════
// Neueste Version oben, je Version ein Abschnitt:
//
//   # 3.2.14
//   ## Deutsch
//   - Punkt
//   ## English
//   - Point
//
// Weitere Zeilen gehören zum Punkt davor. Fehlt eine Sprache, gilt Deutsch
// (Österreichisch ist sonst Deutsch). Dasselbe Format wie die Notizen der
// Desktop-App (spritebit-rs/notes/<version>.md), nur alle in einer Datei.
// Reine Rechnung ohne DOM — getestet in tests/notes.test.js; anzeigen tut
// sie js/whatsnew.js.

/** @typedef {{ version: string, langs: Record<string, string[]> }} NoteEntry */

const LANG_NAMES = { de: 'deutsch', en: 'english', at: 'österreichisch' };

/** @param {string} md @returns {NoteEntry[]} */
export function parseNotes(md) {
  /** @type {NoteEntry[]} */
  const out = [];
  /** @type {string[] | null} */
  let points = null;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    const v = /^#\s+(\S+)/.exec(line);
    if (v && !line.startsWith('##')) {
      out.push({ version: v[1], langs: {} });
      points = null;
      continue;
    }
    const entry = out[out.length - 1];
    const h = /^##\s+(.+)$/.exec(line);
    if (h) {
      points = entry ? (entry.langs[h[1].trim().toLowerCase()] = []) : null;
      continue;
    }
    if (!points || !line) continue;
    // Fett und Code-Schrift zeigt der Dialog nicht — die Zeichen weg.
    const text = line.replace(/\*\*|`/g, '');
    const p = /^[-*]\s+(.*)$/.exec(text);
    if (p) points.push(p[1].trim());
    else if (points.length) points[points.length - 1] += ' ' + text;
  }
  return out;
}

/** Punkte einer Version in der Sprache `lang` ('de' | 'en' | 'at').
 *  @param {NoteEntry} entry @param {string} lang @returns {string[]} */
export function notePoints(entry, lang) {
  const own = entry.langs[LANG_NAMES[lang] || ''];
  return own && own.length ? own : (entry.langs.deutsch || []);
}
