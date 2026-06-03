// ════════════════════════════════════════════════════════════════════
// STORAGE — Persistierung via localStorage
// ════════════════════════════════════════════════════════════════════
// Alles wird unter EINEM Key gespeichert (versioniert, damit man bei
// Schema-Änderungen v2 anlegen kann ohne alte Saves zu zerschießen).
import { state, grids, customMeta, customPalettes, getVariants } from './state.js';
import { ORIG } from './data.js';

const STORAGE_KEY = 'wb_sprite_tester_v1';
let _saveTimer = null;
let _flashTimer = null;

function _restorePanel(bodyId, toggleId, collapsed) {
  const body   = document.getElementById(bodyId);
  const toggle = document.getElementById(toggleId);
  if (!body || !toggle) return;
  body.classList.toggle('collapsed', collapsed);
  toggle.textContent = collapsed ? '▼' : '▲';
}

// Debounce: bei Mausziehen (paintCell pro Pixel) nicht 100× pro Sekunde schreiben.
export function saveState() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      const payload = {
        grids,
        customMeta,
        customPalettes,
        ui: {
          curType: state.curType, curState: state.curState,
          curVariant: state.curVariant, curColor: state.curColor,
          cellSize: state.cellSize, editorBg: state.editorBg,
          openGroupKey: state.openGroupKey,
          fullscreen: document.body.classList.contains('editor-fullscreen'),
          panels: {
            overview:  document.getElementById('overview-body')?.classList.contains('collapsed') ?? true,
            palette:   document.getElementById('palette-body')?.classList.contains('collapsed') ?? true,
            tools:     document.getElementById('tools-body')?.classList.contains('collapsed') ?? false,
            template:  document.getElementById('template-body')?.classList.contains('collapsed') ?? true,
            shortcuts: document.getElementById('shortcuts-bar')?.classList.contains('collapsed') ?? true,
          },
        },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      flashSaved();
    } catch (e) {
      console.warn('Sprite-Tester: Speichern fehlgeschlagen', e);
    }
  }, 250);
}

// Vollständiges Laden aus dem Storage. KEIN automatisches Rendern hier —
// das macht app.js nach loadState() einmal mit renderAll().
// Liefert `true` falls geladen wurde (z.B. um zu signalisieren dass Custom-
// Sprite-Buttons aufgebaut werden müssen).
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const p = JSON.parse(raw);

    // Built-in + Custom-Grids zurückspielen
    if (p.grids && typeof p.grids === 'object') {
      for (const k of Object.keys(p.grids)) {
        grids[k] = p.grids[k];
      }
    }
    if (p.customMeta && typeof p.customMeta === 'object') {
      Object.assign(customMeta, p.customMeta);
    }
    if (p.customPalettes && typeof p.customPalettes === 'object') {
      if (p.customPalettes.dog)     Object.assign(customPalettes.dog,     p.customPalettes.dog);
      if (p.customPalettes.cat)     Object.assign(customPalettes.cat,     p.customPalettes.cat);
      if (p.customPalettes.neutral) Object.assign(customPalettes.neutral, p.customPalettes.neutral);
    }

    // UI-Zustand wiederherstellen (mit Fallbacks)
    if (p.ui) {
      if (p.ui.curType && (grids[p.ui.curType] || ORIG[p.ui.curType])) {
        state.curType = p.ui.curType;
      }
      if (p.ui.curState) state.curState = p.ui.curState;
      if (p.ui.curColor != null) state.curColor = p.ui.curColor;
      if (p.ui.cellSize) {
        state.cellSize = p.ui.cellSize;
        const slider = document.getElementById('cell-size');
        if (slider) {
          slider.value = state.cellSize;
          document.getElementById('cell-size-val').textContent = state.cellSize + 'px';
        }
      }
      // Variant: nur übernehmen wenn für aktuellen Typ verfügbar
      if (p.ui.curVariant && getVariants(state.curType).includes(p.ui.curVariant)) {
        state.curVariant = p.ui.curVariant;
      } else {
        state.curVariant = getVariants(state.curType)[0];
      }
      if (p.ui.editorBg) state.editorBg = p.ui.editorBg;
      if (p.ui.openGroupKey !== undefined) state.openGroupKey = p.ui.openGroupKey;

      // Panel-Zustände wiederherstellen
      if (p.ui.panels) {
        _restorePanel('overview-body',  'overview-toggle',  p.ui.panels.overview);
        _restorePanel('palette-body',   'palette-toggle',   p.ui.panels.palette);
        _restorePanel('tools-body',     'tools-toggle',     p.ui.panels.tools     ?? false);
        _restorePanel('template-body',  'template-toggle',  p.ui.panels.template  ?? true);
        _restorePanel('shortcuts-bar',  'shortcuts-toggle', p.ui.panels.shortcuts);
      }
    }
    return true;
  } catch (e) {
    console.warn('Sprite-Tester: Laden fehlgeschlagen, starte frisch', e);
    return false;
  }
}

