// ════════════════════════════════════════════════════════════════════
// EXPORT — PNG + PDF mit transparentem Hintergrund, ohne Grid-Linien
// ════════════════════════════════════════════════════════════════════
// PDF nutzt jsPDF, das via CDN in index.html geladen wird (window.jspdf).
import { state, customMeta, getGrid, getPal } from './state.js';
import { cellToColor } from './render.js';
import { showInfoToast } from './toast.js';
import { saveBlob } from './filesystem.js';
import { flashSaved } from './storage.js';

// Sauberer Sprite-Render auf neuen Canvas (ohne Grid-Linien, ohne Schachbrett).
// Hintergrund bleibt transparent (default-state des Canvas).
function renderSpriteToCanvas(scale) {
  const grid = getGrid();
  const pal  = getPal(state.curType, state.curVariant);
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
    ctx.fillText(`Palette — ${colors.length} Farben`, pad, pad);

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
  ctx.fillText(`Palette — ${sorted.length} Farben (nach Farbton sortiert)`, pad, pad);

  sorted.forEach((col, i) => {
    const cx = pad + (i % cols) * (cell + gap);
    const cy = pad + headH + Math.floor(i / cols) * (cell + gap);
    ctx.fillStyle = col;
    ctx.fillRect(cx, cy, cell, cell);
  });
  return c;
}

// Export-Canvas: Sprite oben, optional Farb-Legende darunter.
function buildExportCanvas(scale, includePalette) {
  const sprite = renderSpriteToCanvas(scale);
  if (!includePalette) return sprite;

  const grid = getGrid();
  const pal  = getPal(state.curType, state.curVariant);
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

function exportFilename(ext) {
  const base = state.curType.startsWith('custom_')
    ? (customMeta[state.curType]?.name || state.curType).replace(/[^a-zA-Z0-9_-]/g, '_')
    : `${state.curType}_${state.curState}`;
  return `${base}.${ext}`; // ohne Palettennamen
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
    showInfoToast(`„${filename}“ wurde heruntergeladen (in den Standard-Download-Ordner). ` +
      `Tipp: Mit „📁 Speicherort“ einen festen Ordner wählen.`);
  } else {
    showInfoToast(`✅ „${filename}“ gespeichert${result.dir ? ` in „${result.dir}“` : ''}.`);
  }
}

export function initExport() {
  const scaleSel = document.getElementById('export-scale');

  const embedPalette = () => document.getElementById('export-embed-palette')?.checked;

  document.getElementById('export-png-btn').addEventListener('click', async () => {
    const scale = Number(scaleSel.value) || 8;
    const canvas = buildExportCanvas(scale, embedPalette());
    const blob = await canvasToPngBlob(canvas);
    const filename = exportFilename('png');
    const result = await saveBlob(blob, filename);
    reportSaved(result, filename);
  });

  document.getElementById('export-pdf-btn').addEventListener('click', async () => {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showInfoToast('PDF-Library noch nicht geladen — kurz warten und nochmal versuchen (Internet erforderlich).');
      return;
    }
    const scale = Number(scaleSel.value) || 8;
    const canvas = buildExportCanvas(scale, embedPalette());
    const W = canvas.width, H = canvas.height;
    const dataUrl = canvas.toDataURL('image/png');

    // PDF in exakter Pixel-Größe — Transparenz bleibt durch PNG-Embed erhalten
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      unit: 'px',
      format: [W, H],
      orientation: W >= H ? 'landscape' : 'portrait',
      hotfixes: ['px_scaling'],
    });
    pdf.addImage(dataUrl, 'PNG', 0, 0, W, H, undefined, 'NONE');
    const filename = exportFilename('pdf');
    const result = await saveBlob(pdf.output('blob'), filename);
    reportSaved(result, filename);
  });
}
