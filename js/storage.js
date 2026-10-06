// ════════════════════════════════════════════════════════════════════
// STORAGE — Persistierung via localStorage (+ Projekt-Datei als JSON)
// ════════════════════════════════════════════════════════════════════
// Alles liegt unter EINEM Key. `version` im Payload erlaubt Migrationen,
// ohne alte Saves zu zerschießen.
import { state, sprites, customPalettes, paletteMaterials, selectFirstSprite, paletteExists, makeSprite, flatGrid } from './state.js';
import { DEFAULT_PALETTE, completePalette } from './data.js';
import { saveBlob } from './filesystem.js';
import { showInfoToast } from './toast.js';
import { migrateV1 } from './migrate.js';
import { t } from './i18n.js';
import { MATERIALS } from './gamejson.js';

const STORAGE_KEY = 'wb_sprite_tester_v1'; // Key bleibt — Migration passiert im Payload
const SCHEMA_VERSION = 2;

// Sicherheitsnetz. Beide Schlüssel schreibt das normale Speichern NIE.
//   RESCUE_KEY — ein Stand, den der Editor beim Start nicht lesen konnte.
//                Ohne ihn würde das nächste Auto-Save ihn überschreiben.
//   BACKUP_KEY — der Stand beim Start einer Sitzung, höchstens alle 12 h
//                erneuert. Geht nach einem Update etwas schief, ist der
//                letzte gute Stand noch da (Hilfe → Sicherung).
// Format beider: { at: ISO-Datum, raw: '…JSON wie eine Projektdatei…' }
const RESCUE_KEY = STORAGE_KEY + '_rescue';
const BACKUP_KEY = STORAGE_KEY + '_backup';
const BACKUP_EVERY = 12 * 60 * 60 * 1000;

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
// Sprites für den Speicherstand. `grid` (der erste Frame, alle Ebenen
// zusammengefügt) steht zusätzlich drin: eine ältere, noch
// zwischengespeicherte Version des Editors kennt weder Frames noch Ebenen —
// sie liest dann wenigstens das Bild statt gar nichts.
function serializeSprites() {
  const out = {};
  for (const [id, sp] of Object.entries(sprites)) {
    out[id] = {
      name: sp.name,
      palette: sp.palette,
      fps: sp.fps,
      frame: sp.frame,
      layer: sp.layer,
      layers: sp.layers,
      frames: sp.frames.map(f => (f.dur ? { cels: f.cels, dur: f.dur } : { cels: f.cels })),
      grid: flatGrid(sp, 0),
    };
  }
  return out;
}

// Ein Grid ist brauchbar, wenn es ein nicht-leeres Array aus Zeilen ist.
const isGrid = g => Array.isArray(g) && g.length > 0 && Array.isArray(g[0]) && g[0].length > 0;

// Frames aus einem gespeicherten Sprite lesen. Alte Stände kennen nur
// `grid` (ein Bild) oder Frames mit `grid` (eine Ebene). Alle Bilder bekommen
// die Maße des ersten, fehlende Ebenen werden leer ergänzt (makeSprite).
function readFrames(sp) {
  const celsOf = f => (Array.isArray(f?.cels) ? f.cels.filter(isGrid) : isGrid(f?.grid) ? [f.grid] : []);
  const raw = Array.isArray(sp.frames) && sp.frames.some(f => celsOf(f).length)
    ? sp.frames.filter(f => celsOf(f).length).map(f => ({ cels: celsOf(f), dur: f.dur }))
    : isGrid(sp.grid) ? [{ cels: [sp.grid] }] : null;
  if (!raw) return null;
  const first = raw[0].cels[0];
  const H = first.length, W = first[0].length;
  const fit = g => Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => g[y]?.[x] ?? 0));
  return raw.map(f => ({ cels: f.cels.map(fit), dur: Number(f.dur) || 0 }));
}

