// ════════════════════════════════════════════════════════════════════
// PALETTES — Custom-Paletten erstellen/bearbeiten/löschen
// ════════════════════════════════════════════════════════════════════
import { state, customMeta, customPalettes, getCurrentPalType } from './state.js';
import { DOG_PALETTES, CAT_PALETTES, DOG_VARIANTS, CAT_VARIANTS, DOG_FIXED, CAT_FIXED, COLOR_LABELS } from './data.js';
import { renderAll } from './render.js';
import { saveState } from './storage.js';
import { showConfirmToast, showInfoToast } from './toast.js';

// Edit-Mode: { type: 'dog'|'cat', variant: 'name' } oder null = create
let _editMode = null;

// Modal öffnen — entweder im Create- oder Edit-Modus.
// Beim Edit: Name + Farben werden vorbefüllt, Tierart gelockt, Basis-Auswahl
// versteckt (im Edit ergibt eine "Basis"-Wahl wenig Sinn).
export function openPaletteModal(editType, editVariant) {
  const overlay = document.getElementById('pal-modal-overlay');
  const typeSel = document.getElementById('pal-type');
  const nameInp = document.getElementById('pal-name');
  const srcRow  = document.getElementById('pal-source').parentElement;
  const heading = overlay.querySelector('h2');
  const createBtn = document.getElementById('pal-modal-create');

  if (editType && editVariant) {
    _editMode = {
      type: editType.startsWith('custom_') ? (customMeta[editType]?.palType || 'dog') : editType,
      variant: editVariant,
    };
    heading.textContent = `🎨 Palette "${editVariant}" bearbeiten`;
    nameInp.value = editVariant;
    typeSel.value = _editMode.type;
    typeSel.disabled = true;
    srcRow.style.display = 'none';
    createBtn.textContent = 'Speichern';
    buildPaletteColorRows(customPalettes[_editMode.type][editVariant]);
  } else {
    _editMode = null;
    heading.textContent = '🎨 Neue Palette erstellen';
    nameInp.value = '';
    typeSel.value = getCurrentPalType();
    typeSel.disabled = false;
    srcRow.style.display = '';
    createBtn.textContent = 'Erstellen';
    refreshPaletteModalSource();
    buildPaletteColorRows(null);
  }

  overlay.style.display = 'flex';
  nameInp.focus();
}

// Dropdown "Basis-Palette" mit allen Built-in + Custom-Paletten des Typs füllen.
function refreshPaletteModalSource() {
  const t = document.getElementById('pal-type').value;
  const src = document.getElementById('pal-source');
  src.innerHTML = '<option value="">— Leer / aktuell —</option>';
  const builtin = t === 'dog' ? DOG_VARIANTS : CAT_VARIANTS;
  builtin.forEach(v => src.innerHTML += `<option value="${v}">${v} (built-in)</option>`);
  Object.keys(customPalettes[t] || {}).forEach(v => {
    src.innerHTML += `<option value="custom:${v}">${v} (custom)</option>`;
  });
}

// Color-Picker-Reihen erzeugen — eine pro Palette-Index (1-8 für Hund, 1-9 für Katze).
function buildPaletteColorRows(sourcePalette) {
  const t = document.getElementById('pal-type').value;
  const maxIdx = t === 'cat' ? 9 : 8;
  const container = document.getElementById('pal-color-rows');
  container.innerHTML = '';

  const defaultFixed = t === 'dog' ? DOG_FIXED : CAT_FIXED;
  const defaultVariable = { 1:'#cccccc', 2:'#888888', 3:'#555555', 4:'#222222', 9:'#888899' };

  for (let i = 1; i <= maxIdx; i++) {
    const def = sourcePalette?.[i] || defaultFixed[i] || defaultVariable[i] || '#888888';
    const row = document.createElement('div');
    row.className = 'pal-color-row';
    row.innerHTML = `
      <span class="idx">${i}</span>
      <input type="color" data-idx="${i}" value="${def}">
      <span class="name">${COLOR_LABELS[i] || '—'}</span>
      <span class="hex">${def}</span>
    `;
    const input = row.querySelector('input');
    const hex = row.querySelector('.hex');
    input.addEventListener('input', () => { hex.textContent = input.value; });
    container.appendChild(row);
  }
}

