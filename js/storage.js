// ════════════════════════════════════════════════════════════════════
// STORAGE — Speicherstand im Browser (+ Projekt-Datei als JSON)
// ════════════════════════════════════════════════════════════════════
// Gespeichert wird in IndexedDB (js/idb.js): je Sprite ein Eintrag, die
// Pixel kompakt als Bytes (js/pack.js), und nur, was sich seit dem letzten
// Mal geändert hat. Das Speichern läuft im Hintergrund.
//
// Ohne IndexedDB (manche privaten Fenster) geht es wie früher: alles als
// ein JSON-Text unter EINEM Schlüssel in localStorage.
//
// Was zwischen beiden Welten wandert — Projektdatei, Sicherung, Rettung,
// Notfall-Kopie, der alte localStorage-Stand —, ist immer derselbe JSON-
// Payload (buildPayload). `version` darin erlaubt Migrationen, ohne alte
// Saves zu zerschießen; geladen wird alles über applyPayload.
import { layerForSave } from './mask.js';
import { state, sprites, customPalettes, paletteMaterials, paletteColorNames, selectFirstSprite, paletteExists, makeSprite, flatGrid, framesForSave, makeSpriteId, getPaletteByName } from './state.js';
import { normalizeTlOpts } from './onion.js';
import { DEFAULT_PALETTE, completePalette } from './data.js';
import { saveBlob } from './filesystem.js';
import { showInfoToast } from './toast.js';
import { migrateV1 } from './migrate.js';
import { openDb, readAll, writeBatch, useDb, deleteDb, copyDb, seedDb } from './idb.js';
import { MAIN, readRegistry, writeRegistry, newProjectId, freeName, dbNameOf, storageKeyOf, emergencyKeyOf } from './projects.js';
import { packSprite, unpackSprite, packSum } from './pack.js';
import { readAse, writeAse } from './aseprite.js';
import { t } from './i18n.js';
import { MATERIALS } from './gamejson.js';

// Welches Projekt gerade dran ist (js/projects.js) — steht für die ganze
// Sitzung fest; gewechselt wird per Neustart (switchProject).
const PROJECT_ID = readRegistry().current;
// Das erste Projekt behält den alten Schlüssel — Migration passiert im Payload.
const STORAGE_KEY = storageKeyOf(PROJECT_ID);
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

// Notfall-Kopie (nur bei IndexedDB): wird der Tab geschlossen, während noch
// etwas ungespeichert ist, kann IndexedDB nicht mehr sicher fertig schreiben.
// Dann kommt der Stand zusätzlich synchron hierher; beim nächsten Start
// gewinnt der neuere von beiden.
const EMERGENCY_KEY = emergencyKeyOf(PROJECT_ID);

/** 'idb' oder 'ls' (localStorage) — steht nach loadState() fest. */
let backend = 'ls';
// Sicherung und Rettung bei IndexedDB: beim Start gelesen, danach hier
// gehalten — die Hilfe fragt synchron danach (backupInfo).
const slotCache = {};
// Was zuletzt gespeichert wurde: Prüfsumme je Sprite (js/pack.js).
const savedSums = new Map();
// Änderungszähler: ungespeichert ist, solange savedSeq hinter changeSeq liegt.
let changeSeq = 0, savedSeq = 0;
let writing = null, writeAgain = false;

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
function serializeSprite(sp) {
  return {
    name: sp.name,
    palette: sp.palette,
    fps: sp.fps,
    frame: sp.frame,
    layer: sp.layer,
    layers: sp.layers.map(layerForSave),
    guides: sp.guides,
    tags: sp.tags,
    // Verknüpfte Zellen als { link: k } (state.js framesForSave).
    frames: framesForSave(sp),
    grid: flatGrid(sp, 0),
  };
}

function serializeSprites() {
  const out = {};
  for (const [id, sp] of Object.entries(sprites)) out[id] = serializeSprite(sp);
  return out;
}

// Ein Grid ist brauchbar, wenn es ein nicht-leeres Array aus Zeilen ist.
const isGrid = g => Array.isArray(g) && g.length > 0 && Array.isArray(g[0]) && g[0].length > 0;

