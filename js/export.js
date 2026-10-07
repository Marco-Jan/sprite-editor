// ════════════════════════════════════════════════════════════════════
// EXPORT — PNG + PDF mit transparentem Hintergrund, ohne Grid-Linien
// ════════════════════════════════════════════════════════════════════
// PDF nutzt jsPDF aus vendor/, geladen in editor.html (window.jspdf).
// PNG und PDF zeigen den aktuellen Frame, GIF und Spritesheet alle Frames.
import { getPal, getSprite, listSprites, getPaletteByName, frameDuration, flatGrid, emptyGrid } from './state.js';
import { encodeGif } from './gif.js';
import { cellToColor, renderCallbacks } from './render.js';
import { selectedFrameIndices } from './frames.js';
import { showInfoToast } from './toast.js';
import { saveBlob } from './filesystem.js';
import { flashSaved } from './storage.js';
import { t, onLangChange } from './i18n.js';

// Sauberer Sprite-Render auf neuen Canvas (ohne Grid-Linien, ohne Schachbrett).
// Hintergrund bleibt transparent (default-state des Canvas).
// Der aktuelle Frame, so wie man ihn sieht (alle sichtbaren Ebenen).
// `i` = Frame-Nummer; ohne Angabe der Frame, den man gerade sieht.
const shownGrid = (i) => (getSprite() ? flatGrid(getSprite(), i) : emptyGrid(24));

function renderSpriteToCanvas(scale, i) {
  const grid = shownGrid(i);
  const pal  = getPal();
  const H = grid.length, W = grid[0].length;

  const c = document.createElement('canvas');
  c.width  = W * scale;
  c.height = H * scale;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false; // harte Pixel-Kanten beim Hochskalieren

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const fill = cellToColor(grid[y][x], pal);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }
  return c;
}

// Alle tatsächlich sichtbaren Farben des Grids einsammeln (Palette-Indizes
// werden aufgelöst, Raw-Hex direkt übernommen) — in Reihenfolge des Auftretens.
function collectUsedColors(grid, pal) {
  const seen = new Map();
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      const c = cellToColor(grid[y][x], pal);
      if (c) seen.set(String(c).toLowerCase(), true);
    }
  }
  return [...seen.keys()];
}

// Sortier-Schlüssel: Farbton (0-360) dann Helligkeit — ergibt im kompakten
// Modus einen sauberen Verlauf statt zufälligem Rauschen.
function colorSortKey(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r)      h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h = h * 60; if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  return h * 1000 + l; // Hue dominiert, Helligkeit als Feinsortierung
}

// Ab dieser Anzahl wird auf die kompakte Farb-Map (ohne Hex-Text) umgeschaltet,
// weil Text neben jeder Farbe die Legende sonst tausende Pixel hoch macht.
const LEGEND_LABEL_LIMIT = 48;

// Farb-Legende rendern. Eigener opaker Hintergrund, damit alles auch über
// Transparenz lesbar bleibt.
function renderLegendCanvas(colors, minWidth) {
  const pad = 12, headH = 24, fontPx = 12;

  // ── Modus 1: wenige Farben → Swatch + Hex-Code (lesbare Palette) ──
  if (colors.length <= LEGEND_LABEL_LIMIT) {
    const sw = 18, gap = 6, colGap = 18, rowH = sw + 8;
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = `${fontPx}px monospace`;
    const textW = Math.ceil(measure.measureText('#000000').width) + 2;
    const colW  = sw + gap + textW + colGap;

    const targetW = Math.max(minWidth, 280);
    const cols = Math.max(1, Math.floor((targetW - pad * 2 + colGap) / colW));
    const rows = Math.ceil(colors.length / cols);
    const W = Math.max(targetW, pad * 2 + cols * colW - colGap);
    const H = pad * 2 + headH + rows * rowH;

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1e1e1e'; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'top';
    ctx.font = `bold ${fontPx}px monospace`;
    ctx.fillStyle = '#d0d0d0';
    ctx.fillText(t('exp.legendTitle', { n: colors.length }), pad, pad);

    ctx.font = `${fontPx}px monospace`;
    colors.forEach((col, i) => {
      const cx = pad + (i % cols) * colW;
      const cy = pad + headH + Math.floor(i / cols) * rowH;
      ctx.fillStyle = col;
      ctx.fillRect(cx, cy, sw, sw);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 0.5, cy + 0.5, sw - 1, sw - 1);
      ctx.fillStyle = '#c8c8c8';
      ctx.fillText(col, cx + sw + gap, cy + (sw - fontPx) / 2);
    });
    return c;
  }

  // ── Modus 2: viele Farben → kompakte Farb-Map ohne Text ──
  const sorted = [...colors].sort((a, b) => colorSortKey(a) - colorSortKey(b));
  const cell = 12, gap = 1;
  const targetW = Math.max(minWidth, 480);
  const cols = Math.max(1, Math.floor((targetW - pad * 2 + gap) / (cell + gap)));
  const rows = Math.ceil(sorted.length / cols);
  const W = Math.max(targetW, pad * 2 + cols * (cell + gap) - gap);
  const H = pad * 2 + headH + rows * (cell + gap);

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1e1e1e'; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'top';
  ctx.font = `bold ${fontPx}px monospace`;
  ctx.fillStyle = '#d0d0d0';
  ctx.fillText(t('exp.legendSorted', { n: sorted.length }), pad, pad);

  sorted.forEach((col, i) => {
    const cx = pad + (i % cols) * (cell + gap);
    const cy = pad + headH + Math.floor(i / cols) * (cell + gap);
    ctx.fillStyle = col;
    ctx.fillRect(cx, cy, cell, cell);
  });
  return c;
}

