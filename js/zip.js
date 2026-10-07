// ════════════════════════════════════════════════════════════════════
// ZIP — mehrere Dateien in einem Archiv, ohne Bibliothek
// ════════════════════════════════════════════════════════════════════
// Gebraucht, wenn viele Frames auf einmal hinausgehen und der Browser keine
// Ordner kennt (Firefox, Safari). Einzeln heruntergeladen wären das vierzig
// Bestätigungen — die meisten Browser brechen nach der ersten ab.
//
// Gespeichert wird ohne Kompression (Methode 0, „stored"): PNG und PDF sind
// bereits komprimiert, ein zweiter Durchgang bringt nichts und kostet nur
// Code. Damit besteht das Archiv aus drei Teilen, die hier der Reihe nach
// geschrieben werden:
//
//   je Datei  lokaler Kopf + Inhalt
//   danach    ein Eintrag je Datei im zentralen Verzeichnis
//   zuletzt   das Ende-Zeichen mit Lage und Größe des Verzeichnisses
//
// zipFiles([{ name, data }]) → Uint8Array

/** @typedef {{name: string, data: Uint8Array}} ZipEntry */

// ── CRC-32, wie das ZIP-Format es verlangt ──────────────────────────
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Datum und Uhrzeit im MS-DOS-Format: Sekunden in Zweierschritten, Jahre ab
// 1980. Keiner schaut darauf, aber ohne gültige Werte meckern manche
// Entpacker.
function dosTime(d) {
  return ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
}
function dosDate(d) {
  return (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
}

/**
 * @param {ZipEntry[]} files
 * @param {Date} [now]   nur für Tests; sonst die aktuelle Zeit
 * @returns {Uint8Array}
 */
export function zipFiles(files, now = new Date()) {
  const enc = new TextEncoder();
  const time = dosTime(now), date = dosDate(now);
  const parts = [];        // die fertigen Byte-Blöcke in ihrer Reihenfolge
  const central = [];      // Einträge fürs zentrale Verzeichnis
  let offset = 0;          // Lage des nächsten lokalen Kopfes

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);

    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);   // lokaler Kopf
    head.setUint16(4, 20, true);           // benötigte Fassung: 2.0
    head.setUint16(6, 0x0800, true);       // Name ist UTF-8
    head.setUint16(8, 0, true);            // Methode 0 = unkomprimiert
    head.setUint16(10, time, true);
    head.setUint16(12, date, true);
    head.setUint32(14, crc, true);
    head.setUint32(18, data.length, true); // komprimiert …
    head.setUint32(22, data.length, true); // … und roh gleich groß
    head.setUint16(26, name.length, true);
    head.setUint16(28, 0, true);           // kein Zusatzfeld
    parts.push(new Uint8Array(head.buffer), name, data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);    // Verzeichnis-Eintrag
    dir.setUint16(4, 20, true);            // erzeugt mit 2.0
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, time, true);
    dir.setUint16(14, date, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint16(30, 0, true);            // kein Zusatzfeld
    dir.setUint16(32, 0, true);            // kein Kommentar
    dir.setUint16(34, 0, true);            // erste Diskette
    dir.setUint16(36, 0, true);            // interne Attribute
    dir.setUint32(38, 0, true);            // externe Attribute
    dir.setUint32(42, offset, true);       // wo der lokale Kopf steht
    central.push(new Uint8Array(dir.buffer), name);

    offset += 30 + name.length + data.length;
  }

  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);      // Ende des Verzeichnisses
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);         // Verzeichnis beginnt hier
  end.setUint16(20, 0, true);              // kein Archiv-Kommentar

  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of all) { out.set(b, at); at += b.length; }
  return out;
}

/**
 * Fertige ZIP-Datei als Blob.
 * @param {ZipEntry[]} files
 * @param {Date} [now]
 */
export function zipBlob(files, now) {
  // Ein Uint8Array ist ein gueltiger Blob-Teil; die Typen halten nur den
  // Sonderfall SharedArrayBuffer offen, den es hier nie gibt.
  const bytes = /** @type {BlobPart} */ (/** @type {unknown} */ (zipFiles(files, now)));
  return new Blob([bytes], { type: 'application/zip' });
}
