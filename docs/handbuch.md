# spritebit — Handbuch

Alles, was der Editor kann, Abschnitt für Abschnitt. Der schnelle Überblick steht in der
[README](../README.md), technische Details zum Mitarbeiten in [CONTRIBUTING.md](../CONTRIBUTING.md).

**Inhalt:** [Aufbau der Oberfläche](#aufbau-der-oberfläche) · [Reiter](#reiter) · [Werkzeuge](#werkzeuge) · [Auswahl](#auswahl--ausschneiden-und-verschieben) · [Palettensystem](#palettensystem) · [Licht](#licht) · [Aufräumen](#aufräumen) · [Bild](#bild) · [Schablone](#schablone-foto-vorlage) · [Hilfslinien](#hilfslinien) · [Vorschau](#vorschau) · [Ebenen](#ebenen) · [Animation — Timeline](#animation--timeline) · [Import / Export](#import--export) · [Tastenkürzel](#tastenkürzel) · [Speichern](#speichern) · [Offline und als App](#offline-und-als-app) · [Eigenheiten](#eigenheiten) · [Migration von der alten Version](#migration-von-der-alten-version)

---

## Aufbau der Oberfläche

```
┌── Menüleiste: Datei · Bearbeiten · Ansicht · Hilfe ─────────────────────┐
├──────┬──────────────────────────────────────────────────────────┬──────┤
│      │ [ Held × ] [ Baum × ] [ Icon × ]  +        ↶ ↷  Zoom  ⛶   │      │
│ Dock │ Werkzeugleiste (Zeile 2: Symmetrie + Werkzeug-Optionen)   │ Dock │
│      │ Farbzeile (0–9, weitere Farben, Bildfarben)               │      │
│      │ Zeichenfläche                                             │      │
│      │ Timeline (Ebenen × Frames)                                │      │
│      │ Statuszeile                                               │      │
└──────┴──────────────────────────────────────────────────────────┴──────┘
```

Links und rechts sitzen die **Docks**: ein Icon je Panel (Sprites, Code & Export, Ebenen,
Vorschau, Hilfslinien, Palette, Schablone, Bild, Aufräumen, Licht). Ein Klick öffnet das
Panel als Schublade über der Zeichenfläche, ein zweiter Klick, das × oder `Esc` schließt sie.

**Anordnung anpassen.** Im Panel-Kopf:
- **Pin** — fest als Spalte neben der Zeichenfläche anpinnen; die Spaltenbreite lässt
  sich an ihrer Kante ziehen. Nochmal klicken löst es zurück in die Schublade.
- **Fenster-Symbol** — als schwebendes Fenster lösen, frei verschiebbar, Größe über die
  Ecke unten rechts.
- Am Kopf ziehen löst ein Panel ebenfalls. Lässt man es neben der linken oder rechten
  Leiste los, wechselt es dorthin — ein angepinntes bleibt angepinnt, alle anderen werden
  zur Schublade.
- Die Reihenfolge lässt sich überall ziehen: Panels in der angepinnten Spalte und die
  Icons im Dock (auch auf die andere Seite).

Werkzeugleiste, Farbzeile und Timeline tragen vorn im Griff **dieselben Knöpfe wie ein
Panel-Kopf**: die Pinnadel heftet sie seitlich an (senkrecht neben der Zeichenfläche),
nochmal klicken schickt sie an ihren angestammten Platz zurück — oben für Werkzeuge und
Farben, unten für die Timeline. Das Fenster-Symbol löst sie als schwebendes Fenster. Am
Griff ziehen dockt sie oben, unten, links oder rechts an, in beliebiger Reihenfolge.

Die Anordnung merkt sich der Browser (localStorage `spritebit_layout`), sie gehört nicht
zum Projekt.

**Werkzeugleiste.** Am Rechner hat sie immer zwei Zeilen: oben die Werkzeuge, unten
Symmetrie und dahinter die Einstellungen des gewählten Werkzeugs (Größe, Stärke, Toleranz,
Clean Stroke, Gefüllt, Auswahl-Aktionen). So stehen die Regler immer an derselben Stelle.

**Am Handy** (bis 1100 px Breite) liegen die Panels als Blatt von unten im Dock. Werkzeug-
leiste, Farbzeile und Timeline sitzen angepinnt unter der Zeichenfläche oder — ohne Pin —
ebenfalls im Dock. Die Einstellungen des Werkzeugs (Größe, Stärke …) klappt der Regler-Knopf
am Ende der Werkzeugleiste auf, oder ein zweiter Tipp aufs aktive Werkzeug. Auch die
Dock-Icons lassen sich dort ziehen; diese Wahl gilt nur fürs Handy.

**Vollbild** (`Ansicht → Vollbild`) schaltet auch den Browser ins Vollbild (auf iPhone und
iPad erlaubt Safari das Webseiten nicht, dort werden nur die Leisten ausgeblendet).
Menüleiste, Kopfzeile und Seitenleisten verschwinden; Werkzeugleiste, Farbzeile und
Timeline bleiben. Die Seitenleisten gleiten herein, sobald die Maus an den Rand kommt (ohne
Maus: schmaler Griff am Rand). Beenden: `Esc`, der Knopf oben rechts in der Zeichenfläche
oder `Ansicht → Vollbild`.

**Sprache:** Deutsch, Englisch und Österreichisch, umschaltbar über die Flagge.

---

## Reiter

Wie man es aus Grafikprogrammen kennt, hat jeder **geöffnete Sprite** einen Reiter über der
Zeichenfläche.

- **Klick** wechselt zum Sprite.
- **×** oder **Mittelklick** schließt den Reiter. Der Sprite bleibt im Projekt — ein Klick
  im Sprites-Panel öffnet ihn wieder.
- **Doppelklick** benennt um, **Ziehen** ordnet die Reiter, **+** legt einen neuen Sprite an.
- Neue und duplizierte Sprites öffnen sich von selbst als Reiter, gelöschte verschwinden.
- Der aktive Sprite hat immer einen Reiter — der letzte lässt sich nicht schließen.
- Passen nicht alle hin, scrollt die Reihe seitlich (Mausrad; am Handy wischen).

Welche Reiter offen sind, wird mit dem Projekt gespeichert. Am Handy erscheint die
Reiterzeile erst ab zwei offenen Sprites, damit sie keine Höhe kostet.

---

## Werkzeuge

| Gruppe | Werkzeuge |
|---|---|
| Ansicht | Hand `H` — schiebt nur die Ansicht, verändert nichts am Bild |
| Malen | Stift `P` · Pinsel `B` · Spray `S` · Füllen `F` · Radierer `E` · Zauberstab `W` |
| Formen | Linie `I` · Rechteck `R` · Ellipse `O` — mit Live-Vorschau, *Gefüllt* schaltet Kontur/Fläche |
| Auswahl | Rechteck `A` · Lasso `L` · Farbwahl `K` |

- **Größe** (1–9) und **Stärke** gelten für Pinsel, Spray und Radierer. Die Stärke ist beim
  Pinsel die Dichte, beim Spray die Menge.
- **Toleranz** steuert, wie ähnlich Farben für Zauberstab und Farbwahl sein dürfen.
- **Symmetrie** (↔ / ↕) spiegelt jeden Strich an der Mittelachse; beide Achsen zusammen
  ergeben vier Spiegelungen. Gilt für alle Mal- und Formwerkzeuge, die Achsen werden
  gestrichelt eingeblendet.

### Clean Stroke

Zeichnet man mit 1 Pixel freihand eine Schräge, entstehen an jeder Treppenstufe L-Ecken:
zwei Pixel, wo die Linie nur eins braucht — sie wirkt eckig und stellenweise doppelt dick.
**Clean Stroke** nimmt dieses Eckpixel während des Strichs wieder heraus — wie in bekannten
Pixel-Art-Programmen.

- Gilt für den **Stift** und den **Radierer mit Größe 1**; der Schalter steht in der
  zweiten Zeile der Werkzeugleiste und wird gemerkt.
- Funktioniert auch mit Symmetrie.
- Was vorher unter dem Eckpixel stand, kommt zurück.

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

**Farbzeile umsortieren.** Eine Farbe in der Farbzeile auf einen anderen Platz ziehen gibt
ihr eine andere Nummer. Der Knopf **Nach Farbstufen** sortiert automatisch: erst die
Grautöne, dann je Farbton von dunkel nach hell. In beiden Fällen werden alle Pixel mit
umnummeriert — das Bild bleibt gleich, und es ist ein einzelner Undo-Schritt.

---

## Licht

Das Panel **Licht** setzt Licht und Schatten per Knopfdruck — **nicht-destruktiv**, wie man es
aus Grafikprogrammen kennt: das Original bleibt unberührt, Licht und Schatten liegen als eigene
Ebenen darüber bzw. darunter. Ein 2D-Sprite kennt seine Form nicht — darum wird nicht „echt“
beleuchtet, sondern so, wie man es in Pixel-Art von Hand macht.

**Vorschau:** Solange das Panel offen ist, zeigt die Zeichenfläche Licht und Schatten sofort —
jede Änderung im Panel ist direkt zu sehen, im Bild ist dabei noch nichts verändert.

1. **Lichtquelle** im 3×3-Feld wählen: von wo das Licht kommt (8 Richtungen).
2. **Licht** einstellen — Kanten zur Lampe hin werden heller, abgewandte dunkler.
   - **Stärke** (5–40 %), **Breite** (1–3 px), **Lichtkante** / **Schattenkante** einzeln.
   - Die neuen Farben kommen aus **derselben Farbfamilie der Palette**; fehlt eine passende,
     bleibt der Pixel — mit **Auch Farben außerhalb der Palette** wird eine freie Farbe berechnet.
3. **Schlagschatten** anhaken, Farbe und Abstand (1–3 px) wählen — die Silhouette fällt von
   der Lampe weg.
4. **Als Ebene übernehmen:** über der aktiven Ebene entsteht „Licht · *Name*“, darunter (wenn
   angehakt) „Schatten · *Name*“ — in einem Undo-Schritt.

**Ändern statt neu malen:** Gibt es die Ebenen schon, rechnet **jede Änderung im Panel** sie
sofort neu — Richtung, Stärke, Breite, Schattenfarbe. Die alten Verfärbungen verschwinden
dabei; das Original war ja nie verändert. Jede Änderung ist ein Undo-Schritt.

- Licht und Schatten werden für **alle Frames** berechnet.
- Die Effekt-Ebenen sind **gesperrt** (beim Neuberechnen würde Gemaltes überschrieben) —
  ausprobieren heißt: Ebene ein- und ausblenden; weg damit: Ebene löschen.
- Eine Licht-Ebene gehört zur nächsten normalen Ebene **darunter**, eine Schatten-Ebene zur
  nächsten normalen **darüber**. Ist die aktive Ebene eine Effekt-Ebene, wirkt das Panel auf
  deren Figur.
- **Weitergemalt?** Ändert sich die Figur, zeigt das Panel „An der Figur wurde weitergemalt“ —
  **Neu berechnen** gleicht Licht und Schatten an.
- **Fest übernehmen:** „Nach unten zusammenführen“ (Licht-Ebene aktiv) oder
  „Alle sichtbaren Ebenen zusammenführen“ (siehe [Ebenen](#ebenen)).

---

## Aufräumen

Das Panel **Aufräumen** wirkt auf die aktive Ebene:

- **Hintergrund entfernen** — löscht vom Bildrand her zusammenhängende, ähnlich gefärbte
  Flächen; die *Toleranz* steuert, wie weit es geht.
- **Glätten** — setzt einzelne Streupixel auf die Mehrheitsfarbe ihrer Nachbarn.
- **Outline** — zieht eine Kante (1–3 px) in der gewählten Farbe um alles Gefüllte.

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
4. **Hintergrund entfernen**, **Glätten**, **Outline** (siehe [Aufräumen](#aufräumen)),
   danach **Licht** für Volumen (siehe [Licht](#licht))
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

## Ebenen

Jeder Sprite hat eine oder mehrere **Ebenen** — im Panel „Ebenen“ im Dock und als Zeilen
der [Timeline](#animation--timeline). Die Liste zeigt die oberste Ebene oben, mit
Vorschaubild des aktuellen Frames.

- Gemalt wird immer in die **aktive** Ebene — alle Werkzeuge, Auswahl, Aufräumen und die
  Schablone arbeiten dort. Die Pipette greift, was man sieht.
- **Auge** blendet aus, **Schloss** sperrt. In eine gesperrte oder ausgeblendete Ebene
  wird nicht gemalt; die Statuszeile sagt, warum.
- **Deckkraft** per Regler (ein Undo-Schritt je Ziehen), **Name** per Doppelklick,
  **Reihenfolge** per Ziehen.
- **+** neue leere Ebene über der aktiven, **duplizieren**, **nach unten zusammenführen**
  (in jedem Frame), **alle sichtbaren zusammenführen** (in jedem Frame, auch Licht und
  Schatten; ausgeblendete Ebenen bleiben, wie sie sind), **löschen** (die letzte Ebene bleibt).

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

## Animation — Timeline

Jeder Sprite hat einen oder mehrere **Frames** und eine oder mehrere **Ebenen**. Die
**Timeline** zeigt beides als Raster, wie in gängigen Animations-Programmen: **Ebenen als Zeilen, Frames als
Spalten**. Jedes Feld ist eine **Zelle** — das Bild einer Ebene in einem Frame. Die
Timeline ist eine Leiste wie Werkzeugleiste und Farbzeile (Standard: unter der
Zeichenfläche) und lässt sich genauso andocken, schweben lassen oder ins Dock legen.

**Frames**
- Ein Klick auf eine Zelle wählt Frame und Ebene zugleich.
- **+** fügt dahinter einen leeren Frame ein, daneben **duplizieren** und **löschen**
  (der letzte Frame bleibt). Spalten lassen sich zum Umsortieren ziehen.
- **Mehrere Frames** wählt man mit `Strg`+Klick (einzeln) und `Shift`+Klick (Spanne) —
  Löschen nimmt dann alle markierten in einem Undo-Schritt mit, und PNG/PDF schreiben je
  eine Datei pro Frame. Am Handy gibt es dafür einen Schalter in der Leiste.
- **▶** spielt in der Zeichenfläche ab (`Enter`); ein Tipp auf die Fläche, `Esc` oder
  jede Frame-Aktion hält an. Beim Abspielen wird nicht gezeichnet.
- **FPS** gilt für den ganzen Sprite (1–60). **Dauer** gibt einem einzelnen Frame eine
  eigene Länge in ms; leer heißt „nach FPS“.

**Ebenen in der Timeline**
- Neu, duplizieren und löschen über die Knöpfe in der Ecke des Rasters, **Ziehen** sortiert
  um, **Doppelklick** benennt um. Auge und Schloss stehen vorn in jeder Zeile.
- **Durchgehende Ebene** (Schalter vorn in der Ebenen-Zeile): Neue und duplizierte Frames verknüpfen sich auf
  dieser Ebene mit dem vorigen — gut für Hintergründe, die sich nicht bewegen.

**Zellen**
- **Bereich** aufziehen oder mit `Shift` spannen; **im Bereich ziehen** verschiebt die
  Zellen, mit `Strg` werden sie kopiert.
- **Kopieren**, **Einfügen**, **Leeren** über die Knöpfe der Timeline-Leiste
  (`Strg+V` fügt an der aktiven Zelle ein).
- **Verknüpfen**: Mehrere Zellen teilen sich dann **dasselbe Bild** — malt man in einer,
  ändern sich alle. **Lösen** macht daraus wieder eigenständige Kopien. Verknüpfungen
  überstehen Undo, Speichern, Größe ändern und Umfärben.

**Tags**
- Ein **Tag** gibt einem Abschnitt der Animation einen Namen, eine Farbe und eine
  Abspielrichtung: *vorwärts*, *rückwärts* oder *Ping-Pong* — etwa „Laufen“ in den Frames
  1–8 und „Springen“ in 9–14. Neuer Tag über den Tag-Knopf: er benennt die gewählten Frames.
- Abspielen bleibt im Tag, in dem man gerade steht.
- Der GIF-Export kann **eine Datei je Tag** schreiben (`held_laufen.gif` …); der
  Spritesheet-Atlas nennt die Tags mit.

**Timeline-Menü** (⚙ in der Leiste)
- **Position** oben, unten, links oder rechts.
- **Kopfzeile:** Zählung ab 0 oder 1, Vorschaubilder an/aus.
- **Dauer** des aktuellen Frames.
- **Onion Skin:** zeigt Nachbar-Frames durchscheinend — rot/blau getönt oder in echten
  Farben, mit Deckkraft, Abstufung, bis zu 3 Frames davor und danach, im Tag im Kreis, nur
  die aktive Ebene, vor oder hinter dem Bild.

Gezeichnet wird immer in der aktiven Zelle — alle Werkzeuge, Auswahl und Effekte arbeiten
dort. Was den ganzen Sprite betrifft, wirkt auf **alle Frames und Ebenen**: Größe ändern,
drehen um 90°, spiegeln, skalieren, zuschneiden und zentrieren (beides über die Begrenzung
aller Frames, damit die Animation nicht springt) sowie Paletten-Zuweisung, „Bildfarben in
die Palette“ und „Bild → Palette“. Nur die freie Drehung dreht den sichtbaren Frame.

Frame-, Ebenen- und Zellen-Aktionen sowie das Ändern von FPS und Dauer sind normale
Undo-Schritte. Ein Undo-Eintrag sichert dafür den ganzen Sprite; Bilder, die sich nicht
geändert haben, teilen sich ihre Kopie — auch über mehrere Schritte hinweg.

**Code-Formate mit mehreren Frames** (mit einem Frame bleibt alles wie unter
[Code-Formate](#code-formate)):

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

## Import / Export

### Code-Formate

Das Code-Feld hat eine **Format**-Auswahl. Alle Formate enthalten die Farben, sind also
für sich allein benutzbar:

| Format | Datei | Wofür |
|---|---|---|
| TypeScript | `.ts` | `number[][]` + `Record<number, string>` — der Klassiker |
| JavaScript (ESM) | `.js` | Dasselbe ohne Typen |
| JSON | `.json` | Sprachneutral, für eigene Pipelines und Engines |
| JSON (Spiel) | `.json` | Flaches `data`-Array, Palette `#rrggbbaa` mit Material je Farbe, versioniert — für Spiele (C#-Loader: [docs/csharp-loader.md](csharp-loader.md)) |
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
  Editor (GIF rechnet in 1/100 s). Hat der Sprite Tags, schreibt *GIF: eine Datei je Tag*
  je Abschnitt eine eigene Datei, in seiner Richtung. Höchstens 255 Farben plus Transparent; bei mehr
  Farben erst mit „Bild → Palette …“ reduzieren. Eigener Encoder (`js/gif.js`).
- **Spritesheet** packt *alle* Sprites in gleich große Zellen und schreibt einen
  JSON-Atlas daneben: Name, Palette und Pixelkoordinaten je Frame. Ohne Animation ist es
  ein möglichst quadratisches Raster; sobald ein Sprite mehrere Frames hat, bekommt jeder
  Sprite eine Zeile mit seinen Frames nebeneinander, und jeder Atlas-Eintrag nennt
  zusätzlich `frame` und `duration` (ms). Jeder Frame sitzt mittig in seiner Zelle, der
  Atlas nennt die echte Lage — auch für Sprites, die kleiner als die Zelle sind. Tags
  stehen mit im Atlas.
- *Farb-Legende ins Bild* rendert die verwendeten Farben mit Hex-Codes unter den Sprite.

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
| `Strg+S` / `Strg+O` | Projekt sichern / öffnen |
| `F1` | Hilfe |
| `Esc` | Auswahl aufheben, Dialog oder Vollbild schließen |
| Mittelklick auf einen Reiter | Reiter schließen |
| `Strg` + Ziehen in der Timeline | Zellen kopieren statt verschieben |

---

## Speichern

Der Stand liegt in **IndexedDB** (Datenbank `spritebit`, `js/idb.js`):

- `sprites` — je Sprite ein Eintrag, die Pixel kompakt als Bytes (`js/pack.js`):
  `Uint8Array` für Palettenfarben, `Uint16Array`, sobald freie Farben vorkommen.
  Verknüpfte Zellen stehen nur einmal drin.
- `kv` — Projekt (Paletten, Materialien, Oberfläche, Reihenfolge der Sprites, offene
  Reiter), Sicherung, Rettung und ein wartender Import.

Gespeichert wird 250 ms nach jeder Änderung und sofort beim Wegwechseln vom Tab —
im Hintergrund, und nur Sprites, deren Prüfsumme sich geändert hat, alles in einer
Transaktion. Beim Schließen kann IndexedDB nicht garantiert fertig schreiben; ist
dann noch etwas offen, kommt der Stand zusätzlich als Notfall-Kopie in den
`localStorage` (`spritebit_emergency`). Beim nächsten Start gewinnt der neuere.

Beim ersten Start nach der Umstellung wird der alte Stand aus dem localStorage-Key
`wb_sprite_tester_v1` übernommen; der Key bleibt als weitere Sicherung liegen.
Ohne IndexedDB (manche privaten Fenster) speichert der Editor wie früher dort als
ein JSON-Text. Projektdatei, Sicherung und Notfall-Kopie haben immer dasselbe
JSON-Format; geladen wird alles über dieselbe Prüfung (`applyPayload`).

Für echte Backups **Projekt sichern** benutzen — das schreibt Sprites, Paletten und
UI-Zustand in eine JSON-Datei. Mit **Speicherort** lässt sich einmalig ein Zielordner
wählen (File System Access API); Browser ohne diese API fallen auf den normalen
Download zurück.

---

## Offline und als App

Wer spritebit einmal online geöffnet hat, kann danach **offline** weiterarbeiten — alles,
auch der PDF-Export. Chrome und Edge bieten in der Adressleiste **Installieren** an, danach
startet der Editor wie ein eigenes Programm.

Online kommt immer die aktuelle Version. Ist ein Update da, erscheint oben ein Band
„Eine neue Version ist da — neu laden“; das × lässt es bis zum nächsten Start liegen.
Projekte haben mit dem Cache nichts zu tun — sie liegen im Speicherstand bzw. in der
Projektdatei (siehe [Speichern](#speichern)).

---

## Eigenheiten

- `file://` geht nicht — ES-Module und Service Worker brauchen HTTP.
- Eine Auswahl ist bewusst flüchtig: sie überlebt weder Reload noch Sprite-Wechsel.
- Ein schwebender Auswahl-Inhalt wird beim Schließen des Tabs abgesetzt. Stürzt der
  Browser mittendrin ab, ist die letzte Bewegung verloren — das Loch im Bild sieht man
  aber, solange etwas schwebt.
- Die Zwischenablage der Auswahl liegt im Speicher, nicht in der System-Zwischenablage —
  `Strg`+`C` im Editor kopiert also keine Pixel in andere Programme.
- Sprites sind höchstens **1024 × 1024** Pixel groß. Jedes Pixel ist im Arbeitsspeicher
  eine JS-Zahl; ein 1024er-Sprite mit 8 Frames und 2 Ebenen braucht rund ein halbes
  Gigabyte. Am Rechner läuft das flüssig, am Handy kann es bei vielen Frames eng werden.
  Für größere Bilder müsste das Datenmodell auf Byte-Felder umgestellt werden.
- Große Sprites (ab 256 × 256): die Zeichenfläche wird mit gedeckelter Auflösung gezeichnet
  und per CSS gezoomt (`js/raster.js`, sonst lehnen Browser die Fläche ab — iOS ab ~16 Mio.
  Pixel); nicht aktive Ebenen kommen aus einem Zwischenspeicher; die Bildchen in Timeline,
  Ebenen-Panel und Vorschau folgen erst nach einer kurzen Malpause; der Code im
  Ausgabe-Feld wird erst beim Kopieren oder Speichern gebaut (ab 300 000 Pixeln über
  alle Frames).
- Inkognito-Modus verliert alles beim Tab-Schließen.
- Speicherplatz: IndexedDB fasst je nach Browser hunderte MB. Ohne IndexedDB
  (Rückfall localStorage) gilt ein Limit von ~5 MB; bei Überschreitung erscheint ein
  Hinweis-Toast.
- Die Schablonen-Pipette ignoriert Stellen mit Alpha = 0.

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
