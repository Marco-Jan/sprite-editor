// ════════════════════════════════════════════════════════════════════
// ONION — Einstellungen der Timeline und welche Frames durchscheinen
// ════════════════════════════════════════════════════════════════════
// Die Einstellungen gelten für alle Sprites und stehen in state.tlOpts
// (gespeichert mit der Oberfläche, js/storage.js). Bedient werden sie im
// Timeline-Menü (js/tlmenu.js). Hier steht nur Rechnung ohne DOM.
//
//   firstFrame  Zählung in der Timeline ab 0 oder 1
//   thumbs      Vorschaubilder in der Kopfzeile — aus spart Höhe
//   thumbSize   Kantenlänge der Vorschaubilder in px, per Griff am Rand der
//               Timeline gezogen; 0 = passend zur Breite (js/frames.js)
//   onion:
//     mode      'tint' rot/blau gefärbt | 'color' in echten Farben
//     opacity   Deckkraft des nächsten Nachbarn (0.1–0.9)
//     step      um wie viel jeder weitere Frame blasser wird (0–0.9)
//     before    so viele Frames davor (0–3) …
//     after     … und danach
//     loopTag   im Tag bleiben: am Ende des Tags geht es vorn weiter
//     layerOnly nur die aktive Ebene zeigen
//     front     vor statt hinter dem Bild
import { tagAt } from './tags.js';

export const ONION_MAX = 3;

// Grenzen für die gezogene Größe der Vorschaubilder (thumbSize).
export const THUMB_SIZE_MIN = 30;
export const THUMB_SIZE_MAX = 128;

/** @typedef {{mode: 'tint'|'color', opacity: number, step: number, before: number, after: number, loopTag: boolean, layerOnly: boolean, front: boolean}} OnionOpts */
/** @typedef {{firstFrame: number, thumbs: boolean, thumbSize: number, onion: OnionOpts}} TlOpts */

export const TL_DEFAULTS = Object.freeze({
  firstFrame: 1,
  thumbs: true,
  thumbSize: 0,
  onion: Object.freeze({
    mode: 'tint', opacity: 0.3, step: 0.3, before: 1, after: 1,
    loopTag: false, layerOnly: false, front: false,
  }),
});

/** @returns {TlOpts} */
export function defaultTlOpts() {
  return { ...TL_DEFAULTS, onion: { ...TL_DEFAULTS.onion } };
}

const num = (v, lo, hi, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

/**
 * Gespeicherte Einstellungen gültig machen — fehlt etwas, gilt die Vorgabe.
 * @returns {TlOpts}
 */
export function normalizeTlOpts(raw) {
  const d = TL_DEFAULTS, o = raw?.onion || {};
  return {
    firstFrame: raw?.firstFrame === 0 ? 0 : 1,
    thumbs: raw?.thumbs !== false,
    thumbSize: raw?.thumbSize ? Math.round(num(raw.thumbSize, THUMB_SIZE_MIN, THUMB_SIZE_MAX, 0)) : 0,
    onion: {
      mode: o.mode === 'color' ? /** @type {const} */ ('color') : /** @type {const} */ ('tint'),
      opacity: num(o.opacity, 0.1, 0.9, d.onion.opacity),
      step: num(o.step, 0, 0.9, d.onion.step),
      before: Math.round(num(o.before, 0, ONION_MAX, d.onion.before)),
      after: Math.round(num(o.after, 0, ONION_MAX, d.onion.after)),
      loopTag: !!o.loopTag,
      layerOnly: !!o.layerOnly,
      front: !!o.front,
    },
  };
}

/**
 * Welche Frames um Frame `f` durchscheinen, und wie stark.
 * Der nächste Nachbar hat `opacity`, jeder weitere `step` weniger (relativ).
 * Mit loopTag läuft die Zählung im Tag um Frame f im Kreis; ohne Tag oder
 * ohne loopTag endet sie am Anfang bzw. Ende der Animation.
 * @returns {{frame: number, side: 'before'|'after', alpha: number}[]}
 */
export function onionFrames(sp, f, opts) {
  const n = sp.frames.length;
  const o = opts.onion;
  const tag = o.loopTag ? tagAt(sp.tags, f) : null;
  const out = [];
  const seen = new Set([f]);
  const add = (k, side) => {
    let i = side === 'before' ? f - k : f + k;
    if (tag) {
      const len = tag.to - tag.from + 1;
      i = tag.from + (((i - tag.from) % len) + len) % len;
    } else if (i < 0 || i >= n) return;
    if (seen.has(i)) return;
    seen.add(i);
    out.push({ frame: i, side, alpha: o.opacity * Math.pow(1 - o.step, k - 1) });
  };
  for (let k = 1; k <= Math.max(o.before, o.after); k++) {
    if (k <= o.before) add(k, 'before');
    if (k <= o.after) add(k, 'after');
  }
  return out;
}

/** Frame-Nummer, wie sie angezeigt wird (ab 0 oder ab 1). */
export const frameLabel = (i, opts) => i + (opts?.firstFrame === 0 ? 0 : 1);
