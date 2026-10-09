// Tests für js/site-links.js: die Versionen an den Knöpfen der Startseite.
//
// Die Web-Version pflegt tools/deploy.py aus package.json. Ändert jemand nur
// eine der beiden Stellen von Hand, zeigt die Startseite still eine falsche
// Nummer an — das fällt hier auf.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(ROOT, f), 'utf8');

test('Web-Version auf der Startseite = package.json', () => {
  const pkg = JSON.parse(read('package.json')).version;
  const site = read('js/site-links.js').match(/\bweb:\s*'([^']*)'/)?.[1];
  assert.equal(site, pkg, 'python tools/deploy.py gleicht das ab');
});

test('Desktop-Version hat die Form 1.2.3', () => {
  const v = read('js/site-links.js').match(/\bdesktop:\s*'([^']*)'/)?.[1];
  assert.match(v, /^\d+\.\d+\.\d+$/);
});

test('jeder Knopf zum Editor bzw. Download trägt ein Versions-Schild', () => {
  const html = read('index.html');
  const knoepfe = [...html.matchAll(/<a\b[^>]*(?:href="editor\.html"|data-link="download")[^>]*>[\s\S]*?<\/a>/g)].map(m => m[0]);
  assert.ok(knoepfe.length >= 6, `nur ${knoepfe.length} Knöpfe gefunden`);
  for (const k of knoepfe) assert.match(k, /data-version="(web|desktop)"/, k.slice(0, 80));
});
