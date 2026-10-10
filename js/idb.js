// ════════════════════════════════════════════════════════════════════
// IDB — eine kleine Hülle um IndexedDB für den Speicherstand
// ════════════════════════════════════════════════════════════════════
// Je Projekt eine Datenbank (js/projects.js dbNameOf), darin zwei Bereiche:
//   kv       Projekt (Paletten, Einstellungen, Reihenfolge der Sprites),
//            Sicherung, Rettung, ein wartender Import
//   sprites  je Sprite ein Eintrag, gepackt (js/pack.js)
//
// IndexedDB arbeitet asynchron — die Seite wartet nicht aufs Speichern.
// Mehrere Änderungen in EINER Transaktion: entweder kommt alles an oder
// nichts, ein halber Stand ist nicht möglich.

let dbName = 'spritebit';
const DB_VERSION = 1;

/** @type {Promise<IDBDatabase>|null} */
let dbp = null;

/** Welches Projekt gespeichert wird — vor dem ersten Zugriff (storage.js). */
export function useDb(name) {
  dbName = name;
  dbp = null;
}

/** @param {string} name */
function openNamed(name) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB fehlt')); return; }
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of ['kv', 'sprites']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blockiert'));
  });
}

export function openDb() {
  if (dbp) return dbp;
  dbp = openNamed(dbName);
  dbp.catch(() => { dbp = null; });
  return dbp;
}

/** Datenbank eines anderen Projekts löschen. @param {string} name */
export function deleteDb(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve(undefined);
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(undefined); // wird gelöscht, sobald nichts sie mehr offen hält
  });
}

/** Ein Projekt ganz in eine andere (leere) Datenbank kopieren — Duplizieren.
 *  `kv` überschreibt danach einzelne Einträge (z. B. den Namen).
 *  @param {string} from @param {string} to @param {Record<string, any>} [kv] */
export async function copyDb(from, to, kv = {}) {
  const src = await openNamed(from);
  const dst = await openNamed(to);
  const rtx = src.transaction(['kv', 'sprites']);
  const all = async name => {
    const s = rtx.objectStore(name);
    const [keys, vals] = await Promise.all([result(s.getAllKeys()), result(s.getAll())]);
    return keys.map((k, i) => [k, vals[i]]);
  };
  const [k, sp] = await Promise.all([all('kv'), all('sprites')]);
  const wtx = dst.transaction(['kv', 'sprites'], 'readwrite');
  for (const [key, val] of k) wtx.objectStore('kv').put(val, key);
  for (const [key, val] of Object.entries(kv)) wtx.objectStore('kv').put(val, key);
  for (const [key, val] of sp) wtx.objectStore('sprites').put(val, key);
  await done(wtx);
  src.close();
  dst.close();
}

/** Inhalt einer Datenbank ersetzen, ohne sie zu öffnen zu lassen — für ein
 *  neues Projekt: der Startinhalt als wartender Import.
 *  @param {string} name @param {Record<string, any>} kv */
export async function seedDb(name, kv) {
  const db = await openNamed(name);
  const tx = db.transaction(['kv'], 'readwrite');
  for (const [key, val] of Object.entries(kv)) tx.objectStore('kv').put(val, key);
  await done(tx);
  db.close();
}

const result = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const done = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve(undefined);
  tx.onabort = tx.onerror = () => reject(tx.error || new Error('Transaktion abgebrochen'));
});

/** Alles lesen: { kv: Map, sprites: Map } */
export async function readAll() {
  const db = await openDb();
  const tx = db.transaction(['kv', 'sprites']);
  const all = async name => {
    const s = tx.objectStore(name);
    const [keys, vals] = await Promise.all([result(s.getAllKeys()), result(s.getAll())]);
    return new Map(keys.map((k, i) => [k, vals[i]]));
  };
  const [kv, sprites] = await Promise.all([all('kv'), all('sprites')]);
  return { kv, sprites };
}

/**
 * Mehrere Änderungen in einer Transaktion.
 * @param {{kv?: Record<string, any>, kvDel?: string[], put?: Record<string, any>, del?: string[], clearSprites?: boolean}} w
 */
export async function writeBatch({ kv = {}, kvDel = [], put = {}, del = [], clearSprites = false }) {
  const db = await openDb();
  const tx = db.transaction(['kv', 'sprites'], 'readwrite');
  const k = tx.objectStore('kv'), s = tx.objectStore('sprites');
  if (clearSprites) s.clear();
  for (const [key, val] of Object.entries(kv)) k.put(val, key);
  for (const key of kvDel) k.delete(key);
  for (const [id, rec] of Object.entries(put)) s.put(rec, id);
  for (const id of del) s.delete(id);
  await done(tx);
}
