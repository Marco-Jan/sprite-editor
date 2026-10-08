// ════════════════════════════════════════════════════════════════════
// CELS — Zellen der Timeline: verschieben, kopieren, leeren, verknüpfen
// ════════════════════════════════════════════════════════════════════
// Eine Zelle ist das Bild einer Ebene in einem Frame (sp.frames[f].cels[l]).
// Ein Bereich ist ein Rechteck im Raster der Timeline:
//
//   { f0, f1, l0, l1 }   Frames f0..f1, Ebenen l0..l1 (0 = unterste), je inklusive
//
// Hier steht nur die Rechnung, ohne DOM — frames.js ruft sie in recordOp()
// auf, damit jede Aktion ein Undo-Schritt ist.
//
// Verknüpfte Zellen (state.js) teilen sich ein Bild-Objekt. Verschieben
// nimmt das Objekt mit (die Verknüpfung bleibt), Kopieren macht neue
// Objekte — wobei innerhalb des kopierten Bereichs Verknüpfte untereinander
// verknüpft bleiben, wie in Aseprite.
import { blankLike, isLinked } from './state.js';
import { dc } from './data.js';

/** @typedef {{f0: number, f1: number, l0: number, l1: number}} CelRange */
/** @typedef {{w: number, h: number, cels: any[][][][]}} CelClip  cels[ebene-offset][frame-offset] */

/** Bereich aus zwei beliebigen Ecken. */
export function rangeOf(fa, la, fb, lb) {
  return { f0: Math.min(fa, fb), f1: Math.max(fa, fb), l0: Math.min(la, lb), l1: Math.max(la, lb) };
}

export const rangeSize = r => (r.f1 - r.f0 + 1) * (r.l1 - r.l0 + 1);

export const inRange = (r, f, l) => !!r && f >= r.f0 && f <= r.f1 && l >= r.l0 && l <= r.l1;

/** Bereich auf das zurechtstutzen, was der Sprite hat — oder null. */
export function clampRange(sp, r) {
  if (!r) return null;
  const n = sp.frames.length, L = sp.layers.length;
  if (r.f0 >= n || r.l0 >= L) return null;
  return { f0: r.f0, f1: Math.min(r.f1, n - 1), l0: r.l0, l1: Math.min(r.l1, L - 1) };
}

// Kopien mit derselben Teilung untereinander.
function copier() {
  const memo = new Map();
  return g => { if (!memo.has(g)) memo.set(g, dc(g)); return memo.get(g); };
}

// Passt ein um (df, dl) verschobener Bereich noch ins Raster?
export function canShift(sp, r, df, dl) {
  return r.f0 + df >= 0 && r.f1 + df < sp.frames.length && r.l0 + dl >= 0 && r.l1 + dl < sp.layers.length;
}

/**
 * Bereich um df Frames und dl Ebenen versetzen. Verschieben lässt leere
 * Zellen zurück, Kopieren das Original stehen. Was am Ziel lag, wird
 * überschrieben. Liegt das Ziel außerhalb, passiert nichts (false).
 */
export function shiftCels(sp, r, df, dl, copy = false) {
  if (!canShift(sp, r, df, dl) || (!df && !dl)) return false;
  const cp = copier();
  // Erst alles einsammeln, dann schreiben: Quelle und Ziel dürfen sich
  // überlappen (eine Zelle einen Frame weiter schieben).
  const moving = [];
  for (let l = r.l0; l <= r.l1; l++) for (let f = r.f0; f <= r.f1; f++) {
    const g = sp.frames[f].cels[l];
    moving.push({ f, l, g: copy ? cp(g) : g });
  }
  if (!copy) {
    for (const m of moving) sp.frames[m.f].cels[m.l] = blankLike(m.g);
  }
  for (const m of moving) sp.frames[m.f + df].cels[m.l + dl] = m.g;
  return true;
}

/** Zellen leeren — jede bekommt ein eigenes leeres Bild (löst Verknüpfungen). */
export function clearCels(sp, r) {
  for (let l = r.l0; l <= r.l1; l++) for (let f = r.f0; f <= r.f1; f++) {
    sp.frames[f].cels[l] = blankLike(sp.frames[f].cels[l]);
  }
}

/** Zwischenablage für Zellen: unabhängige Kopien, Teilung untereinander bleibt. */
export function copyCels(sp, r) {
  const cp = copier();
  const cels = [];
  for (let l = r.l0; l <= r.l1; l++) {
    const row = [];
    for (let f = r.f0; f <= r.f1; f++) row.push(cp(sp.frames[f].cels[l]));
    cels.push(row);
  }
  return { w: r.f1 - r.f0 + 1, h: r.l1 - r.l0 + 1, cels };
}

/**
 * Einfügen: die linke obere Ecke (erster Frame, OBERSTE Ebene — so, wie man
 * es in der Timeline sieht) landet auf Frame `f`, Ebene `lTop`. Was über
 * den Rand ginge, fällt weg. Gibt den belegten Bereich zurück oder null.
 * Bilder mit anderen Maßen (Sprite inzwischen verkleinert) passen nicht.
 */
export function pasteCels(sp, clip, f, lTop) {
  if (!clip || !clip.cels.length) return null;
  const H = sp.frames[0].cels[0].length, W = sp.frames[0].cels[0][0].length;
  const g0 = clip.cels[0][0];
  if (g0.length !== H || g0[0].length !== W) return null;
  const cp = copier();
  const l0 = lTop - (clip.h - 1);
  let used = null;
  for (let dl = 0; dl < clip.h; dl++) for (let df = 0; df < clip.w; df++) {
    const tf = f + df, tl = l0 + dl;
    if (tf < 0 || tf >= sp.frames.length || tl < 0 || tl >= sp.layers.length) continue;
    sp.frames[tf].cels[tl] = cp(clip.cels[dl][df]);
    used = used ? rangeOf(Math.min(used.f0, tf), Math.min(used.l0, tl), Math.max(used.f1, tf), Math.max(used.l1, tl))
      : { f0: tf, f1: tf, l0: tl, l1: tl };
  }
  return used;
}

/** Je Ebene im Bereich zeigen alle Frames auf das Bild des ersten. */
export function linkCels(sp, r) {
  let changed = false;
  for (let l = r.l0; l <= r.l1; l++) {
    const g = sp.frames[r.f0].cels[l];
    for (let f = r.f0 + 1; f <= r.f1; f++) {
      if (sp.frames[f].cels[l] !== g) { sp.frames[f].cels[l] = g; changed = true; }
    }
  }
  return changed;
}

/** Jede Zelle im Bereich bekommt ein eigenes Bild — mit gleichem Inhalt. */
export function unlinkCels(sp, r) {
  let changed = false;
  for (let l = r.l0; l <= r.l1; l++) for (let f = r.f0; f <= r.f1; f++) {
    if (isLinked(sp, f, l)) { sp.frames[f].cels[l] = dc(sp.frames[f].cels[l]); changed = true; }
  }
  return changed;
}
