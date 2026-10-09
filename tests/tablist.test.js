// Tests für die Reiter der geöffneten Sprites (js/tablist.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncTabs, closeTab, moveTab, stepTab } from '../js/tablist.js';

test('ohne gespeicherte Reiter sind alle Sprites offen', () => {
  assert.deepEqual(syncTabs(null, ['a', 'b', 'c'], 'b'), ['a', 'b', 'c']);
});

test('gelöschte und doppelte fallen weg, der aktive kommt dazu', () => {
  assert.deepEqual(syncTabs(['a', 'x', 'a'], ['a', 'b', 'c'], 'c'), ['a', 'c']);
  assert.deepEqual(syncTabs([], ['a'], 'a'), ['a']);
});

test('Reihenfolge der Reiter bleibt, nicht die des Projekts', () => {
  assert.deepEqual(syncTabs(['c', 'a'], ['a', 'b', 'c'], 'a'), ['c', 'a']);
});

test('aktiven Reiter schließen: rechter Nachbar, am Ende der linke', () => {
  assert.deepEqual(closeTab(['a', 'b', 'c'], 'b', 'b'), { tabs: ['a', 'c'], cur: 'c' });
  assert.deepEqual(closeTab(['a', 'b', 'c'], 'c', 'c'), { tabs: ['a', 'b'], cur: 'b' });
});

test('anderen Reiter schließen: der aktive bleibt', () => {
  assert.deepEqual(closeTab(['a', 'b', 'c'], 'a', 'c'), { tabs: ['b', 'c'], cur: 'c' });
});

test('den letzten Reiter kann man nicht schließen', () => {
  assert.deepEqual(closeTab(['a'], 'a', 'a'), { tabs: ['a'], cur: 'a' });
});

test('verschieben', () => {
  assert.deepEqual(moveTab(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b']);
  assert.deepEqual(moveTab(['a', 'b', 'c'], 'a', null), ['b', 'c', 'a']);
  assert.deepEqual(moveTab(['a', 'b', 'c'], 'b', 'b'), ['a', 'b', 'c']);
});

test('weiterschalten läuft rundum', () => {
  assert.equal(stepTab(['a', 'b', 'c'], 'c', 1), 'a');
  assert.equal(stepTab(['a', 'b', 'c'], 'a', -1), 'c');
  assert.equal(stepTab([], 'a', 1), null);
});
