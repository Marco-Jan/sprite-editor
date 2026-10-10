// Tests für die Versions-Notizen (js/notes.js, notes/web.md) — Hilfe →
// „Was ist neu?“.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseNotes, notePoints } from '../js/notes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MD = `# 3.2.14

## Deutsch

- Erster **Punkt**
  geht weiter
- Zweiter mit \`code\`

## English

- First point

# 3.2.13

## Deutsch

- Älter
`;

test('Versionen, Sprachen und Punkte', () => {
  const e = parseNotes(MD);
  assert.deepEqual(e.map(x => x.version), ['3.2.14', '3.2.13']);
  assert.deepEqual(notePoints(e[0], 'de'), ['Erster Punkt geht weiter', 'Zweiter mit code']);
  assert.deepEqual(notePoints(e[0], 'en'), ['First point']);
});

test('fehlt eine Sprache, gilt Deutsch', () => {
  const e = parseNotes(MD);
  assert.deepEqual(notePoints(e[0], 'at'), notePoints(e[0], 'de'));
  assert.deepEqual(notePoints(e[1], 'en'), ['Älter']);
});

test('Unsinn ergibt nichts statt eines Fehlers', () => {
  assert.deepEqual(parseNotes(''), []);
  assert.deepEqual(parseNotes('- ohne Version\n## Deutsch\n- auch nicht\n'), []);
});

test('notes/web.md: neueste oben, jede Version mit Deutsch und Englisch', () => {
  const e = parseNotes(readFileSync(join(ROOT, 'notes', 'web.md'), 'utf8'));
  assert.ok(e.length, 'notes/web.md ist leer');
  const num = v => v.split('.').map(Number);
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  const cmp = (a, b) => { const [x, y] = [num(a), num(b)]; for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  assert.ok(cmp(e[0].version, pkg) >= 0, `oben steht ${e[0].version}, package.json hat schon ${pkg}`);
  for (let i = 1; i < e.length; i++) assert.ok(cmp(e[i - 1].version, e[i].version) > 0, `Reihenfolge: ${e[i - 1].version} vor ${e[i].version}`);
  for (const x of e) {
    assert.ok(x.langs.deutsch?.length, `${x.version}: kein Abschnitt „## Deutsch“`);
    assert.ok(x.langs.english?.length, `${x.version}: kein Abschnitt „## English“`);
  }
});
