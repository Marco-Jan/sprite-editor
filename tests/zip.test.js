// Tests für den ZIP-Schreiber (js/zip.js).
//
// Ein Archiv ist wie ein GIF: stimmt ein Versatz nicht, öffnet es gar nicht
// und man sieht beim Programmieren nicht, woran es lag. Geprüft wird die
// Struktur — und zur Sicherheit einmal gegen das Betriebssystem, das die
// Datei am Ende wirklich entpacken muss.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipFiles, crc32 } from '../js/zip.js';

const enc = s => new TextEncoder().encode(s);
const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

const WHEN = new Date(2026, 9, 7, 12, 30, 0);
const sample = () => zipFiles([
  { name: 'a.txt', data: enc('hallo') },
  { name: 'b.txt', data: enc('welt!') },
], WHEN);

test('CRC-32 stimmt mit den bekannten Werten überein', () => {
  assert.equal(crc32(enc('')), 0);
  assert.equal(crc32(enc('a')), 0xe8b7be43);
  assert.equal(crc32(enc('123456789')), 0xcbf43926);
});

test('das Archiv beginnt mit einem lokalen Kopf', () => {
  assert.equal(u32(sample(), 0), 0x04034b50);
});

test('das Archiv endet mit dem Ende-Zeichen und zählt seine Dateien', () => {
  const b = sample();
  const end = b.length - 22;
  assert.equal(u32(b, end), 0x06054b50);
  assert.equal(u16(b, end + 8), 2, 'Dateien auf dieser Diskette');
  assert.equal(u16(b, end + 10), 2, 'Dateien gesamt');
});

test('das zentrale Verzeichnis liegt dort, wo das Ende-Zeichen es angibt', () => {
  const b = sample();
  const end = b.length - 22;
  const at = u32(b, end + 16);
  const size = u32(b, end + 12);
  assert.equal(u32(b, at), 0x02014b50, 'Verzeichnis beginnt nicht an der angegebenen Stelle');
  assert.equal(at + size, end, 'Größe des Verzeichnisses passt nicht zum Ende-Zeichen');
});

test('jeder Verzeichnis-Eintrag zeigt auf seinen lokalen Kopf', () => {
  const b = sample();
  const end = b.length - 22;
  let at = u32(b, end + 16);
  for (let i = 0; i < 2; i++) {
    const local = u32(b, at + 42);
    assert.equal(u32(b, local), 0x04034b50, `Eintrag ${i} zeigt nicht auf einen lokalen Kopf`);
    at += 46 + u16(b, at + 28);
  }
});

test('Größen und Prüfsumme stehen im Kopf', () => {
  const b = zipFiles([{ name: 'a.txt', data: enc('hallo') }], WHEN);
  assert.equal(u32(b, 14), crc32(enc('hallo')));
  assert.equal(u32(b, 18), 5, 'komprimierte Größe');
  assert.equal(u32(b, 22), 5, 'rohe Größe');
  assert.equal(u16(b, 8), 0, 'Methode 0 — unkomprimiert');
});

test('ein leeres Archiv ist gültig', () => {
  const b = zipFiles([], WHEN);
  assert.equal(b.length, 22);
  assert.equal(u32(b, 0), 0x06054b50);
  assert.equal(u16(b, 10), 0);
});

test('Namen mit Umlauten kommen als UTF-8 durch', () => {
  const b = zipFiles([{ name: 'grün.txt', data: enc('x') }], WHEN);
  assert.equal(u16(b, 6) & 0x0800, 0x0800, 'UTF-8-Schalter fehlt');
  const nameLen = u16(b, 26);
  const name = new TextDecoder().decode(b.slice(30, 30 + nameLen));
  assert.equal(name, 'grün.txt');
});

// Der eigentliche Beweis: ein echter Entpacker kommt damit zurecht.
test('das Betriebssystem entpackt das Archiv', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'spritebit-zip-'));
  try {
    const file = join(dir, 'test.zip');
    writeFileSync(file, zipFiles([
      { name: 'eins.txt', data: enc('hallo') },
      { name: 'zwei.txt', data: enc('welt!') },
    ], WHEN));
    // Je nach System kann ein anderes Werkzeug ZIP: GNU tar kann es NICHT,
    // bsdtar und unzip schon. Findet sich keines, wird der Test übersprungen
    // statt falsch rot zu werden.
    const versuche = [
      ['unzip', ['-o', file, '-d', dir]],
      ['tar', ['-xf', file, '-C', dir]],
      ['C:/Windows/System32/tar.exe', ['-xf', file, '-C', dir]],
    ];
    const geschafft = versuche.some(([cmd, args]) => {
      try { execFileSync(cmd, args, { stdio: 'pipe' }); return true; } catch { return false; }
    });
    if (!geschafft) { t.skip('kein Entpacker auf diesem System'); return; }
    assert.equal(readFileSync(join(dir, 'eins.txt'), 'utf8'), 'hallo');
    assert.equal(readFileSync(join(dir, 'zwei.txt'), 'utf8'), 'welt!');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
