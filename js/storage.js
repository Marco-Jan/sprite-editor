// ════════════════════════════════════════════════════════════════════
// STORAGE — Persistierung via localStorage (+ Projekt-Datei als JSON)
// ════════════════════════════════════════════════════════════════════
// Alles liegt unter EINEM Key. `version` im Payload erlaubt Migrationen,
// ohne alte Saves zu zerschießen.
import { state, sprites, customPalettes, selectFirstSprite, paletteExists } from './state.js';
import { DEFAULT_PALETTE, completePalette } from './data.js';
import { saveBlob } from './filesystem.js';
import { showInfoToast } from './toast.js';
import { migrateV1 } from './migrate.js';
import { t } from './i18n.js';

const STORAGE_KEY = 'wb_sprite_tester_v1'; // Key bleibt — Migration passiert im Payload
const SCHEMA_VERSION = 2;

let _saveTimer = null;
let _flashTimer = null;

// Wenn wir die Seite absichtlich neu laden, nachdem wir den Storage ersetzt
// haben (Projekt öffnen, Zurücksetzen), darf der beforeunload-Handler NICHT
// mehr den alten In-Memory-Zustand darüberschreiben — sonst verpufft die
// Aktion wirkungslos.
let _saveDisabled = false;

function disableSaving() {
  _saveDisabled = true;
  clearTimeout(_saveTimer);
}

// ────────────────────────────────────────────────────────────────────
// Panel-Zustände (auf-/zugeklappt) — generisch über [data-panel]
// ────────────────────────────────────────────────────────────────────
function collectPanelStates() {
  const out = {};
  document.querySelectorAll('[data-panel]').forEach(p => {
    out[p.dataset.panel] = p.classList.contains('collapsed');
  });
  return out;
}

function applyPanelStates(panels) {
  if (!panels) return;
  document.querySelectorAll('[data-panel]').forEach(p => {
    const collapsed = panels[p.dataset.panel];
    if (typeof collapsed === 'boolean') p.classList.toggle('collapsed', collapsed);
  });
}

// ────────────────────────────────────────────────────────────────────
// Payload bauen / schreiben
// ────────────────────────────────────────────────────────────────────
function buildPayload() {
  return {
    version: SCHEMA_VERSION,
    sprites,
    customPalettes,
    ui: {
      curSprite: state.curSprite,
      curColor:  state.curColor,
      cellSize:  state.cellSize,
      editorBg:  state.editorBg,
      tool:      state.tool,
      outputFormat: state.outputFormat,
      mirror:    state.mirror,
      shapeFill: state.shapeFill,
      refSprite:  state.refSprite,
      refVisible: state.refVisible,
      refOpacity: state.refOpacity,
      refFront:   state.refFront,
      fullscreen: document.body.classList.contains('editor-fullscreen'),
      panels: collectPanelStates(),
    },
  };
}

// Debounce: beim Mausziehen (ein paintCell pro Pixel) nicht 100× pro Sekunde
// in den localStorage schreiben.
export function saveState() {
  if (_saveDisabled) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(writeNow, 250);
}

function writeNow() {
  if (_saveDisabled) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload()));
    flashSaved();
  } catch (e) {
    console.warn('Sprite-Editor: Speichern fehlgeschlagen', e);
    showInfoToast(t('file.saveFailed'));
  }
}

// Forcierter Save beim Tab-Schließen (der Debouncer könnte noch pending sein).
export function forceSaveBeforeUnload() {
  if (_saveDisabled) return;
  clearTimeout(_saveTimer);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload())); } catch {}
}

// ────────────────────────────────────────────────────────────────────
// Laden
// ────────────────────────────────────────────────────────────────────
// Kein Rendern hier — app.js ruft danach einmal renderAll().
// Rückgabe: { loaded, migrated, note } — `note` erklärt dem Nutzer, was die
// Migration mit alten Hund/Katze-Daten gemacht hat.
export function loadState() {
  let raw;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { return { loaded: false }; }
  if (!raw) return { loaded: false };

  let payload;
  try { payload = JSON.parse(raw); } catch (e) {
    console.warn('Sprite-Editor: Save unlesbar, starte frisch', e);
    return { loaded: false };
  }

  return applyPayload(payload);
}

