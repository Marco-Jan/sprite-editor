// Tests für verknüpfte Zellen (js/state.js, js/history.js).
//
// Verknüpft heißt: mehrere Frames teilen sich auf einer Ebene DASSELBE Bild
// — dasselbe Array-Objekt. Das ist bequem, solange alle Kopien die Teilung
// mitnehmen. Vergisst es eine Stelle (Undo, Speichern, Größe ändern), zerfällt
// die Verknüpfung still — oder zwei getrennte Zellen kleben plötzlich
// zusammen. Beides merkt man erst, wenn man malt und es woanders mitmalt.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeSprite, allGrids, mapFrames, copyFrames, linkSignature, linkedTo, isLinked,
  framesForSave, resolveLinks,
} from '../js/state.js';

/** Drei Frames, eine Ebene; Frame 1 und 2 teilen sich ein Bild. */
function linked() {
  const shared = [[1, 2]];
  return makeSprite({
    name: 'L', palette: 'graustufen',
    frames: [{ cels: [[[5, 5]]] }, { cels: [shared] }, { cels: [shared] }],
  });
}

test('linkedTo und isLinked erkennen die Teilung', () => {
  const sp = linked();
  assert.equal(linkedTo(sp, 2, 0), 1);
  assert.equal(linkedTo(sp, 1, 0), -1, 'der erste der Gruppe zeigt auf niemanden');
  assert.ok(isLinked(sp, 1, 0));
  assert.ok(!isLinked(sp, 0, 0));
});

test('malen in einer verknüpften Zelle ändert alle', () => {
  const sp = linked();
  sp.frame = 1;
  sp.grid[0][0] = 7;
  assert.equal(sp.frames[2].cels[0][0][0], 7);
});

test('sp.grid zuweisen ersetzt den Inhalt — die Verknüpfung bleibt', () => {
  const sp = linked();
  sp.frame = 2;
  sp.grid = [[9, 9]];
  assert.deepEqual(sp.frames[1].cels[0], [[9, 9]]);
  assert.equal(sp.frames[1].cels[0], sp.frames[2].cels[0]);
});

test('allGrids nennt ein geteiltes Bild nur einmal', () => {
  assert.equal(allGrids(linked()).length, 2);
});

test('mapFrames rechnet ein geteiltes Bild einmal um und lässt es geteilt', () => {
  const sp = linked();
  let calls = 0;
  mapFrames(sp, g => { calls++; return g.map(r => r.map(v => v + 1)); });
  assert.equal(calls, 2);
  assert.equal(sp.frames[1].cels[0], sp.frames[2].cels[0]);
  assert.deepEqual(sp.frames[2].cels[0], [[2, 3]]);
});

test('copyFrames kopiert die Teilung mit, aber nicht das Original', () => {
  const sp = linked();
  const cp = copyFrames(sp.frames);
  assert.equal(cp[1].cels[0], cp[2].cels[0]);
  assert.notEqual(cp[1].cels[0], sp.frames[1].cels[0]);
  assert.equal(linkSignature(cp), linkSignature(sp.frames));
});

test('linkSignature unterscheidet verknüpft von bloß gleich', () => {
  const a = [{ cels: [[[1]]] }, { cels: [[[1]]] }];
  const g = [[1]];
  const b = [{ cels: [g] }, { cels: [g] }];
  assert.notEqual(linkSignature(a), linkSignature(b));
});

// ── Speichern und Laden ─────────────────────────────────────────────
test('Speichern schreibt { link: k }, Laden macht wieder ein Bild daraus', () => {
  const sp = linked();
  const saved = JSON.parse(JSON.stringify(framesForSave(sp)));
  assert.deepEqual(saved[2].cels[0], { link: 1 });
  const back = makeSprite({ name: 'L', palette: 'graustufen', frames: saved });
  assert.equal(back.frames[1].cels[0], back.frames[2].cels[0]);
  assert.deepEqual(back.frames[2].cels[0], [[1, 2]]);
});

test('eine Kette von Verweisen endet beim selben Bild', () => {
  const out = resolveLinks([
    { cels: [[[3]]] }, { cels: [{ link: 0 }] }, { cels: [{ link: 1 }] },
  ]);
  assert.equal(out[2].cels[0], out[0].cels[0]);
});

