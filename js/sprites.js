// ════════════════════════════════════════════════════════════════════
// SPRITES — Custom-Sprite-Management: Header-Buttons + "Neuer Sprite"-Modal
// ════════════════════════════════════════════════════════════════════
import { state, grids, customMeta, getVariants } from './state.js';
import { ORIG } from './data.js';
import { renderAll, syncButtons, ensureGroupExpanded, fillPaletteSelect } from './render.js';
import { saveState } from './storage.js';
import { showInfoToast } from './toast.js';

// No-op — custom sprite navigation is handled via the overview group cards.
// Kept as exported API so call sites in app.js (init load) don't break.
export function addCustomTypeButton(_key, _name) {}

export function deleteCustomSprite(key) {
  delete grids[key];
  delete customMeta[key];

  // Falls aktiver Sprite gelöscht: zurück auf Default Hund/normal/golden
  if (state.curType === key) {
    state.curType = 'dog';
    state.curState = 'normal';
    state.curVariant = 'golden';
  }

  syncButtons(); renderAll(); saveState();
}

// ────────────────────────────────────────────────────────────────────
// "Neuer Sprite"-Modal: Name, Tierart (Palette), Grid-Größe, optionale Vorlage
// ────────────────────────────────────────────────────────────────────
export function initNewSpriteModal() {
  const overlay = document.getElementById('new-modal-overlay');
  const openBtn = document.getElementById('new-sprite-btn');
  const nameInp = document.getElementById('new-name');
  const sizeSel = document.getElementById('new-size');
  const tplSel  = document.getElementById('new-template');
  const cancel  = document.getElementById('new-modal-cancel');
  const create  = document.getElementById('new-modal-create');

  const varSel  = document.getElementById('new-variant');

  openBtn.addEventListener('click', () => {
    overlay.classList.add('open');
    // Reset Form-Felder bei jedem Öffnen — keine hängenden Werte vom letzten Mal
    nameInp.value = '';
    sizeSel.value = '24';
    tplSel.value  = '';
    // ALLE Paletten (alle Tierarten) zur Auswahl anbieten; Default: Hund/golden
    fillPaletteSelect(varSel, 'dog', 'golden');
    nameInp.focus();
  });

  cancel.addEventListener('click', () => overlay.classList.remove('open'));

  // Klick auf Overlay-Hintergrund schließt
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });

  create.addEventListener('click', () => {
    const rawName = nameInp.value.trim();
    // Gewählte Palette bestimmt die Tierart: value ist "type:variant"
    const [palType, chosenVariant] = (varSel.value || 'dog:golden').split(':');
    const size    = Number(sizeSel.value);
    const tplKey  = tplSel.value;

    if (!rawName) { showInfoToast('Bitte einen Namen eingeben.'); return; }

    const key = 'custom_' + rawName.replace(/[^a-zA-Z0-9_]/g, '_');

    // Immer ein frisches leeres Grid in der gewählten Größe.
    // Wenn eine Vorlage gewählt ist, wird sie zentriert reingelegt
    // (geclippt falls Vorlage größer als Ziel, gepadded falls kleiner).
    const baseGrid = Array.from({ length: size }, () => Array(size).fill(0));
    if (tplKey && ORIG[tplKey.split('_')[0]]?.[tplKey.split('_')[1]]) {
      const [t, s] = tplKey.split('_');
      const tpl = ORIG[t][s];
      const tplH = tpl.length, tplW = tpl[0].length;
      const ox = Math.floor((size - tplW) / 2);
      const oy = Math.floor((size - tplH) / 2);
      for (let y = 0; y < tplH; y++) for (let x = 0; x < tplW; x++) {
        const ty = y + oy, tx = x + ox;
        if (ty >= 0 && ty < size && tx >= 0 && tx < size) baseGrid[ty][tx] = tpl[y][x];
      }
    }

    grids[key] = baseGrid;
    customMeta[key] = { palType, name: rawName };

    state.curType = key;
    // Gewählte Palette übernehmen — Fallback: erste verfügbare Variante.
    const available = getVariants(key);
    state.curVariant = available.includes(chosenVariant) ? chosenVariant : available[0];
    state.curState = 'normal';

    ensureGroupExpanded(key);
    overlay.classList.remove('open');

    syncButtons(); renderAll(); saveState();
  });
}