// Export-Canvas: Sprite oben, optional Farb-Legende darunter.
function buildExportCanvas(scale, includePalette, i) {
  const sprite = renderSpriteToCanvas(scale, i);
  if (!includePalette) return sprite;

  const grid = shownGrid(i);
  const pal  = getPal();
  const colors = collectUsedColors(grid, pal);
  if (!colors.length) return sprite;

  const legend = renderLegendCanvas(colors, sprite.width);
  const W = Math.max(sprite.width, legend.width);
  const H = sprite.height + legend.height;

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // Legende-Band auf volle Breite einfärben (falls Sprite breiter als Legende)
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, sprite.height, W, legend.height);
  ctx.drawImage(sprite, 0, 0);                // Sprite oben, Rest transparent
  ctx.drawImage(legend, 0, sprite.height);    // Legende darunter
  return c;
}

function exportBase() {
  return (getSprite()?.name || 'sprite').replace(/[^a-zA-Z0-9_-]/g, '_') || 'sprite';
}

function exportFilename(ext) {
  return `${exportBase()}.${ext}`;
}

// Ein Frame je Datei: name_f01.png, name_f02.png … Die Nummer ist so lang
// wie die höchste Frame-Nummer, damit die Dateien in jedem Dateimanager in
// der richtigen Reihenfolge stehen.
function frameFilename(ext, i, total) {
  const pad = String(total).length;
  return `${exportBase()}_f${String(i + 1).padStart(pad, '0')}.${ext}`;
}

// Welche Frames exportiert werden: die in der Timeline markierten, sonst der
// aktive. Mehr als einer heißt: eine Datei je Frame.
function framesToExport() {
  const sp = getSprite();
  if (!sp) return [];
  return selectedFrameIndices().filter(i => i >= 0 && i < sp.frames.length);
}

// Mehrere Dateien am Stück: einmal melden statt einmal pro Datei.
function reportSavedMany(result, n, first, last) {
  flashSaved();
  const where = result.fallback ? t('exp.framesDownload')
    : result.dir ? t('exp.framesIn', { dir: result.dir }) : '';
  showInfoToast(t('exp.framesSaved', { n, first, last, where }));
}

// Canvas → PNG-Blob (Promise).
function canvasToPngBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// Nach erfolgreichem Speichern Feedback geben: kurz "gespeichert" aufblitzen,
// bei Download-Fallback einmalig erklären wohin die Datei ging.
function reportSaved(result, filename) {
  flashSaved(); // kurzes "gespeichert"-Aufblitzen oben rechts
  if (result.fallback) {
    showInfoToast(t('file.downloadedTipIcon', { name: filename }));
  } else {
    showInfoToast(result.dir
      ? t('file.savedInOk', { name: filename, dir: result.dir })
      : t('file.savedOk', { name: filename }));
  }
}

