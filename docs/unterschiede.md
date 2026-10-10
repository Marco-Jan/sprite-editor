# Web ↔ Desktop: Unterschiede

**Die Web-Version führt.** Neue Funktionen entstehen zuerst hier; die Desktop-App
([spritebit-rs](https://github.com/spritebit/spritebit-rs)) zieht gezielt nach. Wo sich
die beiden unterscheiden, gilt das Verhalten im Web als Vorgabe — außer eine Zeile unten
sagt ausdrücklich, dass der Desktop es besser macht.

Diese Liste ist das Gedächtnis dafür. **Pflege:**

- Neue Funktion im Web fertig → Zeile unter [Fehlt am Desktop](#1-fehlt-am-desktop).
- Am Desktop nachgezogen → Zeile löschen.
- Verhält sich etwas absichtlich anders → unter [Bewusst verschieden](#4-bewusst-verschieden-plattform).

Das gemeinsame Dateiformat (`.bitty`, Projektdateien) prüfen die Tests mit den
Beispieldateien in `tests/interop/` — siehe `tools/sync_interop.py`. Hier geht es nur
um Bedienung und Verhalten.

*Stand: 2026-10-10 (Web 3.2.26, Desktop 1.2.1). Erhoben per Durchsicht von Handbuch und
Code beider Apps, nicht durch Durchklicken jeder Funktion — Zeilen mit „prüfen“ sind
nicht sicher.*

---

## 1. Fehlt am Desktop

| Bereich | Im Web | Am Desktop | Aufwand |
|---|---|---|---|
| Bitty | **Touren** — geführte Rundgänge durch die Oberfläche | keine Touren (Tipps, Suche und Hilfe sind da) | mittel |
| Oberfläche | Panels lassen sich als **schwebendes Fenster** lösen, frei verschieben und in der Größe ziehen | aufgeklapptes Panel lässt sich verschieben (seit 1.2.0), aber nicht in der Größe ändern; kein eigener „Fenster“-Knopf | mittel |
| Oberfläche | **Werkzeugleiste und Farbzeile** lassen sich anpinnen, lösen und oben/unten/links/rechts andocken | Werkzeugleiste fest oben; Farben sind ein Panel. Nur die Timeline hat eine Position (Timeline-Menü) | groß |
| Farbzeile | eigene **Farbzeile** über der Fläche: 0–9 groß mit Tasten, dahinter bis 32 kleine Felder, „+N“ öffnet das ganze Raster | alle Farben als umbrechende Reihe im Panel „Farben“ | klein–mittel |

## 2. Verhält sich anders — Desktop an Web angleichen

| Bereich | Im Web (Vorgabe) | Am Desktop | Aufwand |
|---|---|---|---|
| Palette | Farben werden im **Paletten-Panel** bearbeitet: Raster mit „+“-Feld, Doppelklick, Rechtsklick-Menü — auch für eine nur *angezeigte* Palette | bearbeitet wird in der Farbreihe im Panel „Farben“ (nur die Palette des Sprites); die Felder im Paletten-Panel sind nur zum Ansehen | mittel |
| Palette | **Farbe entfernen** gilt für alle Sprites mit dieser Palette | eine mit anderen Sprites geteilte Palette wird für den aktuellen Sprite kopiert, nur er ändert sich | klein — erst entscheiden, welches richtig ist |
| Timeline | Vorschaubilder ohne gezogene Größe: **passend zur Breite** (30–48 px); Doppelklick auf die Trennlinie stellt das wieder ein | feste Standardgröße 32 px, Doppelklick setzt auf 32 zurück | klein |

## 3. Desktop macht es besser — Web nachziehen

Hier ist der Desktop weiter. Weil das Web führt, gehören diese Punkte **ins Web**.

| Bereich | Am Desktop | Im Web | Aufwand |
|---|---|---|---|
| Palette | **Jede** Änderung an einer Palette ist ein Undo-Schritt (Farbe ändern, anhängen, duplizieren, einfügen, Dialog „Bearbeiten“, Kopie anlegen) | nur Zuweisen, Umsortieren, Bildfarben aufnehmen und Entfernen lassen sich rückgängig machen; Farbe ändern, „+“, Duplizieren, Einfügen und der Dialog nicht | mittel |
| Farben | **Hex-Feld** unter der aktuellen Farbe — eintippen wählt die Farbe oder macht eine freie | nur der Farbwähler | klein |
| Farben | **„+ In Palette“** nimmt die aktuelle freie Farbe einzeln als neue Nummer auf | nur alle Bildfarben auf einmal („In Palette aufnehmen“) | klein |

## 4. Bewusst verschieden (Plattform)

Bleibt so — der Grund steht dabei.

| Bereich | Web | Desktop | Warum |
|---|---|---|---|
| Größe | Sprites bis **1024 × 1024** | bis **8192 × 8192**, Bilder in Kacheln | Arbeitsspeicher im Browser (siehe Handbuch, Eigenheiten) |
| Speichern | automatisch im Browser (IndexedDB), **Projektliste** im Browser, „Projekt sichern“ als Datei | Projektdateien auf der Platte, **zuletzt geöffnet**, Startfenster, Rückfrage bei ungespeicherten Änderungen | Browser hat kein Dateisystem, der Desktop schon |
| Kürzel | `Strg+N`, `Strg+W`, `Strg+Tab`, `F11` gehören dem Browser | `Strg+N` / `Strg+Alt+N` neu, `Strg+W` Reiter zu, `Strg+Tab` Reiter weiter, `Strg+E` Export, `F11` Vollbild | Browser fängt diese Tasten ab |
| Mehrere Dateien | PNG/PDF je Frame und Godot-Export als **ZIP** (oder Ordner, wo der Browser es kann) | direkt in einen **gewählten Ordner** | Browser darf pro Klick nur eine Datei herunterladen |
| Handy | eigenes Layout bis 1100 px Breite, Touch-Gesten | — | Desktop läuft nur am Rechner |
| Offline | PWA mit Service Worker, „Installieren“ | ist installiert | — |
| Updates | neue Version kommt beim Laden, Band „neu laden“ | Selbst-Update über GitHub Releases, „Was ist neu?“ aus `notes/` | — |
| Export | — | zusätzlich **Als Web-Projekt exportieren** | Weg vom Desktop ins Web |
| Darstellung | Pfeilzeichen ← → in Tooltips | „Pfeil links“ statt ← | eingebaute Schrift der Desktop-App kennt die Zeichen nicht |

## 5. Gleich (abgeglichen)

Zur Orientierung, was **in beiden** vorhanden ist: alle Werkzeuge (Stift, Pinsel, Spray,
Füllen mit „Grenzen: alle Ebenen“, Radierer, Zauberstab, Linie, Rechteck, Ellipse,
Auswahl, Lasso, Farbwahl, Hand), Symmetrie, Clean Stroke, Umschalt für gerade Linien,
`Alt`+Rechts ziehen für die Größe · Auswahl mit Anfassern, Kopie mit `Alt`, Einfügen mit
Nummern (`Strg+Umschalt+V`) · Paletten zuweisen/umfärben, umsortieren, „Nach
Farbstufen“, Bild → Palette, freie Farben, Farbnamen, Materialien · Licht mit Vorschau ·
Feinschliff (Hintergrund, Glätten, Outline außen/innen/beides) · Bild (Spiegeln, Drehen,
frei drehen, Zuschneiden, Zentrieren, Größe mit Anker, ×2/÷2, Rechnen in Feldern) ·
Schablone · Hilfslinien samt Figur und Layouts · Vorschau-Panel · Ebenen mit Masken,
Deckkraft, Zusammenführen · Kacheln samt Godot-Export · Timeline mit Tags, Onion Skin,
verknüpften und durchgehenden Zellen, Mehrfachauswahl, Pfeiltasten, Trennlinie für die
Vorschaubilder · alle 9 Code-Formate (Export und Import) · PNG, PDF, GIF (auch je Tag),
Spritesheet, Farb-Legende · Aseprite öffnen und speichern · Reiter · Bitty mit Tipps und
Suche · Deutsch, Englisch, Österreichisch.
