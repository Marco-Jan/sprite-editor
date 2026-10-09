// Tests für Bittys Touren (js/helper.js, TOURS).
//
// Eine Tour zeigt auf Elemente per id. Benennt jemand einen Knopf um,
// zeigt die Tour still ins Leere (sie fällt aufs Panel zurück) — das soll
// hier auffallen. Ebenso ein vergessener Text.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(ROOT, f), 'utf8');

const helper = read('js/helper.js');
const block = helper.slice(helper.indexOf('const TOURS = {'), helper.indexOf('const TOPICS'));
const html = read('editor.html');
const i18n = read('js/i18n.js');

test('die Tour-Tabelle wurde gefunden', () => {
  assert.ok(block.length > 500);
});

test('jedes Tour-Ziel gibt es im Editor', () => {
  const fehlend = new Set();
  for (const [, id] of block.matchAll(/'#([\w-]+)'/g)) {
    if (!html.includes(`id="${id}"`)) fehlend.add(`#${id}`);
  }
  for (const [, p] of block.matchAll(/(?:panel: '|data-panel="|data-target=")([\w-]+)/g)) {
    if (!html.includes(`data-panel="${p}"`)) fehlend.add(`Panel ${p}`);
  }
  for (const [, f] of block.matchAll(/label\[for="([\w-]+)"\]/g)) {
    if (!html.includes(`for="${f}"`)) fehlend.add(`label for=${f}`);
  }
  assert.deepEqual([...fehlend], []);
});

test('jeder Tour-Text steht auf Deutsch und Englisch da', () => {
  const keys = [...block.matchAll(/key: '([\w.]+)'/g)].map(m => m[1]);
  assert.ok(keys.length > 20);
  for (const k of keys) {
    const n = i18n.split(`'${k}':`).length - 1;
    assert.equal(n, 2, `${k}: ${n}× statt 2× (de + en)`);
  }
});
