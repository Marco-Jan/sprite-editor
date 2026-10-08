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

### Update-Band

Ein neuer Service Worker **übernimmt nicht von selbst**. Er installiert sich im Hintergrund
und bleibt auf `waiting` stehen, bis die Seite neu geladen wird — sonst tauscht er einer
offenen App den Unterbau unter den Füßen aus (genau daher kam der Fehler, dass die PWA nach
einem Deploy nichts mehr anzeigte).

`js/pwa.js` merkt das Warten und blendet oben ein Band ein: „Eine neue Version ist da —
neu laden“. Ein Klick schickt `{type:'skip-waiting'}` an den wartenden Worker und lädt
danach neu; das × lässt es bis zum nächsten Start liegen. Das Band schiebt die Seite um
seine Höhe nach unten (`body.sb-has-update`), verdeckt also die Kopfzeile nicht, und steht
in der gerade gewählten Sprache — wechselt man sie bei offenem Band, wandert der Text mit.

Eine Versionsnummer braucht es dafür nicht: dass ein zweiter Worker existiert, **ist** das
Update. Von sich aus sucht der Browser nur beim Navigieren danach, darum fragt `pwa.js`
zusätzlich bei jedem Zurückschalten auf den Tab und alle 30 Minuten nach (`registration.update()`).

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
│ Sprites   │  Werkzeugleiste                   │ Vorschau, Ebenen │
│ Code &    │  Farb-Schnellwahl (0–9)           │ Farben, Schablone │
│ Export    │  Zeichenfläche                    │ Aufräumen        │
│           │  Timeline (Frames)                │                  │
│           │  Statuszeile                      │                  │
└───────────┴───────────────────────────────────┴──────────────────┘
```

Alle Panels lassen sich zuklappen; der Zustand wird gespeichert.

**Anordnung anpassen:** Jedes Panel sitzt als Icon im Dock links oder rechts und öffnet
sich als Schublade. Im Panel-Kopf:
- **Pin** — fest als Spalte neben der Zeichenfläche anpinnen; die Spaltenbreite lässt
  sich an ihrer Kante ziehen. Nochmal klicken löst es zurück in die Schublade.
- **Fenster-Symbol** — als schwebendes Fenster lösen, frei verschiebbar, Größe über die
  Ecke unten rechts.
- Am Kopf ziehen löst ein Panel ebenfalls. Lässt man es neben der linken oder rechten
  Leiste los, wechselt es dorthin — **ohne** angepinnt zu werden: ein angepinntes bleibt
  angepinnt (an der Stelle, wo man es loslässt), alle anderen werden zur Schublade.
- Die Reihenfolge lässt sich überall ziehen: Panels in der angepinnten Spalte und die
  Icons im Dock (auch auf die andere Seite).

Werkzeugleiste, Farbzeile und Timeline tragen vorn im Griff **dieselben zwei Knöpfe wie ein
Panel-Kopf**: die Pinnadel heftet sie seitlich an (feste Spalte links oder rechts der
Zeichenfläche, senkrecht angeordnet), nochmal klicken schickt sie an ihren angestammten
Platz zurück — oben für Werkzeuge und Farben, unten für die Timeline. Das Fenster-Symbol
löst sie als schwebendes Fenster. Am Griff ziehen geht weiterhin überallhin.
Auf dem Handy (bis 700 px) hat jede dieser Leisten nur den Pin: angepinnt sitzt sie fest unter
der Zeichenfläche (Standard), ohne Pin liegt sie im Dock. Diese Wahl gilt nur fürs Handy.
Auch die Dock-Icons unten lassen sich dort ziehen: Reihenfolge ändern und zwischen linker
und rechter Gruppe wechseln — ebenfalls nur fürs Handy, das Desktop-Layout bleibt. Andocken lassen sie sich oben, unten oder links/rechts neben der
Zeichenfläche (dort senkrecht), in beliebiger Reihenfolge. Die Anordnung merkt sich
der Browser (localStorage `spritebit_layout`), sie gehört nicht zum Projekt. Im Vollbild
verschwindet nur die Kopfzeile.

---

## Palettensystem

Eine Palette ist ein Mapping **Index → Hex-Farbe**. Index `0` ist immer transparent,
dazu kommen **bis zu 255 Farben** — zusammen 256 Werte, die übliche Grenze indizierter
Pixel-Art (GIF, PNG-8) und genau ein Byte im C-Export. Die eingebauten Paletten haben
9 Farben; nur `1`–`9` tragen Namen und eine Taste, ab `10` heißt es schlicht „Farbe 10“.

**Anschauen ist nicht Zuweisen.** Eine Palette im Panel auswählen zeigt sie nur an
(Raster mit 8 bzw. 16 Spalten, 256 Farben = 16 × 16) — die Zeichnung bleibt, wie sie
ist. Ein Klick auf ein Feld wählt die Farbe zum Malen. Zugewiesen wird per Knopf:

- **Für Sprite nutzen** — der Sprite bekommt die Palette, die Zeichnung behält ihr
  Aussehen. Farben, die es in der neuen Palette nicht gibt, bleiben als Bildfarben stehen.
- **Sprite umfärben** — die Indizes bleiben, die Farben kommen aus der neuen Palette.

Beides ist ein normaler Undo-Schritt.

Daneben kann ein Pixel eine **freie Farbe** tragen: seinen Hex-Wert direkt statt eines
Index. Die entstehen über die Pipette und beim Übernehmen der Schablone mit „Originalfarben“ oder „Reduzieren auf N Farben“.
Sie werden ganz normal gespeichert und exportiert. Die häufigsten stehen als kleine Felder
in der Farbzeile, alle über **„+N Bildfarben“** (nach Häufigkeit sortiert). Von dort lassen
sie sich **in die Palette aufnehmen**, solange sie in 255 Plätze passen.

**Bild → Palette …** macht aus allen Farben des Bildes eine Palette. Man wählt, wie viele:
alle (bis 255, exakt) oder reduziert auf 128 / 64 / 32 / 16 / 8 / 4 — mit Vorher/Nachher-
Vorschau, bevor das Bild umgeschrieben wird. Ein Foto mit Tausenden Farben sieht mit 255
fast aus wie vorher; 16 oder 32 geben den typischen Pixel-Art-Look.

**Farbzeile**: 0–9 groß (Tasten), danach bis zu 32 weitere Palettenfarben als kleine
Felder; bei mehr öffnet `+N` das ganze Raster im Paletten-Panel.

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

**Eigene Paletten**: über `+ Palette` neu anlegen (mit `+ Farbe` / `− Letzte` auf jede
Größe bis 255) oder mit `Kopie bearbeiten` aus einer eingebauten ableiten. Ein
**Doppelklick** auf ein Feld im Raster ändert die Farbe — alle Pixel mit diesem Index
färben sich mit.

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

**Zurück in den Editor** kommen alle Formate, siehe [Import](#import).

Bei **JSON (Spiel)** erscheint unter dem Format eine Auswahl *Material je Farbe*
(`sand`, `water`, `stone` …). Sie gilt pro Palette und wird mit dem Projekt gespeichert.
Vor dem Export wird geprüft (Länge von `data`, Indizes, transparenter Index 0); bei einem
Fehler steht die Meldung im Code-Feld und Kopieren/Speichern sind gesperrt.

*Palette in den Code schreiben* gibt es nur bei TS und JS — überall sonst stecken die
Farben ohnehin im Ergebnis.

Freie Farben (Pipette, Schablone mit Originalfarben) passen nicht in `number[][]` — sie bekommen
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
| TypeScript, JavaScript, JSON, JSON (Spiel), Python, C-Header | verlustfrei, auch die Farb-Nummern (bei JSON (Spiel) ohne die Materialien) |
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

- **PNG** transparent, Skalierung 1× bis 32× — der aktuelle Frame
- **PDF** mit eingebettetem PNG — der aktuelle Frame
- **Mehrere Frames auf einmal**: Sind in der Timeline Frames markiert (Strg/Shift+Klick,
  siehe `js/frames.js`), schreiben PNG und PDF **eine Datei je Frame** — `name_f01.png`,
  `name_f02.png` …, die Nummer so lang wie die höchste Frame-Nummer, damit die
  Reihenfolge im Dateimanager stimmt. Der Zielordner wird **vor** dem ersten Bild
  erfragt — danach gilt der Klick dem Browser als zu alt und der Dialog bliebe zu.
  Kann der Browser keine Ordner (Firefox, Safari) oder mag man keinen wählen, kommt
  alles zusammen in **ein ZIP** (`js/zip.js`, ohne Kompression, ohne Bibliothek):
  einzeln herunterladen lässt der Browser pro Klick nur eine Datei zu. Das GIF enthält dann nur die markierten Frames;
  so schneidet man einen Abschnitt heraus, ohne etwas zu löschen. Eine Zeile unter den
  Export-Knöpfen sagt, worauf sie sich gerade beziehen.
- **GIF** die ganze Animation des aktiven Sprites, läuft endlos, Dauer je Frame wie im
  Editor (GIF rechnet in 1/100 s). Höchstens 255 Farben plus Transparent; bei mehr
  Farben erst mit „Bild → Palette …“ reduzieren. Eigener Encoder (`js/gif.js`).
- **Spritesheet** packt *alle* Sprites in gleich große Zellen und schreibt einen
  JSON-Atlas daneben: Name, Palette und Pixelkoordinaten je Frame. Ohne Animation ist es
  ein möglichst quadratisches Raster; sobald ein Sprite mehrere Frames hat, bekommt jeder
  Sprite eine Zeile mit seinen Frames nebeneinander, und jeder Atlas-Eintrag nennt
  zusätzlich `frame` und `duration` (ms). Jeder Frame sitzt mittig in seiner Zelle, der
  Atlas nennt die echte Lage — auch für Sprites, die kleiner als die Zelle sind.
- *Farb-Legende ins Bild* rendert die verwendeten Farben mit Hex-Codes unter den Sprite

---

## Vorschau

Beim Arbeiten ist man meist weit hineingezoomt. Das Panel **Vorschau** zeigt daneben
immer den **ganzen Sprite** — ohne Gitter, ohne Schachbrett, ohne Hilfslinien und ohne
Onion Skin, also genau das, was auch der Export liefert. Es zeichnet bei jedem Strich
mit und läuft beim Abspielen als Animation mit. Als Schublade schließt es sich beim
Klick auf die Zeichenfläche — zum Mitschauen beim Malen also **anpinnen**.

**Pixelgröße** stellt ein, wie groß ein Pixel dargestellt wird: *Einpassen* nutzt den
Platz des Panels, 1× zeigt den Sprite in seiner echten Größe — so, wie er später im
Spiel wirkt. Die Wahl wird gespeichert.

---

## Werkzeuge

| Gruppe | Werkzeuge |
|---|---|
| Malen | Stift `P` · Pinsel `B` · Spray `S` · Füllen `F` · Radierer `E` · Zauberstab `W` |
| Formen | Linie `I` · Rechteck `R` · Ellipse `O` — mit Live-Vorschau, *Gefüllt* schaltet Kontur/Fläche |
| Auswahl | Rechteck `A` · Lasso `L` · Farbwahl `K` |
| Ansicht | Hand `H` — schiebt nur die Ansicht, verändert nichts am Bild |

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
Ohne das würde er nach einem Sprite-Wechsel im falschen Bild landen oder ganz
verschwinden.

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

1. Bild laden, mit `Shift`+`Alt`+Linksklick ziehen positionieren
2. **Aufs Raster übernehmen** — mit **Palettenfarben** (jede Farbe wird zur ähnlichsten der
   Palette), **Originalfarben** (exakt aus dem Bild) oder **Reduzieren auf N Farben**
   (Median-Cut, gibt flache Flächen statt Foto-Rauschen)
3. **Bild → Palette …** — macht aus den Bildfarben eine Palette, mit Wahl der Farbanzahl
4. **Hintergrund entfernen**, **Glätten**, **Outline**
5. Reste von Hand säubern

Die Schablone überlebt einen Reload (eigener localStorage-Key).

---

## Hilfslinien

Panel „Hilfslinien“ im Dock. Reine Zeichenhilfe: nur in der Zeichenfläche zu sehen, in
keinem Export, kein Undo. Gespeichert je Sprite (`sp.guides`), `G` blendet alle ein/aus.

- **Freie Linien** — „+ Waagerecht“ / „+ Senkrecht“ setzt eine Linie in die Mitte. Im
  Modus **Verschieben** gehört die Zeichenfläche den Linien: anfassen und ziehen (immer
  auf eine Pixelgrenze), aus dem Bild ziehen löscht. Gemalt wird solange nicht; ein Tipp
  neben die Linien oder `Esc` beendet den Modus, ohne Linien endet er von selbst.
- **Figur** — Einteilung in 2 (Chibi), 3, 4, 6 oder 8 Kopfhöhen mit Kopfnummern, den
  üblichen Marken (Kinn, Brust, Nabel, Hüfte, Schritt, Knie — je nach Einteilung) und
  der Körperachse. „An Figur anpassen“ setzt Ober- und Unterkante auf den sichtbaren
  Inhalt; beide lassen sich im Modus Verschieben ziehen.

---

## Ebenen

Jeder Sprite hat eine oder mehrere **Ebenen** (Panel „Ebenen“ im Dock). Die Liste zeigt
die oberste Ebene oben, mit Vorschaubild des aktuellen Frames.

- Gemalt wird immer in die **aktive** Ebene — alle Werkzeuge, Auswahl, Aufräumen und die
  Schablone arbeiten dort. Die Pipette greift, was man sieht.
- **Auge** blendet aus, **Schloss** sperrt. In eine gesperrte oder ausgeblendete Ebene
  wird nicht gemalt; die Statuszeile sagt, warum.
- **Deckkraft** per Regler (ein Undo-Schritt je Ziehen), **Name** per Doppelklick,
  **Reihenfolge** per Ziehen.
- **+** neue leere Ebene über der aktiven, **duplizieren**, **nach unten zusammenführen**
  (in jedem Frame), **löschen** (die letzte Ebene bleibt).

Jede Ebene hat in jedem Frame ihr eigenes Bild (`frames[].cels`). Größe ändern, drehen,
spiegeln, skalieren, zuschneiden und Paletten umfärben wirken auf alle Ebenen.

**Export: was man sieht.** Bilder, GIF, Spritesheet, alle Code-Formate, Vorschaubilder
und Onion Skin zeigen alle sichtbaren Ebenen zusammengefügt. Bei voller Deckkraft bleibt
der Palette-Index erhalten; eine halbdurchsichtige Ebene wird mit der Farbe darunter zu
einer freien Farbe gemischt — über leerem Grund bleibt sie deckend, weil Pixel keine
Transparenz-Stufen kennen. Die Ebenen selbst stecken nur im Projekt (Speicherstand und
Projektdatei). „Import → In aktuellen Sprite“ ersetzt den Sprite samt Ebenen
(`Strg+Z` holt ihn zurück).

---

## Animation — Frames

Jeder Sprite hat einen oder mehrere **Frames**. Die **Timeline** ist eine Leiste wie
Werkzeugleiste und Farbzeile (Standard: unter der Zeichenfläche) und lässt sich genauso
andocken, schweben lassen oder ins Dock legen.

- **Vorschaubilder** aller Frames: antippen wählt, ziehen sortiert um.
- **Mehrere Frames** wählt man mit `Strg`+Klick (einzeln) und `Shift`+Klick (Spanne),
  wie im Dateimanager — Löschen nimmt dann alle markierten in einem Undo-Schritt mit,
  und PNG/PDF schreiben je eine Datei pro Frame. Am Handy gibt es dafür einen
  Schalter in der Leiste (`#tl-multi`): ist er an, markiert ein Tipp den Frame, statt
  zu ihm zu wechseln. Am Rechner ist der Schalter ausgeblendet — dort genügen die Tasten.
