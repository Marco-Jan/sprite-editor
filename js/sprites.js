// ════════════════════════════════════════════════════════════════════
// SPRITES — anlegen, umbenennen, duplizieren, löschen
// ════════════════════════════════════════════════════════════════════
import {
  state, sprites, createSprite, selectFirstSprite, emptyGrid,
  getSprite, makeSpriteId, listSprites, clearSelection,
} from './state.js';
import { DEFAULT_PALETTE, dc } from './data.js';
import { renderAll, fillPaletteSelect } from './render.js';
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
    grid: dc(src.grid),
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
  const nameInp = document.getElementById('new-name');
  const sizeSel = document.getElementById('new-size');
  const palSel  = document.getElementById('new-palette');
  const tplSel  = document.getElementById('new-template');
  const cancel  = document.getElementById('new-modal-cancel');
  const create  = document.getElementById('new-modal-create');

  const open = () => {
    nameInp.value = suggestName();
    sizeSel.value = '24';
    fillPaletteSelect(palSel, getSprite()?.palette || DEFAULT_PALETTE);
    fillSpriteTemplateSelect(tplSel);
    overlay.classList.add('open');
    nameInp.focus();
    nameInp.select();
  };

  document.getElementById('new-sprite-btn').addEventListener('click', open);

  const close = () => overlay.classList.remove('open');
  cancel.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') create.click(); });

  create.addEventListener('click', () => {
    const name = nameInp.value.trim();
    if (!name) { showInfoToast(t('sprite.needName')); nameInp.focus(); return; }

    const size = Number(sizeSel.value) || 24;
    const palette = palSel.value || DEFAULT_PALETTE;
    const srcId = tplSel.value;

    // Vorlage wird zentriert eingesetzt (geclippt wenn größer, gepadded wenn kleiner).
    let grid = emptyGrid(size);
    if (srcId && sprites[srcId]) {
      const tpl = sprites[srcId].grid;
      const tplH = tpl.length, tplW = tpl[0].length;
      const ox = Math.floor((size - tplW) / 2);
      const oy = Math.floor((size - tplH) / 2);
      for (let y = 0; y < tplH; y++) for (let x = 0; x < tplW; x++) {
        const ty = y + oy, tx = x + ox;
        if (ty >= 0 && ty < size && tx >= 0 && tx < size) grid[ty][tx] = tpl[y][x];
      }
    }

    const id = createSprite({ name, size, palette, grid });
    state.curSprite = id;
    close();
    renderAll();
    saveState();
  });
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
  const inp = document.getElementById('rename-input');
  inp.value = sp.name;
  overlay.classList.add('open');
  inp.focus();
  inp.select();
}

export function initRenameModal() {
  const overlay = document.getElementById('rename-modal-overlay');
  const inp = document.getElementById('rename-input');
  const ok = document.getElementById('rename-modal-ok');
  const close = () => { overlay.classList.remove('open'); _renameId = null; };

  document.getElementById('rename-modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
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
  document.getElementById('size-w').value = w;
  document.getElementById('size-h').value = h;
  document.getElementById('size-anchor').value = 'center';
  document.getElementById('size-modal-current').textContent =
    t('mod.sizeCurrent', { name: sp.name, w, h });
  document.getElementById('size-modal-overlay').classList.add('open');
  const inp = document.getElementById('size-w');
  inp.focus();
  inp.select();
}

export function initSizeModal() {
  const overlay = document.getElementById('size-modal-overlay');
  const wInp = document.getElementById('size-w');
  const hInp = document.getElementById('size-h');
  const ok = document.getElementById('size-modal-ok');
  const close = () => { overlay.classList.remove('open'); _sizeId = null; };

  document.getElementById('size-modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
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
    const anchor = document.getElementById('size-anchor').value;
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
