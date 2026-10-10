// ════════════════════════════════════════════════════════════════════
// ASEPRITE — .aseprite / .ase lesen und schreiben
// ════════════════════════════════════════════════════════════════════
// Dasselbe wie spritebit-rs (spritebit_core::aseprite), für die Web-Version.
// Das Format ist offen beschrieben (aseprite/docs, ase-file-specs.md): ein
// Kopf von 128 Byte, dann je Frame ein Frame-Kopf und Blöcke („Chunks“):
// Ebenen, Zellen (Pixel mit zlib gepackt), Palette, Tags, Tilesets. Alle
// Zahlen little-endian.
//
// In beide Richtungen: Ebenen (Name, sichtbar, gesperrt, Deckkraft), Frames
// mit Dauer, verknüpfte Zellen, Palette, Tags, Tilemap-Ebenen samt Tileset.
// Lesen: indiziert, RGBA, Graustufen; Gruppen werden aufgelöst. Farben, die
// nicht in der Palette stehen, werden freie Farben ('#rrggbb').
// Schreiben: indiziert (0 = transparent, dann die Palette), mit freien
// Farben RGBA. Masken werden eingerechnet — so, wie man es sieht.
//
// Ergebnis von readAse ist eine Sprite-Datei wie .bitty (kind: 'sprite') —
// storage.js addSpritesFromPayload nimmt sie dazu. Ohne DOM; zlib über
// CompressionStream (Browser und Node ≥ 18). Getestet in tests/aseprite.test.js.
import { mapOf, mapSize, buildTileset } from './tiles.js';
import { maskedCel } from './mask.js';

const MAGIC = 0xA5E0, FRAME_MAGIC = 0xF1FA;
const CH = { OLD_PAL: 0x0004, OLD_PAL64: 0x0011, LAYER: 0x2004, CEL: 0x2005, TAGS: 0x2018, PALETTE: 0x2019, TILESET: 0x2023 };
const MAX_COLORS = 255;
const DIRS = ['forward', 'reverse', 'pingpong', 'pingpong'];

/** Fehler mit Kennung für die Meldung (file.aseBad, file.aseBig). */
export class AseError extends Error {
  /** @param {'notAse'|'tooBig'|'corrupt'} code @param {string} [why] */
  constructor(code, why = '') { super(why || code); this.code = code; }
}

async function inflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function deflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

const hex2 = v => v.toString(16).padStart(2, '0');
const hexOf = (r, g, b) => '#' + hex2(r) + hex2(g) + hex2(b);
const rgbOf = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

class Reader {
  /** @param {Uint8Array} b */
  constructor(b) { this.b = b; this.v = new DataView(b.buffer, b.byteOffset, b.byteLength); this.pos = 0; }
  need(n) { if (this.pos + n > this.b.length) throw new AseError('corrupt', 'zu kurz'); }
  u8() { this.need(1); return this.b[this.pos++]; }
  u16() { this.need(2); const v = this.v.getUint16(this.pos, true); this.pos += 2; return v; }
  i16() { this.need(2); const v = this.v.getInt16(this.pos, true); this.pos += 2; return v; }
  u32() { this.need(4); const v = this.v.getUint32(this.pos, true); this.pos += 4; return v; }
  take(n) { this.need(n); const s = this.b.subarray(this.pos, this.pos + n); this.pos += n; return s; }
  skip(n) { this.take(n); }
  str() { const n = this.u16(); return new TextDecoder().decode(this.take(n)); }
  rest() { const s = this.b.subarray(this.pos); this.pos = this.b.length; return s; }
}

/**
 * Aseprite-Datei → Sprite-Datei (wie .bitty). `name` wird der Name von
 * Sprite und Palette. `maxSide`: größte Kante (Web 1024).
 * @param {ArrayBuffer|Uint8Array} buf @param {string} name
 */
