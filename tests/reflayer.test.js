// Tests für Sprite-Ebenen (js/state.js: layer.ref, layer.at, layerGrid).
//
// Eine Figur aus Teilen: Ebenen, die einen ANDEREN Sprite zeigen — an einer
// Stelle, in einem seiner Frames, gedreht oder gespiegelt. Was hier schief
// geht, sieht man im Export als verrutschten Arm oder gar nicht. Geprüft wird
// darum das Zusammensetzen selbst, das Laden fremder Speicherstände und dass
// zwei Sprites, die aufeinander zeigen, nicht ewig rechnen.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeSprite, flatGrid, layerGrid, transformGrid, normalizeLayer, normalizePlace,
  copyLayer, refersTo, sprites, defaultPlace,
} from '../js/state.js';

const grid = rows => rows.map(r => [...r]);
const blank = (w, h) => Array.from({ length: h }, () => Array(w).fill(0));

// Ein 2×1-Teil „Arm" mit zwei Frames: [1, 2] und [3, 3].
function arm(palette = 'graustufen') {
  return makeSprite({
    name: 'Arm', palette,
    frames: [{ grid: [[1, 2]] }, { grid: [[3, 3]] }],
  });
}

// Eine 4×3-Figur: unten eine gemalte Ebene, darüber der Arm.
function figure(at, palette = 'graustufen') {
  return makeSprite({
    name: 'Figur', palette,
    frames: at.map(() => ({ cels: [blank(4, 3), blank(4, 3)] })),
    layers: [{ name: 'Grund' }, { name: 'Arm', ref: 'arm', at }],
  });
}

function withSprites(map, fn) {
  const keep = { ...sprites };
  for (const k of Object.keys(sprites)) delete sprites[k];
  Object.assign(sprites, map);
  try { fn(); } finally {
    for (const k of Object.keys(sprites)) delete sprites[k];
    Object.assign(sprites, keep);
  }
}

// ── Drehen und Spiegeln ─────────────────────────────────────────────
test('transformGrid dreht im Uhrzeigersinn', () => {
  const g = grid([[1, 2, 3], [4, 5, 6]]);
  assert.deepEqual(transformGrid(g, 1), [[4, 1], [5, 2], [6, 3]]);
  assert.deepEqual(transformGrid(g, 2), [[6, 5, 4], [3, 2, 1]]);
  assert.deepEqual(transformGrid(g, 3), [[3, 6], [2, 5], [1, 4]]);
  assert.deepEqual(transformGrid(g, 4), g, 'vier Vierteldrehungen sind keine');
});

test('transformGrid spiegelt und lässt das Original in Ruhe', () => {
  const g = grid([[1, 2], [3, 4]]);
  assert.deepEqual(transformGrid(g, 0, true, false), [[2, 1], [4, 3]]);
  assert.deepEqual(transformGrid(g, 0, false, true), [[3, 4], [1, 2]]);
  assert.deepEqual(g, [[1, 2], [3, 4]]);
});

// ── Zusammensetzen ──────────────────────────────────────────────────
test('das Teil steht an seiner Position', () => {
  withSprites({ arm: arm() }, () => {
    const fig = figure([{ x: 1, y: 2, f: 0 }]);
    assert.deepEqual(layerGrid(fig, 1, 0), [[0, 0, 0, 0], [0, 0, 0, 0], [0, 1, 2, 0]]);
    assert.deepEqual(flatGrid(fig, 0), [[0, 0, 0, 0], [0, 0, 0, 0], [0, 1, 2, 0]]);
  });
});

test('je Frame eine eigene Position und ein eigener Frame des Teils', () => {
  withSprites({ arm: arm() }, () => {
    const fig = figure([{ x: 0, y: 0, f: 0 }, { x: 2, y: 1, f: 1 }]);
    assert.deepEqual(flatGrid(fig, 0)[0], [1, 2, 0, 0]);
    assert.deepEqual(flatGrid(fig, 1)[1], [0, 0, 3, 3]);
  });
});

test('was über den Rand ragt, wird abgeschnitten', () => {
  withSprites({ arm: arm() }, () => {
    const fig = figure([{ x: -1, y: 0 }]);
    assert.deepEqual(flatGrid(fig, 0)[0], [2, 0, 0, 0]);
    const fig2 = figure([{ x: 3, y: 5 }]);
    assert.ok(flatGrid(fig2, 0).every(r => r.every(v => v === 0)));
  });
});

test('gedreht und gespiegelt', () => {
  withSprites({ arm: arm() }, () => {
    const rot = figure([{ x: 0, y: 0, rot: 1 }]);
    assert.deepEqual(layerGrid(rot, 1, 0).map(r => r[0]), [1, 2, 0]);
    const flip = figure([{ x: 0, y: 0, fx: true }]);
    assert.deepEqual(layerGrid(flip, 1, 0)[0], [2, 1, 0, 0]);
  });
});

