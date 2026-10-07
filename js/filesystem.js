// ════════════════════════════════════════════════════════════════════
// FILESYSTEM — Speicherort wählen & merken (File System Access API)
// ════════════════════════════════════════════════════════════════════
// Lässt den Nutzer EINMAL einen Ziel-Ordner wählen. Der DirectoryHandle
// wird in IndexedDB persistiert, damit PNG/PDF/JSON-Saves danach still in
// diesen Ordner geschrieben werden — ohne jedes Mal neu zu fragen.
//
// Browser ohne File System Access API (Firefox/Safari) fallen automatisch
// auf den klassischen <a download>-Download in den Download-Ordner zurück.

const DB_NAME  = 'wb_sprite_tester_fs';
const STORE    = 'handles';
const DIR_KEY  = 'saveDir';

// ── Feature-Detection ────────────────────────────────────────────────
export function supportsFsAccess() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

// ── IndexedDB (Handles sind nur via IndexedDB persistierbar, nicht JSON) ─
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** @returns {Promise<void>} */
async function idbSet(key, val) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/** @returns {Promise<void>} */
async function idbDel(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ── Berechtigung prüfen / anfordern ──────────────────────────────────
// Muss aus einer User-Geste (Klick) heraus aufgerufen werden, sonst
// verweigert der Browser requestPermission().
async function verifyPermission(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

let _cachedDir = null; // In-Memory-Cache für die aktuelle Session

// Gemerkten Ordner laden (ohne Permission-Prompt) — nur für UI-Anzeige.
export async function getStoredDirName() {
  if (!supportsFsAccess()) return null;
  try {
    if (!_cachedDir) _cachedDir = await idbGet(DIR_KEY);
    return _cachedDir ? _cachedDir.name : null;
  } catch {
    return null;
  }
}

// Liefert einen schreibbaren DirectoryHandle.
//   promptIfMissing=true → öffnet den Ordner-Picker, falls noch keiner
//   gewählt ist (oder die Berechtigung verloren ging).
// Gibt null zurück, wenn kein Ordner verfügbar ist (→ Download-Fallback).
export async function getSaveDirectory({ promptIfMissing = false } = {}) {
  if (!supportsFsAccess()) return null;

  if (!_cachedDir) {
    try { _cachedDir = await idbGet(DIR_KEY); } catch { _cachedDir = null; }
  }

  if (_cachedDir) {
    if (await verifyPermission(_cachedDir)) return _cachedDir;
    // Berechtigung verweigert/verloren → wie kein Ordner behandeln
    _cachedDir = null;
  }

  if (promptIfMissing) return pickSaveDirectory();
  return null;
}

// Ordner-Picker öffnen, Auswahl persistieren und zurückgeben.
// Muss aus einer User-Geste heraus aufgerufen werden.
export async function pickSaveDirectory() {
  if (!supportsFsAccess()) return null;
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'sprite-save-dir' });
    if (!(await verifyPermission(handle))) return null;
    _cachedDir = handle;
    await idbSet(DIR_KEY, handle);
    return handle;
  } catch (e) {
    // AbortError = Nutzer hat den Dialog abgebrochen → still ignorieren
    if (e && e.name !== 'AbortError') console.warn('Ordnerauswahl fehlgeschlagen', e);
    return null;
  }
}

// Gemerkten Ordner vergessen (zurück zum Download-Fallback).
export async function clearSaveDirectory() {
  _cachedDir = null;
  try { await idbDel(DIR_KEY); } catch {}
}

// Klassischer Download als Fallback.
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

// Blob speichern. Schreibt in den gewählten Ordner; falls keiner verfügbar
// ist (oder ein Schreibfehler auftritt), klassischer Download.
// Rückgabe: { dir: <Ordnername|null>, fallback: <bool> }
export async function saveBlob(blob, filename, { promptIfMissing = true } = {}) {
  const dir = await getSaveDirectory({ promptIfMissing });
  if (dir) {
    try {
      const fileHandle = await dir.getFileHandle(filename, { create: true });
      const writable   = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { dir: dir.name, fallback: false };
    } catch (e) {
      console.warn('Schreiben in Ordner fehlgeschlagen — Download-Fallback', e);
    }
  }
  downloadBlob(blob, filename);
  return { dir: null, fallback: true };
}