- **Unter 500 px** (Telefon hochkant) fallen in der Timeline die Schritt-Knöpfe und das
  Sprung-Feld weg, damit die Leiste zweizeilig bleibt: den Nachbar-Frame tippt man direkt
  an, und für die Enden gibt es |◀◀ und ▶▶|. Darueber — Tablet, schmales Fenster — ist
  alles da.
- **+** fügt dahinter einen leeren Frame ein, daneben **duplizieren** und **löschen**
  (der letzte Frame bleibt).
- **▶** spielt in der Zeichenfläche ab (`Enter`); ein Tipp auf die Fläche, `Esc` oder
  jede Frame-Aktion hält an. Beim Abspielen wird nicht gezeichnet.
- **FPS** gilt für den ganzen Sprite (1–60). **Dauer** gibt einem einzelnen Frame eine
  eigene Länge in ms; leer heißt „nach FPS“. Frames mit eigener Dauer tragen ein ⏱.
- **Onion Skin** zeigt den vorigen Frame rot und den nächsten blau getönt unter dem
  aktuellen.

Gezeichnet wird immer im aktuellen Frame — alle Werkzeuge, Auswahl und Effekte arbeiten
dort. Was den ganzen Sprite betrifft, wirkt auf **alle Frames**: Größe ändern, drehen um
90°, spiegeln, skalieren, zuschneiden und zentrieren (beides über die Begrenzung aller
Frames, damit die Animation nicht springt) sowie Paletten-Zuweisung, „Bildfarben in die
Palette“ und „Bild → Palette“. Nur die freie Drehung dreht den sichtbaren Frame.

