// ════════════════════════════════════════════════════════════════════
// EXPORT — PNG + PDF mit transparentem Hintergrund, ohne Grid-Linien
// ════════════════════════════════════════════════════════════════════
// PDF nutzt jsPDF, das via CDN in index.html geladen wird (window.jspdf).
import { state, customMeta, getGrid, getPal } from './state.js';
import { cellToColor } from './render.js';
import { showInfoToast } from './toast.js';

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

function exportFilename(ext) {
  const base = state.curType.startsWith('custom_')
    ? (customMeta[state.curType]?.name || state.curType).replace(/[^a-zA-Z0-9_-]/g, '_')
    : `${state.curType}_${state.curState}`;
  return `${base}_${state.curVariant}.${ext}`;
}

function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 0);
}

export function initExport() {
  const scaleSel = document.getElementById('export-scale');

  document.getElementById('export-png-btn').addEventListener('click', () => {
    const scale = Number(scaleSel.value) || 8;
    const canvas = renderSpriteToCanvas(scale);
    const url = canvas.toDataURL('image/png');
    triggerDownload(url, exportFilename('png'));
  });

  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showInfoToast('PDF-Library noch nicht geladen — kurz warten und nochmal versuchen (Internet erforderlich).');
      return;
    }
    const scale = Number(scaleSel.value) || 8;
    const canvas = renderSpriteToCanvas(scale);
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
    pdf.save(exportFilename('pdf'));
  });
}
