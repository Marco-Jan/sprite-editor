#!/usr/bin/env python3
# ════════════════════════════════════════════════════════════════════
# SEO — erzeugt robots.txt, sitemap.xml und llms.txt
# ════════════════════════════════════════════════════════════════════
# Die Domain steht NUR hier. Wer umzieht, ändert BASE und lässt das Skript
# neu laufen — dann stimmen Sitemap, robots und llms.txt wieder zusammen.
# Die absoluten URLs in den <link rel="canonical">- und og:url-Tags der
# beiden HTML-Seiten werden dabei mitgezogen.
#
#   python tools/make_seo.py
#
# Reine Standardbibliothek, keine Abhängigkeiten.
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── Die einzige Stelle mit der Domain ───────────────────────────────
# Die Seite läuft auf eigener Domain (gehostet bei Vercel).
BASE = 'https://spritebit.at'

SITE_NAME = 'spritebit'
LANG = 'de'

# ── Die Seiten ──────────────────────────────────────────────────────
# changefreq/priority sind Hinweise, keine Befehle; Google ignoriert sie
# weitgehend, andere Crawler lesen sie noch.
PAGES = [
    {
        'path': '/',
        'file': 'index.html',
        'prio': '1.0',
        'freq': 'monthly',
        'title': 'Startseite',
        'desc': 'Zum Ausprobieren: ein kleines Raster zum Malen und Paletten '
                'zum Umfärben, dazu der Weg zu Editor und Desktop-App.',
    },
    {
        'path': '/editor.html',
        'file': 'editor.html',
        'prio': '0.9',
        'freq': 'monthly',
        'title': 'Editor',
        'desc': 'Die Anwendung selbst. Läuft ohne Anmeldung im Browser, '
                'speichert lokal.',
    },
    {
        'path': '/funktionen.html',
        'file': 'funktionen.html',
        'prio': '0.8',
        'freq': 'monthly',
        'title': 'Funktionen',
        'desc': 'Alle Werkzeuge im Überblick und der Weg vom Foto zum Sprite.',
    },
    {
        'path': '/export.html',
        'file': 'export.html',
        'prio': '0.7',
        'freq': 'monthly',
        'title': 'Export',
        'desc': 'Bild, GIF, Spritesheet, Godot und neun Code-Formate.',
    },
    {
        'path': '/desktop.html',
        'file': 'desktop.html',
        'prio': '0.8',
        'freq': 'monthly',
        'title': 'Desktop-App (Windows)',
        'desc': 'Download, Installation in drei Schritten und der Vergleich '
                'Browser gegen Desktop.',
    },
]


def lastmod(rel):
    """Letztes Commit-Datum der Datei; sonst Änderungsdatum auf der Platte."""
    try:
        out = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', rel],
                             cwd=ROOT, capture_output=True, text=True, timeout=10)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except Exception:
        pass
    import datetime
    ts = os.path.getmtime(os.path.join(ROOT, rel))
    return datetime.date.fromtimestamp(ts).isoformat()


def write(rel, text):
    path = os.path.join(ROOT, rel)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print(f'  {rel:16} {len(text.encode("utf-8")):>6} B')


# ════════════════════════════════════════════════════════════════════
# robots.txt
# ════════════════════════════════════════════════════════════════════
def build_robots():
    return f"""# {SITE_NAME}
# Alles darf gelesen werden — die Seite ist ein offenes Werkzeug.

User-agent: *
Allow: /

# Arbeitsdateien, die in einem Suchergebnis niemand braucht.
Disallow: /tools/
Disallow: /js/
Disallow: /assets/sprites/

Sitemap: {BASE}/sitemap.xml
"""