Frame-Aktionen und das Ändern von FPS und Dauer sind normale Undo-Schritte. Ein
Undo-Eintrag sichert dafür den ganzen Sprite; Frames, die sich nicht geändert haben,
teilen sich ihre Kopie.

**Code-Formate mit mehreren Frames** (mit einem Frame bleibt alles wie oben):

| Format | Frames |
|---|---|
| TypeScript / JavaScript | `X: number[][][]` (`[Frame][y][x]`) plus `X_DURATIONS` in ms |
| JSON | `"frames": [ … ]` statt `"grid"`, dazu `"fps"` und `"durations"` |
| JSON (Spiel) | Frames als Streifen nebeneinander in `data`, Atlas `sprites` mit `frames`, dazu `durations` |
| SVG | eine `<g>` je Frame mit `data-ms`, CSS-Animation zeigt sie nacheinander (ohne CSS: Frame 1) |
| CSS | Frame 1 am Element, `@keyframes` mit einem `box-shadow` je Frame, `step-end` |
| C-Header | `X_FRAMES`, `X_DURATIONS[]`, `X_DATA[Frames][W*H]` |
| Python | Liste von Grids plus `X_DURATIONS` |
| Text-Raster | ein Block je Frame mit Zeile `Frame N · ms` |

Der Import liest all das zurück, samt Dauer. Sind alle Frames gleich lang, wird daraus
die FPS-Zahl des Sprites.