// Frames aus einem gespeicherten Sprite lesen. Alte Stände kennen nur
// `grid` (ein Bild) oder Frames mit `grid` (eine Ebene). Alle Bilder bekommen
// die Maße des ersten, fehlende Ebenen werden leer ergänzt (makeSprite).
// Ein { link: k } (verknüpfte Zelle) bleibt stehen; makeSprite löst es auf.
const isLink = c => !!c && typeof c === 'object' && !Array.isArray(c) && Number.isInteger(c.link);
function readFrames(sp) {
  const celsOf = f => (Array.isArray(f?.cels) ? f.cels.filter(c => isGrid(c) || isLink(c)) : isGrid(f?.grid) ? [f.grid] : []);
  const raw = Array.isArray(sp.frames) && sp.frames.some(f => celsOf(f).length)
    ? sp.frames.filter(f => celsOf(f).length).map(f => ({ cels: celsOf(f), dur: f.dur }))
    : isGrid(sp.grid) ? [{ cels: [sp.grid] }] : null;
  if (!raw) return null;
  const first = raw.flatMap(f => f.cels).find(isGrid);
  if (!first) return null;
  const H = first.length, W = first[0].length;
  const fit = g => Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => g[y]?.[x] ?? 0));
  return raw.map(f => ({ cels: f.cels.map(c => (isLink(c) ? c : fit(c))), dur: Number(f.dur) || 0 }));
}

// Alles außer den Sprites — für IndexedDB, wo die Sprites einzeln liegen.
function buildProject() {
  const { sprites: _, ...rest } = buildPayload(false);
  return { ...rest, order: Object.keys(sprites), savedAt: Date.now() };
}

function buildPayload(withSprites = true) {
  return {
    version: SCHEMA_VERSION,
    name: projectName(),
    sprites: withSprites ? serializeSprites() : {},
    customPalettes,
    paletteMaterials,
    paletteColorNames,
    ui: {
      curSprite: state.curSprite,
      openTabs:  state.openTabs,
      curColor:  state.curColor,
      cellSize:  state.cellSize,
      editorBg:  state.editorBg,
      tool:      state.tool,
      outputFormat: state.outputFormat,
      mirror:    state.mirror,
      shapeFill: state.shapeFill,
      fillVisible: state.fillVisible,
      pixelPerfect: state.pixelPerfect,
      tileMode: state.tileMode,
      tileAuto: state.tileAuto,
      onion:      state.onion,
      timeline:   state.tlOpts,
      showGuides: state.showGuides,
      lockGuides: state.lockGuides,
      fullscreen: document.body.classList.contains('editor-fullscreen'),
      panels: collectPanelStates(),
    },
  };
}

// Debounce: beim Mausziehen (ein paintCell pro Pixel) nicht 100× pro Sekunde
// in den localStorage schreiben.
export function saveState() {
  if (_saveDisabled) return;
  changeSeq++;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(writeNow, 250);
}

function writeNow() {
  if (_saveDisabled) return;
  if (backend === 'idb') { writeIdb(); return; }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload()));
    savedSeq = changeSeq;
    touchRegistry();
    flashSaved();
  } catch (e) {
    console.warn('spritebit: Speichern fehlgeschlagen', e);
    showInfoToast(t('file.saveFailed'));
  }
}

// IndexedDB: nur Sprites schreiben, deren Prüfsumme sich geändert hat, dazu
// das Projekt — alles in einer Transaktion. Läuft schon ein Schreiben, wird
// danach noch einmal geschrieben, statt zwei Transaktionen zu mischen.
async function writeIdb() {
  if (_saveDisabled) return;
  if (writing) { writeAgain = true; return; }
  const seq = changeSeq;
  const put = {}, sums = new Map();
  for (const [id, sp] of Object.entries(sprites)) {
    const rec = packSprite(sp);
    const sum = packSum(rec);
    sums.set(id, sum);
    if (savedSums.get(id) !== sum) put[id] = rec;
  }
  const del = [...savedSums.keys()].filter(id => !sprites[id]);
  writing = writeBatch({ kv: { project: buildProject() }, put, del });
  try {
    await writing;
    savedSums.clear();
    for (const [id, sum] of sums) savedSums.set(id, sum);
    savedSeq = seq;
    try { localStorage.removeItem(EMERGENCY_KEY); } catch {}
    touchRegistry();
    flashSaved();
  } catch (e) {
    console.warn('spritebit: Speichern fehlgeschlagen', e);
    showInfoToast(t('file.saveFailed'));
  } finally {
    writing = null;
    if (writeAgain) { writeAgain = false; writeIdb(); }
  }
}

