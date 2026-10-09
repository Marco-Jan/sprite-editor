// ════════════════════════════════════════════════════════════════════
// TILES — Tilemap-Ebenen mit eigenem Kachelsatz (wie in Aseprite)
// ════════════════════════════════════════════════════════════════════
// Eine Tilemap-Ebene ist ein Raster aus Kacheln fester Größe. Jede Kachel
// steht einmal im Kachelsatz der Ebene; malt man eine Kachel an, ändern
// sich alle Stellen mit, an denen sie liegt.
//
//   layer.tileset = { tw, th, tiles: [grid th×tw, …] }   // Kachel k = tiles[k-1]
//
// Kachel 0 ist „leer“ und steht nicht in der Liste. Die Ebene speichert
// weiter ganz normale Pixel (frames[].cels) — welche Kachel wo liegt, ergibt
// sich aus dem Inhalt der Zellen (mapOf). So funktionieren Frames,
// verknüpfte Zellen, Undo, Masken und Export ohne Sonderfall; der Kachelsatz
// sorgt nur dafür, dass Kacheln gleich bleiben und sich gemeinsam ändern.
//
// Nach jeder Änderung gleicht syncLayer() Pixel und Kachelsatz ab:
//   • Pixel malen (Modus „Pixel“): die geänderten Kacheln werden im Satz
//     geändert und an allen anderen Stellen mitgezogen.
//       Auto     — wer in eine leere Zelle malt, legt eine neue Kachel an.
//       Manuell  — keine neuen Kacheln; leere Zellen bleiben leer.
//   • Alles andere (Kacheln setzen, Frames, Größe …): Inhalt gilt; was neu
//     ist, kommt in den Satz.
// Der Rand, der nicht mehr in eine ganze Kachel passt, gehört nicht zur Karte.
//
// Reine Rechnung ohne DOM — läuft unter Node (tests/tiles.test.js).
// Die Desktop-Version rechnet genauso (spritebit-rs, tiles.rs).

export const TILE_SIZES = [8, 16, 24, 32, 48, 64];
export const DEFAULT_TILE = 16;

/** Leerer Kachelsatz. */
export const blankTileset = (tw = DEFAULT_TILE, th = tw) => ({ tw, th, tiles: [] });

/** Tiefe Kopie (Undo, Duplizieren). */
export const copyTileset = ts => (ts ? { tw: ts.tw, th: ts.th, tiles: ts.tiles.map(g => g.map(r => r.slice())) } : null);

/**
 * Aus dem Speicherstand oder einer fremden Datei. Unbrauchbares → null
 * (dann ist es eine normale Ebene).
 */
export function normalizeTileset(ts) {
  if (!ts || typeof ts !== 'object') return null;
  const tw = Math.round(Number(ts.tw)), th = Math.round(Number(ts.th));
  if (!(tw >= 1 && tw <= 256 && th >= 1 && th <= 256)) return null;
  const ok = g => Array.isArray(g) && g.length === th
    && g.every(r => Array.isArray(r) && r.length === tw && r.every(v => typeof v === 'number' || typeof v === 'string'));
  const tiles = (Array.isArray(ts.tiles) ? ts.tiles : []).filter(ok).map(g => g.map(r => r.slice()));
  return { tw, th, tiles };
}

/** Wie viele ganze Kacheln passen in W × H? */
export const mapSize = (ts, W, H) => ({ cols: Math.floor(W / ts.tw), rows: Math.floor(H / ts.th) });

// Inhalt einer Zelle als Text — zum Vergleichen und Nachschlagen.
function cellKey(g, cx, cy, tw, th) {
  let s = '';
  for (let y = 0; y < th; y++) {
    const row = g[cy * th + y];
    for (let x = 0; x < tw; x++) s += row[cx * tw + x] + ',';
  }
  return s;
}
const gridKey = t => t.map(r => r.join(',') + ',').join('');
const isBlankKey = k => /^(0,)*$/.test(k);

function readCell(g, cx, cy, tw, th) {
  return Array.from({ length: th }, (_, y) => g[cy * th + y].slice(cx * tw, cx * tw + tw));
}
function writeCell(g, cx, cy, t) {
  const th = t.length, tw = t[0].length;
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) g[cy * th + y][cx * tw + x] = t[y][x];
}

/** Kachel k in Zelle (cx, cy) setzen — 0 leert die Zelle. */
export function placeTile(ts, g, cx, cy, k) {
  const t = k > 0 ? ts.tiles[k - 1] : null;
  writeCell(g, cx, cy, t || Array.from({ length: ts.th }, () => Array(ts.tw).fill(0)));
}

/** Nachschlagen: Inhalt → Kachelnummer (1 …). */
function indexOf(ts) {
  const m = new Map();
  ts.tiles.forEach((t, i) => { const k = gridKey(t); if (!m.has(k)) m.set(k, i + 1); });
  return m;
}

