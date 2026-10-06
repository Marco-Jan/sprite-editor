// ════════════════════════════════════════════════════════════════════
// PALETTES — eigene Paletten erstellen, bearbeiten, löschen, zuweisen
// ════════════════════════════════════════════════════════════════════
// Das Paletten-Panel ist eine Bibliothek: eine Palette AUSWÄHLEN zeigt sie
// nur an (state.palPreview). Dem Sprite zugewiesen wird sie erst per Knopf,
// und zwar auf eine von zwei Arten:
//   assignPalette(name, { keepLook: true })  — Zeichnung bleibt, wie sie ist
//   assignPalette(name, { keepLook: false }) — Sprite umfärben
// Beides ist ein normaler Undo-Schritt (history.js merkt sich die Palette).
import {
  state, sprites, customPalettes, paletteMaterials,
  getSprite, getPal, getPaletteName, getPaletteByName, getAllPaletteOptions,
  getPreviewName, paletteExists, isCustomPalette, uniquePaletteName,
} from './state.js';
import {
  BUILTIN_PALETTES, MAX_COLORS, DEFAULT_PALETTE, NEW_PALETTE_DEFAULTS,
  completePalette, paletteSize, cellToColor,
} from './data.js';
import { t, tn, colorLabel } from './i18n.js';
import { renderAll } from './render.js';
import { saveState } from './storage.js';
import { recordOp } from './history.js';
import { showConfirmToast, showInfoToast } from './toast.js';

// Name der Palette, die gerade bearbeitet wird — null = neue anlegen.
let _editName = null;

// ────────────────────────────────────────────────────────────────────
// Anschauen und Zuweisen
// ────────────────────────────────────────────────────────────────────
export function previewPalette(name) {
  state.palPreview = name && name !== getPaletteName() ? name : null;
  renderAll();
}

// Palette `name` wird die Palette des aktuellen Sprites.
// keepLook: jedes Pixel behält seine Farbe. Indizes, deren Farbe in der neuen
// Palette woanders steht, wandern dorthin; Farben, die es dort gar nicht
// gibt, bleiben als freie Farbe stehen. Umgekehrt werden freie Farben, die
// die neue Palette hat, wieder zu deren Index.
// Ohne keepLook: Indizes bleiben, die Farben kommen aus der neuen Palette.
export function assignPalette(name, { keepLook }) {
  const sp = getSprite();
  if (!sp || !paletteExists(name)) return;
  const oldPal = getPal();
  const newPal = getPaletteByName(name);
  const size = paletteSize(newPal);

  let kept = 0;
  recordOp(() => {
    if (keepLook) {
      const where = new Map();   // Farbe → erster Index in der neuen Palette
      for (let i = 1; i <= size; i++) {
        const k = newPal[i]?.toLowerCase();
        if (k && !where.has(k)) where.set(k, i);
      }
      for (const row of sp.grid) {
        for (let x = 0; x < row.length; x++) {
          const c = row[x];
          if (c === 0) continue;
          const hex = cellToColor(c, oldPal)?.toLowerCase();
          if (!hex) continue;
          if (typeof c === 'number' && newPal[c]?.toLowerCase() === hex) continue;
          const idx = where.get(hex);
          row[x] = idx || hex;
          if (!idx) kept++;
        }
      }
    }
    sp.palette = name;
  });

  // Eine Index-Farbe, die es in der neuen Palette nicht gibt, gilt nicht mehr.
  if (typeof state.curColor === 'number' && state.curColor > size) state.curColor = 1;
  state.palPreview = null;
  renderAll();
  saveState();
  showInfoToast(keepLook
    ? (kept ? tn('pal.assignedFree', kept, { name }) : t('pal.assigned', { name }))
    : t('pal.recolored', { name }));
}

// ────────────────────────────────────────────────────────────────────
// Kopie anlegen (eingebaute Paletten sind schreibgeschützt)
// ────────────────────────────────────────────────────────────────────
// Kopiert die angezeigte Palette. War es die des Sprites, nutzt der Sprite
// danach die Kopie — die Farben sind identisch, das Bild ändert sich nicht.
export function forkPreviewPalette() {
  const src = getPreviewName();
  const name = uniquePaletteName(src + '_kopie');
  customPalettes[name] = { ...getPaletteByName(src) };
  if (paletteMaterials[src]) paletteMaterials[name] = { ...paletteMaterials[src] };
  const sp = getSprite();
  if (sp && sp.palette === src) { sp.palette = name; state.palPreview = null; }
  else state.palPreview = name;
  renderAll();
  saveState();
  showInfoToast(t('pal.forked', { name }));
}