// Forcierter Save beim Tab-Schließen (der Debouncer könnte noch pending sein).
// localStorage schreibt synchron und ist garantiert fertig; IndexedDB nicht.
// Darum bei IndexedDB: ist etwas ungespeichert, zusätzlich die Notfall-Kopie.
export function forceSaveBeforeUnload() {
  if (_saveDisabled) return;
  clearTimeout(_saveTimer);
  if (backend !== 'idb') {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload())); } catch {}
    return;
  }
  if (changeSeq === savedSeq && !writing) return;
  try {
    localStorage.setItem(EMERGENCY_KEY, JSON.stringify({ at: Date.now(), raw: JSON.stringify(buildPayload()) }));
  } catch (e) {
    console.warn('spritebit: Notfall-Kopie passt nicht in den Speicher', e);
  }
  writeIdb();
}

// ────────────────────────────────────────────────────────────────────
// Laden
// ────────────────────────────────────────────────────────────────────
// Kein Rendern hier — app.js ruft danach einmal renderAll().
// Rückgabe: { loaded, migrated, note } — `note` erklärt dem Nutzer, was die
// Migration mit alten Hund/Katze-Daten gemacht hat.
export async function loadState() {
  try {
    useDb(dbNameOf(PROJECT_ID));
    await openDb();
    backend = 'idb';
    return await loadIdb();
  } catch (e) {
    console.warn('spritebit: IndexedDB nicht verfügbar, speichere in localStorage', e);
    backend = 'ls';
    return loadLegacy();
  }
}

// Welcher Stand gilt beim Start mit IndexedDB? Der Reihe nach:
//   1. ein wartender Import (Projekt öffnen, Sicherung zurückholen)
//   2. die Notfall-Kopie, wenn sie neuer ist als das Gespeicherte
//   3. das Gespeicherte
//   4. noch nichts gespeichert: der alte localStorage-Stand (einmaliger
//      Umzug; der alte Schlüssel bleibt als weitere Sicherung liegen)
async function loadIdb() {
  const { kv, sprites: stored } = await readAll();
  for (const k of [BACKUP_KEY, RESCUE_KEY]) if (kv.get(k)?.raw) slotCache[k] = kv.get(k);
  const project = kv.get('project');
  let emergency = null;
  try { emergency = JSON.parse(localStorage.getItem(EMERGENCY_KEY) || 'null'); } catch {}

  let raw = null, why = '';
  if (typeof kv.get('import') === 'string') { raw = kv.get('import'); why = 'import'; }
  else if (emergency?.raw && (!project || emergency.at > (project.savedAt || 0))) { raw = emergency.raw; why = 'emergency'; }
  // Der Umzug aus dem alten localStorage-Stand gilt nur fürs erste Projekt —
  // ein neues bringt seinen Startinhalt als Import mit.
  else if (!project && !kv.get('migrated') && PROJECT_ID === MAIN) {
    try { raw = localStorage.getItem(STORAGE_KEY); } catch {}
    why = 'migrate';
  }

  if (raw) {
    let payload;
    try { payload = JSON.parse(raw); } catch {
      rescue(raw);
      return { loaded: false, rescued: true };
    }
    const r = applyPayload(payload);
    if (!r.loaded) { rescue(raw); r.rescued = true; return r; }
    keepBackup(raw);
    // Gleich vollständig nach IndexedDB — danach ist der Import erledigt.
    savedSums.clear();
    await writeBatch({
      kv: { project: buildProject(), migrated: true },
      kvDel: ['import'],
      put: Object.fromEntries(Object.entries(sprites).map(([id, sp]) => [id, packSprite(sp)])),
      clearSprites: true,
    });
    for (const [id, sp] of Object.entries(sprites)) savedSums.set(id, packSum(packSprite(sp)));
    try { localStorage.removeItem(EMERGENCY_KEY); } catch {}
    if (why === 'migrate') console.info('spritebit: Speicherstand aus localStorage nach IndexedDB übernommen');
    return r;
  }

  try { localStorage.removeItem(EMERGENCY_KEY); } catch {}
  if (!project) return { loaded: false };

  // Gespeichertes auspacken und durch dieselbe Prüfung schicken wie eine Datei.
  const order = (Array.isArray(project.order) ? project.order : []).filter(id => stored.has(id));
  for (const id of stored.keys()) if (!order.includes(id)) order.push(id);
  const payload = {
    ...project,
    sprites: Object.fromEntries(order.map(id => [id, unpackSprite(stored.get(id))])),
  };
  const r = applyPayload(payload);
  if (!r.loaded) {
    const text = JSON.stringify(payload);
    rescue(text);
    r.rescued = true;
    return r;
  }
  // Was geladen ist, gilt als gespeichert — sonst schriebe das erste
  // Speichern jeden Sprite neu. Einträge ohne Sprite räumt es dann weg.
  for (const id of stored.keys()) savedSums.set(id, '');
  for (const [id, sp] of Object.entries(sprites)) savedSums.set(id, packSum(packSprite(sp)));
  keepBackup(() => JSON.stringify(buildPayload()));
  return r;
}