export async function readAse(buf, name, maxSide = 1024) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (bytes.length < 128 || (bytes[4] | (bytes[5] << 8)) !== MAGIC) throw new AseError('notAse');
  const r = new Reader(bytes);
  r.pos = 6;
  const nFrames = r.u16(), W = r.u16(), H = r.u16(), depth = r.u16();
  if (![8, 16, 32].includes(depth)) throw new AseError('corrupt', 'Farbtiefe ' + depth);
  const flags = r.u32(), speed = r.u16();
  r.skip(8);
  const transparent = r.u8();
  if (!W || !H || W > maxSide || H > maxSide) throw new AseError('tooBig', `${W}×${H}`);
  if (!nFrames) throw new AseError('corrupt', 'keine Frames');
  const bpp = depth / 8;
  r.pos = 128;

  const layers = [], cels = [], tags = [], tilesets = [], durations = [];
  let palette = [], newPal = false;
  for (let f = 0; f < nFrames; f++) {
    const start = r.pos;
    const len = r.u32();
    if (r.u16() !== FRAME_MAGIC || len < 16) throw new AseError('corrupt', 'Frame-Kennung fehlt');
    const oldN = r.u16(), dur = r.u16();
    r.skip(2);
    const newN = r.u32();
    const n = newN || oldN;
    durations.push(dur || speed);
    const end = start + len;
    if (end > bytes.length) throw new AseError('corrupt', 'Frame abgeschnitten');
    for (let k = 0; k < n && r.pos + 6 <= end; k++) {
      const size = r.u32(), kind = r.u16();
      if (size < 6) throw new AseError('corrupt', 'Block zu klein');
      const c = new Reader(r.take(size - 6));
      if (kind === CH.LAYER) {
        const lf = c.u16(), lk = c.u16();
        c.skip(8);
        const op = c.u8();
        c.skip(3);
        const nm = c.str();
        layers.push({ kind: lk, visible: !!(lf & 1), editable: !!(lf & 2), opacity: flags & 1 ? op : 255, name: nm, tileset: lk === 2 ? c.u32() : 0 });
      } else if (kind === CH.CEL) {
        const layer = c.u16(), x = c.i16(), y = c.i16();
        c.skip(1);
        const ck = c.u16();
        c.skip(7);
        cels.push({ frame: f, layer, x, y, kind: ck, data: c.rest() });
      } else if (kind === CH.TAGS) {
        const cnt = c.u16();
        c.skip(8);
        for (let i = 0; i < cnt; i++) {
          const from = c.u16(), to = c.u16(), dir = c.u8();
          c.skip(8);
          const [cr, cg, cb] = c.take(3);
          c.skip(1);
          const nm = c.str();
          tags.push({ name: nm, from: Math.min(from, nFrames - 1), to: Math.min(Math.max(to, from), nFrames - 1), color: cr | cg | cb ? hexOf(cr, cg, cb) : undefined, dir: DIRS[dir] || 'forward' });
        }
      } else if (kind === CH.PALETTE) {
        newPal = true;
        const sz = Math.min(c.u32(), 256), first = c.u32(), last = c.u32();
        c.skip(8);
        while (palette.length < sz) palette.push([0, 0, 0, 255]);
        for (let i = first; i <= Math.min(last, first + 1024); i++) {
          const ef = c.u16();
          const [pr, pg, pb, pa] = c.take(4);
          if (ef & 1) c.str();
          if (i < palette.length) palette[i] = [pr, pg, pb, pa];
        }
      } else if ((kind === CH.OLD_PAL || kind === CH.OLD_PAL64) && !newPal) {
        const packets = c.u16();
        let i = 0;
        for (let p = 0; p < packets; p++) {
          i += c.u8();
          const cnt = c.u8() || 256;
          for (let j = 0; j < cnt; j++, i++) {
            const [pr, pg, pb] = c.take(3);
            const s = v => (kind === CH.OLD_PAL64 ? Math.floor(v * 255 / 63) : v);
            if (i < 256) { while (palette.length <= i) palette.push([0, 0, 0, 255]); palette[i] = [s(pr), s(pg), s(pb), 255]; }
          }
        }
      } else if (kind === CH.TILESET) {
        const id = c.u32(), tf = c.u32(), count = c.u32(), tw = c.u16(), th = c.u16();
        c.skip(16);
        c.str();
        if (tf & 1) c.skip(8);
        let pixels = new Uint8Array(0);
        if (tf & 2) { const dl = c.u32(); pixels = await inflate(c.take(dl)); }
        if (tw && th) tilesets.push({ id, tw, th, count, pixels });
      }
    }
    r.pos = end;
  }

  // Palette: die transparente Nummer (bzw. durchsichtige Einträge) fallen weg.
  const palColors = [];
  const byIndex = new Array(Math.max(256, palette.length)).fill(0);
  palette.forEach((c, i) => {
    if ((depth === 8 && i === transparent) || (depth !== 8 && c[3] === 0) || palColors.length >= MAX_COLORS) return;
    palColors.push(c);
    byIndex[i] = palColors.length;
  });
  const byHex = new Map();
  for (let i = palColors.length - 1; i >= 0; i--) byHex.set(hexOf(...palColors[i].slice(0, 3)), i + 1);
  const pixel = (src, o) => {
    if (depth === 8) { const i = src[o]; return i === transparent ? 0 : byIndex[i] || 0; }
    if (depth === 16) { if (!src[o + 1]) return 0; const h = hexOf(src[o], src[o], src[o]); return byHex.get(h) ?? h; }
    if (!src[o + 3]) return 0;
    const h = hexOf(src[o], src[o + 1], src[o + 2]);
    return byHex.get(h) ?? h;
  };

  // Gruppen fallen weg; die anderen behalten ihre Reihenfolge (unten → oben).
  const kept = layers.map((l, i) => i).filter(i => layers[i].kind !== 1);
  if (!kept.length) throw new AseError('corrupt', 'keine Ebenen');
  const ourOf = new Map(kept.map((a, o) => [a, o]));
  const blank = () => Array.from({ length: H }, () => new Array(W).fill(0));
  /** @type {any[][]} */
  const grid = Array.from({ length: nFrames }, () => kept.map(() => blank()));
  const links = Array.from({ length: nFrames }, () => kept.map(() => -1));
  const tsOf = id => tilesets.find(t => t.id === id);
  const put = (g, x, y, v) => { if (v !== 0 && x >= 0 && y >= 0 && x < W && y < H) g[y][x] = v; };

  for (const cel of cels) {
    const l = ourOf.get(cel.layer);
    if (l === undefined) continue;
    const f = cel.frame, c = new Reader(cel.data);
    if (cel.kind === 1) {
      const link = c.u16();
      if (link < f) links[f][l] = links[link][l] >= 0 ? links[link][l] : link;
    } else if (cel.kind === 0 || cel.kind === 2) {
      const cw = c.u16(), ch = c.u16();
      const px = cel.kind === 0 ? c.take(cw * ch * bpp) : await inflate(c.rest());
      if (px.length < cw * ch * bpp) throw new AseError('corrupt', 'Zelle zu kurz');
      for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) put(grid[f][l], cel.x + xx, cel.y + yy, pixel(px, (yy * cw + xx) * bpp));
    } else if (cel.kind === 3) {
      const ts = tsOf(layers[cel.layer].tileset);
      if (!ts) continue;
      const cols = c.u16(), rows = c.u16(), bits = c.u16(), mask = c.u32();
      c.skip(22);
      const tb = Math.max(1, bits / 8);
      const raw = await inflate(c.rest());
      for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
        const o = (ty * cols + tx) * tb;
        if (o + tb > raw.length) continue;
        let v = 0;
        for (let k = 0; k < tb; k++) v |= raw[o + k] << (8 * k);
        const k = (v >>> 0) & mask;
        if (!k || k >= ts.count) continue;
        for (let yy = 0; yy < ts.th; yy++) for (let xx = 0; xx < ts.tw; xx++) {
          const so = ((k * ts.th + yy) * ts.tw + xx) * bpp;
          if (so + bpp > ts.pixels.length) continue;
          put(grid[f][l], cel.x + tx * ts.tw + xx, cel.y + ty * ts.th + yy, pixel(ts.pixels, so));
        }
      }
    }
  }

  const sameDur = durations.every(d => d === durations[0]);
  const first = Math.max(1, durations[0]);
  const fps = Math.max(1, Math.min(60, Math.round(1000 / first)));
  const outLayers = kept.map((a, o) => {
    const L = layers[a];
    const ts = L.kind === 2 ? tsOf(L.tileset) : null;
    return {
      name: L.name || 'Ebene ' + (o + 1),
      visible: L.visible,
      locked: !L.editable,
      opacity: L.opacity / 255,
      tileset: ts ? buildTileset(ts.tw, ts.th, grid.map(fr => fr[o])) : null,
    };
  });
  const frames = grid.map((fr, f) => {
    const cels = fr.map((g, l) => (links[f][l] >= 0 ? { link: links[f][l] } : g));
    return sameDur ? { cels } : { cels, dur: durations[f] };
  });
  const pal = Object.fromEntries(palColors.map((c, i) => [String(i + 1), hexOf(c[0], c[1], c[2]).toUpperCase()]));
  const id = (name || 'aseprite').replace(/[^a-zA-Z0-9_-]/g, '_') || 'aseprite';
  return {
    version: 2,
    kind: 'sprite',
    sprites: { [id]: { name, palette: name, fps, frame: 0, layer: outLayers.length - 1, layers: outLayers, frames, tags } },
    customPalettes: { [name]: pal },
  };
}