// ────────────────────────────────────────────────────────────────────
// Bildfarben (freie Farben) in die Palette aufnehmen
// ────────────────────────────────────────────────────────────────────
// Hängt die freien Farben des Sprites hinten an seine Palette an und macht
// aus den Pixeln Indizes. Eine eingebaute Palette wird dafür erst kopiert.
// Passt das nicht in 255 Plätze, passiert nichts — dafür gibt es "Bild →
// Palette" mit Reduzieren.
export function addFreeColorsToPalette() {
  const sp = getSprite();
  if (!sp) return;
  const free = new Set();
  for (const row of sp.grid) for (const c of row) {
    if (typeof c === 'string' && c[0] === '#') free.add(c.toLowerCase());
  }
  if (!free.size) return;

  let name = sp.palette;
  const base = getPal();
  const size = paletteSize(base);
  const have = new Map();
  for (let i = 1; i <= size; i++) if (base[i]) have.set(base[i].toLowerCase(), i);
  const fresh = [...free].filter(h => !have.has(h));
  if (size + fresh.length > MAX_COLORS) {
    showInfoToast(t('fc.tooMany', { n: free.size, max: MAX_COLORS - size }));
    return;
  }

  if (!isCustomPalette(name)) {
    const copy = uniquePaletteName(name + '_kopie');
    customPalettes[copy] = { ...base };
    if (paletteMaterials[name]) paletteMaterials[copy] = { ...paletteMaterials[name] };
    name = copy;
  }
  const pal = customPalettes[name];
  fresh.forEach((hex, k) => { pal[size + 1 + k] = hex; have.set(hex, size + 1 + k); });

  recordOp(() => {
    for (const row of sp.grid) for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (typeof c === 'string' && c[0] === '#') row[x] = have.get(c.toLowerCase());
    }
    sp.palette = name;
  });
  if (typeof state.curColor === 'string' && have.has(state.curColor.toLowerCase())) {
    state.curColor = have.get(state.curColor.toLowerCase());
  }
  state.palPreview = null;
  renderAll();
  saveState();
  showInfoToast(tn('fc.added', fresh.length, { name }));
}

// ────────────────────────────────────────────────────────────────────
// Löschen
// ────────────────────────────────────────────────────────────────────
export function deleteCustomPalette(name) {
  if (!customPalettes[name]) return;
  delete customPalettes[name];
  delete paletteMaterials[name];
  if (state.palPreview === name) state.palPreview = null;

  // Sprites, die auf die gelöschte Palette zeigten, auf den Default setzen.
  let affected = 0;
  for (const sp of Object.values(sprites)) {
    if (sp.palette === name) { sp.palette = DEFAULT_PALETTE; affected++; }
  }
  renderAll();
  saveState();
  if (affected) {
    showInfoToast(tn('pal.deleted', affected, { fallback: DEFAULT_PALETTE }));
  }
}

// ────────────────────────────────────────────────────────────────────
// Modal — neue Palette / Palette bearbeiten
// ────────────────────────────────────────────────────────────────────
export function openPaletteModal(editName) {
  const overlay   = document.getElementById('pal-modal-overlay');
  const nameInp   = document.getElementById('pal-name');
  const srcRow    = document.getElementById('pal-source-row');
  const heading   = document.getElementById('pal-modal-title');
  const createBtn = document.getElementById('pal-modal-create');

  if (editName && customPalettes[editName]) {
    _editName = editName;
    heading.textContent = t('pal.modalEdit', { name: editName });
    nameInp.value = editName;
    srcRow.hidden = true;
    createBtn.textContent = t('pal.modalSave');
    buildPaletteColorRows(customPalettes[editName]);
  } else {
    _editName = null;
    heading.textContent = t('pal.modalNew');
    nameInp.value = uniquePaletteName('meine_palette');
    srcRow.hidden = false;
    createBtn.textContent = t('pal.modalCreate');
    refreshPaletteSourceSelect();
    buildPaletteColorRows(getPaletteByName(getPreviewName()));
  }

  overlay.classList.add('open');
  nameInp.focus();
  nameInp.select();
}

// Dropdown "Basis-Palette" mit allen verfügbaren Paletten füllen.
function refreshPaletteSourceSelect() {
  const src = document.getElementById('pal-source');
  src.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = t('pal.optCurrent');
  src.appendChild(none);
  getAllPaletteOptions().forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.name;
    opt.textContent = o.isCustom ? t('pal.optCustomSuffix', { name: o.name }) : o.name;
    src.appendChild(opt);
  });
}

function colorRow(i, hexValue) {
  const row = document.createElement('div');
  row.className = 'pal-color-row';
  row.innerHTML =
    `<span class="pal-idx">${i}</span>` +
    `<input type="color" data-idx="${i}" value="${hexValue}" aria-label="${t('pal.colorAria', { i })}">` +
    `<span class="pal-name">${colorLabel(i) || '—'}</span>` +
    `<span class="pal-hex">${hexValue}</span>`;
  const input = row.querySelector('input');
  const hex = row.querySelector('.pal-hex');
  input.addEventListener('input', () => { hex.textContent = input.value; });
  return row;
}

