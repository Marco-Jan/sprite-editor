// ════════════════════════════════════════════════════════════════════
// PROJECTS — mehrere Projekte im Browser
// ════════════════════════════════════════════════════════════════════
// Jedes Projekt hat seine eigene IndexedDB-Datenbank (js/idb.js) — bzw. ohne
// IndexedDB seine eigenen localStorage-Schlüssel. Das erste Projekt („main")
// ist die Datenbank, in der schon immer gespeichert wurde: ein bestehender
// Stand wird so ohne Umzug zum ersten Projekt der Liste.
//
// Die Liste selbst ist klein und liegt in localStorage — sie muss beim Start
// sofort (synchron) wissen, welches Projekt dran ist:
//
//   { current: 'main', list: [{ id, name, updated, count }] }
//
// Gewechselt wird per Neustart der Seite (storage.js switchProject): so gilt
// beim Laden immer genau ein Projekt, und nichts kann sich vermischen.
// Reine Rechnung, ohne DOM — getestet in tests/projects.test.js.

export const MAIN = 'main';
export const REGISTRY_KEY = 'spritebit_projects';
const LEGACY_KEY = 'wb_sprite_tester_v1';

/** @typedef {{ id: string, name: string, updated: number, count: number }} ProjectEntry */
/** @typedef {{ current: string, list: ProjectEntry[] }} Registry */

/** Liste aus gespeichertem Text — Unbrauchbares fällt weg, „main" gibt es immer.
 *  @param {string | null} text @returns {Registry} */
export function parseRegistry(text) {
  let raw = null;
  try { raw = JSON.parse(text || 'null'); } catch {}
  const list = [];
  const seen = new Set();
  for (const e of Array.isArray(raw?.list) ? raw.list : []) {
    if (!e || typeof e.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(e.id) || seen.has(e.id)) continue;
    seen.add(e.id);
    list.push({
      id: e.id,
      name: typeof e.name === 'string' ? e.name.slice(0, 60) : '',
      updated: Number.isFinite(e.updated) ? e.updated : 0,
      count: Number.isInteger(e.count) && e.count >= 0 ? e.count : 0,
    });
  }
  if (!seen.has(MAIN)) list.unshift({ id: MAIN, name: '', updated: 0, count: 0 });
  const current = typeof raw?.current === 'string' && seen.has(raw.current) ? raw.current : (list[0]?.id || MAIN);
  return { current, list };
}

/** @returns {Registry} */
export function readRegistry() {
  let text = null;
  try { text = localStorage.getItem(REGISTRY_KEY); } catch {}
  return parseRegistry(text);
}

/** @param {Registry} r */
export function writeRegistry(r) {
  try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(r)); } catch (e) { console.warn('spritebit: Projektliste nicht gespeichert', e); }
}

/** Neue, noch nicht vergebene Kennung. @param {Registry} r */
export function newProjectId(r, rnd = Math.random) {
  for (;;) {
    const id = 'p' + Math.floor(rnd() * 36 ** 6).toString(36).padStart(6, '0');
    if (!r.list.some(e => e.id === id)) return id;
  }
}

/** Name, der in der Liste noch frei ist („Projekt 2" …).
 *  @param {Registry} r @param {string} base */
export function freeName(r, base) {
  const b = base.trim() || 'Projekt';
  const taken = new Set(r.list.map(e => e.name));
  if (!taken.has(b)) return b;
  for (let k = 2; ; k++) if (!taken.has(`${b} ${k}`)) return `${b} ${k}`;
}

/** Wo ein Projekt liegt. */
export const dbNameOf = id => (id === MAIN ? 'spritebit' : 'spritebit-' + id);
export const storageKeyOf = id => (id === MAIN ? LEGACY_KEY : LEGACY_KEY + '_' + id);
export const emergencyKeyOf = id => (id === MAIN ? 'spritebit_emergency' : 'spritebit_emergency_' + id);

/** Neueste zuerst; das geöffnete steht immer oben.
 *  @param {Registry} r @returns {ProjectEntry[]} */
export function sortedList(r) {
  return [...r.list].sort((a, b) => (a.id === r.current ? -1 : b.id === r.current ? 1 : b.updated - a.updated));
}