// ────────────────────────────────────────────────────────────────────
// GIF — die Animation des aktiven Sprites (ein Frame: ein stilles Bild)
// ────────────────────────────────────────────────────────────────────
// Farben über alle Frames einsammeln; GIF fasst 255 plus Transparent.
function buildGif(scale, only) {
  const sp = getSprite();
  if (!sp) return { ok: false, reason: t('exp.noSprites') };
  const pal = getPal();
  const H = sp.grid.length, W = sp.grid[0].length;
  const index = new Map();
  // Markierte Frames: nur die kommen ins GIF — so schneidet man einen
  // Abschnitt einer langen Animation heraus, ohne etwas zu löschen.
  const use = only && only.length > 1 ? only : sp.frames.map((_, i) => i);
  const shown = use.map(i => flatGrid(sp, i));
  for (const g of shown) for (const row of g) for (const c of row) {
    const hex = cellToColor(c, pal);
    if (hex && !index.has(hex.toLowerCase())) index.set(hex.toLowerCase(), index.size + 1);
  }
  if (index.size > 255) return { ok: false, reason: t('exp.gifTooMany', { n: index.size }) };

  const w = W * scale, h = H * scale;
  const frames = shown.map(g => {
    const px = new Uint8Array(w * h);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const hex = cellToColor(g[y][x], pal);
      if (!hex) continue;
      const v = index.get(hex.toLowerCase());
      for (let dy = 0; dy < scale; dy++) px.fill(v, (y * scale + dy) * w + x * scale, (y * scale + dy) * w + x * scale + scale);
    }
    return px;
  });
  const bytes = encodeGif({
    width: w, height: h, colors: [...index.keys()], frames,
    delays: use.map(i => frameDuration(sp, i)),
  });
  return { ok: true, blob: new Blob([bytes], { type: 'image/gif' }), n: frames.length };
}

// ────────────────────────────────────────────────────────────────────
// SPRITESHEET — alle Sprites in einem Bild, plus Atlas
// ────────────────────────────────────────────────────────────────────
// Gleich große Zellen: das ist das Format, das Engines (Phaser, Godot,
// Unity) ohne Nacharbeit einlesen. Jeder Frame sitzt mittig in seiner
// Zelle, der Atlas nennt die echten Pixelkoordinaten — auch für Sprites,
// die kleiner als die Zelle sind.
// Ohne Animation: ein möglichst quadratisches Raster, ein Sprite je Zelle.
// Mit Animation: eine Zeile je Sprite, seine Frames nebeneinander; der Atlas
// nennt dann zu jedem Eintrag Frame-Nummer und Dauer.
function buildSheet(scale) {
  const all = listSprites();
  if (!all.length) return null;

  const animated = all.some(s => s.frames.length > 1);
  const cellW = Math.max(...all.map(s => s.grid[0].length));
  const cellH = Math.max(...all.map(s => s.grid.length));
  const cols = animated ? Math.max(...all.map(s => s.frames.length)) : Math.ceil(Math.sqrt(all.length));
  const rows = animated ? all.length : Math.ceil(all.length / cols);

  const c = document.createElement('canvas');
  c.width  = cols * cellW * scale;
  c.height = rows * cellH * scale;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const place = (sp, grid, col, row) => {
    const W = grid[0].length, H = grid.length;
    // Mittig in der Zelle, auf ganze Pixel gerundet.
    const ox = col * cellW + Math.floor((cellW - W) / 2);
    const oy = row * cellH + Math.floor((cellH - H) / 2);
    const pal = getPaletteByName(sp.palette);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const fill = cellToColor(grid[y][x], pal);
      if (!fill) continue;
      ctx.fillStyle = fill;
      ctx.fillRect((ox + x) * scale, (oy + y) * scale, scale, scale);
    }
    return { name: sp.name, id: sp.id, x: ox * scale, y: oy * scale, w: W * scale, h: H * scale, palette: sp.palette };
  };

  const frames = animated
    ? all.flatMap((sp, row) => sp.frames.map((_, i) => ({
        ...place(sp, flatGrid(sp, i), i, row), frame: i, duration: frameDuration(sp, i),
      })))
    : all.map((sp, i) => place(sp, flatGrid(sp), i % cols, Math.floor(i / cols)));

  const atlas = {
    image: '',                       // wird unten mit dem Dateinamen gefüllt
    scale,
    cell: { w: cellW * scale, h: cellH * scale },
    columns: cols,
    frames,
  };
  return { canvas: c, atlas, count: all.length };
}

