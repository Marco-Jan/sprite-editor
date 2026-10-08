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
  // Direkt in ein 16-Bit-Feld schreiben; kommen keine freien Farben vor,
  // reicht am Ende ein Byte je Pixel.
  const pack = g => {
    let wide = false;
    const out = new Uint16Array(W * H);
    for (let y = 0; y < H; y++) {
      const row = g[y] || [];
      const o = y * W;
      for (let x = 0; x < W; x++) {
        let v = row[x] ?? 0;
        if (typeof v === 'string') {
          if (!freeIdx.has(v)) { freeIdx.set(v, free.length); free.push(v); }
          v = FREE_BASE + freeIdx.get(v);
          wide = true;
        } else if (!(v >= 0 && v < FREE_BASE)) v = 0;
        out[o + x] = v;
      }
    }
    return wide ? out : Uint8Array.from(out);
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
  const meta = JSON.stringify({ ...rec, images: undefined });
  for (let i = 0; i < meta.length; i++) h = Math.imul(h ^ meta.charCodeAt(i), 0x01000193);
  for (const img of rec.images) {
    h = Math.imul(h ^ img.length ^ (img.BYTES_PER_ELEMENT << 24), 0x01000193);
    // Vier Bytes auf einmal — bei einer Million Pixeln je Bild zählt das.
    const words = img.byteLength >> 2;
    const u32 = new Uint32Array(img.buffer, img.byteOffset, words);
    for (let i = 0; i < words; i++) h = Math.imul(h ^ u32[i], 0x01000193);
    const u8 = new Uint8Array(img.buffer, img.byteOffset + words * 4, img.byteLength - words * 4);
    for (let i = 0; i < u8.length; i++) h = Math.imul(h ^ u8[i], 0x01000193);
  }
  return (h >>> 0).toString(36) + ':' + rec.images.length;
}