// Eine Color-Picker-Zeile pro Farbe; so viele, wie die Vorlage hat.
function buildPaletteColorRows(sourcePalette) {
  const container = document.getElementById('pal-color-rows');
  container.innerHTML = '';
  const n = Math.max(1, paletteSize(sourcePalette || NEW_PALETTE_DEFAULTS));
  for (let i = 1; i <= n; i++) {
    container.appendChild(colorRow(i, sourcePalette?.[i] || NEW_PALETTE_DEFAULTS[i] || '#888888'));
  }
  syncSizeButtons();
}

function rowCount() {
  return document.querySelectorAll('#pal-color-rows .pal-color-row').length;
}

function syncSizeButtons() {
  const n = rowCount();
  document.getElementById('pal-add-color').disabled = n >= MAX_COLORS;
  document.getElementById('pal-remove-color').disabled = n <= 1;
  document.getElementById('pal-size').textContent = tn('pal.sizeCount', n);
}

export function initPaletteModal() {
  const overlay = document.getElementById('pal-modal-overlay');
  const close = () => { overlay.classList.remove('open'); _editName = null; };

  document.getElementById('pal-source').addEventListener('change', e => {
    buildPaletteColorRows(e.target.value ? getPaletteByName(e.target.value) : getPaletteByName(getPreviewName()));
  });

  // Farben hinzufügen/entfernen — neue Farbe übernimmt die letzte.
  document.getElementById('pal-add-color').addEventListener('click', () => {
    const container = document.getElementById('pal-color-rows');
    const n = rowCount();
    if (n >= MAX_COLORS) return;
    const last = container.querySelector('.pal-color-row:last-child input')?.value || '#888888';
    const row = colorRow(n + 1, last);
    container.appendChild(row);
    row.scrollIntoView({ block: 'nearest' });
    syncSizeButtons();
  });
  document.getElementById('pal-remove-color').addEventListener('click', () => {
    if (rowCount() <= 1) return;
    document.querySelector('#pal-color-rows .pal-color-row:last-child')?.remove();
    syncSizeButtons();
  });

  document.getElementById('pal-modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  document.getElementById('pal-modal-create').addEventListener('click', () => {
    const raw = document.getElementById('pal-name').value.trim();
    if (!raw) { showInfoToast(t('pal.needName')); return; }
    const name = raw.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

    if (BUILTIN_PALETTES[name]) {
      showInfoToast(t('pal.isBuiltin', { name }));
      return;
    }

    const pal = {};
    document.querySelectorAll('#pal-color-rows input[type="color"]').forEach(inp => {
      pal[Number(inp.dataset.idx)] = inp.value;
    });

    const commit = (finalName, oldName) => {
      if (oldName && oldName !== finalName) {
        delete customPalettes[oldName];
        if (paletteMaterials[oldName]) {
          paletteMaterials[finalName] = paletteMaterials[oldName];
          delete paletteMaterials[oldName];
        }
        // Sprites mitziehen, die auf den alten Namen zeigten.
        for (const sp of Object.values(sprites)) {
          if (sp.palette === oldName) sp.palette = finalName;
        }
        if (state.palPreview === oldName) state.palPreview = finalName;
      }
      customPalettes[finalName] = pal;
      // Neue Palette: nur anzeigen, nicht zuweisen — die Zeichnung bleibt.
      if (!oldName) state.palPreview = finalName === getPaletteName() ? null : finalName;
      close();
      renderAll();
      saveState();
    };

    // Kollision mit einer anderen bestehenden eigenen Palette?
    if (customPalettes[name] && name !== _editName) {
      showConfirmToast(t('pal.exists', { name }),
        () => commit(name, _editName), t('pal.overwrite'));
      return;
    }
    commit(name, _editName);
  });
}

// ────────────────────────────────────────────────────────────────────
// Palette aus einem Import übernehmen (TS-Import)
// ────────────────────────────────────────────────────────────────────
// `entries` ist ein { index: '#hex' }-Objekt. Legt eine eigene Palette an
// und gibt deren Namen zurück. Indizes > MAX_COLORS werden verworfen — die
// gehören zu freien Farben und werden vom Importer direkt ins Grid geschrieben.
export function createPaletteFromImport(entries, baseName) {
  const pal = {};
  for (const [k, v] of Object.entries(entries)) {
    const i = Number(k);
    if (Number.isInteger(i) && i >= 1 && i <= MAX_COLORS) pal[i] = v;
  }
  if (!Object.keys(pal).length) return null;

  const name = uniquePaletteName((baseName || 'import').toLowerCase().replace(/[^a-z0-9_-]/g, '_'));
  // Lücken auffüllen — sonst wären Pixel mit einem nicht gelieferten Index unsichtbar.
  customPalettes[name] = completePalette(pal);
  return name;
}

export { isCustomPalette };
