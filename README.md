# 🐾 Sprite Editor

claude

Ursprünglich als Tool zum Erstellen von Hund-/Katze-Sprites für eine React-App gebaut, jetzt als eigenständiger Editor.

---

## 🚀 Schnellstart

`index.html` direkt im Browser öffnen — kein Server nötig.

PDF-Export braucht Internet (jsPDF wird per CDN geladen). PNG funktioniert offline.

---

## ✨ Features

- **Pixel-Art Editor** mit beliebigen Grid-Größen (16×16 bis 128×128)
- **9-Slot-Palette** pro Sprite (Index 0 = transparent, 1–9 = Farben)
- **Built-in Paletten**: 4 Hund-Varianten (golden/brown/black/cream), 4 Katze-Varianten (grey/orange/black/white)
- **Custom Paletten** erstellen, bearbeiten, löschen
- **Custom Sprites** beliebiger Größe anlegen
- **Schablone** (Referenzbild) als Overlay:
  - Deckkraft regelbar 0–100%
  - Größe regelbar 10–200%
  - Verschieben per Drag (Shift+Linksklick)
  - Pipette (Shift+Rechtsklick) extrahiert exakten Hex-Wert
  - Shift halten = Schablone in Vordergrund (Tracing-Modus)
- **Export**:
  - PNG mit transparentem Hintergrund (1× / 4× / 8× / 16× / 32× Skalierung)
  - PDF mit eingebetteter PNG (gleiche Skalierungen)
  - TypeScript-Array (`number[][]`) zum Reinkopieren in Code
- **localStorage**: alles wird automatisch gespeichert — Sprites, Custom-Paletten, UI-State

### UI

- **Übersicht ein-/ausklappbar** — Toggle-Button oben rechts in der Übersichtsleiste
- **Sprite-Sammlungen als Thumbnail-Cards** — jede Sammlung (Hund, Katze, Custom) hat eine eigene kompakte Card mit Vorschau; Klick öffnet das Sprites-Panel darunter
- **Farbpaletten ein-/ausklappbar** — Toggle-Button im Farbpaletten-Panel (standardmäßig zugeklappt)
- **Editor-Hintergrund umschalten** — Dunkel (dunkles Schachbrett) oder Hell (weiß/grau) direkt im Editor-Header
- **Undo / Redo** — Buttons im Editor-Fenster (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)

---

## ⌨️ Shortcuts

| Aktion | Wirkung |
|---|---|
| **Linksklick** | Pixel malen mit aktueller Farbe |
| **Linksklick + ziehen** | Durchgehend malen |
| **Rechtsklick** | Pixel löschen (= Index 0) |
| **Rechtsklick + ziehen** | Durchgehend löschen |
| **Alt + Linksklick** | Pipette auf Canvas-Pixel (übernimmt Index) |
| **Shift halten** | Schablone in Vordergrund (volle Deckkraft) |
| **Shift + Linksklick + ziehen** | Schablone verschieben |
| **Shift + Rechtsklick** | Schablone-Pipette (exakter Hex-Wert) |
| **0–9** | Farbe per Palette-Index wechseln |

---

## 🎨 Palette-System

Eine Palette ist ein Mapping von Index (0–9) → Hex-Farbe:

| Index | Bedeutung (Hund) | Bedeutung (Katze) |
|---|---|---|
| 0 | Transparent | Transparent |
| 1 | Fell hell | Fell hell |
| 2 | Fell mittel | Fell mittel |
| 3 | Fell dunkel | Fell dunkel |
| 4 | Fell sehr dunkel | Fell sehr dunkel |
| 5 | Outline / Kontur | Outline / Kontur |
| 6 | Nase / Mund | Nase / Mund |
| 7 | Augen-Glanz | Augen-Glanz |
| 8 | Pfoten / Detail | Pfoten / Detail |
| 9 | — (nicht genutzt) | Streifen / Iris |

Hund hat 8 Farben (1–8), Katze 9 (1–9). Die Indices 5–8 (bzw. 9) sind als "Fixed" definiert — bei allen Varianten gleich, außer eine Palette überschreibt sie.

**Eigene Palette erstellen**: im Palette-Panel rechts auf `+ Palette` klicken → Modal mit Color-Pickern. Du kannst eine Built-in als Basis nehmen und nur einzelne Farben anpassen.

**Bearbeiten/Löschen**: Custom-Paletten haben ein kleines ✎ (bearbeiten) und × (löschen) am Variant-Button.

---

## 📷 Schablone (Referenzbild)

Zum Abzeichnen kannst du ein beliebiges Bild als Overlay laden:

1. Bild via `📷 Schablone` File-Input auswählen
2. **Deckkraft** anpassen (Slider oder Zahlenfeld) — default 50%
3. **Größe** skalieren (10–200%) — default 100%
4. **Verschieben**: Shift halten + Linksklick auf Canvas + ziehen
5. **Zentrieren** Button → Position auf 0,0 zurück
6. **Pipette**: Shift halten + Rechtsklick auf eine Stelle im Bild → Hex wird übernommen

Beim Picken einer Schablonen-Farbe wird der **exakte Hex-Wert** als `curColor` gesetzt (nicht der nächstgelegene Palette-Index!). Das entsprechende Pixel im Grid speichert dann den Hex-String direkt. Beim TypeScript-Export werden solche Pixel als `0` (transparent) ausgegeben — sie dienen nur zum Tracen, für echte Sprites solltest du die finale Palette nutzen.

