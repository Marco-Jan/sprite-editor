// ════════════════════════════════════════════════════════════════════
// PROJECTSUI — das Fenster „Projekte“ (Datei → Projekte …)
// ════════════════════════════════════════════════════════════════════
// Oben ein neues Projekt mit Namen anlegen, darunter alle Projekte dieses
// Browsers: öffnen, umbenennen, duplizieren, löschen. Die Arbeit machen
// storage.js (Speichern, Wechseln) und projects.js (die Liste).
import { readRegistry, sortedList } from './projects.js';
import { createProject, switchProject, renameProject, duplicateProject, deleteProject, projectName, currentProjectId, syncCount } from './storage.js';
import { t, tn, getLang, onLangChange } from './i18n.js';
import { iconSvg } from './icons.js';
import { showConfirmToast } from './toast.js';

/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);

/** Projektname in der Kopfzeile. */
function syncTitle() {
  const b = $('project-btn');
  if (b) b.textContent = projectName();
}

/** @param {number} ms */
function when(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString(getLang() === 'en' ? 'en-GB' : 'de-AT', { dateStyle: 'medium', timeStyle: 'short' });
}

function iconButton(icon, title, onClick, disabled = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.innerHTML = iconSvg(icon);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function render() {
  const list = $('proj-list');
  if (!list) return;
  const reg = readRegistry();
  const cur = currentProjectId();
  list.replaceChildren();
  for (const e of sortedList(reg)) {
    const row = document.createElement('div');
    row.className = 'proj-row' + (e.id === cur ? ' is-current' : '');
    const info = document.createElement('div');
    info.className = 'proj-info';
    const name = document.createElement('span');
    name.className = 'proj-name';
    name.textContent = e.name || t('proj.unnamed');
    const meta = document.createElement('span');
    meta.className = 'proj-meta';
    meta.textContent = [tn('proj.sprites', e.count, { n: e.count }), when(e.updated)].filter(Boolean).join(' · ');
    info.append(name, meta);

    const acts = document.createElement('div');
    acts.className = 'proj-acts';
    if (e.id === cur) {
      const badge = document.createElement('span');
      badge.className = 'proj-badge';
      badge.textContent = t('proj.opened');
      acts.append(badge);
    } else {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'btn btn--sm btn--primary';
      open.textContent = t('proj.open');
      open.addEventListener('click', () => switchProject(e.id));
      acts.append(open);
    }
    acts.append(
      iconButton('pencil', t('proj.rename'), () => startRename(row, e.id, e.name)),
      iconButton('copy', t('proj.dup'), async () => { syncCount(); await duplicateProject(e.id); render(); }),
      iconButton('trash', e.id === cur ? t('proj.delCurrent') : t('proj.del'), () => {
        showConfirmToast(t('proj.delConfirm', { name: e.name || t('proj.unnamed') }), async () => { await deleteProject(e.id); render(); }, t('proj.delOk'));
      }, e.id === cur),
    );
    row.append(info, acts);
    list.append(row);
  }
}

function startRename(row, id, old) {
  const name = row.querySelector('.proj-name');
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'input input--sm';
  inp.maxLength = 60;
  inp.value = old;
  name.replaceWith(inp);
  inp.focus();
  inp.select();
  let done = false;
  const finish = ok => {
    if (done) return;
    done = true;
    if (ok && inp.value.trim()) renameProject(id, inp.value);
    render();
    syncTitle();
  };
  inp.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') finish(true);
    if (ev.key === 'Escape') { ev.stopPropagation(); finish(false); }
  });
  inp.addEventListener('blur', () => finish(true));
}

/** Das Fenster öffnen; `focusNew`: gleich den Namen fürs neue Projekt tippen. */
export function openProjects(focusNew = false) {
  render();
  $('projects-modal-overlay').classList.add('open');
  if (focusNew) { const n = $('proj-new-name'); n.value = ''; n.focus(); }
}

export function initProjectsUi() {
  const overlay = $('projects-modal-overlay');
  if (!overlay) return;
  $('projects-close').addEventListener('click', () => overlay.classList.remove('open'));
  $('projects-btn').addEventListener('click', () => openProjects());
  $('new-project-btn').addEventListener('click', () => openProjects(true));
  $('project-btn')?.addEventListener('click', () => openProjects());
  const create = () => createProject($('proj-new-name').value.trim());
  $('proj-new-btn').addEventListener('click', create);
  $('proj-new-name').addEventListener('keydown', e => { if (e.key === 'Enter') create(); });
  syncTitle();
  syncCount();
  onLangChange(() => { syncTitle(); if (overlay.classList.contains('open')) render(); });
}
