// Tests für die Offline-Dateiliste in sw.js — laufen ohne Abhängigkeiten:
//   node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const list = [...sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)]
  .map((m) => m[1]);

test('jede Datei in PRECACHE existiert', () => {
  for (const f of list) {
    if (f === './') continue;
    assert.ok(existsSync(join(ROOT, f)), `fehlt auf der Platte: ${f}`);
  }
});

test('alle Module und Seiten sind offline verfügbar', () => {
  const js = readdirSync(join(ROOT, 'js')).map((n) => 'js/' + n);
  for (const f of ['./', 'index.html', 'editor.html', 'styles.css', 'vendor/jspdf.umd.min.js', ...js]) {
    assert.ok(list.includes(f), `nicht in PRECACHE: ${f} — python tools/make_sw.py ausführen`);
  }
});

test('Seiten laden nichts von fremden Servern', () => {
  for (const page of ['index.html', 'editor.html']) {
    const html = readFileSync(join(ROOT, page), 'utf8');
    assert.doesNotMatch(html, /<script[^>]+src="https?:/, `${page} lädt ein Skript von außen`);
    assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"[^>]+href="https?:/, `${page} lädt CSS von außen`);
  }
});