---

## Tastenkürzel

| Taste | Wirkung |
|---|---|
| Linksklick | Malen (ziehen = durchgehend) |
| Rechtsklick | Löschen (ziehen = durchgehend) |
| `Alt` + Klick | Pipette auf das Grid |
| `Shift` + `Alt` halten | Schablone in den Vordergrund |
| `Shift` + `Alt` + Links + Ziehen | Schablone verschieben |
| `Shift` + `Alt` + Rechtsklick | Schablonen-Pipette (exakter Hex) |
| Mausrad / `Shift` + Mausrad | hoch–runter / links–rechts scrollen |
| `Strg` + Mausrad | Zoom auf den Mauszeiger |
| `Leertaste` + Ziehen | Bild verschieben (auch mittlere Maustaste) |
| `0`–`9` | Farb-Index wählen |
| `P` `B` `S` `F` `E` `W` | Stift · Pinsel · Spray · Füllen · Radierer · Zauberstab |
| `I` `R` `O` | Linie · Rechteck · Ellipse |
| `A` `L` `K` | Auswahl · Lasso · Farbwahl |
| `H` | Hand — Ansicht verschieben, ohne zu zeichnen |
| Ziehen in der Auswahl | Bereich ausschneiden und verschieben |
| `Alt` + Ziehen | Kopie verschieben, Original bleibt |
| Pfeiltasten | Auswahl pixelweise verschieben |
| `Strg+A` / `C` / `X` / `V` | Alles wählen · Kopieren · Ausschneiden · Einfügen |
| `Entf` | Auswahl leeren |
| `Enter` | Drehung übernehmen · sonst Animation abspielen / anhalten |
| `,` / `.` | Voriger / nächster Frame |
| `Pos1` / `Ende` | Zum ersten / letzten Frame |
| `G` | Hilfslinien ein / aus |
| Zwei Finger (Touch) | Zoomen und verschieben |
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
├── jsconfig.json       ← Typprüfung ohne Build (npm run check)
├── package.json        ← nur Skripte + TypeScript als Entwicklungs-Abhängigkeit
├── tests/              ← alle Tests: npm test
│   ├── place.test.js   ← Andocken: anpinnen, lösen, schweben, Ziehen
│   ├── sprite.test.js  ← Sprite-Modell: Frames, Ebenen, Dauer
│   ├── migrate.test.js ← alte Projektstände überleben die Migration
│   ├── gif.test.js     ← GIF-Encoder erzeugt gültige Dateien
│   ├── i18n.test.js    ← keine fehlenden Texte in irgendeiner Sprache
│   ├── gamejson.test.js ← Tests für „JSON (Spiel)“
│   └── sw.test.js      ← Offline-Liste vollständig, nichts von fremden Servern
├── tools/
│   ├── make_icons.py   ← erzeugt alles in assets/ neu (nur Standardbibliothek)
│   ├── make_sw.py      ← schreibt die Offline-Dateiliste in sw.js
│   └── make_itch.py    ← baut dist/spritebit-itch.zip für itch.io
└── js/
    ├── data.js         ← Farb-Labels, eingebaute Paletten, cellToColor, Konstanten
    ├── state.js        ← Sprites, Paletten, UI-State + Lookups
    ├── storage.js      ← localStorage + Projekt-Datei
    ├── migrate.js      ← v1 (dog/cat) → v2 (generisch)
    ├── render.js       ← alle Render-Funktionen + Mal-Operationen
    ├── codegen.js      ← Code-Formate (TS/JS/JSON/SVG/CSS/C/Python/Text), alle Frames
    ├── gamejson.js     ← „JSON (Spiel)“: Materialliste, Aufbau, Validierung (ohne DOM)
    ├── selection.js    ← Auswahl: Rechteck, Lasso, Farbwahl, verschieben, einfügen
    ├── transform.js    ← spiegeln, drehen, zuschneiden, zentrieren, Größe, skalieren
    ├── history.js      ← Undo/Redo pro Strich (sichert den ganzen Sprite mit allen Frames)
    ├── frames.js       ← Frames: anlegen, wechseln, abspielen, Onion Skin, Timeline
    ├── layers.js       ← Ebenen: anlegen, ordnen, ausblenden, sperren, Deckkraft, Panel
    ├── preview.js      ← Vorschau-Panel: der ganze Sprite, Pixelgröße einstellbar
    ├── guides.js       ← Hilfslinien: freie Linien, Figuren-Proportionen, Verschieben-Modus
    ├── gif.js          ← GIF89a-Encoder (LZW, Endlosschleife, Dauer je Frame)
    ├── sprites.js      ← anlegen, umbenennen, duplizieren, löschen
    ├── palettes.js     ← Paletten-Modal + Fork/Import
    ├── tsimport.js     ← Import aller Formate (Frames + Palette)
    ├── template.js     ← Schablone: Upload, Drag, Pipette, Abtasten
    ├── spritefx.js     ← Median-Cut, Glätten, Outline, Zauberstab
    ├── reduce.js       ← Dialog „Bild → Palette“: Farben zusammenfassen, Bild umschreiben
    ├── view.js         ← Ansicht: zoomen, verschieben, Finger-Gesten (fasst keine Pixel an)
    ├── export.js       ← PNG, PDF, GIF, Spritesheet
    ├── filesystem.js   ← Speicherort merken (File System Access API)
    ├── toast.js        ← Confirm-/Info-Toast statt window.confirm
    ├── pwa.js          ← meldet den Service Worker an (Startseite + Editor)
    ├── dock.js         ← Seitenleisten als Icon-Spalte, unter 1280 px Kopfzeile als Menü
    ├── icons.js        ← alle Linien-Icons (SVG) + applyIcons() für [data-icon]
    ├── place.js        ← wo ein Panel/eine Leiste sitzt, als EIN Wert (ohne DOM, getestet)
    ├── layout.js       ← zeichnet Plätze ins DOM: anpinnen, lösen, verschieben, Größe
    ├── globals.d.ts    ← Typen für Browser-Felder außerhalb des Standards (nie ausgeliefert)
    ├── palpicker.js    ← Paletten-Auswahl: Suche, Filter, klappbare Gruppen, Farbstreifen
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

