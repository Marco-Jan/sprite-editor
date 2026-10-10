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
  state, sprites, customPalettes, paletteMaterials, paletteColorNames, allGrids,
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
import { recordOp, recordCustom } from './history.js';
import { commitFloat } from './selection.js';
import {
  permFromOrder, invertPerm, isIdentity, permutePalette, permuteMaterials, remapGrid, shadeOrder,
} from './palorder.js';
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
      for (const row of allGrids(sp).flat()) {
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
  const name = forkSilently();
  renderAll();
  saveState();
  showInfoToast(t('pal.forked', { name }));
}

function forkSilently() {
  const src = getPreviewName();
  const name = uniquePaletteName(src + '_kopie');
  customPalettes[name] = { ...getPaletteByName(src) };
  if (paletteMaterials[src]) paletteMaterials[name] = { ...paletteMaterials[src] };
  if (paletteColorNames[src]) paletteColorNames[name] = { ...paletteColorNames[src] };
  const sp = getSprite();
  if (sp && sp.palette === src) { sp.palette = name; state.palPreview = null; }
  else state.palPreview = name;
  return name;
}

// Die angezeigte Palette, änderbar: eine eingebaute wird dafür still kopiert
// (mit Hinweis), damit „+“, Duplizieren und Einfügen dort auch gehen.
function editablePreviewPalette() {
  const src = getPreviewName();
  if (isCustomPalette(src)) return src;
  const name = forkSilently();
  showInfoToast(t('pal.forkedAuto', { name }));
  return name;
}

// ────────────────────────────────────────────────────────────────────
// Einzelne Farben direkt im Raster (Panel): anhängen, überschreiben
// ────────────────────────────────────────────────────────────────────
// Neue Farben kommen immer ans Ende — so verschiebt sich kein Index und
// keine Zeichnung ändert ihr Aussehen.
// Rückgabe: { name, idx } der neuen Farbe, oder null, wenn die Palette voll ist.
export function appendPaletteColor(hex) {
  if (paletteSize(getPaletteByName(getPreviewName())) >= MAX_COLORS) {
    showInfoToast(t('pal.full', { max: MAX_COLORS }));
    return null;
  }
  const name = editablePreviewPalette();
  const pal = customPalettes[name];
  const idx = paletteSize(pal) + 1;
  pal[idx] = hex;
  renderAll();
  saveState();
  return { name, idx };
}