// Alles wegwerfen und Seite neu laden (= zurück zu Werkseinstellungen).
// Bestätigung läuft über showConfirmToast in app.js.
export function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

// Kurzes "💾 gespeichert"-Aufblitzen oben rechts (visuelles Feedback).
export function flashSaved() {
  const el = document.getElementById('save-indicator');
  if (!el) return;
  el.style.opacity = '1';
  clearTimeout(_flashTimer);
  _flashTimer = setTimeout(() => { el.style.opacity = '0'; }, 800);
}

// Gesamten Zustand als JSON-Datei herunterladen.
export function saveToFile() {
  const payload = {
    grids,
    customMeta,
    customPalettes,
    ui: {
      curType: state.curType, curState: state.curState,
      curVariant: state.curVariant, curColor: state.curColor,
      cellSize: state.cellSize, editorBg: state.editorBg,
      openGroupKey: state.openGroupKey,
      fullscreen: document.body.classList.contains('editor-fullscreen'),
      panels: {
        overview:  document.getElementById('overview-body')?.classList.contains('collapsed') ?? true,
        palette:   document.getElementById('palette-body')?.classList.contains('collapsed') ?? true,
        tools:     document.getElementById('tools-body')?.classList.contains('collapsed') ?? false,
        template:  document.getElementById('template-body')?.classList.contains('collapsed') ?? true,
        shortcuts: document.getElementById('shortcuts-bar')?.classList.contains('collapsed') ?? true,
      },
    },
  };
  const filename = state.curType.startsWith('custom_')
    ? (customMeta[state.curType]?.name || state.curType).replace(/[^a-zA-Z0-9_-]/g, '_')
    : `${state.curType}_${state.curState}`.toUpperCase();

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

// JSON-Datei einlesen, in localStorage schreiben, Seite neu laden.
export function loadFromFile(file, onError) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      JSON.parse(e.target.result); // Validierung
      localStorage.setItem(STORAGE_KEY, e.target.result);
      location.reload();
    } catch {
      if (onError) onError('Ungültige Datei — kein gültiges JSON.');
    }
  };
  reader.onerror = () => { if (onError) onError('Datei konnte nicht gelesen werden.'); };
  reader.readAsText(file);
}

// Forcierter Save beim Tab-Schließen (Debouncer könnte noch pending sein,
// in dem Fall wäre die letzte Änderung verloren).
export function forceSaveBeforeUnload() {
  clearTimeout(_saveTimer);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      grids, customMeta, customPalettes,
      ui: {
        curType: state.curType, curState: state.curState,
        curVariant: state.curVariant, curColor: state.curColor,
        cellSize: state.cellSize, editorBg: state.editorBg,
        openGroupKey: state.openGroupKey,
        fullscreen: document.body.classList.contains('editor-fullscreen'),
        panels: {
          overview:  document.getElementById('overview-body')?.classList.contains('collapsed') ?? true,
          palette:   document.getElementById('palette-body')?.classList.contains('collapsed') ?? true,
          tools:     document.getElementById('tools-body')?.classList.contains('collapsed') ?? false,
          shortcuts: document.getElementById('shortcuts-bar')?.classList.contains('collapsed') ?? true,
        },
      },
    }));
  } catch {}
}
