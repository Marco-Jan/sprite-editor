// ════════════════════════════════════════════════════════════════════
// SPRITES — anlegen, umbenennen, duplizieren, löschen
// ════════════════════════════════════════════════════════════════════
import {
  state, sprites, createSprite, selectFirstSprite, flatGrid, copyLayer,
  getSprite, makeSpriteId, listSprites, clearSelection,
} from './state.js';
import { DEFAULT_PALETTE, dc } from './data.js';
import { renderAll } from './render.js';
import { createPalettePicker } from './palpicker.js';
import { saveState } from './storage.js';
import { showInfoToast, showConfirmToast } from './toast.js';
import { clearHistory } from './history.js';
import { commitFloat } from './selection.js';
import { resizeSpriteCanvas } from './transform.js';
import { t } from './i18n.js';

// ────────────────────────────────────────────────────────────────────
// Auswahl
// ────────────────────────────────────────────────────────────────────
export function selectSprite(id) {
  if (!sprites[id] || state.curSprite === id) return;
  // Schwebender Inhalt gehört in den Sprite, den wir gerade verlassen —
  // erst absetzen, dann wechseln. Sonst wäre er weg.
  commitFloat();
  clearSelection(); // Auswahl gehört zum Grid, das wir gerade verlassen
  state.curSprite = id;
  renderAll();
  saveState();
}

// ────────────────────────────────────────────────────────────────────
// Erzeugen — auch beim allerersten Start (leeres Projekt)
// ────────────────────────────────────────────────────────────────────
export function createDefaultSprite() {
  const id = createSprite({ name: t('list.defaultName'), size: 24, palette: DEFAULT_PALETTE });
  state.curSprite = id;
  return id;
}

export function duplicateSprite(id) {
  const src = sprites[id];
  if (!src) return;
  const newId = createSprite({
    name: src.name + t('list.copySuffix'),
    palette: src.palette,
    frames: src.frames.map(f => ({ cels: f.cels.map(dc), dur: f.dur })),
    fps: src.fps,
    layers: src.layers.map(copyLayer),
    layer: src.layer,
    guides: JSON.parse(JSON.stringify(src.guides)),
  });
  commitFloat();
  clearSelection();
  state.curSprite = newId;
  renderAll();
  saveState();
  showInfoToast(t('sprite.created', { name: sprites[newId].name }));
}

export function deleteSprite(id) {
  if (!sprites[id]) return;
  commitFloat(); // in einen anderen Sprite gehobener Inhalt darf nicht verfallen
  clearSelection();
  delete sprites[id];
  if (state.curSprite === id) {
    selectFirstSprite();
    if (!state.curSprite) createDefaultSprite();
  }
  clearHistory(); // Undo-Einträge zeigen evtl. auf den gelöschten Sprite
  renderAll();
  saveState();
}

// Grid des aktuellen Sprites leeren (Undo-fähig — der Aufrufer wrappt in recordOp).
export function clearCurrentGrid() {
  const sp = getSprite();
  if (!sp) return;
  const size = sp.grid.length;
  const w = sp.grid[0].length;
  sp.grid = Array.from({ length: size }, () => Array(w).fill(0));
}

