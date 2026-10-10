// Tests für die Projektliste (js/projects.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRegistry, newProjectId, freeName, sortedList, dbNameOf, storageKeyOf, MAIN } from '../js/projects.js';

test('ohne Liste gibt es das erste Projekt — der alte Speicherstand', () => {
  const r = parseRegistry(null);
  assert.equal(r.current, MAIN);
  assert.deepEqual(r.list.map(e => e.id), [MAIN]);
  assert.equal(dbNameOf(MAIN), 'spritebit', 'dieselbe Datenbank wie bisher');
  assert.equal(storageKeyOf(MAIN), 'wb_sprite_tester_v1', 'derselbe Schlüssel wie bisher');
});

test('Unbrauchbares fällt weg, main kommt immer dazu', () => {
  const r = parseRegistry(JSON.stringify({
    current: 'weg',
    list: [{ id: 'p1', name: 'Level', updated: 5, count: 3 }, { id: 'p1', name: 'doppelt' }, { id: '../x' }, null, { id: 'p2', name: 7, count: -1 }],
  }));
  assert.deepEqual(r.list.map(e => e.id), [MAIN, 'p1', 'p2']);
  assert.equal(r.list[1].name, 'Level');
  assert.equal(r.list[2].name, '', 'kein Text → leer');
  assert.equal(r.list[2].count, 0);
  assert.equal(r.current, MAIN, 'unbekanntes current → das erste');
  assert.equal(parseRegistry('kaputt{').list.length, 1);
});

test('neue Kennung ist frei, eigene Datenbank und eigener Schlüssel', () => {
  const r = parseRegistry(JSON.stringify({ list: [{ id: 'p000000' }] }));
  let k = 0;
  const id = newProjectId(r, () => (k++ === 0 ? 0 : 0.5));
  assert.notEqual(id, 'p000000');
  assert.match(id, /^p[a-z0-9]{6}$/);
  assert.notEqual(dbNameOf(id), dbNameOf(MAIN));
  assert.notEqual(storageKeyOf(id), storageKeyOf(MAIN));
});

test('freie Namen und Reihenfolge', () => {
  const r = parseRegistry(JSON.stringify({
    current: 'p2',
    list: [{ id: MAIN, name: 'Projekt', updated: 30 }, { id: 'p1', name: 'Projekt 2', updated: 50 }, { id: 'p2', name: 'Alt', updated: 10 }],
  }));
  assert.equal(freeName(r, 'Projekt'), 'Projekt 3');
  assert.equal(freeName(r, '  Neu  '), 'Neu');
  assert.equal(freeName(r, ''), 'Projekt 3');
  assert.deepEqual(sortedList(r).map(e => e.id), ['p2', 'p1', MAIN], 'geöffnetes oben, dann neueste');
});