// Farbe `idx` aus der angezeigten Palette entfernen. Die Nummern dahinter
// rücken auf, und alle Sprites mit dieser Palette werden mit umgeschrieben —
// das Bild sieht danach gleich aus: Pixel der entfernten Farbe zeigen auf
// dieselbe Farbe an anderer Stelle (nach „Duplizieren“) oder werden zur
// freien Farbe. Ein Undo-Schritt (history.js recordCustom).
export function removePaletteColor(idx) {
  const size = paletteSize(getPaletteByName(getPreviewName()));
  if (size <= 1 || idx < 1 || idx > size) return;
  commitFloat();
  const name = editablePreviewPalette();
  const pal = customPalettes[name];
  const hex = pal[idx];
  let twin = 0;
  for (let i = 1; i <= size; i++) {
    if (i !== idx && pal[i]?.toLowerCase() === hex.toLowerCase()) { twin = i; break; }
  }
  const newTwin = twin > idx ? twin - 1 : twin;
  const mat = paletteMaterials[name]?.[idx];
  const label = paletteColorNames[name]?.[idx];
  const targets = Object.keys(sprites).filter(k => sprites[k].palette === name);
  /** @type {[string, number, number, number][]} */
  let cells = [];

  // Nummer → Wert-Maps (Materialien, Namen): ab `from` um `d` verschieben.
  const shiftMap = (m, from, d) => {
    if (!m) return m;
    const out = {};
    for (const [k, v] of Object.entries(m)) {
      const i = Number(k);
      if (d < 0 && i === from) continue;
      out[i >= from ? i + d : i] = v;
    }
    return out;
  };
  const setMap = (store, m) => { if (m && Object.keys(m).length) store[name] = m; else delete store[name]; };

  const forward = () => {
    const p = customPalettes[name];
    if (!p) return false;
    const n = paletteSize(p);
    for (let i = idx; i < n; i++) p[i] = p[i + 1];
    delete p[n];
    setMap(paletteMaterials, shiftMap(paletteMaterials[name], idx, -1));
    setMap(paletteColorNames, shiftMap(paletteColorNames[name], idx, -1));
    cells = [];
    for (const k of targets) {
      if (!sprites[k]) continue;
      allGrids(sprites[k]).forEach((g, gi) => {
        for (let y = 0; y < g.length; y++) {
          const row = g[y];
          for (let x = 0; x < row.length; x++) {
            const v = row[x];
            if (typeof v !== 'number') continue;
            if (v === idx) { row[x] = newTwin || hex; cells.push([k, gi, y, x]); }
            else if (v > idx) row[x] = v - 1;
          }
        }
      });
    }
    const c = state.curColor;
    if (typeof c === 'number') state.curColor = c === idx ? (newTwin || hex) : c > idx ? c - 1 : c;
    return true;
  };
  const backward = () => {
    const p = customPalettes[name];
    if (!p) return false;
    for (let i = paletteSize(p); i >= idx; i--) p[i + 1] = p[i];
    p[idx] = hex;
    const mats = shiftMap(paletteMaterials[name] || {}, idx, 1);
    if (mat) mats[idx] = mat;
    setMap(paletteMaterials, mats);
    const names = shiftMap(paletteColorNames[name] || {}, idx, 1);
    if (label) names[idx] = label;
    setMap(paletteColorNames, names);
    for (const k of targets) {
      if (!sprites[k]) continue;
      for (const g of allGrids(sprites[k])) for (const row of g) {
        for (let x = 0; x < row.length; x++) {
          const v = row[x];
          if (typeof v === 'number' && v >= idx) row[x] = v + 1;
        }
      }
    }
    for (const [k, gi, y, x] of cells) {
      const g = sprites[k] && allGrids(sprites[k])[gi];
      if (g?.[y]) g[y][x] = idx;
    }
    if (typeof state.curColor === 'number' && state.curColor >= idx) state.curColor++;
    return true;
  };

  forward();
  const free = twin ? 0 : cells.length;
  recordCustom({ undo: backward, redo: forward });
  renderAll();
  saveState();
  showInfoToast(free ? tn('pal.removedFree', free, { i: idx }) : t('pal.removed', { i: idx }));
}