`place.js` hängt an nichts: es kennt weder DOM noch andere Module. Das ist
Absicht — dadurch lässt sich die Andock-Logik ohne Browser prüfen. `layout.js`
benutzt es und ist die einzige Stelle, die daraus DOM macht.

---

## Veröffentlichen auf itch.io

itch spielt statische Web-Projekte im iframe ab: ein ZIP hochladen, `index.html`
muss darin ganz oben liegen. Das Archiv baut

```
python tools/make_itch.py              # → dist/spritebit-itch.zip
python tools/make_itch.py --landing    # Startseite bleibt der Einstieg
```

Standardmäßig wird getauscht: **`index.html` ist der Editor**, die bisherige
Startseite heißt `start.html`. Auf itch landet man damit sofort im Werkzeug —
die Projektseite drumherum übernimmt die Aufgabe der Landingpage. Die Verweise
der Seiten aufeinander, `start_url` im Manifest und die Offline-Liste in `sw.js`
werden mitgezogen; die Dateien im Projekt bleiben unberührt. Nicht mit ins
Archiv kommen Tests, Werkzeuge, Typdateien und alles, was nur für Suchmaschinen
da ist.

Im itch-iframe gelten drei Einschränkungen, die auf der eigenen Domain nicht
bestehen: die PWA-Installation entfällt, der Service Worker kann in der Sandbox
scheitern (dann eben ohne Offline-Modus, `js/pwa.js` fängt das ab), und der
`localStorage` liegt in einem fremden Rahmen — Browser trennen Speicher nach
Seite, Safari kann ihn blockieren. Ein Hinweis auf die eigene Adresse auf der
Projektseite ist deshalb sinnvoll.