test('ein zu großer Frame-Wert zeigt den letzten Frame des Teils', () => {
  withSprites({ arm: arm() }, () => {
    const fig = figure([{ x: 0, y: 0, f: 9 }]);
    assert.deepEqual(flatGrid(fig, 0)[0], [3, 3, 0, 0]);
  });
});

test('die gemalte Ebene darunter bleibt sichtbar, das Teil liegt darüber', () => {
  withSprites({ arm: arm() }, () => {
    const fig = figure([{ x: 0, y: 0 }]);
    fig.frames[0].cels[0][0] = [5, 5, 5, 5];
    assert.deepEqual(flatGrid(fig, 0)[0], [1, 2, 5, 5]);
  });
});

test('eine andere Palette kommt als freie Farbe herüber', () => {
  withSprites({ arm: arm('golden') }, () => {
    const fig = figure([{ x: 0, y: 0 }], 'graustufen');
    const row = flatGrid(fig, 0)[0];
    assert.equal(typeof row[0], 'string');
    assert.match(row[0], /^#[0-9a-f]{6}$/);
  });
});

test('fehlt der Sprite, bleibt die Ebene leer statt abzustürzen', () => {
  withSprites({}, () => {
    const fig = figure([{ x: 0, y: 0 }]);
    assert.ok(flatGrid(fig, 0).every(r => r.every(v => v === 0)));
  });
});

test('zwei Sprites, die aufeinander zeigen, rechnen nicht endlos', () => {
  const a = makeSprite({
    name: 'A', palette: 'graustufen',
    frames: [{ cels: [[[1]], [[0]]] }],
    layers: [{ name: 'eigen' }, { name: 'B', ref: 'b', at: [{}] }],
  });
  const b = makeSprite({
    name: 'B', palette: 'graustufen',
    frames: [{ cels: [[[0]]] }],
    layers: [{ name: 'A', ref: 'a', at: [{}] }],
  });
  withSprites({ a, b }, () => {
    assert.deepEqual(flatGrid(a, 0), [[1]]);
    assert.ok(refersTo('a', 'b'));
    assert.ok(refersTo('b', 'a'));
  });
});

test('refersTo erkennt auch Umwege und sich selbst', () => {
  withSprites({ arm: arm() }, () => {
    const fig = figure([{}]);
    sprites.fig = fig;
    assert.ok(refersTo('fig', 'arm'));
    assert.ok(!refersTo('arm', 'fig'));
    assert.ok(refersTo('arm', 'arm'));
  });
});

// ── Laden und Kopieren ──────────────────────────────────────────────
test('normalizePlace macht aus Unsinn gültige Werte', () => {
  assert.deepEqual(normalizePlace(null), defaultPlace());
  assert.deepEqual(normalizePlace({ x: '3', y: 1.6, f: -2, rot: 5, fx: 1 }),
    { x: 3, y: 2, f: 0, rot: 1, fx: true, fy: false });
  assert.equal(normalizePlace({ rot: -1 }).rot, 3);
});

test('normale Ebenen bekommen beim Laden kein ref', () => {
  const L = normalizeLayer({ name: 'x' }, 1);
  assert.ok(!('ref' in L));
  assert.ok(!('at' in L));
});

test('makeSprite ergänzt fehlende Positionen und kürzt überzählige', () => {
  const sp = makeSprite({
    name: 'F', palette: 'graustufen',
    frames: [{ grid: [[0]] }, { grid: [[0]] }, { grid: [[0]] }],
    layers: [{ name: 'Teil', ref: 'arm', at: [{ x: 4 }] }],
  });
  assert.equal(sp.layers[0].at.length, 3);
  assert.equal(sp.layers[0].at[2].x, 4, 'übernimmt die letzte bekannte');
  const sp2 = makeSprite({
    name: 'F', palette: 'graustufen',
    frames: [{ grid: [[0]] }],
    layers: [{ name: 'Teil', ref: 'arm', at: [{ x: 1 }, { x: 2 }] }],
  });
  assert.equal(sp2.layers[0].at.length, 1);
});

test('copyLayer teilt die Positionen nicht mit dem Original', () => {
  const L = normalizeLayer({ name: 'Teil', ref: 'arm', at: [{ x: 1 }] }, 1);
  const c = copyLayer(L);
  c.at[0].x = 9;
  assert.equal(L.at[0].x, 1);
});

test('eine einzelne Sprite-Ebene wird trotzdem zusammengesetzt', () => {
  withSprites({ arm: arm() }, () => {
    const sp = makeSprite({
      name: 'F', palette: 'graustufen',
      frames: [{ grid: blank(2, 1) }],
      layers: [{ name: 'Teil', ref: 'arm', at: [{}] }],
    });
    assert.deepEqual(flatGrid(sp, 0), [[1, 2]]);
  });
});
