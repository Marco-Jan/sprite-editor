# spritebit

Pixel-Art-Editor mit Foto-Vorlage. Reines Frontend — HTML, CSS und ES-Module, kein Build.

Ursprünglich als Tool für Hund-/Katze-Sprites gebaut, inzwischen komplett motiv-frei:
Sprites und Paletten sind generisch, es gibt keine eingebauten Motive mehr.

---

## Schnellstart

ES-Module brauchen HTTP — `file://` funktioniert nicht:

```
python -m http.server
```

Dann `http://localhost:8000/` öffnen — das ist die Startseite, der Editor liegt unter
`editor.html`. Alles läuft ohne Internet, auch der PDF-Export (jsPDF liegt in `vendor/`).

---

## Offline-Modus (PWA)

Wer Startseite oder Editor einmal online geöffnet hat, kann danach offline weiterarbeiten.
Der Service Worker (`sw.js`) legt beim ersten Besuch die ganze App im Browser-Cache ab.
Chrome und Edge bieten in der Adressleiste „Installieren“ an, danach startet der Editor wie
eine eigene App.

- **Online** lädt jede Datei frisch vom Server und aktualisiert dabei den Cache. Nach einem
  Deploy bekommt man also beim nächsten Neuladen die neue Version.
- **Offline**, oder wenn der Server länger als 4 Sekunden nicht antwortet, kommt die Datei
  aus dem Cache.
- Projekte liegen wie immer im `localStorage` bzw. in der Projektdatei. Mit dem Cache haben
  sie nichts zu tun.

Welche Dateien vorab in den Cache kommen, steht in der `PRECACHE`-Liste von `sw.js`. Die
Liste wird erzeugt, nicht von Hand gepflegt. **Nach neuen, umbenannten oder gelöschten
Dateien:**

```
python tools/make_sw.py           # Liste neu schreiben
python tools/make_sw.py --check   # nur prüfen
```

`tests/sw.test.js` schlägt fehl, wenn ein Modul in der Liste fehlt oder eine Seite wieder
etwas von einem fremden Server lädt.

Zum Testen: DevTools → Application → Service Workers zeigt den Worker. Unter Network auf
„Offline“ stellen und neu laden.

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

**Eingebaut, neutral**: `graustufen`, `golden`, `braun`, `kohle`, `creme`, `schiefer`,
`orange`, `tinte`, `schnee` — reine Farbschemata, schreibgeschützt.

**Eingebaut, Helden**: `blitz`, `klempner`, `igel`, `held`, `roboter`, `puff`, `geist`,
`ninja` — Farbschemata im Geist bekannter Spiel- und Comicfiguren. Die Töne sind so
gewählt, dass die Figur wiedererkennbar wird; die Namen sind beschreibend statt
geliehen. Alle neun Slots sind belegt, und jede Kontur hebt sich vom mittleren Ton
mindestens 3:1 ab — sonst verschwindet sie beim Zeichnen.

**Eigene Paletten**: über `+ Palette` neu anlegen oder mit `Kopie bearbeiten` aus einer
eingebauten ableiten. Danach sind die Swatches rechts direkt anklickbar — eine
Farbänderung färbt alle Pixel mit diesem Index sofort um.

Jeder Sprite merkt sich seine eigene Palette.

---

## Import / Export

### Code-Formate

Das Code-Feld hat eine **Format**-Auswahl. Alle Formate enthalten die Farben, sind also
für sich allein benutzbar:

