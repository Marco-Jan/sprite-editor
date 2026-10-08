// ════════════════════════════════════════════════════════════════════
// IDB — eine kleine Hülle um IndexedDB für den Speicherstand
// ════════════════════════════════════════════════════════════════════
// Zwei Bereiche in der Datenbank „spritebit":
//   kv       Projekt (Paletten, Einstellungen, Reihenfolge der Sprites),
//            Sicherung, Rettung, ein wartender Import
//   sprites  je Sprite ein Eintrag, gepackt (js/pack.js)
//
// IndexedDB arbeitet asynchron — die Seite wartet nicht aufs Speichern.
// Mehrere Änderungen in EINER Transaktion: entweder kommt alles an oder
// nichts, ein halber Stand ist nicht möglich.

const DB_NAME = 'spritebit';
const DB_VERSION = 1;

/** @type {Promise<IDBDatabase>|null} */
let dbp = null;

export function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB fehlt')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of ['kv', 'sprites']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blockiert'));
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
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
