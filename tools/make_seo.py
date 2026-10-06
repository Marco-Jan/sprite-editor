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
        'desc': 'Was der Editor kann, in fünf Stationen: vom ersten Pixel '
                'über Paletten und Werkzeuge bis zum Export.',
    },
    {
        'path': '/editor.html',
        'file': 'editor.html',
        'prio': '0.9',
        'freq': 'monthly',
        'title': 'Der Editor',
        'desc': 'Die Anwendung selbst. Läuft ohne Anmeldung im Browser, '
                'speichert lokal.',
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
    return f"""# {SITE_NAME}

> Pixel-Art-Editor, der komplett im Browser läuft. Kein Build, keine
> Anmeldung, keine Cloud — die Arbeit bleibt im localStorage des Nutzers.
> Sprites lassen sich als Bild oder in neun Code-Formaten exportieren.
> Kostenlos, ohne Werbung, ohne Anmeldung.

Der Editor ist reines Frontend: HTML, CSS und ES-Module ohne Bundler. Weil
ES-Module HTTP brauchen, funktioniert ein Aufruf über `file://` nicht.

## Seiten

- [Startseite]({BASE}/): Was der Editor kann, in fünf Stationen erzählt.
- [Editor]({BASE}/editor.html): Die Anwendung selbst.

## Was der Editor kann

- Zeichnen: Stift, Pinsel, Spray, Füllen, Radierer, Zauberstab. Formen als
  Linie, Rechteck und Ellipse mit Live-Vorschau. Symmetrie über zwei Achsen.
- Auswahl: Rechteck, Lasso (freie Form) und Farbauswahl. Der gewählte
  Bereich wird ausgeschnitten und schwebt, bis er abgesetzt wird — er lässt
  sich verschieben, frei drehen, spiegeln und kopieren, ohne den Untergrund
  zu beschädigen.
- Paletten: index-basiert. Index 0 ist immer transparent, 1 bis 9 sind frei
  belegbar. Eine Farbe zu ändern färbt alle Pixel mit diesem Index sofort um.
  Neun Schemata sind eingebaut, eigene lassen sich anlegen.
- Foto-Vorlage: Bild laden, darüberlegen, per Median-Cut auf wenige Farben
  reduzieren, Bildfarben als Palette übernehmen, Hintergrund entfernen,
  glätten, Outline ziehen.
- Ebene: ein zweiter Sprite lässt sich halbdurchsichtig einblenden — zum
  Abpausen und um Teile zwischen Sprites zu übertragen.
- Bild: spiegeln, drehen (auch frei um beliebige Winkel), auf den Inhalt
  zuschneiden, zentrieren, Fläche ändern, hart skalieren.
- Undo und Redo pro Strich, Auto-Save, Tastenkürzel für jedes Werkzeug.

## Export

- Als Bild: PNG mit Transparenz (1× bis 32×), PDF, sowie ein Spritesheet
  aller Sprites mit begleitender JSON-Liste der Positionen.
- Als Code: TypeScript, JavaScript, JSON, SVG, CSS (box-shadow), C-Header
  für Mikrocontroller, Python und ein Text-Raster. Jedes Format enthält die
  Farben und ist für sich allein benutzbar.
- Zurück in den Editor kommen TypeScript, JavaScript und JSON — verlustfrei.
  Der Import wertet keinen Code aus, er prüft den Text gegen eine
  Zeichen-Whitelist.

## Technisches

- Kein Konto, kein Server, keine Telemetrie. Nichts wird hochgeladen.
- Speicherort ist der localStorage des Browsers; für Sicherungen schreibt
  „Projekt sichern" eine JSON-Datei.
- Läuft nach dem ersten Aufruf komplett offline (PWA), auch der PDF-Export,
  und lässt sich als App installieren.

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