| Format | Datei | Wofür |
|---|---|---|
| TypeScript | `.ts` | `number[][]` + `Record<number, string>` — der Klassiker |
| JavaScript (ESM) | `.js` | Dasselbe ohne Typen |
| JSON | `.json` | Sprachneutral, für eigene Pipelines und Engines |
| JSON (Spiel) | `.json` | Flaches `data`-Array, Palette `#rrggbbaa` mit Material je Farbe, versioniert — für Spiele (C#-Loader: [docs/csharp-loader.md](docs/csharp-loader.md)) |
| SVG-Bild | `.svg` | Vektorgrafik, skaliert verlustfrei, direkt einbindbar |
| CSS (box-shadow) | `.css` | Der Sprite auf einem einzigen Element, ohne Bilddatei |
| C-Header | `.h` | `uint8`-Indizes + `uint32`-Palette für Mikrocontroller / LED-Matrix |
| Python | `.py` | Dict + Liste für Pygame, Pillow, Skripte |
| Text-Raster | `.txt` | Ein Zeichen pro Pixel plus Legende — für Diffs und Doku |

**Zurück in den Editor** kommen TypeScript, JavaScript und JSON. Der Rest ist Einbahnstraße.

Bei **JSON (Spiel)** erscheint unter dem Format eine Auswahl *Material je Farbe*
(`sand`, `water`, `stone` …). Sie gilt pro Palette und wird mit dem Projekt gespeichert.
Vor dem Export wird geprüft (Länge von `data`, Indizes, transparenter Index 0); bei einem
Fehler steht die Meldung im Code-Feld und Kopieren/Speichern sind gesperrt.

*Palette in den Code schreiben* gibt es nur bei TS und JS — überall sonst stecken die
Farben ohnehin im Ergebnis.

Freie Farben (Pipette, Rohfarben-Trace) passen nicht in `number[][]` — sie bekommen
Indizes oberhalb der Palette (10, 11, …) und landen im Palettenblock. Der Round-Trip
Export → Import ist damit verlustfrei.

Das SVG fasst waagerechte Läufe gleicher Farbe zu einem Rechteck zusammen; bei großen
Flächen spart das den Löwenanteil der Dateigröße.

### Import

**Alles, was der Editor schreibt, liest er auch wieder ein.** Das Format wird am Inhalt
erkannt, nicht an der Dateiendung — Einfügen aus der Zwischenablage geht also genauso wie
eine Datei.

| Format | Kommt zurück |
|---|---|
| TypeScript, JavaScript, JSON, Python, C-Header | verlustfrei, auch die Farb-Nummern |
| SVG, CSS, Text-Raster | Bild identisch, Farben neu durchnummeriert |

Die drei letzten kennen keine Palette-Indizes — dort werden die Farben in der Reihenfolge
ihres Auftretens neu vergeben. Das Bild ist danach dasselbe, nur die Nummern können sich
verschoben haben.

Die Parser sind nachsichtig und lesen auch von Hand geschriebene Dateien: SVG ohne
`viewBox`, dreistellige Hex-Farben, `box-shadow` ohne Unschärfe-Wert oder mit negativen
Versätzen, C-Header ohne Palettenblock, Text-Raster ohne Legende.

Aus dem `number[][]`-Zweig (TS/JS/JSON/Python) werden erkannt:

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
- **Spritesheet** packt *alle* Sprites in gleich große Zellen (möglichst quadratisches
  Raster) und schreibt einen JSON-Atlas daneben: Name, Palette und Pixelkoordinaten je
  Frame. Jeder Sprite sitzt mittig in seiner Zelle, der Atlas nennt die echte Lage —
  auch für Sprites, die kleiner als die Zelle sind.
- *Farb-Legende ins Bild* rendert die verwendeten Farben mit Hex-Codes unter den Sprite

---

## Werkzeuge

| Gruppe | Werkzeuge |
|---|---|
| Malen | Stift `P` · Pinsel `B` · Spray `S` · Füllen `F` · Radierer `E` · Zauberstab `W` |
| Formen | Linie `I` · Rechteck `R` · Ellipse `O` — mit Live-Vorschau, *Gefüllt* schaltet Kontur/Fläche |
| Auswahl | Rechteck `A` · Lasso `L` · Farbwahl `K` |

**Symmetrie** (↔ / ↕ in der Werkzeugleiste) spiegelt jeden Strich an der Mittelachse;
beide Achsen zusammen ergeben vier Spiegelungen. Gilt für alle Mal- und Formwerkzeuge,
die Achsen werden gestrichelt eingeblendet.

---

## Auswahl — ausschneiden und verschieben

Drei Wege zur selben Sache — ein Bereich, den man als Ganzes bewegt:

- **Auswahl** (`A`) zieht ein Rechteck auf.
- **Lasso** (`L`) umfährt eine freie Form. Beim Loslassen wird die Spur geschlossen und
  alles darin gehört dazu. Statt Polygon-Mathematik wird von außen geflutet — deshalb
  kommt es auch mit überkreuzten und krakeligen Zügen zurecht.
- **Farbwahl** (`K`) nimmt die zusammenhängende ähnliche Fläche unter dem Klick; die
  *Toleranz* steuert, wie viel mitgeht. Derselbe Bereich, den der Zauberstab löschen
  würde — nur eben als Auswahl.

- **In die Auswahl fassen und ziehen** schneidet den Bereich aus. Er **schwebt** dann,
  bis du ihn absetzt (siehe unten). Die ganze Sitzung ist *ein* Undo-Schritt.
- **`Alt` + Ziehen** lässt das Original stehen — man verschiebt eine Kopie.
- **Pfeiltasten** schieben pixelweise, **Füllen** färbt die ganze Auswahl um.
- **`Strg`+`X` / `C` / `V`** schneiden aus, kopieren, fügen ein; die Zwischenablage
  überlebt einen Sprite-Wechsel, sodass sich Teile zwischen Sprites kopieren lassen.
- **`Entf`** leert den Bereich, **`Esc`** oder ein Klick daneben hebt die Auswahl auf.

Beim Absetzen überschreiben nur gefüllte Pixel — transparente Stellen des Blocks lassen
den Untergrund stehen. Was über den Rand hinausgeschoben wird, ist weg (`Strg`+`Z` holt es
zurück).

### Der schwebende Inhalt

Sobald eine Auswahl bewegt, gedreht oder gespiegelt wird, wird ihr Inhalt **einmal** aus
dem Grid gehoben; die Quelle bleibt leer. Ab da passiert alles nur noch am schwebenden
Puffer — das Grid wird erst beim Absetzen wieder angefasst.

Das ist nicht Kosmetik, sondern nötig: würde nach jeder Bewegung gestempelt und beim
nächsten Schritt neu aus dem Grid gelesen, läse man den Untergrund mit. Die Auswahl würde
bei jeder weiteren Drehung alles mitnehmen und ausstanzen, worüber sie gerade liegt.

Abgesetzt wird automatisch, sobald du etwas anderes tust: neue Auswahl, Abwählen (`Esc`),
Werkzeug- oder Sprite-Wechsel, Undo, Tab schließen.

Der schwebende Inhalt merkt sich, aus **welchem** Sprite er stammt (`selection.owner`),
und landet beim Absetzen immer dort — auch wenn inzwischen ein anderer Sprite offen ist.
Ohne das würde er beim Arbeiten mit einer Ebene im falschen Bild landen oder ganz
verschwinden.

---

## Ebene — mit zwei Sprites arbeiten

Unter der Sprite-Liste lässt sich ein **zweiter Sprite als Ebene** einblenden:
halbdurchsichtig, oben links ausgerichtet, mit seiner eigenen Palette. Bearbeitet wird
immer nur der aktive Sprite — die Ebene ist reine Vorlage.

- **👁** blendet sie aus, der Regler stellt die Deckkraft.
- **dahinter / davor** legt sie unter oder über das Bild (davor hilft beim Abpausen von
  Konturen).
- **Tauschen** vertauscht die Rollen: die Ebene wird bearbeitet, der bisherige Sprite
  wird zur Ebene.

Teile übertragen: im einen Sprite auswählen, `Strg`+`C`, zum anderen wechseln, `Strg`+`V`.
Das Eingefügte schwebt und lässt sich erst hinschieben, bevor es liegt.

---

## Bild

Das Panel **Bild** arbeitet nach der üblichen Konvention: gibt es eine Auswahl, trifft
die Aktion nur sie — sonst den ganzen Sprite. Das Abzeichen im Panelkopf sagt, worauf
gerade.

| Aktion | Wirkung |
|---|---|
| ↔ / ↕ Spiegeln | Waagerecht bzw. senkrecht; die Lasso-Form spiegelt mit |
| ↻ 90° | Dreht im Uhrzeigersinn; bei nicht-quadratischen Sprites tauschen Breite und Höhe |
| Frei drehen | Beliebiger Winkel mit Vorschau — `Enter` übernimmt, `Esc` verwirft |
| Zuschneiden | Schneidet den leeren Rand rundherum weg |
| Zentrieren | Rückt den Inhalt in die Mitte der Fläche |
| Größe | Ändert die Fläche ohne zu skalieren; Anker bestimmt, wohin der Inhalt rutscht |
| ×2 / ÷2 | Hartes Skalieren (Nearest Neighbor) — Pixel bleiben Pixel |

Alles ist ein einzelner Undo-Schritt, auch wenn dabei das ganze Grid ausgetauscht wird.

Die freie Drehung rechnet per Rückwärts-Abbildung mit Nearest Neighbor — es wird nichts
gemischt, jede Zelle behält ihren Palette-Index. Jede Vorschau geht vom **Original** aus,
nicht vom zuletzt gedrehten Ergebnis; dreimal am Regler ziehen verwäscht die Form also
nicht. Bei einer Auswahl wächst der Rahmen mit, damit nichts abgeschnitten wird; beim
ganzen Sprite bleibt die Fläche gleich und Ecken außerhalb fallen weg.

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
| `I` `R` `O` | Linie · Rechteck · Ellipse |
| `A` `L` `K` | Auswahl · Lasso · Farbwahl |
| `Strg` + Mausrad | Zoomen |
| Ziehen in der Auswahl | Bereich ausschneiden und verschieben |
| `Alt` + Ziehen | Kopie verschieben, Original bleibt |
| Pfeiltasten | Auswahl pixelweise verschieben |
| `Strg+A` / `C` / `X` / `V` | Alles wählen · Kopieren · Ausschneiden · Einfügen |
| `Entf` | Auswahl leeren |
| `Enter` | Drehung übernehmen |
| `Strg+Z` / `Strg+Y` | Rückgängig / Wiederholen |
| `Esc` | Auswahl aufheben, Dialog oder Vollbild schließen |

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
├── index.html          ← Landingpage (Einstieg)
├── landing.css         ← Styles der Landingpage
├── editor.html         ← der Editor selbst, keine Inline-Styles
├── styles.css          ← Token-System + Komponenten (Editor)
├── site.webmanifest    ← PWA-Manifest (Name, Farben, Icons)
├── sw.js               ← Service Worker für den Offline-Modus (Liste: tools/make_sw.py)
├── vendor/
│   └── jspdf.umd.min.js ← jsPDF 2.5.1 für den PDF-Export, lokal statt CDN
├── assets/             ← Logos: icon.svg, favicon(.ico|-16|-32|-48), apple-touch,
│                          icon-192/512, icon-maskable-512, og-image
├── docs/
│   └── csharp-loader.md ← Format „JSON (Spiel)“ + C#-Loader
├── tests/
│   ├── gamejson.test.js ← Tests für „JSON (Spiel)“
│   └── sw.test.js      ← Offline-Liste vollständig, nichts von fremden Servern
│                          (alle Tests: node --test tests/*.test.js)
├── tools/
│   ├── make_icons.py   ← erzeugt alles in assets/ neu (nur Standardbibliothek)
│   └── make_sw.py      ← schreibt die Offline-Dateiliste in sw.js
└── js/
    ├── data.js         ← Farb-Labels, eingebaute Paletten, cellToColor, Konstanten
    ├── state.js        ← Sprites, Paletten, UI-State + Lookups
    ├── storage.js      ← localStorage + Projekt-Datei
    ├── migrate.js      ← v1 (dog/cat) → v2 (generisch)
    ├── render.js       ← alle Render-Funktionen + Mal-Operationen
    ├── codegen.js      ← Code-Formate (TS/JS/JSON/SVG/CSS/C/Python/Text)
    ├── gamejson.js     ← „JSON (Spiel)“: Materialliste, Aufbau, Validierung (ohne DOM)
    ├── selection.js    ← Auswahl: Rechteck, Lasso, Farbwahl, verschieben, einfügen
    ├── transform.js    ← spiegeln, drehen, zuschneiden, zentrieren, Größe, skalieren
    ├── history.js      ← Undo/Redo pro Strich
    ├── sprites.js      ← anlegen, umbenennen, duplizieren, löschen
    ├── palettes.js     ← Paletten-Modal + Fork/Import
    ├── tsimport.js     ← TS-/JS-Parser (Grid + Palette)
    ├── template.js     ← Schablone: Upload, Drag, Pipette, Abtasten
    ├── spritefx.js     ← Median-Cut, Glätten, Outline, Zauberstab
    ├── export.js       ← PNG + PDF
    ├── filesystem.js   ← Speicherort merken (File System Access API)
    ├── toast.js        ← Confirm-/Info-Toast statt window.confirm
    ├── pwa.js          ← meldet den Service Worker an (Startseite + Editor)
    └── app.js          ← Init, Events, Verdrahtung
```

### Abhängigkeiten

```
data.js
   ↑
state.js
   ↑
   ├─ codegen.js ← (data, state, gamejson)
   ├─ render.js ← (data, state, codegen)
   ├─ selection.js ← (state, render, storage, history, spritefx)
   ├─ transform.js ← (state, render, storage, history)
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

- `file://` geht nicht — ES-Module und Service Worker brauchen HTTP.
- Eine Auswahl ist bewusst flüchtig: sie überlebt weder Reload noch Sprite-Wechsel.
- Ein schwebender Auswahl-Inhalt wird beim Schließen des Tabs abgesetzt. Stürzt der
  Browser mittendrin ab, ist die letzte Bewegung verloren — das Loch im Bild sieht man
  aber, solange etwas schwebt.
- Die Zwischenablage der Auswahl liegt im Speicher, nicht in der System-Zwischenablage —
  `Strg`+`C` im Editor kopiert also keine Pixel in andere Programme.
- Inkognito-Modus verliert alles beim Tab-Schließen.
- localStorage-Limit ~5 MB; bei Überschreitung erscheint ein Hinweis-Toast.
- Die Schablonen-Pipette ignoriert Stellen mit Alpha = 0.

---

## Logos

Alle Icons stammen aus `tools/make_icons.py` — ein Skript ohne Fremdbibliotheken, das
PNG, ICO und SVG selbst schreibt. Motiv ist eine Pixel-Treppe in den beiden Akzentfarben
der App auf dem Transparenz-Schachbrett des Editors.

```
python tools/make_icons.py
```

Danach liegen Favicon (SVG + ICO + PNG), Apple-Touch-Icon, die PWA-Icons (192/512 und
maskierbar) sowie ein OG-Vorschaubild in `assets/`. Wer das Motiv ändert, ändert
`band_cells()` im Skript und lässt es neu laufen — alle Größen bleiben dadurch identisch.

---

## Lizenz

MIT