# ════════════════════════════════════════════════════════════════════
# sitemap.xml
# ════════════════════════════════════════════════════════════════════
def build_sitemap():
    urls = []
    for p in PAGES:
        urls.append(
            '  <url>\n'
            f'    <loc>{BASE}{p["path"]}</loc>\n'
            f'    <lastmod>{lastmod(p["file"])}</lastmod>\n'
            f'    <changefreq>{p["freq"]}</changefreq>\n'
            f'    <priority>{p["prio"]}</priority>\n'
            '  </url>'
        )
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + '\n'.join(urls)
            + '\n</urlset>\n')


# ════════════════════════════════════════════════════════════════════
# llms.txt  (Format nach llmstxt.org)
# ════════════════════════════════════════════════════════════════════
# Kurzfassung der Seite für Sprachmodelle: eine H1, ein Blockzitat als
# Zusammenfassung, danach Abschnitte mit Links und je einem Satz.
def build_llms():
    pages = '\n'.join(f"- [{p['title']}]({BASE}{p['path']}): {p['desc']}"
                      for p in PAGES)
    return f"""# {SITE_NAME}

> Kostenloser Pixel-Art-Editor für Sprites, Animationen und Spiel-Levels. Läuft
> komplett im Browser (offline, ohne Konto, nichts wird hochgeladen) und als
> Desktop-App für Windows. Export als Bild, GIF, Spritesheet, Godot-Szene oder
> in neun Code-Formaten. Open Source (MIT).

Die Web-Version ist reines Frontend: HTML, CSS und ES-Module ohne Bundler. Weil
ES-Module HTTP brauchen, funktioniert ein Aufruf über `file://` nicht. Die
Desktop-App ist in Rust geschrieben (egui) und liest und schreibt dieselben
Projektdateien.

## Seiten

{pages}
- [Download Desktop-App](https://github.com/spritebit/spritebit-rs/releases/latest): Neueste Version auf GitHub Releases.
- [Quellcode Web](https://github.com/spritebit/sprite-editor) · [Quellcode Desktop](https://github.com/spritebit/spritebit-rs)
- [Handbuch](https://github.com/spritebit/sprite-editor/blob/main/docs/handbuch.md)

## Was der Editor kann

- Zeichnen: Stift, Pinsel, Spray (Größe 1–64), Füllen, Radierer, Zauberstab.
  Clean Stroke für saubere 1-Pixel-Linien. Formen als Linie, Rechteck und
  Ellipse mit Live-Vorschau. Symmetrie über zwei Achsen.
- Auswahl: Rechteck, Lasso (freie Form) und Farbauswahl. Der gewählte Bereich
  schwebt, bis er abgesetzt wird — verschieben, frei drehen, spiegeln, kopieren.
- Paletten: index-basiert, bis zu 255 Farben, 17 eingebaut, eigene anlegen.
  Index 0 ist transparent. Eine Farbe zu ändern färbt alle Pixel mit diesem
  Index sofort um. Nach Farbstufen sortieren.
- Ebenen: Deckkraft, ausblenden, sperren, Masken (ausblenden ohne zu löschen),
  zusammenführen.
- Animation: Timeline als Raster aus Ebenen und Frames, Zellen kopieren und
  verschieben, verknüpfte Zellen, durchgehende Ebenen, Tags mit Richtung
  (vorwärts, rückwärts, Ping-Pong), Onion Skin, FPS und Dauer je Frame.
- Kacheln (Tilemaps): Tilemap-Ebenen mit eigenem Kachelsatz (8–64 px). Eine
  Kachel anmalen ändert sie überall, wo sie liegt. Auto- und Manuell-Modus,
  Kacheln setzen und füllen. Export für Godot 4 (TileMapLayer) und als JSON.
- Licht: Lichtquelle aus 8 Richtungen, Licht- und Schattenkante sowie
  Schlagschatten als eigene, jederzeit neu berechnete Ebenen.
- Foto-Vorlage: Bild laden, darüberlegen, auf wenige Farben reduzieren,
  Bildfarben als Palette übernehmen, Hintergrund entfernen, glätten, Outline.
- Bild: spiegeln, drehen (auch frei), zuschneiden, zentrieren, Fläche ändern,
  hart skalieren. In Größenfeldern darf man rechnen (z. B. 24 * 4).
- Hilfslinien und Figuren-Proportionen (2–8 Kopfhöhen), als eigene Layouts
  speicherbar.
- Arbeitsplatz: Reiter für geöffnete Sprites, Panels anpinnen, schweben lassen
  oder ins Dock legen. Undo pro Strich, Auto-Save, Tastenkürzel für jedes Werkzeug.

## Export

- Bild: PNG mit Transparenz (1× bis 32×), PDF, animiertes GIF (auch je Tag),
  Spritesheet aller Sprites und Frames mit JSON-Atlas.
- Godot 4: Kachelbild (PNG) plus Szene (.tscn) mit einer TileMapLayer je
  Tilemap-Ebene, dazu ein JSON mit der Karte.
- Code: TypeScript, JavaScript, JSON, JSON für Spiele-Engines (mit Material je
  Farbe), SVG, CSS (box-shadow), C-Header für Mikrocontroller, Python und ein
  Text-Raster. Jedes Format enthält die Farben und alle Frames.
- Alle neun Code-Formate lassen sich wieder importieren — das Bild bleibt dabei
  unverändert. Der Import wertet keinen Code aus.

## Technisches

- Sprite-Größe: im Browser bis 1024 × 1024 Pixel, in der Desktop-App bis
  8192 × 8192 (Bilder in Kacheln, nur Bemaltes belegt Speicher).
- Kein Konto, kein Server, keine Telemetrie. Nichts wird hochgeladen.
- Speicherort ist der Browser (IndexedDB); „Projekt sichern“ schreibt eine
  JSON-Datei, die auch die Desktop-App öffnet.
- Läuft nach dem ersten Aufruf komplett offline (PWA) und lässt sich als App
  installieren.
- Sprachen: Deutsch, Englisch und Österreichisch.

## Rechtliches

- [Impressum]({BASE}/impressum.html)
- [Datenschutz]({BASE}/datenschutz.html)
"""