test('ein Verweis ins Leere oder nach vorn wird ein leeres Bild', () => {
  const out = resolveLinks([
    { cels: [[[3, 3]]] }, { cels: [{ link: 5 }] }, { cels: [{ link: 2 }] },
  ]);
  assert.deepEqual(out[1].cels[0], [[0, 0]]);
  assert.deepEqual(out[2].cels[0], [[0, 0]]);
  assert.notEqual(out[1].cels[0], out[0].cels[0]);
});

// ── Undo ────────────────────────────────────────────────────────────
import { state, sprites } from '../js/state.js';
import { recordOp, undo, redo, clearHistory } from '../js/history.js';

function withCurrent(sp, fn) {
  const keep = state.curSprite;
  sprites.__links = sp;
  state.curSprite = '__links';
  clearHistory();
  try { fn(); } finally { delete sprites.__links; state.curSprite = keep; clearHistory(); }
}

test('Undo stellt verknüpfte Zellen verknüpft wieder her', () => {
  withCurrent(linked(), () => {
    recordOp(() => { sprites.__links.frame = 1; sprites.__links.grid[0][0] = 8; });
    undo();
    const sp = sprites.__links;
    assert.equal(sp.frames[1].cels[0], sp.frames[2].cels[0], 'nach Undo nicht mehr verknüpft');
    assert.deepEqual(sp.frames[2].cels[0], [[1, 2]]);
  });
});

test('Verknüpfen ohne Pixeländerung ist ein eigener Undo-Schritt', () => {
  withCurrent(makeSprite({
    name: 'U', palette: 'graustufen',
    frames: [{ cels: [[[1]]] }, { cels: [[[1]]] }],
  }), () => {
    recordOp(() => { const sp = sprites.__links; sp.frames[1].cels[0] = sp.frames[0].cels[0]; });
    const sp = sprites.__links;
    assert.equal(sp.frames[0].cels[0], sp.frames[1].cels[0]);
    undo();
    assert.notEqual(sprites.__links.frames[0].cels[0], sprites.__links.frames[1].cels[0]);
    redo();
    assert.equal(sprites.__links.frames[0].cels[0], sprites.__links.frames[1].cels[0]);
  });
});

test('Undo verklebt zwei gleiche, aber getrennte Zellen nicht', () => {
  withCurrent(linked(), () => {
    // Lösen: Frame 2 bekommt eine eigene Kopie mit gleichem Inhalt.
    recordOp(() => { const sp = sprites.__links; sp.frames[2].cels[0] = sp.frames[2].cels[0].map(r => [...r]); });
    recordOp(() => { sprites.__links.frames[0].cels[0][0][0] = 4; });
    undo();
    const sp = sprites.__links;
    assert.notEqual(sp.frames[1].cels[0], sp.frames[2].cels[0]);
  });
});

// ── Durchgehende Ebenen ─────────────────────────────────────────────
import { newFrameCels, normalizeLayer } from '../js/state.js';

test('neuer Frame: durchgehende Ebene verknüpft, die übrigen sind leer', () => {
  const sp = makeSprite({
    name: 'D', palette: 'graustufen',
    frames: [{ cels: [[[1]], [[2]]] }],
    layers: [{ name: 'Grund', continuous: true }, { name: 'Figur' }],
  });
  const cels = newFrameCels(sp, 0);
  assert.equal(cels[0], sp.frames[0].cels[0], 'Grund: dasselbe Bild');
  assert.deepEqual(cels[1], [[0]], 'Figur: leer');
});

test('Frame duplizieren: durchgehend verknüpft, sonst eigene Kopie', () => {
  const sp = makeSprite({
    name: 'D', palette: 'graustufen',
    frames: [{ cels: [[[1]], [[2]]] }],
    layers: [{ name: 'Grund', continuous: true }, { name: 'Figur' }],
  });
  const cels = newFrameCels(sp, 0, true);
  assert.equal(cels[0], sp.frames[0].cels[0]);
  assert.notEqual(cels[1], sp.frames[0].cels[1]);
  assert.deepEqual(cels[1], [[2]]);
});

test('continuous übersteht das Laden, fehlt es, ist die Ebene nicht durchgehend', () => {
  assert.equal(normalizeLayer({ continuous: 1 }, 1).continuous, true);
  assert.equal(normalizeLayer({}, 1).continuous, false);
});