**Hinweis zum Auslesen**: Beim Bild-Upload wird ein Offscreen-Canvas mit dem Originalbild gebaut, um `getImageData()` für die Pipette zu nutzen. Lokal hochgeladene Bilder (ObjectURL) sind CORS-frei, externe Bilder via URL wären blockiert.

---

## 💾 Persistierung

Alles wird unter dem Key `wb_sprite_tester_v1` im **localStorage** des Browsers gespeichert:

- Built-in Sprite-Edits
- Custom Sprites
- Custom Paletten
- UI-Zustand (aktiver Sprite, Variante, Farbe, Zellgröße)

**Speicher-Verhalten**:
- Auto-Save 250ms nach jeder Änderung (debounced)
- Force-Save beim Tab-Schließen
- Hält praktisch unbegrenzt (überlebt PC-Shutdown, Browser-Update etc.)
- Limit ~5 MB pro Origin (reicht für hunderte Sprites)
- Inkognito-Modus speichert NICHT permanent — alles weg beim Tab-Schließen

**Komplett zurücksetzen**: `🗑 Reset Storage` Button oben rechts.

**Für echte Backups**: Sprites als PNG exportieren — die liegen dann unabhängig vom Browser-Storage auf der Platte.

---

## 📦 Projekt-Struktur

```
sprite-editor/
├── index.html              ← HTML-Struktur, lädt CSS + ES-Module
├── styles.css              ← Komplettes Stylesheet (Dark-Theme)
├── README.md               ← Diese Datei
└── js/
    ├── data.js             ← Konstanten: Paletten, ORIG-Sprites, Color-Labels
    ├── state.js            ← Veränderlicher State + Helpers (getGrid/getPal/...)
    ├── storage.js          ← localStorage save/load/clear
    ├── render.js           ← Alle Render-Funktionen (Editor, Overview, Palette, ...)
    ├── template.js         ← Schablone: Upload, Slider, Drag, Pipette, Shift-Foreground
    ├── sprites.js          ← Custom-Sprite Header-Buttons + "Neuer Sprite"-Modal
    ├── palettes.js         ← Custom-Palette Modal (erstellen/bearbeiten/löschen)
    ├── export.js           ← PNG + PDF Export
    └── app.js              ← Haupt-Entry: Init, Canvas-Events, Tastatur, Wiring
```

### Modul-Abhängigkeiten

```
data.js     (keine Abhängigkeiten)
   ↑
state.js    (importiert data)
   ↑
   ├─ render.js     ← (data, state)
   ├─ storage.js    ← (state, data)
   ├─ template.js   ← (state, render, storage)
   ├─ sprites.js    ← (state, data, render, storage)
   ├─ palettes.js   ← (state, data, render, storage)
   └─ export.js     ← (state, render)
                       ↑
                    app.js     (orchestriert alles, wired Events)
```

`render.js` definiert `renderCallbacks`, die in `app.js` auf konkrete Funktionen aus `storage.js`/`palettes.js` zeigen. Damit vermeiden wir Zirkular-Imports zwischen den Feature-Modulen.

---

## 🛠 Weiterentwickeln

### Neuen Sprite-Typ hinzufügen (z.B. Hase)

1. In `data.js`: neue `RABBIT_PALETTES` + `RABBIT_VARIANTS` ergänzen
2. In `data.js`: `ORIG.rabbit = { normal: [...], ... }` ergänzen (24×24 Grids)
3. In `state.js`: `grids.rabbit = { normal: dc(ORIG.rabbit.normal), ... }` ergänzen
4. In `state.js`: `getPal()` und `getVariants()` um Rabbit-Fall erweitern
5. In `render.js`: `renderOverview()` Typen-Liste erweitern

### Neue Palette-Farbe (Index 10) hinzufügen

1. `data.js`: `COLOR_LABELS[10] = '...'` ergänzen
2. `state.js`: `getMaxIdx()` Returnwert anpassen
3. `data.js`: alle bestehenden Palette-Definitionen um Index 10 ergänzen (sonst undefined)

### Neuen Export-Typ (z.B. SVG)

1. `export.js`: `exportSVG()` Funktion schreiben (svgSprite aus render.js wiederverwenden)
2. `index.html`: Button mit ID `export-svg-btn` ergänzen
3. `export.js initExport()`: Click-Handler verdrahten

---

## 🐛 Bekannte Eigenheiten

- **`file://` funktioniert nicht** — ES Modules brauchen HTTP. Schnellster Workaround: `python -m http.server` im Projekt-Ordner.
- **Inkognito-Modus löscht alles beim Tab-Schließen** — localStorage ist dort session-only.
- **PDF braucht Internet** beim ersten Aufruf (lädt jsPDF vom CDN).
- **Bilder mit transparenten Bereichen**: Die Pipette ignoriert Stellen mit Alpha=0 (zeigt Hinweis im Info-Bar).
- **Sehr große Grids (128×128)** rendern bei niedriger Zellgröße noch flüssig, aber das Overview wird voll wenn viele Custom-Sprites da sind.

---

## 📄 Lizenz

MIT (oder was du willst — eigenes Tool, eigene Wahl)