# ════════════════════════════════════════════════════════════════════
# Canonical- und og:url-Tags in den HTML-Seiten mitziehen
# ════════════════════════════════════════════════════════════════════
def sync_html():
    for p in PAGES:
        path = os.path.join(ROOT, p['file'])
        with open(path, encoding='utf-8') as f:
            s = f.read()
        url = BASE + p['path']

        before = s
        s = re.sub(r'(<link rel="canonical" href=")[^"]*(")',
                   lambda m: m.group(1) + url + m.group(2), s)
        s = re.sub(r'(<meta property="og:url" content=")[^"]*(")',
                   lambda m: m.group(1) + url + m.group(2), s)
        # Absolute Bild-URL: manche Dienste folgen relativen og:image nicht.
        img = BASE + '/assets/og-image.png'
        s = re.sub(r'(<meta property="og:image" content=")[^"]*(")',
                   lambda m: m.group(1) + img + m.group(2), s)
        s = re.sub(r'(<meta name="twitter:image" content=")[^"]*(")',
                   lambda m: m.group(1) + img + m.group(2), s)
        # Strukturierte Daten (JSON-LD): Adresse und Vorschaubild.
        s = re.sub(r'("url"\s*:\s*")[^"]*(")',
                   lambda m: m.group(1) + BASE + '/' + m.group(2), s)
        s = re.sub(r'("image"\s*:\s*")[^"]*(")',
                   lambda m: m.group(1) + img + m.group(2), s)

        if s != before:
            with open(path, 'w', encoding='utf-8', newline='') as f:
                f.write(s)
            print(f'  {p["file"]:16} URLs aktualisiert')


if __name__ == '__main__':
    print(f'Basis-URL: {BASE}')
    write('robots.txt', build_robots())
    write('sitemap.xml', build_sitemap())
    write('llms.txt', build_llms())
    sync_html()