// ── Schreiben ───────────────────────────────────────────────────────

class Writer {
  constructor() { this.parts = []; this.len = 0; }
  bytes(b) { this.parts.push(b); this.len += b.length; }
  num(v, n, signed = false) {
    const b = new Uint8Array(n), dv = new DataView(b.buffer);
    if (n === 1) b[0] = v & 255;
    else if (n === 2) signed ? dv.setInt16(0, v, true) : dv.setUint16(0, v & 0xffff, true);
    else dv.setUint32(0, v >>> 0, true);
    this.bytes(b);
  }
  u8(v) { this.num(v, 1); }
  u16(v) { this.num(v, 2); }
  i16(v) { this.num(v, 2, true); }
  u32(v) { this.num(v, 4); }
  zeros(n) { this.bytes(new Uint8Array(n)); }
  str(s) { const b = new TextEncoder().encode(s).subarray(0, 0xffff); this.u16(b.length); this.bytes(b); }
  done() { const out = new Uint8Array(this.len); let o = 0; for (const p of this.parts) { out.set(p, o); o += p.length; } return out; }
}

function chunk(list, kind, body) {
  const w = new Writer();
  w.u32(body.length + 6);
  w.u16(kind);
  w.bytes(body);
  list.push(w.done());
}

/** Inhalt-Rechteck eines Rasters (oder null, wenn leer). */
function bounds(g) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  g.forEach((row, y) => row.forEach((v, x) => {
    if (v === 0) return;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }));
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Sprite (wie in state.js) als Aseprite-Datei.
 * @param {any} sp @param {Record<string, string>} pal  { 1: '#rrggbb', … }
 * @returns {Promise<Uint8Array>}
 */