export function initExport() {
  const scaleSel = /** @type {HTMLSelectElement} */ (document.getElementById('export-scale'));

  // Hinweiszeile: sie macht sichtbar, dass PNG/PDF/GIF sich gerade auf die
  // markierten Frames beziehen — ein Titel-Tooltip sieht auf dem Handy keiner.
  const note = document.getElementById('export-frames-note');
  const syncFrameNote = (n) => {
    if (!note) return;
    const many = n > 1;
    note.hidden = !many;
    if (many) note.textContent = t('exp.framesNote', { n });
  };
  renderCallbacks.onFrameSelection = syncFrameNote;
  onLangChange(() => syncFrameNote(framesToExport().length));

  document.getElementById('export-gif-btn').addEventListener('click', async () => {
    const scale = Number(scaleSel.value) || 8;
    const r = buildGif(scale, framesToExport());
    if (!r.ok) { showInfoToast(r.reason); return; }
    const filename = exportFilename('gif');
    const result = await saveBlob(r.blob, filename);
    reportSaved(result, filename);
  });

  const embedPalette = () => /** @type {HTMLInputElement} */ (document.getElementById('export-embed-palette'))?.checked;

  document.getElementById('export-png-btn').addEventListener('click', async () => {
    const scale = Number(scaleSel.value) || 8;
    const ids = framesToExport();
    const sp = getSprite();
    if (!sp) { showInfoToast(t('exp.noSprites')); return; }

    // Ein markierter Frame (oder gar keine Auswahl): eine Datei wie bisher.
    if (ids.length < 2) {
      const canvas = buildExportCanvas(scale, embedPalette());
      const blob = await canvasToPngBlob(canvas);
      const filename = exportFilename('png');
      reportSaved(await saveBlob(blob, filename), filename);
      return;
    }

    let result = null, first = '', last = '';
    for (const i of ids) {
      const name = frameFilename('png', i, sp.frames.length);
      const blob = await canvasToPngBlob(buildExportCanvas(scale, embedPalette(), i));
      result = await saveBlob(blob, name);
      first = first || name;
      last = name;
    }
    reportSavedMany(result, ids.length, first, last);
  });

  document.getElementById('export-sheet-btn').addEventListener('click', async () => {
    const scale = Number(scaleSel.value) || 8;
    const sheet = buildSheet(scale);
    if (!sheet) { showInfoToast(t('exp.noSprites')); return; }

    const base = (getSprite()?.name || 'sprites').replace(/[^a-zA-Z0-9_-]/g, '_') || 'sprites';
    const pngName = `${base}_sheet.png`;
    sheet.atlas.image = pngName;

    const pngResult = await saveBlob(await canvasToPngBlob(sheet.canvas), pngName);
    const jsonName = `${base}_sheet.json`;
    const jsonBlob = new Blob([JSON.stringify(sheet.atlas, null, 2)], { type: 'application/json;charset=utf-8' });
    await saveBlob(jsonBlob, jsonName);

    flashSaved();
    showInfoToast(t('exp.sheetSaved', {
      n: sheet.count, png: pngName, json: jsonName,
      where: pngResult.fallback ? t('exp.sheetDownload')
           : pngResult.dir ? t('exp.sheetIn', { dir: pngResult.dir }) : '.',
    }));
  });

  document.getElementById('export-pdf-btn').addEventListener('click', async () => {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showInfoToast(t('exp.pdfMissing'));
      return;
    }
    const scale = Number(scaleSel.value) || 8;
    const sp = getSprite();
    if (!sp) { showInfoToast(t('exp.noSprites')); return; }
    const ids = framesToExport();

    // PDF in exakter Pixel-Größe — Transparenz bleibt durch PNG-Embed erhalten
    const makePdf = (i) => {
      const canvas = buildExportCanvas(scale, embedPalette(), i);
      const W = canvas.width, H = canvas.height;
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        unit: 'px',
        format: [W, H],
        orientation: W >= H ? 'landscape' : 'portrait',
        hotfixes: ['px_scaling'],
      });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, W, H, undefined, 'NONE');
      return pdf.output('blob');
    };

    if (ids.length < 2) {
      const filename = exportFilename('pdf');
      reportSaved(await saveBlob(makePdf(undefined), filename), filename);
      return;
    }

    let result = null, first = '', last = '';
    for (const i of ids) {
      const name = frameFilename('pdf', i, sp.frames.length);
      result = await saveBlob(makePdf(i), name);
      first = first || name;
      last = name;
    }
    reportSavedMany(result, ids.length, first, last);
  });
}