// ────────────────────────────────────────────────────────────────────
// "Neuer Sprite"-Modal
// ────────────────────────────────────────────────────────────────────
export function initNewSpriteModal() {
  const overlay = document.getElementById('new-modal-overlay');
  const nameInp = /** @type {HTMLInputElement} */ (document.getElementById('new-name'));
  const sizeSel = /** @type {HTMLSelectElement} */ (document.getElementById('new-size'));
  // Paletten-Auswahl wie im Panel: Suche, Filter, klappbare Gruppen.
  let chosenPalette = DEFAULT_PALETTE;
  const palPicker = createPalettePicker(document.getElementById('new-palette'), {
    onSelect: n => { chosenPalette = n; },
    activeName: () => getSprite()?.palette || null,
  });
  const tplSel  = /** @type {HTMLSelectElement} */ (document.getElementById('new-template'));
  const customRow = document.getElementById('new-size-custom');
  const wInp    = /** @type {HTMLInputElement} */ (document.getElementById('new-w'));
  const hInp    = /** @type {HTMLInputElement} */ (document.getElementById('new-h'));
  const cancel  = document.getElementById('new-modal-cancel');
  const create  = document.getElementById('new-modal-create');

  const open = () => {
    nameInp.value = suggestName();
    sizeSel.value = '24';
    wInp.value = '24';
    hInp.value = '24';
    syncCustomRow();
    chosenPalette = getSprite()?.palette || DEFAULT_PALETTE;
    palPicker.render(chosenPalette);
    fillSpriteTemplateSelect(tplSel);
    overlay.classList.add('open');
    nameInp.focus();
    nameInp.select();
  };

  // Bei "eigene Größe" erscheinen zwei Zahlenfelder; sonst bleibt das Dropdown allein.
  const syncCustomRow = () => { customRow.hidden = sizeSel.value !== 'custom'; };
  sizeSel.addEventListener('change', syncCustomRow);

  document.getElementById('new-sprite-btn').addEventListener('click', open);

  const close = () => overlay.classList.remove('open');
  cancel.addEventListener('click', close);
  // Kein Schließen per Klick daneben — ein Fehlklick (oder Text markieren und
  // außerhalb loslassen) soll die Eingaben nicht verwerfen. Abbrechen oder Esc.
  nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') create.click(); });

  create.addEventListener('click', () => {
    const name = nameInp.value.trim();
    if (!name) { showInfoToast(t('sprite.needName')); nameInp.focus(); return; }

    // Eigene Maße dürfen rechteckig sein; das Dropdown liefert nur Quadrate.
    let w, h;
    if (sizeSel.value === 'custom') {
      w = clampSize(wInp.value);
      h = clampSize(hInp.value);
      if (!w || !h) { showInfoToast(t('sprite.needSize')); wInp.focus(); return; }
    } else {
      w = h = Number(sizeSel.value) || 24;
    }
    const palette = chosenPalette || DEFAULT_PALETTE;
    const srcId = tplSel.value;

    // Vorlage wird zentriert eingesetzt (geclippt wenn größer, gepadded wenn kleiner).
    let grid = Array.from({ length: h }, () => Array(w).fill(0));
    if (srcId && sprites[srcId]) {
      const tpl = flatGrid(sprites[srcId]);
      const tplH = tpl.length, tplW = tpl[0].length;
      const ox = Math.floor((w - tplW) / 2);
      const oy = Math.floor((h - tplH) / 2);
      for (let y = 0; y < tplH; y++) for (let x = 0; x < tplW; x++) {
        const ty = y + oy, tx = x + ox;
        if (ty >= 0 && ty < h && tx >= 0 && tx < w) grid[ty][tx] = tpl[y][x];
      }
    }

    const id = createSprite({ name, palette, grid });
    state.curSprite = id;
    close();
    renderAll();
    saveState();
  });
}

// Zahl aus einem Eingabefeld auf 1…256 begrenzen; 0 bedeutet "unbrauchbar".
function clampSize(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.min(n, 256);
}

// Namensvorschlag: "Sprite N" mit der nächsten freien Nummer.
function suggestName() {
  const taken = new Set(Object.values(sprites).map(s => s.name));
  const prefix = t('list.namePrefix');
  let i = Object.keys(sprites).length + 1;
  while (taken.has(prefix + i)) i++;
  return prefix + i;
}

// Vorlagen-Dropdown mit den vorhandenen Sprites füllen.
function fillSpriteTemplateSelect(sel) {
  sel.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = t('sprite.emptyGrid');
  sel.appendChild(none);
  listSprites().forEach(sp => {
    const opt = document.createElement('option');
    opt.value = sp.id;
    opt.textContent = t('sprite.option', { name: sp.name, w: sp.grid[0].length, h: sp.grid.length });
    sel.appendChild(opt);
  });
}

// ────────────────────────────────────────────────────────────────────
// Umbenennen-Modal
// ────────────────────────────────────────────────────────────────────
let _renameId = null;

export function openRenameModal(id) {
  const sp = sprites[id];
  if (!sp) return;
  _renameId = id;
  const overlay = document.getElementById('rename-modal-overlay');
  const inp = /** @type {HTMLInputElement} */ (document.getElementById('rename-input'));
  inp.value = sp.name;
  overlay.classList.add('open');
  inp.focus();
  inp.select();
}

