// ════════════════════════════════════════════════════════════════════
// PALETTES — eigene Paletten erstellen, bearbeiten, löschen
// ════════════════════════════════════════════════════════════════════
import {
  sprites, customPalettes,
  getSprite, getPaletteName, getPaletteByName, getAllPaletteOptions,
  paletteExists, isCustomPalette, uniquePaletteName,
} from './state.js';
import { BUILTIN_PALETTES, COLOR_LABELS, MAX_IDX, DEFAULT_PALETTE, NEW_PALETTE_DEFAULTS, completePalette } from './data.js';
import { renderAll } from './render.js';
import { saveState } from './storage.js';
import { showConfirmToast, showInfoToast } from './toast.js';

// Name der Palette, die gerade bearbeitet wird — null = neue anlegen.
let _editName = null;

// ────────────────────────────────────────────────────────────────────
// Palette dem aktuellen Sprite zuweisen
// ────────────────────────────────────────────────────────────────────
export function applyPaletteToCurrentSprite(name) {
  const sp = getSprite();
  if (!sp || !paletteExists(name)) return;
  sp.palette = name;
  renderAll();
  saveState();
}

// Eine eingebaute Palette als eigene Kopie anlegen (dann ist sie editierbar).
export function forkCurrentPalette() {
  const src = getPaletteName();
  const name = uniquePaletteName(src + '_kopie');
  customPalettes[name] = { ...getPaletteByName(src) };
  const sp = getSprite();
  if (sp) sp.palette = name;
  renderAll();
  saveState();
  showInfoToast(`Palette „${name}“ angelegt — die Farb-Swatches rechts sind jetzt änderbar.`);
}

// ────────────────────────────────────────────────────────────────────
// Löschen
// ────────────────────────────────────────────────────────────────────
export function deleteCustomPalette(name) {
  if (!customPalettes[name]) return;
  delete customPalettes[name];

  // Sprites, die auf die gelöschte Palette zeigten, auf den Default setzen.
  let affected = 0;
  for (const sp of Object.values(sprites)) {
    if (sp.palette === name) { sp.palette = DEFAULT_PALETTE; affected++; }
  }
  renderAll();
  saveState();
  if (affected) {
    showInfoToast(`Palette gelöscht — ${affected} Sprite${affected === 1 ? '' : 's'} auf „${DEFAULT_PALETTE}“ gesetzt.`);
  }
}

// ────────────────────────────────────────────────────────────────────
// Modal
// ────────────────────────────────────────────────────────────────────
export function openPaletteModal(editName) {
  const overlay   = document.getElementById('pal-modal-overlay');
  const nameInp   = document.getElementById('pal-name');
  const srcRow    = document.getElementById('pal-source-row');
  const heading   = document.getElementById('pal-modal-title');
  const createBtn = document.getElementById('pal-modal-create');

  if (editName && customPalettes[editName]) {
    _editName = editName;
    heading.textContent = `Palette „${editName}“ bearbeiten`;
    nameInp.value = editName;
    srcRow.hidden = true;
    createBtn.textContent = 'Speichern';
    buildPaletteColorRows(customPalettes[editName]);
  } else {
    _editName = null;
    heading.textContent = 'Neue Palette';
    nameInp.value = uniquePaletteName('meine_palette');
    srcRow.hidden = false;
    createBtn.textContent = 'Erstellen';
    refreshPaletteSourceSelect();
    buildPaletteColorRows(getPaletteByName(getPaletteName()));
  }

  overlay.classList.add('open');
  nameInp.focus();
  nameInp.select();
}

// Dropdown "Basis-Palette" mit allen verfügbaren Paletten füllen.
function refreshPaletteSourceSelect() {
  const src = document.getElementById('pal-source');
  src.innerHTML = '<option value="">— aktuelle Palette —</option>';
  getAllPaletteOptions().forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.name;
    opt.textContent = o.isCustom ? `${o.name} (eigene)` : o.name;
    src.appendChild(opt);
  });
}

