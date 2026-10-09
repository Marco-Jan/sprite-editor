// ════════════════════════════════════════════════════════════════════
// TABLIST — welche Sprites als Reiter offen sind
// ════════════════════════════════════════════════════════════════════
// Ein Reiter ist ein geöffneter Sprite. Schließen nimmt nur den Reiter weg;
// der Sprite bleibt im Projekt und öffnet sich wieder, sobald man ihn im
// Sprites-Panel anklickt. Der aktive Sprite hat immer einen Reiter, darum
// lässt sich der letzte nicht schließen.
//
// Reine Rechnung auf Listen von Sprite-IDs, ohne DOM — läuft auch unter
// Node (tests/tablist.test.js). Die Oberfläche steht in js/tabs.js.

/**
 * Reiter an den Projektstand anpassen: gelöschte Sprites fallen weg,
 * Doppelte auch, der aktive kommt hinten dazu, falls er fehlt.
 * @param {string[] | null} tabs  null = noch nie gesetzt → alle Sprites offen
 * @param {string[]} ids          alle Sprites des Projekts, in ihrer Reihenfolge
 * @param {string | null} cur
 * @returns {string[]}
 */
export function syncTabs(tabs, ids, cur) {
  const have = new Set(ids);
  const out = [];
  for (const id of tabs ?? ids) if (have.has(id) && !out.includes(id)) out.push(id);
  if (cur && have.has(cur) && !out.includes(cur)) out.push(cur);
  return out;
}

/**
 * Reiter schließen. Ist es der aktive, wird der rechte Nachbar aktiv
 * (am Ende der linke) — wie im Browser.
 * @returns {{ tabs: string[], cur: string | null }}
 */
export function closeTab(tabs, id, cur) {
  const i = tabs.indexOf(id);
  if (i < 0 || tabs.length <= 1) return { tabs, cur };
  const rest = tabs.filter(t => t !== id);
  return { tabs: rest, cur: id === cur ? rest[Math.min(i, rest.length - 1)] : cur };
}

/**
 * Reiter `id` vor `beforeId` setzen (null = ans Ende).
 * @returns {string[]}
 */
export function moveTab(tabs, id, beforeId) {
  if (id === beforeId || !tabs.includes(id)) return tabs;
  const rest = tabs.filter(t => t !== id);
  const j = beforeId ? rest.indexOf(beforeId) : -1;
  if (j < 0) rest.push(id); else rest.splice(j, 0, id);
  return rest;
}

/**
 * Nachbar-Reiter für Weiterschalten: +1 rechts, -1 links, rundum.
 * @returns {string | null}
 */
export function stepTab(tabs, cur, dir) {
  if (!tabs.length) return null;
  const i = tabs.indexOf(cur);
  if (i < 0) return tabs[0];
  return tabs[(i + dir + tabs.length) % tabs.length];
}