---

## Mitarbeiten — die Regeln des Hauses

Dieser Abschnitt richtet sich an alle, die hier etwas ändern. Er ist kurz, weil
es nur wenige Regeln gibt — aber an die sollte man sich halten, sonst entstehen
genau die Fehler, die wir uns schon einmal eingefangen haben.

### Vor dem Commit

```
npm test        # alle Tests (braucht nichts zu installieren)
npm run check   # Typprüfung (npx -p typescript tsc -p jsconfig.json)
```

`npm run check` braucht TypeScript — entweder `npm install` oder einmalig
`npx -p typescript tsc -p jsconfig.json`. Geprüft wird der Browser-Code, der
dabei **nicht** übersetzt wird: es gibt weiterhin keinen Build-Schritt, die
Dateien im Browser sind dieselben wie im Editor. Beide Läufe müssen sauber
durchgehen. Nach neuen, umbenannten oder gelöschten Dateien zusätzlich
`python tools/make_sw.py` (sonst meldet es der Test).

### Regel 1 — eine Wahrheit, und das DOM ist sie nie

Zustand lebt in einem Objekt, das DOM wird daraus **gezeichnet**. Keine
Entscheidung liest ihn zurück aus `dataset`, aus einer CSS-Klasse oder aus der
Stellung eines Elements im Baum.

