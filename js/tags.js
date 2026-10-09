// ════════════════════════════════════════════════════════════════════
// TAGS — benannte Abschnitte der Animation
// ════════════════════════════════════════════════════════════════════
// Eine Figur hat oft mehrere Animationen in einem Sprite: „Laufen" in den
// Frames 1–8, „Springen" in 9–14. Ein Tag gibt so einem Abschnitt einen
// Namen, eine Farbe und eine Abspielrichtung:
//
//   sp.tags = [{ name, from, to, color, dir }, …]
//     from, to   erster und letzter Frame (0-basiert, inklusive)
//     dir        'forward' | 'reverse' | 'pingpong'
//
// Abspielen bleibt im Tag, in dem man gerade steht; der Export kann je Tag
// eine eigene Datei schreiben. Hier steht nur Rechnung ohne DOM.

export const TAG_DIRS = ['forward', 'reverse', 'pingpong'];
export const TAG_COLORS = ['#e5534b', '#e0823d', '#c9b33a', '#57ab5a', '#4aa3df', '#986ee2', '#d36bb0', '#8b949e'];

/** @typedef {{name: string, from: number, to: number, color: string, dir: string}} Tag */

/**
 * Tags aus fremder Hand (Speicherstand, Datei) gültig machen: Bereich in die
 * Frames einpassen, Unbekanntes durch Vorgaben ersetzen, Kaputtes weglassen.
 * @param {any} tags
 * @param {number} n  Zahl der Frames
 * @returns {Tag[]}
 */
export function normalizeTags(tags, n) {
  if (!Array.isArray(tags) || n < 1) return [];
  const out = [];
  tags.forEach((g, k) => {
    const from = Math.round(Number(g?.from)), to = Math.round(Number(g?.to));
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    const a = Math.max(0, Math.min(from, to)), b = Math.min(n - 1, Math.max(from, to));
    if (a > b) return;
    out.push({
      name: typeof g?.name === 'string' && g.name.trim() ? g.name.trim() : 'Tag ' + (k + 1),
      from: a,
      to: b,
      color: typeof g?.color === 'string' && /^#[0-9a-f]{6}$/i.test(g.color) ? g.color.toLowerCase() : TAG_COLORS[k % TAG_COLORS.length],
      dir: TAG_DIRS.includes(g?.dir) ? g.dir : 'forward',
    });
  });
  return out;
}

export const copyTags = tags => (tags || []).map(g => ({ ...g }));

/**
 * Ein Frame wird an Stelle `at` eingefügt. Tags dahinter rücken auf; wird
 * innerhalb eines Tags oder direkt an seinem Ende eingefügt, wächst er mit —
 * wer im Tag „Laufen" einen Frame anhängt, will ihn im Tag haben.
 */
export function tagsInsert(tags, at) {
  for (const g of tags) {
    if (at <= g.from) { g.from++; g.to++; } else if (at <= g.to + 1) g.to++;
  }
}

/** Frames mit diesen Nummern fallen weg. Tags ohne Frame verschwinden. */
export function tagsDelete(tags, ids) {
  for (const i of [...ids].sort((a, b) => b - a)) {
    for (const g of tags) {
      if (i < g.from) { g.from--; g.to--; } else if (i <= g.to) g.to--;
    }
  }
  for (let k = tags.length - 1; k >= 0; k--) if (tags[k].to < tags[k].from) tags.splice(k, 1);
}

/** Der engste Tag, der Frame f enthält — oder null. */
export function tagAt(tags, f) {
  let best = null;
  for (const g of tags || []) {
    if (f >= g.from && f <= g.to && (!best || g.to - g.from < best.to - best.from)) best = g;
  }
  return best;
}

/** Reihenfolge der Frames eines Tags beim Abspielen (eine Runde). */
export function tagFrames(g) {
  const fwd = [];
  for (let f = g.from; f <= g.to; f++) fwd.push(f);
  if (g.dir === 'reverse') return fwd.reverse();
  // Ping-Pong: hin und zurück, ohne die Enden doppelt zu zeigen.
  if (g.dir === 'pingpong' && fwd.length > 2) return [...fwd, ...fwd.slice(1, -1).reverse()];
  return fwd;
}

/**
 * Nächster Frame beim Abspielen. `step` ist der Zähler innerhalb der Runde
 * (für Ping-Pong nötig — derselbe Frame kommt hin und zurück vor).
 * Ohne Tag: alle Frames vorwärts.
 * @returns {{frame: number, step: number}}
 */
export function nextPlayFrame(g, n, f, step) {
  if (!g) return { frame: (f + 1) % n, step: 0 };
  const order = tagFrames(g);
  // Steht man (noch) nicht auf dem erwarteten Frame, fängt die Runde dort an,
  // wo dieser Frame darin vorkommt.
  let k = order[step] === f ? step : order.indexOf(f);
  if (k < 0) k = -1;
  const next = (k + 1) % order.length;
  return { frame: order[next], step: next };
}

/**
 * Tags auf Spuren verteilen: überlappende liegen untereinander, damit keiner
 * den anderen verdeckt. Gibt je Tag die Spur (0 = oben) zurück.
 */
export function tagLanes(tags) {
  const lanes = [];   // je Spur der letzte belegte Frame
  return tags.map(g => {
    let k = lanes.findIndex(end => end < g.from);
    if (k < 0) { k = lanes.length; lanes.push(-1); }
    lanes[k] = Math.max(lanes[k], g.to);
    return k;
  });
}
