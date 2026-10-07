#!/usr/bin/env python3
"""Baut das ZIP für itch.io — nur die Dateien, die wirklich ausgeliefert werden.

itch entpackt das Archiv und spielt es im iframe ab; dabei muss `index.html`
ganz oben liegen. Auf itch soll der Besucher sofort im Editor stehen, nicht
erst auf der Startseite: die Projektseite drumherum übernimmt deren Aufgabe.
Darum wird hier getauscht —

    index.html   ← editor.html   (Einstieg)
    start.html   ← index.html    (die bisherige Startseite, weiter erreichbar)

— und die beiden Verweise aufeinander umgeschrieben. Die Quelldateien im
Projekt bleiben unberührt.

Nicht mitgenommen werden Tests, Werkzeuge, Typdateien und alles, was nur für
Suchmaschinen da ist (robots.txt, sitemap.xml, Google-Nachweis).

    python tools/make_itch.py                 # → dist/spritebit-itch.zip
    python tools/make_itch.py --landing       # Startseite bleibt der Einstieg

Reine Standardbibliothek, keine Abhängigkeiten.
"""
import os
import re
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'dist')
OUT = os.path.join(OUT_DIR, 'spritebit-itch.zip')

# Einzelne Dateien im Hauptordner, die mitkommen.
FILES = ['index.html', 'editor.html', 'impressum.html', 'datenschutz.html',
         'styles.css', 'landing.css', 'site.webmanifest', 'sw.js']
# Ordner, die komplett mitkommen.
DIRS = ['js', 'vendor', 'assets']
# Endungen, die nie ausgeliefert werden (Typbeschreibungen für npm run check).
SKIP_EXT = ('.d.ts',)
# Nur für Suchmaschinen und Link-Vorschauen — im iframe nutzlos.
SKIP = {'assets/og-image.png'}


def collect():
    """Alle auszuliefernden Pfade, relativ zum Projekt."""
    out = [f for f in FILES if os.path.exists(os.path.join(ROOT, f))]
    for d in DIRS:
        for base, _, names in os.walk(os.path.join(ROOT, d)):
            for n in names:
                rel = os.path.relpath(os.path.join(base, n), ROOT).replace(os.sep, '/')
                if rel not in SKIP and not rel.endswith(SKIP_EXT):
                    out.append(rel)
    return sorted(set(out))


def read(rel):
    with open(os.path.join(ROOT, rel), 'rb') as fh:
        return fh.read()


def swap_entry(files):
    """editor.html wird zum Einstieg, die Startseite heißt dann start.html.

    Gibt {Pfad im Archiv: Inhalt} für die drei betroffenen Dateien zurück.
    """
    editor = read('editor.html').decode('utf-8')
    landing = read('index.html').decode('utf-8')

    # Im Editor zeigt die Wortmarke auf die Startseite — die heißt jetzt anders.
    editor = editor.replace('href="index.html"', 'href="start.html"')
    # Auf der Startseite führen alle Knöpfe zum Editor, der jetzt index.html ist.
    landing = landing.replace('href="editor.html"', 'href="index.html"')

    return {
        'index.html': editor.encode('utf-8'),
        'start.html': landing.encode('utf-8'),
        'editor.html': None,          # geht in index.html auf
    }


def patch_sw(data, landing_first):
    """Offline-Liste an die getauschten Namen anpassen.

    Der Service Worker legt beim ersten Besuch die Liste aus `sw.js` in den
    Cache. Ohne diese Anpassung stuende dort `editor.html` (gibt es nicht mehr)
    und `start.html` fehlte — die Startseite waere offline nicht da. Fehlende
    Dateien uebergeht der Worker zwar still, aber falsch ist die Liste trotzdem.
    """
    if landing_first:
        return data
    text = data.decode('utf-8')
    text = text.replace("  'editor.html',", "  'start.html',")
    # Offline-Rueckfall fuer Seitenaufrufe: zeigt sonst auf eine Datei, die es
    # im Archiv nicht mehr gibt.
    text = text.replace("cache.match('editor.html')", "cache.match('index.html')")
    return text.encode('utf-8')


def patch_manifest(data, entry):
    """start_url im Manifest auf den tatsächlichen Einstieg zeigen lassen."""
    text = data.decode('utf-8')
    text = re.sub(r'"(id|start_url)":\s*"[^"]*"',
                  lambda m: '"%s": "./%s"' % (m.group(1), entry), text)
    return text.encode('utf-8')


def main():
    landing_first = '--landing' in sys.argv
    files = collect()
    entry = 'index.html' if landing_first else 'index.html'   # immer so benannt
    swapped = {} if landing_first else swap_entry(files)

    os.makedirs(OUT_DIR, exist_ok=True)
    written = []
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
        for rel in files:
            if rel in swapped and swapped[rel] is None:
                continue                      # fällt weg (in index.html aufgegangen)
            if rel in swapped:
                data = swapped[rel]
            else:
                data = read(rel)
            # Impressum und Datenschutz verlinken ebenfalls auf den Editor.
            if rel in ('impressum.html', 'datenschutz.html') and not landing_first:
                data = data.decode('utf-8').replace('href="editor.html"', 'href="index.html"').encode('utf-8')
            if rel == 'site.webmanifest':
                data = patch_manifest(data, 'editor.html' if landing_first else entry)
            if rel == 'sw.js':
                data = patch_sw(data, landing_first)
            z.writestr(rel, data)
            written.append(rel)
        # Die umbenannte Startseite kommt zusätzlich hinein.
        for extra, data in swapped.items():
            if extra not in files and data is not None:
                z.writestr(extra, data)
                written.append(extra)

    size = os.path.getsize(OUT)
    print('%s: %d Dateien, %.1f KB' % (os.path.relpath(OUT, ROOT), len(written), size / 1024))
    print('Einstieg: %s' % ('Startseite' if landing_first else 'Editor'))


if __name__ == '__main__':
    main()