Woran man das sieht: `js/layout.js` hält `layout.places[id]`, und nur `render()`
fasst Eltern-Element und Klassen an. Attribute wie `data-mode` schreibt sie als
*Ausgabe* mit — lesen darf sie davon nichts. Vorher stand „auf welcher Seite
sitzt dieses Panel?" an vier Stellen gleichzeitig, mit zwei verschiedenen
Vorrangregeln; daher kamen „rechts angepinnt, links gelandet" und Verwandte.

### Regel 2 — Entscheidungen gehören in eine Funktion ohne DOM

Was wohin gehört, wie ein Knopf wirkt, was aus einem Drop folgt: solche Logik
kommt in ein Modul, das ohne Browser läuft — dann kann ein Test sie prüfen.
`js/place.js` ist das Muster dafür: reine Funktionen auf Werten, 24 Tests in
`tests/place.test.js`, kein `document` in Sicht.

### Regel 3 — Texte an beiden Stellen

Deutsch steht im HTML, Englisch in `STATIC.en` (js/i18n.js). Laufzeit-Texte
(`t('…')`) brauchen einen Eintrag in **MSG.de und MSG.en**. Die österreichische
Fassung (`js/i18n-at.js`) ist optional — was dort fehlt, fällt auf Deutsch
zurück. `tests/i18n.test.js` prüft das alles; es hat beim ersten Lauf drei
Texte gefunden, die auf Deutsch nur den Schlüsselnamen anzeigten.

