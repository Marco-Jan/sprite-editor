# Sprite Editor

Pixel-Art-Editor mit Foto-Vorlage. Reines Frontend — HTML, CSS und ES-Module, kein Build.

Ursprünglich als Tool für Hund-/Katze-Sprites gebaut, inzwischen komplett motiv-frei:
Sprites und Paletten sind generisch, es gibt keine eingebauten Motive mehr.

---

## Schnellstart

ES-Module brauchen HTTP — `file://` funktioniert nicht:

```
python -m http.server
```

Dann `http://localhost:8000/` öffnen. PDF-Export lädt jsPDF vom CDN und braucht dafür
einmalig Internet; alles andere läuft offline.

---

## Aufbau der Oberfläche

```
┌── Kopfzeile: Projekt sichern/öffnen, Speicherort, Hilfe ──────────┐
├───────────┬───────────────────────────────────┬──────────────────┤
│ Sprites   │  Werkzeugleiste                   │ Farben           │
│ Code &    │  Farb-Schnellwahl (0–9)           │ Schablone        │
│ Export    │  Zeichenfläche                    │ Aufräumen        │
│           │  Statuszeile                      │                  │
└───────────┴───────────────────────────────────┴──────────────────┘
```

Alle Panels lassen sich zuklappen; der Zustand wird gespeichert.

---

## Palettensystem

Eine Palette ist ein Mapping **Index → Hex-Farbe**. Index `0` ist immer transparent,
`1`–`9` sind frei belegbar. Es gibt keine an ein Motiv gebundenen Slots.

| Index | Konvention (kein Zwang) |
|---|---|
| 0 | Transparent |
| 1–4 | Tonleiter hell → dunkel |
| 5 | Outline / Kontur |
| 6–9 | Akzent A · Highlight · Akzent B · Akzent C |

**Eingebaut**: `graustufen`, `golden`, `braun`, `kohle`, `creme`, `schiefer`, `orange`,
`tinte`, `schnee` — reine Farbschemata, schreibgeschützt.

**Eigene Paletten**: über `+ Palette` neu anlegen oder mit `Kopie bearbeiten` aus einer
eingebauten ableiten. Danach sind die Swatches rechts direkt anklickbar — eine
Farbänderung färbt alle Pixel mit diesem Index sofort um.

Jeder Sprite merkt sich seine eigene Palette.

---

## Import / Export

### TypeScript-Export

Das Code-Feld erzeugt ein `number[][]`. Mit *Palette in den Code schreiben* kommt ein
`Record<number, string>`-Block dazu.

Freie Farben (Pipette, Rohfarben-Trace) passen nicht in `number[][]` — sie bekommen
Indizes oberhalb der Palette (10, 11, …) und landen im Palettenblock. Der Round-Trip
Export → Import ist damit verlustfrei.

### Import

`Import…` liest sowohl eingefügten Text als auch eine Datei (`.ts`, `.js`, `.json`, `.txt`).
Erkannt werden:

- das `number[][]`-Grid (auch mit abschließenden Kommas, ungleich langen Zeilen, Hex-Strings)
- ein Palettenblock in beliebiger Schreibweise (`'#abc'`, `"#AABBCC"`, mit oder ohne `Record<…>`)
- der Konstantenname als Sprite-Name

Ist eine Palette dabei, wird sie als eigene Palette angelegt und dem Sprite zugewiesen.
Indizes oberhalb von 9 werden wieder zu freien Farb-Pixeln.

Der Parser wertet **keinen** Code aus: der Array-Text wird gegen eine Zeichen-Whitelist
geprüft und mit `JSON.parse` gelesen.

### Bilder

- **PNG** transparent, Skalierung 1× bis 32×
- **PDF** mit eingebettetem PNG
- *Farb-Legende ins Bild* rendert die verwendeten Farben mit Hex-Codes unter den Sprite

---

## Schablone (Foto-Vorlage)

1. Bild laden, mit `Shift`+Linksklick ziehen positionieren
2. **Reduzieren auf N Farben** — Median-Cut, gibt flache Flächen statt Foto-Rauschen
3. **Bild → Palette** — macht aus den Bildfarben eine editierbare Palette
4. **Hintergrund entfernen**, **Glätten**, **Outline**
5. Reste von Hand säubern

Die Schablone überlebt einen Reload (eigener localStorage-Key).

---

## Tastenkürzel