// Eine Color-Picker-Zeile pro Palette-Index.
function buildPaletteColorRows(sourcePalette) {
  const container = document.getElementById('pal-color-rows');
  container.innerHTML = '';

  for (let i = 1; i <= MAX_IDX; i++) {
    const def = sourcePalette?.[i] || NEW_PALETTE_DEFAULTS[i] || '#888888';
    const row = document.createElement('div');
    row.className = 'pal-color-row';
    row.innerHTML =
      `<span class="pal-idx">${i}</span>` +
      `<input type="color" data-idx="${i}" value="${def}" aria-label="Farbe ${i}">` +
      `<span class="pal-name">${COLOR_LABELS[i] || '—'}</span>` +
      `<span class="pal-hex">${def}</span>`;
    const input = row.querySelector('input');
    const hex = row.querySelector('.pal-hex');
    input.addEventListener('input', () => { hex.textContent = input.value; });
    container.appendChild(row);
  }
}

export function initPaletteModal() {
  const overlay = document.getElementById('pal-modal-overlay');
  const close = () => { overlay.classList.remove('open'); _editName = null; };

  document.getElementById('pal-source').addEventListener('change', e => {
    buildPaletteColorRows(e.target.value ? getPaletteByName(e.target.value) : null);
  });

  document.getElementById('pal-modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  document.getElementById('pal-modal-create').addEventListener('click', () => {
    const raw = document.getElementById('pal-name').value.trim();
    if (!raw) { showInfoToast('Bitte einen Namen eingeben.'); return; }
    const name = raw.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

    if (BUILTIN_PALETTES[name]) {
      showInfoToast(`„${name}“ ist eine eingebaute Palette — bitte einen anderen Namen wählen.`);
      return;
    }

    const pal = {};
    document.querySelectorAll('#pal-color-rows input[type="color"]').forEach(inp => {
      pal[Number(inp.dataset.idx)] = inp.value;
    });

    const commit = (finalName, oldName) => {
      if (oldName && oldName !== finalName) {
        delete customPalettes[oldName];
        // Sprites mitziehen, die auf den alten Namen zeigten.
        for (const sp of Object.values(sprites)) {
          if (sp.palette === oldName) sp.palette = finalName;
        }
      }
      customPalettes[finalName] = pal;
      const sp = getSprite();
      if (sp && !oldName) sp.palette = finalName; // neue Palette direkt anwenden
      close();
      renderAll();
      saveState();
    };

    // Kollision mit einer anderen bestehenden eigenen Palette?
    if (customPalettes[name] && name !== _editName) {
      showConfirmToast(`Palette „${name}“ existiert schon — überschreiben?`,
        () => commit(name, _editName), 'Überschreiben');
      return;
    }
    commit(name, _editName);
  });
}

// ────────────────────────────────────────────────────────────────────
// Palette aus einem Import übernehmen (TS-Import)
// ────────────────────────────────────────────────────────────────────
// `entries` ist ein { index: '#hex' }-Objekt. Legt eine eigene Palette an
// und gibt deren Namen zurück. Indizes > MAX_IDX werden verworfen — die
// gehören zu freien Farben und werden vom Importer direkt ins Grid geschrieben.
export function createPaletteFromImport(entries, baseName) {
  const pal = {};
  for (const [k, v] of Object.entries(entries)) {
    const i = Number(k);
    if (Number.isInteger(i) && i >= 1 && i <= MAX_IDX) pal[i] = v;
  }
  if (!Object.keys(pal).length) return null;

  const name = uniquePaletteName((baseName || 'import').toLowerCase().replace(/[^a-z0-9_-]/g, '_'));
  // Lücken auffüllen — sonst wären Pixel mit einem nicht gelieferten Index unsichtbar.
  customPalettes[name] = completePalette(pal);
  return name;
}

export { isCustomPalette };