// Payload (v1 ODER v2) in den State übernehmen.
function applyPayload(payload) {
  let note = null;
  let migrated = false;

  // v1 = altes dog/cat-Schema (erkennbar an `grids`), auf v2 heben.
  if (!payload.version || payload.grids) {
    const r = migrateV1(payload);
    payload = r.payload;
    note = r.note;
    migrated = true;
  }

  try {
    if (payload.sprites && typeof payload.sprites === 'object') {
      for (const [id, sp] of Object.entries(payload.sprites)) {
        if (!sp || !Array.isArray(sp.grid) || !sp.grid.length || !Array.isArray(sp.grid[0])) continue;
        sprites[id] = {
          name: typeof sp.name === 'string' && sp.name ? sp.name : id,
          palette: typeof sp.palette === 'string' ? sp.palette : DEFAULT_PALETTE,
          grid: sp.grid,
        };
      }
    }
    if (payload.customPalettes && typeof payload.customPalettes === 'object') {
      for (const [name, pal] of Object.entries(payload.customPalettes)) {
        if (pal && typeof pal === 'object') customPalettes[name] = completePalette(pal);
      }
    }

    // Paletten-Referenzen prüfen — eine gelöschte Palette darf keinen Sprite
    // unrenderbar machen.
    for (const sp of Object.values(sprites)) {
      if (!paletteExists(sp.palette)) sp.palette = DEFAULT_PALETTE;
    }

    const ui = payload.ui || {};
    state.curSprite = sprites[ui.curSprite] ? ui.curSprite : null;
    if (!state.curSprite) selectFirstSprite();
    if (ui.curColor != null) state.curColor = ui.curColor;
    if (ui.cellSize) state.cellSize = ui.cellSize;
    if (ui.editorBg) state.editorBg = ui.editorBg;
    if (ui.tool) state.tool = ui.tool;
    if (ui.outputFormat) state.outputFormat = ui.outputFormat;
    if (ui.mirror) state.mirror = ui.mirror;
    if (typeof ui.shapeFill === 'boolean') state.shapeFill = ui.shapeFill;
    // Die Ebene nur übernehmen, wenn es den Sprite noch gibt.
    state.refSprite = ui.refSprite && sprites[ui.refSprite] ? ui.refSprite : null;
    if (typeof ui.refVisible === 'boolean') state.refVisible = ui.refVisible;
    if (ui.refOpacity) state.refOpacity = ui.refOpacity;
    if (typeof ui.refFront === 'boolean') state.refFront = ui.refFront;
    applyPanelStates(ui.panels);

    return { loaded: true, migrated, note, fullscreen: !!ui.fullscreen };
  } catch (e) {
    console.warn('Sprite-Editor: Laden fehlgeschlagen, starte frisch', e);
    return { loaded: false };
  }
}

// Alles wegwerfen und Seite neu laden (= Werkseinstellungen).
export function clearStorage() {
  disableSaving(); // sonst schreibt beforeunload alles sofort wieder zurück
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  location.reload();
}

// Kurzes "gespeichert"-Aufblitzen in der Kopfzeile.
export function flashSaved() {
  const el = document.getElementById('save-indicator');
  if (!el) return;
  el.classList.add('on');
  clearTimeout(_flashTimer);
  _flashTimer = setTimeout(() => el.classList.remove('on'), 900);
}

// ────────────────────────────────────────────────────────────────────
// Projekt-Datei (JSON) speichern / laden
// ────────────────────────────────────────────────────────────────────
export async function saveToFile() {
  const payload = buildPayload();
  const base = (sprites[state.curSprite]?.name || 'sprites').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${base}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const result = await saveBlob(blob, filename);
  flashSaved();
  showInfoToast(result.fallback
    ? t('file.downloadedTip', { name: filename })
    : (result.dir ? t('file.savedIn', { name: filename, dir: result.dir })
                  : t('file.saved', { name: filename })));
}

// JSON-Projektdatei einlesen. Wird validiert und (nach Migration beim nächsten
// Load) in den Storage geschrieben; danach Reload für einen sauberen Start.
export function loadFromFile(file, onError) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const p = JSON.parse(e.target.result);
      if (!p || typeof p !== 'object' || (!p.sprites && !p.grids)) {
        throw new Error('kein Sprite-Projekt');
      }
      disableSaving(); // sonst überschreibt beforeunload die frisch geladene Datei
      localStorage.setItem(STORAGE_KEY, e.target.result);
      location.reload();
    } catch {
      if (onError) onError(t('file.badProject'));
    }
  };
  reader.onerror = () => { if (onError) onError(t('file.readFailed')); };
  reader.readAsText(file);
}