export function setPaletteColor(idx, hex) {
  const name = editablePreviewPalette();
  customPalettes[name][idx] = hex;
  renderAll();
  saveState();
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
  for (const row of allGrids(sp).flat()) for (const c of row) {
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
    if (paletteColorNames[name]) paletteColorNames[copy] = { ...paletteColorNames[name] };
    name = copy;
  }
  const pal = customPalettes[name];
  fresh.forEach((hex, k) => { pal[size + 1 + k] = hex; have.set(hex, size + 1 + k); });

  recordOp(() => {
    for (const row of allGrids(sp).flat()) for (let x = 0; x < row.length; x++) {
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
  delete paletteColorNames[name];
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
  const nameInp   = /** @type {HTMLInputElement} */ (document.getElementById('pal-name'));
  const srcRow    = document.getElementById('pal-source-row');
  const heading   = document.getElementById('pal-modal-title');
  const createBtn = document.getElementById('pal-modal-create');

  if (editName && customPalettes[editName]) {
    _editName = editName;
    heading.textContent = t('pal.modalEdit', { name: editName });
    nameInp.value = editName;
    srcRow.hidden = true;
    createBtn.textContent = t('pal.modalSave');
    buildPaletteColorRows(customPalettes[editName], paletteColorNames[editName]);
  } else {
    _editName = null;
    heading.textContent = t('pal.modalNew');
    nameInp.value = uniquePaletteName('meine_palette');
    srcRow.hidden = false;
    createBtn.textContent = t('pal.modalCreate');
    refreshPaletteSourceSelect();
    buildPaletteColorRows(getPaletteByName(getPreviewName()), paletteColorNames[getPreviewName()]);
  }

  overlay.classList.add('open');
  nameInp.focus();
  nameInp.select();
}

// Dropdown "Basis-Palette" mit allen verfügbaren Paletten füllen.
function refreshPaletteSourceSelect() {
  const src = /** @type {HTMLSelectElement} */ (document.getElementById('pal-source'));
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

// Eine Zeile: Nummer, Farbwähler, Name (frei, leer = „Farbe 3“), Hex.
function colorRow(i, hexValue, name = '') {
  const row = document.createElement('div');
  row.className = 'pal-color-row';
  row.innerHTML =
    `<span class="pal-idx">${i}</span>` +
    `<input type="color" data-idx="${i}" value="${hexValue}" aria-label="${t('pal.colorAria', { i })}">` +
    `<input type="text" class="pal-name" data-idx="${i}" maxlength="40" spellcheck="false"` +
    ` aria-label="${t('pal.nameAria', { i })}" title="${t('pal.nameTitle')}">` +
    `<span class="pal-hex">${hexValue}</span>`;
  const nameInp = /** @type {HTMLInputElement} */ (row.querySelector('.pal-name'));
  nameInp.placeholder = colorLabel(i);
  nameInp.value = name;
  const input = row.querySelector('input');
  const hex = row.querySelector('.pal-hex');
  input.addEventListener('input', () => { hex.textContent = /** @type {HTMLInputElement} */ (input).value; });
  return row;
}

// Eine Color-Picker-Zeile pro Farbe; so viele, wie die Vorlage hat.
function buildPaletteColorRows(sourcePalette, names) {
  const container = document.getElementById('pal-color-rows');
  container.innerHTML = '';
  const n = Math.max(1, paletteSize(sourcePalette || NEW_PALETTE_DEFAULTS));
  for (let i = 1; i <= n; i++) {
    container.appendChild(colorRow(i, sourcePalette?.[i] || NEW_PALETTE_DEFAULTS[i] || '#888888', names?.[i] || ''));
  }
  syncSizeButtons();
}

function rowCount() {
  return document.querySelectorAll('#pal-color-rows .pal-color-row').length;
}

function syncSizeButtons() {
  const n = rowCount();
  /** @type {HTMLInputElement} */ (document.getElementById('pal-add-color')).disabled = n >= MAX_COLORS;
  /** @type {HTMLInputElement} */ (document.getElementById('pal-remove-color')).disabled = n <= 1;
  document.getElementById('pal-size').textContent = tn('pal.sizeCount', n);
}

export function initPaletteModal() {
  const overlay = document.getElementById('pal-modal-overlay');
  const close = () => { overlay.classList.remove('open'); _editName = null; };

  /** @type {HTMLSelectElement} */ (document.getElementById('pal-source')).addEventListener('change', e => {
    const chosen = /** @type {HTMLSelectElement} */ (e.target).value;
    const src = chosen || getPreviewName();
    buildPaletteColorRows(getPaletteByName(src), paletteColorNames[src]);
  });

  // Farben hinzufügen/entfernen — neue Farbe übernimmt die letzte.
  document.getElementById('pal-add-color').addEventListener('click', () => {
    const container = document.getElementById('pal-color-rows');
    const n = rowCount();
    if (n >= MAX_COLORS) return;
    const last = /** @type {HTMLInputElement} */ (container.querySelector('.pal-color-row:last-child input'))?.value || '#888888';
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
  // Kein Schließen per Klick daneben — ein Fehlklick (oder Text markieren und
  // außerhalb loslassen) soll die Eingaben nicht verwerfen. Abbrechen oder Esc.

  document.getElementById('pal-modal-create').addEventListener('click', () => {
    const raw = /** @type {HTMLInputElement} */ (document.getElementById('pal-name')).value.trim();
    if (!raw) { showInfoToast(t('pal.needName')); return; }
    const name = raw.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

    if (BUILTIN_PALETTES[name]) {
      showInfoToast(t('pal.isBuiltin', { name }));
      return;
    }

    const pal = {};
    document.querySelectorAll('#pal-color-rows input[type="color"]').forEach(inp => {
      pal[Number(inp.dataset.idx)] = /** @type {HTMLInputElement} */ (inp).value;
    });
    const names = {};
    document.querySelectorAll('#pal-color-rows input.pal-name').forEach(inp => {
      const v = /** @type {HTMLInputElement} */ (inp).value.trim();
      if (v) names[Number(/** @type {HTMLInputElement} */ (inp).dataset.idx)] = v;
    });

    const commit = (finalName, oldName) => {
      if (oldName && oldName !== finalName) {
        delete customPalettes[oldName];
        if (paletteMaterials[oldName]) {
          paletteMaterials[finalName] = paletteMaterials[oldName];
          delete paletteMaterials[oldName];
        }
        delete paletteColorNames[oldName];
        // Sprites mitziehen, die auf den alten Namen zeigten.
        for (const sp of Object.values(sprites)) {
          if (sp.palette === oldName) sp.palette = finalName;
        }
        if (state.palPreview === oldName) state.palPreview = finalName;
      }
      customPalettes[finalName] = pal;
      if (Object.keys(names).length) paletteColorNames[finalName] = names;
      else delete paletteColorNames[finalName];
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

// ────────────────────────────────────────────────────────────────────
// Umsortieren — aus der Farbzeile (Ziehen, „Nach Farbstufen")
// ────────────────────────────────────────────────────────────────────
// Die Farben bekommen neue Nummern, und alle Pixel werden mit umgeschrieben:
// das Bild sieht danach genau gleich aus (js/palorder.js). Betroffen sind
// alle Sprites mit dieser Palette, samt Materialien. Eine eingebaute Palette
// bleibt, wie sie ist — der Sprite bekommt eine umsortierte Kopie.
// Ein Undo-Schritt für alles zusammen (history.js recordCustom).
export function reorderPalette(order) {
  const sp = getSprite();
  if (!sp) return false;
  const perm = permFromOrder(order);
  if (isIdentity(perm)) return false;
  commitFloat();
  const inv = invertPerm(perm);
  const id = state.curSprite;
  const oldName = sp.palette;
  let name = oldName, forked = false;
  if (!isCustomPalette(oldName)) {
    name = uniquePaletteName(oldName + '_kopie');
    customPalettes[name] = permutePalette({ ...getPal() }, perm);
    if (paletteMaterials[oldName]) paletteMaterials[name] = permuteMaterials(paletteMaterials[oldName], perm);
    if (paletteColorNames[oldName]) paletteColorNames[name] = permuteMaterials(paletteColorNames[oldName], perm);
    forked = true;
  }
  const targets = forked ? [id] : Object.keys(sprites).filter(k => sprites[k].palette === name);
  const remapAll = p => {
    for (const k of targets) if (sprites[k]) for (const g of allGrids(sprites[k])) remapGrid(g, p);
    if (typeof state.curColor === 'number' && state.curColor < p.length) state.curColor = p[state.curColor];
  };
  // In beide Richtungen dasselbe, nur mit perm bzw. inv. Wurde die Palette
  // inzwischen gelöscht oder umbenannt, geht es nicht mehr — dann überspringt
  // die History den Schritt, statt Pixel falsch umzuschreiben.
  const run = (p, paletteName) => {
    if (forked) {
      if (!sprites[id]) return false;
      sprites[id].palette = paletteName;
    } else {
      if (!customPalettes[name]) return false;
      customPalettes[name] = permutePalette(customPalettes[name], p);
      if (paletteMaterials[name]) paletteMaterials[name] = permuteMaterials(paletteMaterials[name], p);
      if (paletteColorNames[name]) paletteColorNames[name] = permuteMaterials(paletteColorNames[name], p);
    }
    remapAll(p);
    return true;
  };
  run(perm, name);
  recordCustom({ undo: () => run(inv, oldName), redo: () => run(perm, name) });
  state.palPreview = null;
  renderAll();
  saveState();
  if (forked) showInfoToast(t('qp.forked', { name }));
  return true;
}

// Gleiche Farbtöne nebeneinander, jeweils von dunkel nach hell.
export function sortPaletteByShades() {
  const sp = getSprite();
  if (!sp) return;
  const pal = getPal();
  if (reorderPalette(shadeOrder(pal, paletteSize(pal)))) showInfoToast(t('qp.sorted'));
  else showInfoToast(t('qp.alreadySorted'));
}
