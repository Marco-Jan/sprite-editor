// Tests für die Texte (js/i18n.js, js/i18n-at.js, editor.html, index.html).
//
// Texte liegen an mehreren Stellen: Deutsch im HTML, Englisch in STATIC.en,
// Laufzeit-Texte in MSG.de/MSG.en, Dialekt in i18n-at.js. Vergisst man einen
// Schlüssel, zeigt die Oberfläche still den Schlüsselnamen an („tl.delMany")
// statt einer Meldung — niemandem fällt das auf, bis ein Nutzer fragt.
//
// Diese Tests lesen die Dateien als Text. Das ist unschön, aber die einzige
// Möglichkeit ohne Browser — und es hält die Prüfung an der Stelle, wo die
// Fehler entstehen.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(ROOT, f), 'utf8');

const i18n = read('js/i18n.js');

/**
 * Schlüssel einer Tabelle einsammeln. Die Grenzen werden über die
 * geschweiften Klammern gezählt, nicht geraten — sonst liest der Test die
 * halbe Tabelle und meldet Lücken, die es nicht gibt.
 */
function keysOfBlock(src, header) {
  const at = src.indexOf(header);
  assert.ok(at >= 0, `Tabelle nicht gefunden: ${header}`);
  let i = src.indexOf('{', at + header.length - 1);
  let depth = 0, end = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) { end = i; break; } }
  }
  const body = src.slice(at, end);
  return new Set([...body.matchAll(/^\s+'([\w.]+)':/gm)].map(m => m[1]));
}

// STATIC: die Texte im HTML (Deutsch steht dort direkt, darum nur 'en').
// MSG: die Texte, die t() zur Laufzeit holt.
const STATIC_BLOCK = i18n.slice(i18n.indexOf('const STATIC = {'), i18n.indexOf('const MSG = {'));
const MSG_BLOCK = i18n.slice(i18n.indexOf('const MSG = {'));
const EN = keysOfBlock(STATIC_BLOCK, '\n  en: {');
const MSG_DE = keysOfBlock(MSG_BLOCK, '\n  de: {');
const MSG_EN = keysOfBlock(MSG_BLOCK, '\n  en: {');

test('die Tabellen wurden überhaupt gefunden', () => {
  assert.ok(EN.size > 50, `STATIC.en wirkt leer (${EN.size})`);
  assert.ok(MSG_DE.size > 50, `MSG.de wirkt leer (${MSG_DE.size})`);
});

test('jeder t()-Aufruf im Code hat einen deutschen Text', () => {
  const files = ['app', 'layout', 'frames', 'export', 'layers', 'palettes', 'sprites',
    'storage', 'render', 'toast', 'guides', 'template', 'transform', 'codegen',
    'tsimport', 'selection', 'state', 'migrate', 'palpicker', 'dock', 'tabs'];
  const fehlend = new Set();
  for (const f of files) {
    const src = read(`js/${f}.js`);
    // t('schlüssel') und tn('schlüssel', …) — nur feste Zeichenketten;
    // zusammengesetzte Schlüssel kann dieser Test nicht prüfen.
    for (const m of src.matchAll(/\bt\(\s*'([\w.]+)'\s*[,)]/g)) {
      const key = m[1];
      if (!MSG_DE.has(key)) fehlend.add(`${key}  (js/${f}.js)`);
    }
    // tn() sucht key_one / key_other
    for (const m of src.matchAll(/\btn\(\s*'([\w.]+)'\s*[,)]/g)) {
      const key = m[1];
      if (!MSG_DE.has(`${key}_one`) || !MSG_DE.has(`${key}_other`)) {
        fehlend.add(`${key}_one/_other  (js/${f}.js)`);
      }
    }
  }
  assert.deepEqual([...fehlend], [], 'Texte fehlen in MSG.de');
});

test('was es auf Deutsch gibt, gibt es auch auf Englisch', () => {
  const fehlend = [...MSG_DE].filter(k => !MSG_EN.has(k));
  assert.deepEqual(fehlend, [], 'Texte fehlen in MSG.en');
});

test('jedes data-i18n im HTML hat einen englischen Text', () => {
  // Editor und Startseite haben getrennte Texttabellen — die Startseite ist
  // ein eigenes Skript ohne Modul-Import (js/landing-i18n.js).
  const landing = keysOfBlock(read('js/landing-i18n.js'), 'var EN = {');
  const fehlend = new Set();
  for (const [page, tabelle] of [['editor.html', EN], ['index.html', landing]]) {
    const html = read(page);
    for (const m of html.matchAll(/data-i18n(?:-html)?="([\w.]+)"/g)) {
      if (!tabelle.has(m[1])) fehlend.add(`${m[1]}  (${page})`);
    }
    // data-i18n-attr="title:schlüssel;aria-label:schlüssel"
    for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
      for (const pair of m[1].split(';')) {
        const key = pair.split(':')[1]?.trim();
        if (key && !tabelle.has(key)) fehlend.add(`${key}  (${page}, Attribut)`);
      }
    }
  }
  assert.deepEqual([...fehlend], [], 'englische Texte fehlen');
});

test('die österreichische Fassung erfindet keine unbekannten Schlüssel', () => {
  // Fehlende Einträge sind dort Absicht (Rückfall auf Deutsch) — ein Eintrag
  // mit Tippfehler im Schlüssel wäre dagegen wirkungslos und unauffindbar.
  const at = read('js/i18n-at.js');
  const bekannt = new Set([...EN, ...MSG_DE]);
  const unbekannt = [...at.matchAll(/^\s{2}'([\w.]+)':/gm)]
    .map(m => m[1])
    .filter(k => !bekannt.has(k));
  assert.deepEqual(unbekannt, [], 'Schlüssel gibt es sonst nirgends — Tippfehler?');
});