/** Welche Kachel liegt wo? 0 = leer, -1 = Inhalt, der (noch) keine Kachel ist. */
export function mapOf(ts, g) {
  const { cols, rows } = mapSize(ts, g[0].length, g.length);
  const idx = indexOf(ts);
  return Array.from({ length: rows }, (_, cy) => Array.from({ length: cols }, (_, cx) => {
    const k = cellKey(g, cx, cy, ts.tw, ts.th);
    return isBlankKey(k) ? 0 : idx.get(k) ?? -1;
  }));
}

/** Kachelnummer in Zelle (cx, cy) — wie mapOf, für eine Zelle. */
export function tileAt(ts, g, cx, cy) {
  const k = cellKey(g, cx, cy, ts.tw, ts.th);
  return isBlankKey(k) ? 0 : indexOf(ts).get(k) ?? -1;
}

/**
 * Inhalt gilt: was in den Bildern steht und noch keine Kachel ist, wird
 * eine (Reihenfolge wie im Bild). Doppelte und leere Kacheln fallen weg.
 * @returns {number} wie viele Kacheln neu sind
 */
export function absorb(ts, grids) {
  dedupe(ts);
  const idx = indexOf(ts);
  let added = 0;
  for (const g of grids) {
    const { cols, rows } = mapSize(ts, g[0].length, g.length);
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      const k = cellKey(g, cx, cy, ts.tw, ts.th);
      if (isBlankKey(k) || idx.has(k)) continue;
      ts.tiles.push(readCell(g, cx, cy, ts.tw, ts.th));
      idx.set(k, ts.tiles.length);
      added++;
    }
  }
  return added;
}