export async function writeAse(sp, pal) {
  const H = sp.frames[0].cels[0].length, W = sp.frames[0].cels[0][0].length;
  const colors = [];
  for (let i = 1; i <= MAX_COLORS && pal[i]; i++) colors.push(rgbOf(pal[i]));
  const shown = (f, l) => maskedCel(sp.layers[l], sp.frames[f].cels[l]);
  const indexed = !sp.frames.some((fr, f) => fr.cels.some((_, l) => shown(f, l).some(row => row.some(v => typeof v === 'string'))));
  const depth = indexed ? 8 : 32;
  const nF = Math.min(sp.frames.length, 0xffff);
  const fpsMs = Math.max(1, Math.floor(1000 / Math.max(1, sp.fps || 8)));
  const rgba = v => {
    if (typeof v === 'string') return [...rgbOf(v), 255];
    const c = v > 0 && v <= colors.length ? colors[v - 1] : null;
    return c ? [...c, 255] : [0, 0, 0, 0];
  };
  const enc = (vals) => {
    const out = new Uint8Array(vals.length * (indexed ? 1 : 4));
    vals.forEach((v, i) => {
      if (indexed) out[i] = typeof v === 'number' && v > 0 && v <= colors.length ? v : 0;
      else out.set(rgba(v), i * 4);
    });
    return out;
  };

  // Tilemap-Ebenen, die ganz aus Kacheln bestehen (auch der Rand leer).
  const tilemaps = [];
  sp.layers.forEach((L, l) => {
    const ts = L.tileset;
    if (!ts) return;
    const { cols, rows } = mapSize(ts, W, H);
    const ok = sp.frames.every((_, f) => {
      const g = shown(f, l);
      return mapOf(ts, g).every(row => row.every(k => k >= 0)) && g.every((row, y) => row.every((v, x) => v === 0 || (x < cols * ts.tw && y < rows * ts.th)));
    });
    if (ok) tilemaps.push({ l, ts });
  });
  const tilemapOf = l => tilemaps.findIndex(t => t.l === l);

  const frames = [];
  for (let f = 0; f < nF; f++) {
    const chunks = [];
    if (f === 0) {
      let b = new Writer();
      b.u32(colors.length + 1); b.u32(0); b.u32(colors.length); b.zeros(8);
      b.u16(0); b.bytes(new Uint8Array([0, 0, 0, 0]));
      for (const c of colors) { b.u16(0); b.bytes(new Uint8Array([...c, 255])); }
      chunk(chunks, CH.PALETTE, b.done());
      sp.layers.forEach((L, l) => {
        const k = tilemapOf(l);
        b = new Writer();
        b.u16((L.visible !== false ? 1 : 0) | (L.locked ? 0 : 2));
        b.u16(k >= 0 ? 2 : 0); b.u16(0); b.zeros(4); b.u16(0);
        b.u8(Math.round(Math.max(0, Math.min(1, L.opacity ?? 1)) * 255)); b.zeros(3);
        b.str(L.name || '');
        if (k >= 0) b.u32(k);
        chunk(chunks, CH.LAYER, b.done());
      });
      for (const [k, { l, ts }] of tilemaps.entries()) {
        const vals = [];
        for (let yy = 0; yy < ts.th; yy++) for (let xx = 0; xx < ts.tw; xx++) vals.push(0);
        for (const t of ts.tiles) for (const row of t) for (const v of row) vals.push(v);
        const z = await deflate(enc(vals));
        b = new Writer();
        b.u32(k); b.u32(2 | 4); b.u32(ts.tiles.length + 1); b.u16(ts.tw); b.u16(ts.th); b.i16(1); b.zeros(14);
        b.str(sp.layers[l].name || ''); b.u32(z.length); b.bytes(z);
        chunk(chunks, CH.TILESET, b.done());
      }
      if (sp.tags?.length) {
        b = new Writer();
        b.u16(sp.tags.length); b.zeros(8);
        for (const t of sp.tags) {
          b.u16(Math.min(t.from, nF - 1)); b.u16(Math.min(t.to, nF - 1));
          b.u8(Math.max(0, DIRS.indexOf(t.dir))); b.u16(0); b.zeros(6);
          b.bytes(new Uint8Array(rgbOf(/^#[0-9a-f]{6}$/i.test(t.color || '') ? t.color : '#6ea8fe'))); b.u8(0);
          b.str(t.name || '');
        }
        chunk(chunks, CH.TAGS, b.done());
      }
    }
    for (let l = 0; l < sp.layers.length; l++) {
      const g0 = sp.frames[f].cels[l];
      const first = sp.frames.slice(0, f).findIndex(fr => fr.cels[l] === g0);
      const b = new Writer();
      b.u16(l);
      if (first >= 0) {
        b.i16(0); b.i16(0); b.u8(255); b.u16(1); b.zeros(7); b.u16(first);
        chunk(chunks, CH.CEL, b.done());
        continue;
      }
      const g = shown(f, l);
      const k = tilemapOf(l);
      if (k >= 0) {
        const map = mapOf(tilemaps[k].ts, g);
        if (map.every(row => row.every(t => t === 0))) continue;
        const rows = map.length, cols = map[0]?.length || 0;
        const raw = new Uint8Array(rows * cols * 4), dv = new DataView(raw.buffer);
        map.flat().forEach((t, i) => dv.setUint32(i * 4, Math.max(0, t), true));
        b.i16(0); b.i16(0); b.u8(255); b.u16(3); b.zeros(7);
        b.u16(cols); b.u16(rows); b.u16(32);
        b.u32(0x1fffffff); b.u32(0x80000000); b.u32(0x40000000); b.u32(0x20000000); b.zeros(10);
        b.bytes(await deflate(raw));
        chunk(chunks, CH.CEL, b.done());
        continue;
      }
      const bb = bounds(g);
      if (!bb) continue;
      const vals = [];
      for (let y = bb.y; y < bb.y + bb.h; y++) for (let x = bb.x; x < bb.x + bb.w; x++) vals.push(g[y][x]);
      b.i16(bb.x); b.i16(bb.y); b.u8(255); b.u16(2); b.zeros(7);
      b.u16(bb.w); b.u16(bb.h);
      b.bytes(await deflate(enc(vals)));
      chunk(chunks, CH.CEL, b.done());
    }
    const body = chunks.reduce((s, c) => s + c.length, 0);
    const fw = new Writer();
    fw.u32(body + 16); fw.u16(FRAME_MAGIC); fw.u16(Math.min(chunks.length, 0xffff));
    fw.u16(Math.min(sp.frames[f].dur || fpsMs, 0xffff)); fw.zeros(2); fw.u32(chunks.length);
    for (const c of chunks) fw.bytes(c);
    frames.push(fw.done());
  }

  const total = 128 + frames.reduce((s, f) => s + f.length, 0);
  const h = new Writer();
  h.u32(total); h.u16(MAGIC); h.u16(nF); h.u16(W); h.u16(H); h.u16(depth);
  h.u32(1); h.u16(Math.min(fpsMs, 0xffff)); h.zeros(8);
  h.u8(0); h.zeros(3);
  h.u16(colors.length + 1 >= 256 ? 0 : colors.length + 1);
  h.u8(1); h.u8(1); h.i16(0); h.i16(0); h.u16(16); h.u16(16); h.zeros(84);
  for (const f of frames) h.bytes(f);
  return h.done();
}