function buildPayload() {
  return {
    version: SCHEMA_VERSION,
    sprites: serializeSprites(),
    customPalettes,
    paletteMaterials,
    ui: {
      curSprite: state.curSprite,
      curColor:  state.curColor,
      cellSize:  state.cellSize,
      editorBg:  state.editorBg,
      tool:      state.tool,
      outputFormat: state.outputFormat,
      mirror:    state.mirror,
      shapeFill: state.shapeFill,
      onion:      state.onion,
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
    console.warn('spritebit: Speichern fehlgeschlagen', e);
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
    console.warn('spritebit: Save unlesbar, starte frisch', e);
    rescue(raw);
    return { loaded: false, rescued: true };
  }

  const r = applyPayload(payload);
  if (r.loaded) keepBackup(raw);
  else { rescue(raw); r.rescued = true; }
  return r;
}

// ── Sicherheitsnetz ─────────────────────────────────────────────────
function readSlot(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v && typeof v.raw === 'string' ? v : null;
  } catch { return null; }
}
function writeSlot(key, raw) {
  try { localStorage.setItem(key, JSON.stringify({ at: new Date().toISOString(), raw })); return true; }
  catch (e) { console.warn('spritebit: Sicherung passt nicht mehr in den Speicher', e); return false; }
}

// Unlesbaren Stand beiseitelegen, bevor ihn das nächste Speichern überschreibt.
// Gibt es schon eine Rettung, bleibt die ältere — die ist eher die gute.
function rescue(raw) {
  if (!readSlot(RESCUE_KEY)) writeSlot(RESCUE_KEY, raw);
}

function keepBackup(raw) {
  const old = readSlot(BACKUP_KEY);
  if (old && Date.now() - Date.parse(old.at) < BACKUP_EVERY) return;
  if (old && old.raw === raw) return;
  writeSlot(BACKUP_KEY, raw);
}

// Für die Hilfe: was gibt es an Sicherungen? → { backup: Date|null, rescue: Date|null }
export function backupInfo() {
  const b = readSlot(BACKUP_KEY), r = readSlot(RESCUE_KEY);
  return { backup: b ? new Date(b.at) : null, rescue: r ? new Date(r.at) : null };
}

// Sicherung als Projektdatei herunterladen — "Öffnen" liest sie wieder ein.
export async function downloadBackup(which) {
  const slot = readSlot(which === 'rescue' ? RESCUE_KEY : BACKUP_KEY);
  if (!slot) return;
  const day = slot.at.slice(0, 10);
  const blob = new Blob([slot.raw], { type: 'application/json' });
  await saveBlob(blob, `spritebit-sicherung-${day}.json`);
}

// Sicherung zurückholen: ersetzt den aktuellen Stand, dann Neustart.
// Der aktuelle Stand wird vorher selbst zur Rettung — nichts geht verloren.
export function restoreBackup(which) {
  const slot = readSlot(which === 'rescue' ? RESCUE_KEY : BACKUP_KEY);
  if (!slot) return;
  disableSaving();
  try {
    const cur = localStorage.getItem(STORAGE_KEY);
    if (cur && cur !== slot.raw) localStorage.setItem(RESCUE_KEY, JSON.stringify({ at: new Date().toISOString(), raw: cur }));
    localStorage.setItem(STORAGE_KEY, slot.raw);
  } catch (e) {
    console.warn('spritebit: Wiederherstellen fehlgeschlagen', e);
  }
  location.reload();
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
        const frames = sp && readFrames(sp);
        if (!frames) continue;
        sprites[id] = makeSprite({
          name: typeof sp.name === 'string' && sp.name ? sp.name : id,
          palette: typeof sp.palette === 'string' ? sp.palette : DEFAULT_PALETTE,
          frames,
          fps: sp.fps,
          frame: sp.frame,
          layers: Array.isArray(sp.layers) ? sp.layers : null,
          layer: sp.layer,
        });
      }
    }
    if (payload.customPalettes && typeof payload.customPalettes === 'object') {
      for (const [name, pal] of Object.entries(payload.customPalettes)) {
        if (pal && typeof pal === 'object') customPalettes[name] = completePalette(pal);
      }
    }

    // Materialien nur aus der festen Liste übernehmen — ein unbekannter Name
    // fiele sonst erst beim Export auf.
    if (payload.paletteMaterials && typeof payload.paletteMaterials === 'object') {
      for (const [name, mats] of Object.entries(payload.paletteMaterials)) {
        if (!mats || typeof mats !== 'object') continue;
        const clean = {};
        for (const [i, m] of Object.entries(mats)) if (MATERIALS.includes(m)) clean[i] = m;
        if (Object.keys(clean).length) paletteMaterials[name] = clean;
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
    if (typeof ui.onion === 'boolean') state.onion = ui.onion;
    applyPanelStates(ui.panels);

    return { loaded: true, migrated, note, fullscreen: !!ui.fullscreen };
  } catch (e) {
    console.warn('spritebit: Laden fehlgeschlagen, starte frisch', e);
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