// Doppelte und leere Kacheln aus dem Satz nehmen (Reihenfolge bleibt).
function dedupe(ts) {
  const seen = new Set();
  ts.tiles = ts.tiles.filter(t => {
    const k = gridKey(t);
    if (isBlankKey(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Kachelsatz neu aus den Bildern (Ebene in Tilemap umwandeln). */
export function buildTileset(tw, th, grids) {
  const ts = blankTileset(tw, th);
  absorb(ts, grids);
  return ts;
}

/**
 * Kacheln, die in keinem Bild mehr vorkommen, entfernen.
 * @returns {number} wie viele entfernt wurden
 */
export function pruneUnused(ts, grids) {
  const used = new Set();
  for (const g of grids) for (const row of mapOf(ts, g)) for (const k of row) if (k > 0) used.add(k);
  const n = ts.tiles.length;
  ts.tiles = ts.tiles.filter((_, i) => used.has(i + 1));
  return n - ts.tiles.length;
}

/**
 * Nach einem Strich im Modus „Pixel“: geänderte Kacheln im Satz ändern und
 * überall mitziehen.
 *
 * @param {object} ts       Kachelsatz der Ebene (wird geändert)
 * @param {any[][]} before  das bemalte Bild VOR dem Strich
 * @param {any[][]} after   dasselbe Bild jetzt (wird ggf. geändert)
 * @param {any[][][]} others die übrigen Bilder der Ebene (andere Frames, ohne `after`)
 * @param {'auto'|'manual'} mode
 * @returns {{edited: number, added: number, blocked: number}}
 *   blocked = Zellen, die im Modus „Manuell“ leer bleiben mussten
 */
export function syncPaint(ts, before, after, others, mode = 'auto') {
  const { tw, th } = ts;
  const { cols, rows } = mapSize(ts, after[0].length, after.length);
  const idx = indexOf(ts);
  // Je alte Kachel: die neue Fassung, zusammengesetzt aus den Änderungen
  // aller Stellen, an denen sie angemalt wurde. Widersprechen sich zwei
  // Stellen (dasselbe Pixel, verschiedene Farben), gilt dort der Inhalt.
  /** @type {Map<number, {tile: any[][], set: boolean[][], bad: boolean}>} */
  const edits = new Map();
  let blocked = 0;
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const kb = cellKey(before, cx, cy, tw, th);
    if (kb === cellKey(after, cx, cy, tw, th)) continue;
    const old = isBlankKey(kb) ? 0 : idx.get(kb) ?? -1;
    if (old === 0) {
      if (mode === 'manual') { writeCell(after, cx, cy, readCell(before, cx, cy, tw, th)); blocked++; }
      continue; // Auto: wird unten als neue Kachel aufgenommen
    }
    if (old < 0) continue; // war keine Kachel — Inhalt gilt
    let e = edits.get(old);
    if (!e) {
      e = { tile: ts.tiles[old - 1].map(r => r.slice()), set: Array.from({ length: th }, () => Array(tw).fill(false)), bad: false };
      edits.set(old, e);
    }
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const b = before[cy * th + y][cx * tw + x], a = after[cy * th + y][cx * tw + x];
      if (a === b) continue;
      if (e.set[y][x] && e.tile[y][x] !== a) e.bad = true;
      e.tile[y][x] = a;
      e.set[y][x] = true;
    }
  }

  // Mitziehen: jede Stelle, die vorher Kachel k zeigte, zeigt die neue Fassung.
  const changed = [...edits].filter(([, e]) => !e.bad);
  if (changed.length) {
    const oldKeys = new Map(changed.map(([k, e]) => [gridKey(ts.tiles[k - 1]), e.tile]));
    const pull = (src, dst) => {
      for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
        const t = oldKeys.get(cellKey(src, cx, cy, tw, th));
        if (t) writeCell(dst, cx, cy, t);
      }
    };
    pull(before, after);
    for (const g of others) pull(g, g);
    for (const [k, e] of changed) ts.tiles[k - 1] = e.tile;
  }
  const added = absorb(ts, [after, ...others]);
  return { edited: changed.length, added, blocked };
}

/**
 * Kacheln flächig füllen (Werkzeug „Füllen“ im Modus „Kacheln“): alle
 * zusammenhängenden Zellen mit derselben Kachel wie (cx, cy) bekommen k.
 * @returns {number} wie viele Zellen sich geändert haben
 */
export function fillTiles(ts, g, cx, cy, k) {
  const map = mapOf(ts, g);
  const rows = map.length, cols = map[0]?.length || 0;
  if (cy < 0 || cx < 0 || cy >= rows || cx >= cols) return 0;
  const from = map[cy][cx];
  if (from === k) return 0;
  const stack = [[cx, cy]];
  let n = 0;
  while (stack.length) {
    const [x, y] = /** @type {[number, number]} */ (stack.pop());
    if (x < 0 || y < 0 || x >= cols || y >= rows || map[y][x] !== from) continue;
    map[y][x] = k;
    placeTile(ts, g, x, y, k);
    n++;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return n;
}

// ── Abgleich nach jeder Änderung (history.js ruft das vor dem Undo-Eintrag) ──

function sameTiles(a, b) {
  return !!a && !!b && a.tw === b.tw && a.th === b.th && a.tiles.length === b.tiles.length
    && a.tiles.every((t, i) => gridKey(t) === gridKey(b.tiles[i]));
}
function sameGrid(a, b) {
  if (a === b) return true;
  if (a.length !== b.length || a[0].length !== b[0].length) return false;
  return a.every((r, y) => r.every((v, x) => v === b[y][x]));
}

/**
 * Alle Tilemap-Ebenen eines Sprites mit ihren Kachelsätzen abgleichen.
 * Als Bemalen der Kacheln (syncPaint) zählt es nur, wenn sich genau die
 * aktive Zelle geändert hat und sonst nichts — Frames, Ebenen, Größe und
 * Kachelsatz wie vorher. Alles andere (Kacheln setzen, Zellen ziehen,
 * Frames umstellen …) übernimmt den Inhalt (absorb).
 *
 * @param {any} sp      der Sprite (wird geändert)
 * @param {any} before  Stand vorher: { frames, layers, frame, layer } (history.js)
 * @param {{paint: boolean, mode: 'auto'|'manual'}} opts  paint = Modus „Pixel“
 * @returns {{edited: number, added: number, blocked: number}}
 */
export function syncSprite(sp, before, { paint, mode }) {
  const sum = { edited: 0, added: 0, blocked: 0 };
  sp.layers.forEach((L, li) => {
    const ts = L.tileset;
    if (!ts) return;
    const grids = [...new Set(sp.frames.map(f => f.cels[li]))];
    const act = sp.frames[sp.frame].cels[li];
    const bAct = before?.frames[sp.frame]?.cels[li];
    const editable = paint && li === sp.layer && before && before.layer === sp.layer && before.frame === sp.frame
      && before.frames.length === sp.frames.length && before.layers.length === sp.layers.length
      && sameTiles(before.layers[li]?.tileset, ts)
      && bAct && bAct.length === act.length && bAct[0].length === act[0].length
      && sp.frames.every((f, k) => f.cels[li] === act || sameGrid(f.cels[li], before.frames[k].cels[li]));
    if (editable) {
      const r = syncPaint(ts, bAct, act, grids.filter(g => g !== act), mode);
      sum.edited += r.edited; sum.added += r.added; sum.blocked += r.blocked;
    } else {
      sum.added += absorb(ts, grids);
    }
  });
  return sum;
}

// ── Export für Godot 4 (TileMapLayer) ───────────────────────────────

/** Spalten im Kachelbild (Atlas): möglichst quadratisch. */
export const atlasCols = n => Math.max(1, Math.ceil(Math.sqrt(n)));

/** Kachelbild: alle Kacheln eines Satzes in einem Raster, Kachel k an Stelle k-1. */
export function atlasGrid(ts) {
  const n = ts.tiles.length, cols = atlasCols(n), rows = Math.max(1, Math.ceil(n / cols));
  const g = Array.from({ length: rows * ts.th }, () => Array(cols * ts.tw).fill(0));
  ts.tiles.forEach((t, i) => {
    const ox = (i % cols) * ts.tw, oy = Math.floor(i / cols) * ts.th;
    t.forEach((row, y) => row.forEach((v, x) => { g[oy + y][ox + x] = v; }));
  });
  return g;
}

/**
 * Godots `tile_map_data`: 2 Byte Format (0), dann je belegter Zelle 12 Byte
 * (Little Endian): x, y (int16), Quelle, Atlas-x, Atlas-y, Alternative (uint16).
 * @returns {number[]}
 */
export function tileMapData(map, n) {
  const cols = atlasCols(n);
  const out = [0, 0];
  const u16 = v => { out.push(v & 255, (v >> 8) & 255); };
  map.forEach((row, y) => row.forEach((k, x) => {
    if (k <= 0) return;
    u16(x); u16(y); u16(0); u16((k - 1) % cols); u16(Math.floor((k - 1) / cols)); u16(0);
  }));
  return out;
}

const gdStr = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

/**
 * Godot-Szene (.tscn): ein Node2D mit einer TileMapLayer je Tilemap-Ebene,
 * Kachelsätze eingebettet, Kachelbilder als eigene PNG-Dateien.
 * @param {string} name  Name der Szene (Wurzel-Node)
 * @param {{name: string, ts: any, map: number[][], png: string, visible?: boolean, opacity?: number}[]} layers
 *        png = Pfad im Godot-Projekt, z. B. "res://level/level_boden.png"
 */
export function godotScene(name, layers) {
  const ext = layers.map((l, i) => `[ext_resource type="Texture2D" path=${gdStr(l.png)} id="${i + 1}_tex"]`);
  const subs = [];
  layers.forEach((l, i) => {
    const cols = atlasCols(l.ts.tiles.length);
    const tiles = l.ts.tiles.map((_, k) => `${k % cols}:${Math.floor(k / cols)}/0 = 0`);
    subs.push([
      `[sub_resource type="TileSetAtlasSource" id="TileSetAtlasSource_${i + 1}"]`,
      `texture = ExtResource("${i + 1}_tex")`,
      `texture_region_size = Vector2i(${l.ts.tw}, ${l.ts.th})`,
      ...tiles,
    ].join('\n'));
    subs.push([
      `[sub_resource type="TileSet" id="TileSet_${i + 1}"]`,
      `tile_size = Vector2i(${l.ts.tw}, ${l.ts.th})`,
      `sources/0 = SubResource("TileSetAtlasSource_${i + 1}")`,
    ].join('\n'));
  });
  const nodes = [`[node name=${gdStr(name)} type="Node2D"]`];
  layers.forEach((l, i) => {
    const lines = [`[node name=${gdStr(l.name)} type="TileMapLayer" parent="."]`];
    if (l.visible === false) lines.push('visible = false');
    if (l.opacity != null && l.opacity < 1) lines.push(`modulate = Color(1, 1, 1, ${+l.opacity.toFixed(3)})`);
    lines.push('texture_filter = 1'); // nächster Nachbar — Pixel bleiben scharf
    lines.push(`tile_map_data = PackedByteArray(${tileMapData(l.map, l.ts.tiles.length).join(', ')})`);
    lines.push(`tile_set = SubResource("TileSet_${i + 1}")`);
    nodes.push(lines.join('\n'));
  });
  const steps = layers.length * 3 + 1;
  return [`[gd_scene load_steps=${steps} format=3]`, ...ext, ...subs, ...nodes].join('\n\n') + '\n';
}

/** Allgemeines JSON (für eigene Engines): Kachelgröße, je Ebene die Karte. */
export function tilemapJson(name, layers) {
  return JSON.stringify({
    name,
    layers: layers.map(l => ({
      name: l.name, tileWidth: l.ts.tw, tileHeight: l.ts.th,
      tiles: l.ts.tiles.length, atlas: l.png.replace(/^res:\/\/[^/]*\//, ''), atlasColumns: atlasCols(l.ts.tiles.length),
      columns: l.map[0]?.length || 0, rows: l.map.length,
      // 0 = leer, sonst Kachel k (Stelle k-1 im Kachelbild, zeilenweise)
      data: l.map.flat().map(k => Math.max(0, k)),
    })),
  }, null, 2);
}