// Custom-Palette komplett löschen. Bestätigung läuft über renderCallbacks.onDeletePalette in app.js.
export function deleteCustomPalette(type, variant) {
  const t = type.startsWith('custom_') ? (customMeta[type]?.palType || 'dog') : type;
  delete customPalettes[t][variant];

  // Wenn die gelöschte Palette gerade aktiv war: auf erste Built-in zurück
  if (state.curVariant === variant) {
    state.curVariant = (t === 'dog' ? DOG_VARIANTS : CAT_VARIANTS)[0];
  }
  renderAll(); saveState();
}

// Modal-Event-Bindings einmalig setzen
export function initPaletteModal() {
  document.getElementById('pal-type').addEventListener('change', () => {
    refreshPaletteModalSource();
    buildPaletteColorRows(null);
  });

  document.getElementById('pal-source').addEventListener('change', e => {
    const t = document.getElementById('pal-type').value;
    const val = e.target.value;
    let src = null;
    if (val.startsWith('custom:')) {
      src = customPalettes[t][val.slice(7)];
    } else if (val) {
      src = (t === 'dog' ? DOG_PALETTES : CAT_PALETTES)[val];
    }
    buildPaletteColorRows(src);
  });

  document.getElementById('pal-modal-cancel').addEventListener('click', () => {
    document.getElementById('pal-modal-overlay').style.display = 'none';
  });

  document.getElementById('pal-modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'pal-modal-overlay') {
      document.getElementById('pal-modal-overlay').style.display = 'none';
    }
  });

  document.getElementById('pal-modal-create').addEventListener('click', () => {
    const rawName = document.getElementById('pal-name').value.trim();
    const t = document.getElementById('pal-type').value;
    if (!rawName) { showInfoToast('Bitte einen Namen eingeben.'); return; }
    const name = rawName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

    // Farben aus den Color-Pickern einsammeln
    const pal = {};
    document.querySelectorAll('#pal-color-rows input[type="color"]').forEach(inp => {
      pal[Number(inp.dataset.idx)] = inp.value;
    });

    function commit() {
      document.getElementById('pal-modal-overlay').style.display = 'none';
      _editMode = null;
      renderAll(); saveState();
    }

    if (_editMode) {
      const oldName = _editMode.variant;
      const palType = _editMode.type;

      if (name !== oldName) {
        const builtin = palType === 'dog' ? DOG_VARIANTS : CAT_VARIANTS;
        if (builtin.includes(name)) { showInfoToast('Name ist bereits eine Built-in-Palette.'); return; }
        if (customPalettes[palType][name]) {
          showConfirmToast(`Palette "${name}" existiert schon — überschreiben?`, () => {
            delete customPalettes[palType][oldName];
            customPalettes[palType][name] = pal;
            if (state.curVariant === oldName) state.curVariant = name;
            commit();
          }, 'Überschreiben');
          return;
        }
        delete customPalettes[palType][oldName];
        customPalettes[palType][name] = pal;
        if (state.curVariant === oldName) state.curVariant = name;
      } else {
        customPalettes[palType][oldName] = pal;
      }
    } else {
      const builtin = t === 'dog' ? DOG_VARIANTS : CAT_VARIANTS;
      if (builtin.includes(name)) { showInfoToast('Name ist bereits eine Built-in-Palette.'); return; }
      if (customPalettes[t][name]) {
        showConfirmToast(`Palette "${name}" existiert schon — überschreiben?`, () => {
          customPalettes[t][name] = pal;
          if (getCurrentPalType() === t) state.curVariant = name;
          commit();
        }, 'Überschreiben');
        return;
      }
      customPalettes[t][name] = pal;
      if (getCurrentPalType() === t) state.curVariant = name;
    }

    commit();
  });
}