### Was die Tests bewachen

| Datei | wacht über |
|---|---|
| `tests/place.test.js` | Andocken: anpinnen, lösen, schweben, Ziehen — inklusive der Fehler, die es schon gab |
| `tests/sprite.test.js` | Das Sprite-Modell: Frames, Ebenen, Dauer, Daten aus fremden Dateien |
| `tests/migrate.test.js` | Alte Projektstände überleben die Migration |
| `tests/gif.test.js` | Der GIF-Encoder erzeugt gültige Dateien |
| `tests/gamejson.test.js` | Das Spiel-JSON-Format |
| `tests/i18n.test.js` | Keine fehlenden Texte in irgendeiner Sprache |
| `tests/sw.test.js` | Die Offline-Liste ist vollständig, nichts lädt von fremden Servern |

Wer ein Verhalten ändert, ändert den passenden Test mit — und wer einen Fehler
behebt, schreibt zuerst den Test, der ihn zeigt. Die Fehler dieses Projekts
kamen bisher doppelt zurück, weil sie nur „von Hand im Browser" geprüft waren.

### Etwas Neues andocken

Ein Panel braucht nur `[data-panel="name"]` im HTML und einen Eintrag in
`js/icons.js`; `layout.js` findet es von allein und gibt ihm Kopfzeile, Pin,
Lösen-Knopf und Dock-Icon. Eine neue Leiste kommt zusätzlich in `BARS` und
`BAR_DOCK` in `js/layout.js`. Beides erbt damit automatisch dieselbe Bedienung
— das ist der Sinn des gemeinsamen Modells.

### Typen ohne TypeScript

Typen stehen als JSDoc im normalen JS (`/** @type {…} */`, `@param`,
`@typedef`). Nicht-standardisierte Browser-Felder stehen gesammelt in
`js/globals.d.ts`. Diese Datei wird nie ausgeliefert — `tools/make_sw.py` und
der Offline-Test lassen `.d.ts` bewusst aus.

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

© 2026 Marco Jan — alle Rechte vorbehalten. Das Repository ist privat; Code und
Gestaltung dürfen ohne Erlaubnis nicht weiterverwendet werden. Was Nutzer mit
spritebit zeichnen, gehört ihnen.
