#!/usr/bin/env python3
# ════════════════════════════════════════════════════════════════════
# SERVICE WORKER — schreibt die Offline-Dateiliste in sw.js
# ════════════════════════════════════════════════════════════════════
# Alles, was der Browser für Startseite und Editor braucht, muss in der
# PRECACHE-Liste von sw.js stehen, sonst fehlt es offline. Statt die Liste
# von Hand zu pflegen, sammelt dieses Skript die Dateien ein.
#
#   python tools/make_sw.py           # Liste neu schreiben
#   python tools/make_sw.py --check   # nur prüfen, Exit-Code 1 wenn veraltet
#
# Reine Standardbibliothek, keine Abhängigkeiten.
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SW = os.path.join(ROOT, 'sw.js')

# Einzelne Dateien im Hauptordner
FILES = ['./', 'index.html', 'editor.html', 'impressum.html', 'datenschutz.html',
         'styles.css', 'landing.css', 'site.webmanifest']
# Ordner, die komplett mitkommen
DIRS = ['js', 'vendor', 'assets']
# Nur für Suchmaschinen/Link-Vorschauen, offline nutzlos
SKIP = {'assets/og-image.png'}

BEGIN = '// ── generiert von tools/make_sw.py'
END = '// ── Ende generiert'


def collect():
    out = list(FILES)
    for d in DIRS:
        for base, _, names in os.walk(os.path.join(ROOT, d)):
            for n in names:
                rel = os.path.relpath(os.path.join(base, n), ROOT).replace(os.sep, '/')
                if rel not in SKIP:
                    out.append(rel)
    return sorted(set(out), key=lambda p: (p != './', p))


def render(files):
    lines = ['const PRECACHE = [']
    lines += [f"  '{f}'," for f in files]
    lines.append('];')
    return '\n'.join(lines)


def main():
    with open(SW, encoding='utf-8', newline='') as fh:
        src = fh.read()
    nl = '\r\n' if '\r\n' in src else '\n'
    start = src.index(BEGIN)
    start = src.index('\n', start) + 1
    end = src.index(END, start)
    new = src[:start] + render(collect()).replace('\n', nl) + nl + src[end:]

    if '--check' in sys.argv:
        if new != src:
            print('sw.js ist veraltet — python tools/make_sw.py ausführen.')
            sys.exit(1)
        print('sw.js ist aktuell.')
        return

    with open(SW, 'w', encoding='utf-8', newline='') as fh:
        fh.write(new)
    print(f'sw.js: {len(collect())} Dateien in PRECACHE.')


if __name__ == '__main__':
    main()
