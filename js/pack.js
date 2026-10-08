// ════════════════════════════════════════════════════════════════════
// PACK — ein Sprite kompakt für IndexedDB, und wieder zurück
// ════════════════════════════════════════════════════════════════════
// In der Projektdatei steht jedes Pixel als Zahl im JSON-Text — gut lesbar,
// aber groß. In IndexedDB stehen die Bilder als Bytes:
//
//   images[k]   ein Bild, Zeile für Zeile: Uint8Array (nur Palette)
//               oder Uint16Array (wenn freie Farben vorkommen)
//   free[j]     freie Farbe '#rrggbb' — im Bild als Wert 256 + j
//   frames[f]   { dur, cels: [k je Ebene] }
//
// Verknüpfte Zellen (state.js) teilen sich ein Bild-Objekt; hier zeigen sie
// auf dieselbe Nummer k. Beim Auspacken wird daraus wieder genau das
// Format, das auch die Projektdatei hat (framesForSave: { link: f }) — so
// läuft das Laden durch dieselbe Prüfung wie jede Datei (storage.js).

export const PACK_VERSION = 1;
const FREE_BASE = 256;

/**
 * @param {any} sp  Sprite-Datensatz (state.js makeSprite)
 * @returns {any}   Eintrag für IndexedDB
 */
export function packSprite(sp) {
  const H = sp.frames[0].cels[0].length, W = sp.frames[0].cels[0][0].length;
  const imageOf = new Map();   // Bild-Objekt → Nummer
  const images = [];
  const free = [], freeIdx = new Map();
  const pack = g => {
    let wide = false;
    const vals = new Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = g[y]?.[x] ?? 0;
      if (typeof v === 'string') {
        if (!freeIdx.has(v)) { freeIdx.set(v, free.length); free.push(v); }
        v = FREE_BASE + freeIdx.get(v);
        wide = true;
      } else if (!(v >= 0 && v < FREE_BASE)) v = 0;
      vals[y * W + x] = v;
    }
    return wide ? Uint16Array.from(vals) : Uint8Array.from(vals);
  };
  const frames = sp.frames.map(f => ({
    dur: f.dur || 0,
    cels: f.cels.map(g => {
      if (!imageOf.has(g)) { imageOf.set(g, images.length); images.push(pack(g)); }
      return imageOf.get(g);
    }),
  }));
  return {
    v: PACK_VERSION,
    name: sp.name, palette: sp.palette, fps: sp.fps, frame: sp.frame, layer: sp.layer,
    layers: sp.layers, guides: sp.guides, tags: sp.tags,
    w: W, h: H, free, images, frames,
  };
}

/**
 * Zurück in das Format der Projektdatei (ein Eintrag von payload.sprites).
 * @param {any} rec
 */
export function unpackSprite(rec) {
  const { w: W, h: H, free = [], images = [] } = rec;
  const grid = data => Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => {
    const v = data[y * W + x] ?? 0;
    return v >= FREE_BASE ? (free[v - FREE_BASE] ?? 0) : v;
  }));
  const grids = images.map(grid);
  // Welche Nummer war auf welcher Ebene zuerst in welchem Frame?
  const firstAt = new Map();
  const frames = rec.frames.map((f, i) => {
    const cels = f.cels.map((k, l) => {
      const key = l + ':' + k;
      if (firstAt.has(key)) return { link: firstAt.get(key) };
      firstAt.set(key, i);
      return grids[k] || Array.from({ length: H }, () => Array(W).fill(0));
    });
    return f.dur ? { cels, dur: f.dur } : { cels };
  });
  return {
    name: rec.name, palette: rec.palette, fps: rec.fps, frame: rec.frame, layer: rec.layer,
    layers: rec.layers, guides: rec.guides, tags: rec.tags, frames,
  };
}

/** Prüfsumme über einen gepackten Sprite — hat er sich seit dem letzten Speichern geändert? */
export function packSum(rec) {
  let h = 0x811c9dc5;
  const mix = n => { h ^= n & 0xff; h = Math.imul(h, 0x01000193) >>> 0; };
  const meta = JSON.stringify({ ...rec, images: undefined });
  for (let i = 0; i < meta.length; i++) { const c = meta.charCodeAt(i); mix(c); mix(c >> 8); }
  for (const img of rec.images) {
    mix(img.length); mix(img.BYTES_PER_ELEMENT);
    for (let i = 0; i < img.length; i++) { mix(img[i]); if (img[i] > 255) mix(img[i] >> 8); }
  }
  return h.toString(36) + ':' + rec.images.length;
}
