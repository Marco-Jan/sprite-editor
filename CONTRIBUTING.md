# Mitmachen bei spritebit

Schön, dass du hier bist! Fehler, Ideen und Fragen gern als
[Issue](https://github.com/spritebit/sprite-editor/issues); Pull Requests sind willkommen.
Was der Editor kann, steht im [Handbuch](docs/handbuch.md).

**Inhalt:** [Die Regeln des Hauses](#die-regeln-des-hauses) · [Projekt-Struktur](#projekt-struktur) ·
[Offline-Modus](#offline-modus-service-worker) · [Veröffentlichen](#veröffentlichen) · [Logos](#logos)

---

## Die Regeln des Hauses

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
| `tests/links.test.js` | Verknüpfte Zellen überstehen Undo, Speichern, Größe ändern, Umfärben |
| `tests/cels.test.js` | Zellen der Timeline: verschieben, kopieren, leeren, verknüpfen |
| `tests/tags.test.js` | Tags: Abschnitte, Richtungen, Abspielen im Tag |
| `tests/onion.test.js` | Timeline-Einstellungen und welche Frames durchscheinen |
| `tests/palorder.test.js` | Palette umsortieren, ohne dass sich das Bild ändert |
| `tests/pixelperfect.test.js` | Pixel-perfekt: keine L-Ecken, Untergrund kommt zurück |
| `tests/light.test.js` | Kantenlicht und Schlagschatten |
| `tests/tablist.test.js` | Reiter: öffnen, schließen, ordnen |
| `tests/pack.test.js` | Kompaktes Speicherformat (Bytes, Prüfsumme) |
| `tests/migrate.test.js` | Alte Projektstände überleben die Migration |
| `tests/gif.test.js` | Der GIF-Encoder erzeugt gültige Dateien |
| `tests/zip.test.js` | Das ZIP für mehrere Dateien |
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

## Projekt-Struktur

```
sprite-editor/
├── index.html          ← Startseite
├── landing.css         ← Styles der Startseite
├── editor.html         ← der Editor selbst, keine Inline-Styles
├── styles.css          ← Token-System + Komponenten (Editor)
├── impressum.html, datenschutz.html
├── site.webmanifest    ← PWA-Manifest (Name, Farben, Icons)
├── sw.js               ← Service Worker für den Offline-Modus (Liste: tools/make_sw.py)
├── vendor/jspdf.umd.min.js ← jsPDF für den PDF-Export, lokal statt CDN
├── assets/             ← Logos, Favicons, PWA-Icons, Flaggen, Pixel-Art der Startseite
├── docs/               ← Handbuch, C#-Loader, Bilder für die README
├── tests/              ← alle Tests: npm test
├── tools/              ← Hilfsskripte (nur Python-Standardbibliothek)
│   ├── make_sw.py      ← schreibt die Offline-Dateiliste in sw.js
│   ├── make_icons.py   ← erzeugt alles in assets/ neu
│   ├── make_itch.py    ← baut dist/spritebit-itch.zip für itch.io
│   └── make_flags.py, make_font.py, make_seo.py
├── jsconfig.json       ← Typprüfung ohne Build (npm run check)
├── package.json        ← nur Skripte + TypeScript als Entwicklungs-Abhängigkeit
└── js/
    │   ── Kern
    ├── app.js           ← Haupt-Entry: Init + Event-Bindings + Wiring zwischen Modulen
    ├── state.js         ← Veränderlicher Zustand + Lookup-Helpers
    ├── data.js          ← Konstanten: Farb-Labels + eingebaute Farbpaletten
    ├── history.js       ← Undo/Redo für Grid-Mutationen
    ├── storage.js       ← Speicherstand im Browser (+ Projekt-Datei als JSON)
    ├── idb.js           ← eine kleine Hülle um IndexedDB für den Speicherstand
    ├── pack.js          ← ein Sprite kompakt für IndexedDB, und wieder zurück
    ├── migrate.js       ← altes Hund/Katze-Schema (v1) → generisches Sprite-Schema (v2)
    │   ── Zeichnen und Bild
    ├── render.js        ← alle DOM-/Canvas-Render-Funktionen
    ├── raster.js        ← Bilder als Ganzes zeichnen statt Pixel für Pixel
    ├── view.js          ← Ansicht der Zeichenfläche: zoomen, verschieben, Finger-Gesten
    ├── pixelperfect.js  ← saubere 1-Pixel-Linien beim Freihandzeichnen (Aseprite)
    ├── selection.js     ← Auswahl: aufziehen, lassoen, ausschneiden, verschieben
    ├── transform.js     ← spiegeln, drehen, zuschneiden, zentrieren, Größe ändern
    ├── spritefx.js      ← Bild→Sprite-Helfer: Quantisierung, Glätten, Outline, Zauberstab
    ├── light.js         ← Lichtquelle: Kantenlicht und Schlagschatten per Knopfdruck
    ├── template.js      ← Referenzbild zum Abzeichnen
    ├── guides.js        ← Hilfslinien: freie Linien und Figuren-Proportionen
    ├── preview.js       ← der ganze Sprite, unabhängig vom Zoom der Zeichenfläche
    │   ── Animation
    ├── frames.js        ← Animation: Frames anlegen, wechseln, abspielen, Timeline
    ├── layers.js        ← Ebenen: anlegen, ordnen, ein-/ausblenden, sperren, Deckkraft
    ├── cels.js          ← Zellen der Timeline: verschieben, kopieren, leeren, verknüpfen
    ├── tags.js          ← benannte Abschnitte der Animation, wie in Aseprite
    ├── onion.js         ← Einstellungen der Timeline und welche Frames durchscheinen
    ├── tlmenu.js        ← Einstellungen der Timeline (Knopf ⚙ in der Timeline-Leiste)
    │   ── Farben
    ├── palettes.js      ← eigene Paletten erstellen, bearbeiten, löschen, zuweisen
    ├── palpicker.js     ← Paletten-Auswahl mit Suche, Filter und klappbaren Gruppen
    ├── palorder.js      ← Farben einer Palette umsortieren, ohne dass sich das Bild ändert
    ├── qpdrag.js        ← Farben in der Farbzeile ziehen und so die Palette umsortieren
    ├── reduce.js        ← Bildfarben in eine eigene Palette überführen
    │   ── Sprites und Reiter
    ├── sprites.js       ← anlegen, umbenennen, duplizieren, löschen
    ├── tabs.js          ← Reiter der geöffneten Sprites über der Zeichenfläche
    ├── tablist.js       ← welche Sprites als Reiter offen sind (wie Aseprite/Photoshop)
    │   ── Import und Export
    ├── codegen.js       ← den aktuellen Sprite in verschiedene Textformate gießen
    ├── gamejson.js      ← "JSON (Spiel)": flaches Datenformat für Spiele-Engines
    ├── tsimport.js      ← Sprite-Dateien einlesen, alle Ausgabeformate als Eingabe
    ├── export.js        ← PNG, PDF, GIF und Spritesheet mit JSON-Atlas
    ├── gif.js           ← animiertes GIF89a aus Index-Bildern, ohne Bibliothek
    ├── zip.js           ← mehrere Dateien in einem Archiv, ohne Bibliothek
    ├── filesystem.js    ← Speicherort wählen & merken (File System Access API)
    │   ── Oberfläche
    ├── layout.js        ← Panels und Leisten anpinnen, lösen, verschieben, umsortieren
    ├── place.js         ← wo ein Panel oder eine Leiste sitzt, als EIN Wert
    ├── dock.js          ← Seitenleisten als Icon-Spalte, Kopfzeile als Menü
    ├── menubar.js       ← Menüleiste oben: Datei, Bearbeiten, Ansicht, Hilfe
    ├── fullscreen.js    ← Vollbild: nur Zeichenfläche und die Leisten zum Arbeiten
    ├── icons.js         ← Linien-Icons (SVG, 24×24-Raster), überall im Editor
    ├── toast.js         ← Rückfrage und Hinweis (ersetzt window.confirm / window.alert)
    ├── i18n.js          ← Sprachumschaltung Deutsch / Englisch (Editor + Laufzeit-Texte)
    ├── i18n-at.js       ← österreichische Fassung (Spaß-Sprache)
    ├── pwa.js           ← meldet den Service Worker an (Offline-Modus, siehe sw.js)
    │   ── Startseite und Rechtliches
    ├── landing-i18n.js  ← Deutsch/Englisch für die Startseite
    ├── landing-fx.js    ← Abschnitte blenden beim Hineinscrollen sanft ein
    ├── site-links.js    ← alle Adressen nach draussen an einer Stelle
    ├── legal.js         ← Sprache auf Impressum und Datenschutz
    └── globals.d.ts     ← Typen für Browser-Felder außerhalb des Standards (nie ausgeliefert)
```

Pure Logik ohne DOM steht bewusst in eigenen Modulen (`place.js`, `cels.js`, `tags.js`,
`onion.js`, `palorder.js`, `pixelperfect.js`, `light.js`, `tablist.js`, `pack.js`,
`gamejson.js` …) — die laufen auch unter Node und haben je eine Testdatei.

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
`app.js` (und z. B. `tabs.js`, `frames.js`) verdrahten — das hält den Graph zyklenfrei.

`place.js` hängt an nichts: es kennt weder DOM noch andere Module. Das ist
Absicht — dadurch lässt sich die Andock-Logik ohne Browser prüfen. `layout.js`
benutzt es und ist die einzige Stelle, die daraus DOM macht.

---

## Offline-Modus (Service Worker)

Wer Startseite oder Editor einmal online geöffnet hat, kann danach offline weiterarbeiten.
Der Service Worker (`sw.js`) legt beim ersten Besuch die ganze App im Browser-Cache ab.
Chrome und Edge bieten in der Adressleiste „Installieren“ an, danach startet der Editor wie
eine eigene App.

- **Online** lädt jede Datei frisch vom Server und aktualisiert dabei den Cache. Nach einem
  Deploy bekommt man also beim nächsten Neuladen die neue Version.
- **Offline**, oder wenn der Server länger als 4 Sekunden nicht antwortet, kommt die Datei
  aus dem Cache.
- Projekte liegen in IndexedDB bzw. in der Projektdatei. Mit dem Cache haben sie nichts
  zu tun.

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

## Veröffentlichen

**Alles in einem Durchgang:** `npm run deploy` (bzw. `python tools/deploy.py`) fragt nach
den neuen Versionen für Web und Desktop (Enter = bleibt), trägt sie ein, aktualisiert die
Rust-Abhängigkeiten (`cargo update`, nur wenn die Tests grün bleiben), schreibt die
Offline-Liste neu, lässt alle Tests, die Typprüfung und Clippy laufen, mergt den Web-Branch
lokal nach `main` und pusht dann beide Repos — Vercel geht damit online, ein Pull Request
auf GitHub ist nicht nötig. Bei jedem Fehler bricht es ab, bevor etwas gepusht wird.

| Aufruf | Wirkung |
|---|---|
| `python tools/deploy.py --dry-run` | Probelauf — prüft alles, ändert und pusht nichts |
| `python tools/deploy.py --no-main` | Web nur den Branch pushen, nicht nach `main` mergen |
| `python tools/deploy.py --release` | zusätzlich den Tag `v<Version>` pushen → Desktop-Release |
| `python tools/deploy.py --only web` | nur ein Repo (`web` oder `rs`) |
| `python tools/deploy.py --web-version 3.2.0 --rs-version 1.0.1` | Versionen ohne Nachfrage |

Das Skript erwartet `spritebit-rs` neben diesem Ordner (sonst `--rs <ordner>`).

**Web:** Die Seite ist statisch — jedes Hosting für Dateien genügt (derzeit Vercel). Nach
neuen, umbenannten oder gelöschten Dateien `python tools/make_sw.py` laufen lassen.

**Links nach draußen** (GitHub, Download, Discord, YouTube …) stehen alle in
`js/site-links.js`. Ein leerer Eintrag heißt „gibt es noch nicht“: Startseite und Footer
blenden ihn aus, der Download-Knopf zeigt „bald“.

**Desktop-App:** Die Rust-Fassung (`spritebit-rs`) baut ihre Releases über GitHub Actions
(`.github/workflows/release.yml` dort): ein Tag `v*` pushen, GitHub testet, baut und hängt
`spritebit-windows-x64.zip` an die Release. Der Link
`…/releases/latest/download/spritebit-windows-x64.zip` zeigt immer auf die neueste
Version und gehört in `js/site-links.js` (`download`).

### itch.io

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
Speicher (IndexedDB) liegt in einem fremden Rahmen — Browser trennen Speicher nach
Seite, Safari kann ihn blockieren. Ein Hinweis auf die eigene Adresse auf der
Projektseite ist deshalb sinnvoll.

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

Mit einem Beitrag stellst du ihn unter dieselbe [MIT-Lizenz](LICENSE) wie den Rest des Projekts.