function loadLegacy() {
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
  if (backend === 'idb') return slotCache[key] || null;
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v && typeof v.raw === 'string' ? v : null;
  } catch { return null; }
}
function writeSlot(key, raw) {
  if (backend === 'idb') {
    slotCache[key] = { at: new Date().toISOString(), raw };
    writeBatch({ kv: { [key]: slotCache[key] } })
      .catch(e => console.warn('spritebit: Sicherung nicht geschrieben', e));
    return true;
  }
  try { localStorage.setItem(key, JSON.stringify({ at: new Date().toISOString(), raw })); return true; }
  catch (e) { console.warn('spritebit: Sicherung passt nicht mehr in den Speicher', e); return false; }
}

// Unlesbaren Stand beiseitelegen, bevor ihn das nächste Speichern überschreibt.
// Gibt es schon eine Rettung, bleibt die ältere — die ist eher die gute.
function rescue(raw) {
  if (!readSlot(RESCUE_KEY)) writeSlot(RESCUE_KEY, raw);
}

// raw: der Text — oder eine Funktion, die ihn erst baut, wenn er gebraucht
// wird (bei IndexedDB liegt kein fertiger Text vor).
function keepBackup(raw) {
  const old = readSlot(BACKUP_KEY);
  if (old && Date.now() - Date.parse(old.at) < BACKUP_EVERY) return;
  const text = typeof raw === 'function' ? raw() : raw;
  if (old && old.raw === text) return;
  writeSlot(BACKUP_KEY, text);
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
export async function restoreBackup(which) {
  const slot = readSlot(which === 'rescue' ? RESCUE_KEY : BACKUP_KEY);
  if (!slot) return;
  disableSaving();
  if (backend === 'idb') {
    const cur = JSON.stringify(buildPayload());
    const kv = { import: slot.raw };
    if (cur !== slot.raw) kv[RESCUE_KEY] = { at: new Date().toISOString(), raw: cur };
    try { await writeBatch({ kv }); } catch (e) { console.warn('spritebit: Wiederherstellen fehlgeschlagen', e); }
    location.reload();
    return;
  }
  try {
    const cur = localStorage.getItem(STORAGE_KEY);
    if (cur && cur !== slot.raw) localStorage.setItem(RESCUE_KEY, JSON.stringify({ at: new Date().toISOString(), raw: cur }));
    localStorage.setItem(STORAGE_KEY, slot.raw);
  } catch (e) {
    console.warn('spritebit: Wiederherstellen fehlgeschlagen', e);
  }
  location.reload();
}

// ────────────────────────────────────────────────────────────────────
// Projekte (js/projects.js): anlegen, wechseln, umbenennen, duplizieren, löschen
// ────────────────────────────────────────────────────────────────────
/** Name des geöffneten Projekts (oder „Unbenanntes Projekt“). */
export function projectName() {
  return readRegistry().list.find(e => e.id === PROJECT_ID)?.name || t('proj.unnamed');
}
export const currentProjectId = () => PROJECT_ID;

/** Anzahl Sprites des geöffneten Projekts in der Liste nachtragen — beim
 *  Start und vor einem Wechsel (auch wenn nichts geändert wurde). */
export function syncCount() {
  const reg = readRegistry();
  const e = reg.list.find(x => x.id === PROJECT_ID);
  if (!e || e.count === Object.keys(sprites).length) return;
  e.count = Object.keys(sprites).length;
  writeRegistry(reg);
}

// Nach jedem Speichern: „zuletzt geändert“ und Anzahl Sprites in der Liste.
function touchRegistry() {
  const reg = readRegistry();
  const e = reg.list.find(x => x.id === PROJECT_ID);
  if (!e) return;
  e.updated = Date.now();
  e.count = Object.keys(sprites).length;
  writeRegistry(reg);
}

// Was noch nicht gespeichert ist, jetzt schreiben — vor einem Wechsel.
async function flushSave() {
  if (_saveDisabled) return;
  clearTimeout(_saveTimer);
  if (backend !== 'idb') { writeNow(); return; }
  while (writing) await writing;
  if (changeSeq !== savedSeq) await writeIdb();
  while (writing) await writing;
}

/** Ein anderes Projekt öffnen: speichern, umschalten, neu starten. */
export async function switchProject(id) {
  await flushSave();
  syncCount();
  disableSaving();
  const reg = readRegistry();
  if (!reg.list.some(e => e.id === id)) return;
  reg.current = id;
  writeRegistry(reg);
  location.reload();
}

/** Neues Projekt `name`. Ohne `seedText`: ein leerer Sprite, eigene
 *  Paletten und Einstellungen kommen mit. Mit `seedText` (eine geöffnete
 *  Projektdatei): deren Inhalt. Danach wird es geöffnet. */
export async function createProject(name, seedText = null) {
  const reg = readRegistry();
  const id = newProjectId(reg);
  let seed;
  if (seedText) {
    seed = JSON.parse(seedText);
  } else {
    seed = buildPayload(false);
    seed.ui = { ...seed.ui, curSprite: null, openTabs: null };
  }
  const entry = { id, name: freeName(reg, name || t('proj.unnamed')), updated: Date.now(), count: 0 };
  seed.name = entry.name;
  const text = JSON.stringify(seed);
  try {
    if (backend === 'idb') await seedDb(dbNameOf(id), { import: text, migrated: true });
    else localStorage.setItem(storageKeyOf(id), text);
  } catch (e) {
    console.warn('spritebit: Projekt nicht angelegt', e);
    showInfoToast(t('proj.failed'));
    return;
  }
  reg.list.push(entry);
  writeRegistry(reg);
  await switchProject(id);
}

export function renameProject(id, name) {
  const reg = readRegistry();
  const e = reg.list.find(x => x.id === id);
  const n = name.trim().slice(0, 60);
  if (!e || !n) return;
  e.name = n;
  writeRegistry(reg);
  if (id === PROJECT_ID) saveState(); // der Name steht auch in der Datei
}

/** Kopie eines Projekts — bleibt geschlossen, erscheint in der Liste. */
export async function duplicateProject(id) {
  const reg = readRegistry();
  const src = reg.list.find(x => x.id === id);
  if (!src) return;
  const nid = newProjectId(reg);
  const name = freeName(reg, t('proj.copyOf', { name: src.name || t('proj.unnamed') }));
  try {
    if (id === PROJECT_ID) await flushSave();
    if (backend === 'idb') await copyDb(dbNameOf(id), dbNameOf(nid));
    else {
      const v = localStorage.getItem(storageKeyOf(id));
      if (v) localStorage.setItem(storageKeyOf(nid), v);
    }
  } catch (e) {
    console.warn('spritebit: Duplizieren fehlgeschlagen', e);
    showInfoToast(t('proj.failed'));
    return;
  }
  const fresh = readRegistry();
  fresh.list.push({ id: nid, name, updated: Date.now(), count: src.count });
  writeRegistry(fresh);
}

/** Ein Projekt löschen — nie das geöffnete. */
export async function deleteProject(id) {
  if (id === PROJECT_ID) return;
  try {
    if (backend === 'idb') await deleteDb(dbNameOf(id));
    const k = storageKeyOf(id);
    for (const key of [k, k + '_rescue', k + '_backup', emergencyKeyOf(id)]) localStorage.removeItem(key);
  } catch (e) {
    console.warn('spritebit: Löschen fehlgeschlagen', e);
  }
  const reg = readRegistry();
  reg.list = reg.list.filter(e => e.id !== id);
  writeRegistry(reg);
}

// Farbnamen aus einer Datei: nur Nummer → kurzer Text. null, wenn keiner bleibt.
function cleanColorNames(names) {
  if (!names || typeof names !== 'object') return null;
  const clean = {};
  for (const [k, v] of Object.entries(names)) {
    const i = Number(k);
    if (Number.isInteger(i) && i >= 1 && typeof v === 'string' && v.trim()) clean[i] = v.trim().slice(0, 40);
  }
  return Object.keys(clean).length ? clean : null;
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
          guides: sp.guides,
          tags: sp.tags,
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
    if (payload.paletteColorNames && typeof payload.paletteColorNames === 'object') {
      for (const [name, names] of Object.entries(payload.paletteColorNames)) {
        const clean = cleanColorNames(names);
        if (clean) paletteColorNames[name] = clean;
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
    // Fehlt die Liste (ältere Stände), sind alle Sprites offen.
    state.openTabs = Array.isArray(ui.openTabs) ? ui.openTabs.filter(id => sprites[id]) : null;
    if (ui.curColor != null) state.curColor = ui.curColor;
    if (ui.cellSize) state.cellSize = ui.cellSize;
    if (ui.editorBg) state.editorBg = ui.editorBg;
    if (ui.tool) state.tool = ui.tool;
    if (ui.outputFormat) state.outputFormat = ui.outputFormat;
    if (ui.mirror) state.mirror = ui.mirror;
    if (typeof ui.shapeFill === 'boolean') state.shapeFill = ui.shapeFill;
    if (typeof ui.fillVisible === 'boolean') state.fillVisible = ui.fillVisible;
    if (typeof ui.pixelPerfect === 'boolean') state.pixelPerfect = ui.pixelPerfect;
    if (ui.tileMode === 'pixel' || ui.tileMode === 'tiles') state.tileMode = ui.tileMode;
    if (ui.tileAuto === 'auto' || ui.tileAuto === 'manual') state.tileAuto = ui.tileAuto;
    if (typeof ui.onion === 'boolean') state.onion = ui.onion;
    if (ui.timeline) state.tlOpts = normalizeTlOpts(ui.timeline);
    if (typeof ui.showGuides === 'boolean') state.showGuides = ui.showGuides;
    if (typeof ui.lockGuides === 'boolean') state.lockGuides = ui.lockGuides;
    applyPanelStates(ui.panels);

    return { loaded: true, migrated, note, fullscreen: !!ui.fullscreen };
  } catch (e) {
    console.warn('spritebit: Laden fehlgeschlagen, starte frisch', e);
    return { loaded: false };
  }
}

// Alles wegwerfen und Seite neu laden (= Werkseinstellungen).
export async function clearStorage() {
  disableSaving(); // sonst schreibt beforeunload alles sofort wieder zurück
  if (backend === 'idb') {
    // Sicherung und Rettung bleiben; `migrated` verhindert, dass der alte
    // localStorage-Stand beim Neustart wieder hereingeholt wird.
    try { await writeBatch({ kvDel: ['project', 'import'], kv: { migrated: true }, clearSprites: true }); }
    catch (e) { console.warn('spritebit: Zurücksetzen fehlgeschlagen', e); }
    try { localStorage.removeItem(EMERGENCY_KEY); } catch {}
  }
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  location.reload();
}

// Wechselt man weg (anderer Tab, Handy-App in den Hintergrund), sofort
// speichern statt auf den Debouncer zu warten — danach wird eine Seite oft
// ohne weitere Vorwarnung beendet.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || backend !== 'idb' || _saveDisabled) return;
    if (changeSeq === savedSeq) return;
    clearTimeout(_saveTimer);
    writeIdb();
  });
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
  const base = projectName().replace(/[^a-zA-Z0-9_-]/g, '_') || 'spritebit';
  const filename = `${base}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const result = await saveBlob(blob, filename);
  flashSaved();
  showInfoToast(result.fallback
    ? t('file.downloadedTip', { name: filename })
    : (result.dir ? t('file.savedIn', { name: filename, dir: result.dir })
                  : t('file.saved', { name: filename })));
}

// ────────────────────────────────────────────────────────────────────
// Einzelne Sprites speichern / zum Projekt hinzufügen
// ────────────────────────────────────────────────────────────────────
// Eine Sprite-Datei (.bitty) ist eine Projektdatei mit genau einem Sprite
// und `kind: 'sprite'` — dazu seine eigene Palette (falls er keine
// eingebaute hat) samt Materialien. Die Desktop-App schreibt und liest
// dasselbe (spritebit-rs, io.rs export_sprite).

/**
 * Inhalt einer Sprite-Datei (.bitty) für Sprite `id`: der Sprite samt seiner
 * eigenen Palette, ihren Materialien und Farbnamen. Die Desktop-App liest und
 * schreibt dasselbe (tests/interop/).
 */
export function spritePayload(id) {
  const sp = sprites[id];
  if (!sp) return null;
  const only = store => (store[sp.palette] ? { [sp.palette]: store[sp.palette] } : {});
  return {
    version: SCHEMA_VERSION,
    kind: 'sprite',
    sprites: { [id]: serializeSprite(sp) },
    customPalettes: only(customPalettes),
    paletteMaterials: only(paletteMaterials),
    paletteColorNames: only(paletteColorNames),
    ui: { curSprite: id },
  };
}

/** Nur den aktuellen Sprite als Datei sichern. */
export async function saveSpriteToFile() {
  const sp = sprites[state.curSprite];
  if (!sp) return;
  const payload = spritePayload(state.curSprite);
  // .bitty: innen JSON wie eine Projektdatei — die Desktop-App liest sie genauso.
  const filename = `${(sp.name || 'sprite').replace(/[^a-zA-Z0-9_-]/g, '_')}.bitty`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const result = await saveBlob(blob, filename);
  showInfoToast(result.fallback
    ? t('file.downloadedTip', { name: filename })
    : (result.dir ? t('file.savedIn', { name: filename, dir: result.dir })
                  : t('file.saved', { name: filename })));
}

/** Den aktuellen Sprite als Aseprite-Datei (js/aseprite.js) sichern. */
export async function saveAseToFile() {
  const sp = sprites[state.curSprite];
  if (!sp) return;
  const bytes = await writeAse(sp, getPaletteByName(sp.palette));
  const filename = `${(sp.name || 'sprite').replace(/[^a-zA-Z0-9_-]/g, '_')}.aseprite`;
  const result = await saveBlob(new Blob([/** @type {BlobPart} */ (bytes)], { type: 'application/octet-stream' }), filename);
  showInfoToast(result.fallback
    ? t('file.downloadedTip', { name: filename })
    : (result.dir ? t('file.savedIn', { name: filename, dir: result.dir })
                  : t('file.saved', { name: filename })));
}

const isAse = file => /\.(aseprite|ase)$/i.test(file.name);

/** Aseprite-Datei lesen und als Sprite dazunehmen. onDone(ids), onError(text). */
function addAseFile(file, onDone, onError) {
  file.arrayBuffer()
    .then(buf => readAse(buf, file.name.replace(/\.[^.]+$/, '')))
    .then(p => {
      const ids = addSpritesFromPayload(p);
      if (ids.length) onDone(ids); else if (onError) onError(t('file.badProject'));
    }, e => {
      if (!onError) return;
      onError(e?.code === 'tooBig' ? t('file.aseBig', { size: e.message })
        : e?.code === 'notAse' ? t('file.aseNot')
        : t('file.aseBad', { why: e?.message || '' }));
    });
}

const samePal = (a, b) => JSON.stringify(completePalette(a)) === JSON.stringify(completePalette(b));

/**
 * Sprites aus einer gelesenen Datei (Sprite- oder Projektdatei) zum Projekt
 * hinzufügen — ohne etwas zu ersetzen. Gleiche Namen bekommen eine Nummer
 * (makeSpriteId); eine gleichnamige, aber andere eigene Palette bekommt
 * einen neuen Namen, und die Sprites zeigen auf ihn.
 * @returns {string[]} die neuen Sprite-IDs (leer = nichts Brauchbares darin)
 */
export function addSpritesFromPayload(p) {
  if (!p || typeof p !== 'object' || !p.sprites || typeof p.sprites !== 'object') return [];
  // Paletten zuerst: alter Name → Name im Projekt
  const rename = {};
  for (const [name, pal] of Object.entries(p.customPalettes || {})) {
    if (!pal || typeof pal !== 'object') continue;
    let target = name;
    // Auch eine eingebaute Palette gleichen Namens nicht überschreiben —
    // sonst änderten sich alle Sprites, die sie benutzen.
    if (paletteExists(name) && !samePal(getPaletteByName(name), pal)) {
      let i = 2;
      while (paletteExists(`${name}_${i}`)) i++;
      target = `${name}_${i}`;
    }
    if (!customPalettes[target]) customPalettes[target] = completePalette(pal);
    rename[name] = target;
    const mats = p.paletteMaterials?.[name];
    if (mats && typeof mats === 'object' && !paletteMaterials[target]) {
      const clean = {};
      for (const [i, m] of Object.entries(mats)) if (MATERIALS.includes(m)) clean[i] = m;
      if (Object.keys(clean).length) paletteMaterials[target] = clean;
    }
    const names = cleanColorNames(p.paletteColorNames?.[name]);
    if (names && !paletteColorNames[target]) paletteColorNames[target] = names;
  }
  const ids = [];
  for (const [key, sp] of Object.entries(p.sprites)) {
    const frames = sp && readFrames(sp);
    if (!frames) continue;
    const name = typeof sp.name === 'string' && sp.name ? sp.name : key;
    const pal = rename[sp.palette] || sp.palette;
    const id = makeSpriteId(name);
    sprites[id] = makeSprite({
      name,
      palette: typeof pal === 'string' && paletteExists(pal) ? pal : DEFAULT_PALETTE,
      frames,
      fps: sp.fps,
      frame: sp.frame,
      layers: Array.isArray(sp.layers) ? sp.layers : null,
      layer: sp.layer,
      guides: sp.guides,
      tags: sp.tags,
    });
    ids.push(id);
  }
  return ids;
}

/** Datei lesen und ihre Sprites hinzufügen. onDone(ids), onError(text). */
export function addSpritesFromFile(file, onDone, onError) {
  if (isAse(file)) { addAseFile(file, onDone, onError); return; }
  const reader = new FileReader();
  reader.onload = () => {
    let ids = [];
    try { ids = addSpritesFromPayload(JSON.parse(/** @type {string} */ (reader.result))); } catch { ids = []; }
    if (ids.length) onDone(ids); else if (onError) onError(t('file.badProject'));
  };
  reader.onerror = () => { if (onError) onError(t('file.readFailed')); };
  reader.readAsText(file);
}

// JSON-Projektdatei einlesen. Wird validiert und (nach Migration beim nächsten
// Load) in den Storage geschrieben; danach Reload für einen sauberen Start.
// Eine Sprite-Datei (kind: 'sprite') ersetzt das Projekt nicht, sie kommt
// dazu — onAdded(ids) übernimmt dann das Anzeigen.
export function loadFromFile(file, onError, onAdded = null) {
  // Aseprite: ein Sprite — kommt dazu wie eine .bitty-Datei.
  if (isAse(file) && onAdded) { addAseFile(file, onAdded, onError); return; }
  const reader = new FileReader();
  reader.onload = () => {
    // readAsText (unten) liefert immer einen String, nie einen ArrayBuffer.
    const text = /** @type {string} */ (reader.result);
    try {
      const p = JSON.parse(text);
      if (!p || typeof p !== 'object' || (!p.sprites && !p.grids)) {
        throw new Error('kein Sprite-Projekt');
      }
      if (p.kind === 'sprite' && onAdded) {
        const ids = addSpritesFromPayload(p);
        if (!ids.length) throw new Error('kein Sprite darin');
        onAdded(ids);
        return;
      }
      // Ein Projekt aus einer Datei wird ein eigenes Projekt in der Liste —
      // das geöffnete bleibt, wie es ist (vorher wurde es überschrieben).
      const fromFile = file.name.replace(/\.[^.]+$/, '');
      createProject(typeof p.name === 'string' && p.name ? p.name : fromFile, text);
    } catch {
      if (onError) onError(t('file.badProject'));
    }
  };
  reader.onerror = () => { if (onError) onError(t('file.readFailed')); };
  reader.readAsText(file);
}