export function initRenameModal() {
  const overlay = document.getElementById('rename-modal-overlay');
  const inp = /** @type {HTMLInputElement} */ (document.getElementById('rename-input'));
  const ok = document.getElementById('rename-modal-ok');
  const close = () => { overlay.classList.remove('open'); _renameId = null; };

  document.getElementById('rename-modal-cancel').addEventListener('click', close);
  // Kein Schließen per Klick daneben — ein Fehlklick (oder Text markieren und
  // außerhalb loslassen) soll die Eingaben nicht verwerfen. Abbrechen oder Esc.
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok.click(); });

  ok.addEventListener('click', () => {
    const sp = sprites[_renameId];
    if (!sp) { close(); return; }
    const name = inp.value.trim();
    if (!name) { showInfoToast(t('sprite.needName')); return; }
    sp.name = name;
    close();
    renderAll();
    saveState();
  });
}

// ────────────────────────────────────────────────────────────────────
// Grid-Größe-Modal — die Leinwand eines bestehenden Sprites ändern
// ────────────────────────────────────────────────────────────────────
// Dieselbe Rechnung wie das Bild-Panel, nur direkt am Sprite aus der Liste:
// dort steht die Größe, dort will man sie auch ändern.
let _sizeId = null;

export function openSizeModal(id) {
  const sp = sprites[id];
  if (!sp) return;
  _sizeId = id;
  const w = sp.grid[0].length, h = sp.grid.length;
  /** @type {HTMLInputElement} */ (document.getElementById('size-w')).value = w;
  /** @type {HTMLInputElement} */ (document.getElementById('size-h')).value = h;
  /** @type {HTMLSelectElement} */ (document.getElementById('size-anchor')).value = 'center';
  document.getElementById('size-modal-current').textContent =
    t('mod.sizeCurrent', { name: sp.name, w, h });
  document.getElementById('size-modal-overlay').classList.add('open');
  const inp = /** @type {HTMLInputElement} */ (document.getElementById('size-w'));
  inp.focus();
  inp.select();
}

export function initSizeModal() {
  const overlay = document.getElementById('size-modal-overlay');
  const wInp = /** @type {HTMLInputElement} */ (document.getElementById('size-w'));
  const hInp = /** @type {HTMLInputElement} */ (document.getElementById('size-h'));
  const ok = document.getElementById('size-modal-ok');
  const close = () => { overlay.classList.remove('open'); _sizeId = null; };

  document.getElementById('size-modal-cancel').addEventListener('click', close);
  // Kein Schließen per Klick daneben — ein Fehlklick (oder Text markieren und
  // außerhalb loslassen) soll die Eingaben nicht verwerfen. Abbrechen oder Esc.
  [wInp, hInp].forEach(inp => inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') ok.click();
  }));

  ok.addEventListener('click', () => {
    const id = _sizeId;
    const sp = sprites[id];
    if (!sp) { close(); return; }
    const w = Number(wInp.value), h = Number(hInp.value);
    if (!(w >= 1 && w <= 256 && h >= 1 && h <= 256)) {
      showInfoToast(t('mod.sizeInvalid'));
      return;
    }
    const anchor = /** @type {HTMLSelectElement} */ (document.getElementById('size-anchor')).value;
    const apply = () => {
      const r = resizeSpriteCanvas(id, w, h, anchor);
      if (!r) return;
      showInfoToast(r.ok
        ? t('tf.resized', { w: r.w, h: r.h, lost: r.lost ? t('tf.resizeLost', { n: r.lost }) : '' })
        : t('tf.resizeFail', { reason: t(`reason.${r.reason}`) }));
    };
    close();
    // Verkleinern kann Pixel kosten — vorher fragen.
    if (w < sp.grid[0].length || h < sp.grid.length) {
      // Einen Tick später: der Rückfrage-Toast setzt den Fokus auf seinen
      // Bestätigen-Knopf, und ein Enter aus dem Feld würde ihn sonst gleich
      // mitdrücken — die Rückfrage wäre dann keine.
      setTimeout(() => showConfirmToast(t('tf.confirmShrink'), apply, t('tf.shrinkOk')), 0);
    } else apply();
  });
}

// ID-Vergabe nach außen geben (wird beim TS-Import gebraucht).
export { makeSpriteId };