| Taste | Wirkung |
|---|---|
| Linksklick | Malen (ziehen = durchgehend) |
| Rechtsklick | Löschen (ziehen = durchgehend) |
| `Alt` + Klick | Pipette auf das Grid |
| `Shift` halten | Schablone in den Vordergrund |
| `Shift` + Links + Ziehen | Schablone verschieben |
| `Shift` + Rechtsklick | Schablonen-Pipette (exakter Hex) |
| `0`–`9` | Farb-Index wählen |
| `P` `B` `S` `F` `E` `W` | Stift · Pinsel · Spray · Füllen · Radierer · Zauberstab |
| `Strg+Z` / `Strg+Y` | Rückgängig / Wiederholen |
| `Esc` | Dialog oder Vollbild schließen |

---

## Speichern

Alles liegt unter dem localStorage-Key `wb_sprite_tester_v1` (der Key blieb; das
Schema ist versioniert). Auto-Save 250 ms nach jeder Änderung, Force-Save beim
Tab-Schließen.

Für echte Backups **Projekt sichern** benutzen — das schreibt Sprites, Paletten und
UI-Zustand in eine JSON-Datei. Mit **Speicherort** lässt sich einmalig ein Zielordner
wählen (File System Access API); Browser ohne diese API fallen auf den normalen
Download zurück.

---

## Migration von der alten Version

Projekte aus der Hund/Katze-Version werden beim ersten Start automatisch umgestellt:

- **Eigene Sprites** werden übernommen.
- **Bearbeitete** Hund/Katze-Sprites werden als normale Sprites gerettet (erkannt über
  eine Prüfsumme gegen die Originale). Unveränderte Vorlagen fallen weg.
- **Eigene Paletten** aus den drei Tierart-Töpfen wandern in einen flachen Namensraum;
  bei Namenskollision bekommt die zweite ein Suffix (`neon`, `neon_2`).
- Alte Built-in-Namen werden abgebildet: `brown → braun`, `grey → schiefer`,
  `black` (Hund) `→ kohle`, `black` (Katze) `→ tinte`, `white → schnee`, `leer → graustufen`.

Ein Toast fasst nach der Migration zusammen, was passiert ist.

---

## Projekt-Struktur

```
sprite-editor/
├── index.html          ← Struktur, keine Inline-Styles
├── styles.css          ← Token-System + Komponenten
└── js/
    ├── data.js         ← Farb-Labels, eingebaute Paletten, Konstanten
    ├── state.js        ← Sprites, Paletten, UI-State + Lookups
    ├── storage.js      ← localStorage + Projekt-Datei
    ├── migrate.js      ← v1 (dog/cat) → v2 (generisch)
    ├── render.js       ← alle Render-Funktionen + Mal-Operationen
    ├── history.js      ← Undo/Redo pro Strich
    ├── sprites.js      ← anlegen, umbenennen, duplizieren, löschen
    ├── palettes.js     ← Paletten-Modal + Fork/Import
    ├── tsimport.js     ← TS-/JS-Parser (Grid + Palette)
    ├── template.js     ← Schablone: Upload, Drag, Pipette, Abtasten
    ├── spritefx.js     ← Median-Cut, Glätten, Outline, Zauberstab
    ├── export.js       ← PNG + PDF
    ├── filesystem.js   ← Speicherort merken (File System Access API)
    ├── toast.js        ← Confirm-/Info-Toast statt window.confirm
    └── app.js          ← Init, Events, Verdrahtung
```

### Abhängigkeiten

```
data.js
   ↑
state.js
   ↑
   ├─ render.js ← (data, state)
   ├─ migrate.js ← (data)
   ├─ tsimport.js ← (data)
   ├─ storage.js ← (state, data, migrate, filesystem, toast)
   ├─ history.js ← (state, data)
   └─ template/sprites/palettes/export/spritefx
                       ↑
                    app.js
```

`render.js` ruft Aktionen aus anderen Modulen nur über `renderCallbacks` auf, die
`app.js` verdrahtet — das hält den Graph zyklenfrei.

---

## Eigenheiten

- `file://` geht nicht — ES-Module brauchen HTTP.
- Inkognito-Modus verliert alles beim Tab-Schließen.
- localStorage-Limit ~5 MB; bei Überschreitung erscheint ein Hinweis-Toast.
- PDF braucht beim ersten Aufruf Internet (jsPDF vom CDN).
- Die Schablonen-Pipette ignoriert Stellen mit Alpha = 0.

---

## Lizenz

MIT
