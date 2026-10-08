// Tests für Zellen-Aktionen der Timeline (js/cels.js).
//
// Verschieben, kopieren, einfügen, verknüpfen — jeweils über einen Bereich
// aus Frames × Ebenen. Gefährlich sind die Ränder (Ziel außerhalb) und die
// Überlappung (eine Zelle einen Frame weiter schieben), und dass Kopien nie
// still mit dem Original verknüpft bleiben.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSprite } from '../js/state.js';
import {
  rangeOf, rangeSize, inRange, clampRange, shiftCels, clearCels, copyCels, pasteCels,
  linkCels, unlinkCels,
} from '../js/cels.js';

// Vier Frames, zwei Ebenen. Zelle (f, l) enthält [[10*l + f]] — so sieht
// man nach jeder Aktion, was wo gelandet ist.
function grid4() {
  return makeSprite({
    name: 'C', palette: 'graustufen',
    frames: [0, 1, 2, 3].map(f => ({ cels: [[[f]], [[10 + f]]] })),
  });
}
const v = (sp, f, l) => sp.frames[f].cels[l][0][0];

test('rangeOf ordnet die Ecken, rangeSize und inRange zählen richtig', () => {
  const r = rangeOf(3, 1, 1, 0);
  assert.deepEqual(r, { f0: 1, f1: 3, l0: 0, l1: 1 });
  assert.equal(rangeSize(r), 6);
  assert.ok(inRange(r, 2, 1));
  assert.ok(!inRange(r, 0, 0));
});

test('clampRange schneidet ab, was es nicht mehr gibt', () => {
  const sp = grid4();
  assert.deepEqual(clampRange(sp, { f0: 2, f1: 9, l0: 0, l1: 5 }), { f0: 2, f1: 3, l0: 0, l1: 1 });
  assert.equal(clampRange(sp, { f0: 7, f1: 9, l0: 0, l1: 0 }), null);
});

test('verschieben lässt eine leere Zelle zurück', () => {
  const sp = grid4();
  assert.ok(shiftCels(sp, rangeOf(0, 0, 0, 0), 2, 0));
  assert.equal(v(sp, 2, 0), 0 + 0);   // Inhalt von Frame 0 …
  assert.equal(v(sp, 0, 0), 0);       // … und Frame 0 ist leer
  assert.equal(v(sp, 1, 0), 1, 'Nachbarn bleiben');
});

test('verschieben über sich selbst hinweg (Überlappung)', () => {
  const sp = grid4();
  shiftCels(sp, rangeOf(0, 1, 2, 1), 1, 0);   // Ebene 1, Frames 0–2 → 1–3
  assert.deepEqual([0, 1, 2, 3].map(f => v(sp, f, 1)), [0, 10, 11, 12]);
});

test('kopieren lässt das Original stehen und teilt kein Bild', () => {
  const sp = grid4();
  shiftCels(sp, rangeOf(1, 0, 1, 0), 0, 1, true);   // Frame 1: Ebene 0 → Ebene 1
  assert.equal(v(sp, 1, 1), 1);
  assert.equal(v(sp, 1, 0), 1);
  assert.notEqual(sp.frames[1].cels[1], sp.frames[1].cels[0]);
});

test('ein Ziel außerhalb des Rasters ändert nichts', () => {
  const sp = grid4();
  assert.equal(shiftCels(sp, rangeOf(3, 0, 3, 0), 1, 0), false);
  assert.equal(shiftCels(sp, rangeOf(0, 1, 0, 1), 0, 1), false);
  assert.equal(v(sp, 3, 0), 3);
});

test('verschieben nimmt die Verknüpfung mit', () => {
  const sp = grid4();
  sp.frames[1].cels[0] = sp.frames[0].cels[0];
  shiftCels(sp, rangeOf(1, 0, 1, 0), 2, 0);
  assert.equal(sp.frames[3].cels[0], sp.frames[0].cels[0]);
});

test('leeren löst verknüpfte Zellen und leert nur den Bereich', () => {
  const sp = grid4();
  sp.frames[1].cels[0] = sp.frames[0].cels[0];
  clearCels(sp, rangeOf(1, 0, 1, 0));
  assert.equal(v(sp, 1, 0), 0);
  assert.equal(v(sp, 0, 0), 0 + 0, 'Frame 0 behält seinen Inhalt');
  sp.frames[0].cels[0][0][0] = 5;
  assert.equal(v(sp, 1, 0), 0, 'nicht mehr verknüpft');
});

test('kopieren und einfügen: oberste Ebene landet auf der gewählten', () => {
  const sp = grid4();
  const clip = copyCels(sp, rangeOf(0, 0, 1, 1));   // 2 Frames × 2 Ebenen
  const used = pasteCels(sp, clip, 2, 1);
  assert.deepEqual(used, { f0: 2, f1: 3, l0: 0, l1: 1 });
  assert.deepEqual([v(sp, 2, 0), v(sp, 3, 0), v(sp, 2, 1), v(sp, 3, 1)], [0, 1, 10, 11]);
});

test('einfügen am Rand schneidet ab statt abzustürzen', () => {
  const sp = grid4();
  const clip = copyCels(sp, rangeOf(0, 0, 1, 1));
  const used = pasteCels(sp, clip, 3, 0);   // nur Frame 3, nur Ebene 0 passt
  assert.deepEqual(used, { f0: 3, f1: 3, l0: 0, l1: 0 });
  assert.equal(v(sp, 3, 0), 10);
});

test('eingefügte Zellen sind unabhängig von der Zwischenablage', () => {
  const sp = grid4();
  const clip = copyCels(sp, rangeOf(0, 0, 0, 0));
  pasteCels(sp, clip, 1, 0);
  pasteCels(sp, clip, 2, 0);
  assert.notEqual(sp.frames[1].cels[0], sp.frames[2].cels[0]);
});

test('Bilder in anderer Größe werden nicht eingefügt', () => {
  const sp = grid4();
  assert.equal(pasteCels(sp, { w: 1, h: 1, cels: [[[[1, 2]]]] }, 0, 0), null);
});

test('verknüpfen: alle Frames je Ebene zeigen auf den ersten', () => {
  const sp = grid4();
  assert.ok(linkCels(sp, rangeOf(1, 0, 3, 0)));
  assert.equal(sp.frames[3].cels[0], sp.frames[1].cels[0]);
  assert.notEqual(sp.frames[0].cels[0], sp.frames[1].cels[0], 'außerhalb bleibt');
  assert.notEqual(sp.frames[1].cels[1], sp.frames[2].cels[1], 'andere Ebene bleibt');
  assert.equal(linkCels(sp, rangeOf(1, 0, 3, 0)), false, 'schon verknüpft');
});

test('lösen gibt jeder Zelle ein eigenes Bild mit gleichem Inhalt', () => {
  const sp = grid4();
  linkCels(sp, rangeOf(0, 0, 2, 0));
  assert.ok(unlinkCels(sp, rangeOf(0, 0, 2, 0)));
  const [a, b, c] = [0, 1, 2].map(f => sp.frames[f].cels[0]);
  assert.ok(a !== b && b !== c && a !== c);
  assert.deepEqual(b, a);
});

test('kopieren hält Verknüpfungen innerhalb des Bereichs', () => {
  const sp = grid4();
  linkCels(sp, rangeOf(0, 0, 1, 0));
  const clip = copyCels(sp, rangeOf(0, 0, 1, 0));
  pasteCels(sp, clip, 2, 0);
  assert.equal(sp.frames[2].cels[0], sp.frames[3].cels[0]);
  assert.notEqual(sp.frames[2].cels[0], sp.frames[0].cels[0]);
});
