#!/usr/bin/env python3
# ════════════════════════════════════════════════════════════════════
# ICON-GENERATOR — erzeugt alle Logos aus einer einzigen Beschreibung
# ════════════════════════════════════════════════════════════════════
# Das Motiv ist ein 8x8-Raster: eine treppige Diagonale (das Erkennungs-
# zeichen von Pixel-Art) in den beiden Akzentfarben der App, dahinter das
# Transparenz-Schachbrett des Editors. Alles wird hier gerendert, damit
# Favicon, PWA-Icons und OG-Bild garantiert dasselbe Motiv zeigen.
#
#   python tools/make_icons.py
#
# Reine Standardbibliothek — kein Pillow, PNGs werden direkt geschrieben.
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets')

# ── Farben ───────────────────────────────────────────────────────────
BG        = (0x1b, 0x1b, 0x21)
CHECK_A   = (0x21, 0x21, 0x28)
CHECK_B   = (0x1b, 0x1b, 0x21)
GREEN     = (0x6e, 0xd4, 0x9a)   # --primary
BLUE      = (0x6e, 0xa8, 0xfe)   # --accent
TEXT      = (0xe6, 0xe6, 0xea)   # --text
PAGE_BG   = (0x12, 0x12, 0x14)   # --bg

GRID = 8  # Motiv-Raster


def band_cells():
    """Die Treppe: zwei Zellen breit, von unten links nach oben rechts.
    Bleibt im mittleren 6x6-Feld — sonst knabbert die Eckenrundung sie an."""
    cells = {}
    for step in range(5):
        y = step + 1
        t = step / 4
        color = tuple(round(GREEN[i] + (BLUE[i] - GREEN[i]) * t) for i in range(3))
        for x in (5 - step, 6 - step):
            cells[(x, y)] = color
    return cells


BAND = band_cells()


def motif_color(x, y):
    """Farbe einer Motiv-Zelle — Treppe oder Schachbrett dahinter."""
    if (x, y) in BAND:
        return BAND[(x, y)]
    return CHECK_A if (x + y) % 2 == 0 else CHECK_B


# ── PNG schreiben (ohne Fremdbibliothek) ─────────────────────────────
def write_png(path, w, h, rgba):
    """rgba: bytearray der Länge w*h*4"""
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # Filter „None“ — Pixelgrafik komprimiert so gut genug
        raw += rgba[y * w * 4:(y + 1) * w * 4]

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    return png


# ── Rendering ────────────────────────────────────────────────────────
SS = 4  # Supersampling — glättet nur die runden Ecken, die Blöcke bleiben hart


def rounded_alpha(px, py, size, radius):
    """Ist der Punkt innerhalb des abgerundeten Quadrats?"""
    if radius <= 0:
        return True
    cx = min(max(px, radius), size - radius)
    cy = min(max(py, radius), size - radius)
    dx, dy = px - cx, py - cy
    return dx * dx + dy * dy <= radius * radius


def render_icon(size, radius_frac=0.22, inset_frac=0.0):
    """Icon als RGBA-Puffer. `inset_frac` schiebt das Motiv nach innen
    (für maskierbare Icons, die am Rand beschnitten werden dürfen)."""
    S = size * SS
    radius = S * radius_frac
    inset = S * inset_frac
    cell = (S - 2 * inset) / GRID

    big = bytearray(S * S * 4)
    for py in range(S):
        for px in range(S):
            i = (py * S + px) * 4
            if not rounded_alpha(px + 0.5, py + 0.5, S, radius):
                continue  # außerhalb → transparent
            gx = int((px - inset) // cell)
            gy = int((py - inset) // cell)
            if 0 <= gx < GRID and 0 <= gy < GRID:
                r, g, b = motif_color(gx, gy)
            else:
                r, g, b = BG
            big[i:i + 4] = bytes((r, g, b, 255))

    return downsample(big, S, size)


def downsample(buf, src_size, dst_size):
    """Box-Filter um Faktor SS — nur die Rundung wird weich, Kanten bleiben."""
    out = bytearray(dst_size * dst_size * 4)
    f = src_size // dst_size
    area = f * f
    for y in range(dst_size):
        for x in range(dst_size):
            r = g = b = a = 0
            for dy in range(f):
                row = ((y * f + dy) * src_size + x * f) * 4
                for dx in range(f):
                    i = row + dx * 4
                    al = buf[i + 3]
                    r += buf[i] * al
                    g += buf[i + 1] * al
                    b += buf[i + 2] * al
                    a += al
            o = (y * dst_size + x) * 4
            if a:
                out[o:o + 4] = bytes((r // a, g // a, b // a, a // area))
            # sonst bleibt der Pixel transparent
    return out


# ── Pixel-Schrift für das OG-Bild (nur die gebrauchten Buchstaben) ───
FONT = {
    'S': ['01110', '10001', '10000', '01110', '00001', '10001', '01110'],
    'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    'I': ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
    'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    ' ': ['00000'] * 7,
}


def draw_text(buf, W, text, x0, y0, scale, color):
    for ch in text:
        glyph = FONT[ch]
        for gy, row in enumerate(glyph):
            for gx, on in enumerate(row):
                if on != '1':
                    continue
                for py in range(scale):
                    for px in range(scale):
                        x = x0 + gx * scale + px
                        y = y0 + gy * scale + py
                        i = (y * W + x) * 4
                        buf[i:i + 4] = bytes((*color, 255))
        x0 += 6 * scale  # 5 Pixel Glyphe + 1 Pixel Abstand


def render_og(W=1200, H=630):
    """Social-Preview: Motiv links, Wortmarke in Pixelschrift rechts."""
    buf = bytearray()
    for _ in range(W * H):
        buf += bytes((*PAGE_BG, 255))

    # Motiv (ohne Rundung, damit die Blöcke exakt bleiben)
    icon_size = 288
    icon = render_icon(icon_size, radius_frac=0.14)
    ox, oy = 110, (H - icon_size) // 2
    for y in range(icon_size):
        for x in range(icon_size):
            i = (y * icon_size + x) * 4
            a = icon[i + 3]
            if not a:
                continue
            o = ((oy + y) * W + (ox + x)) * 4
            for c in range(3):
                buf[o + c] = (icon[i + c] * a + buf[o + c] * (255 - a)) // 255

    scale = 14
    draw_text(buf, W, 'SPRITE', 500, 210, scale, TEXT)
    draw_text(buf, W, 'EDITOR', 500, 210 + 9 * scale, scale, BLUE)
    return buf


# ── SVG (skalierbares Favicon) ───────────────────────────────────────
def write_svg(path):
    cell = 8  # 8 * 8 = 64er viewBox
    rects = []
    for y in range(GRID):
        for x in range(GRID):
            if (x, y) not in BAND:
                continue
            r, g, b = BAND[(x, y)]
            rects.append(f'<rect x="{x*cell}" y="{y*cell}" width="{cell}" height="{cell}" '
                         f'fill="#{r:02x}{g:02x}{b:02x}"/>')
    checks = []
    for y in range(GRID):
        for x in range(GRID):
            if (x, y) in BAND or (x + y) % 2:
                continue
            checks.append(f'<rect x="{x*cell}" y="{y*cell}" width="{cell}" height="{cell}" '
                          f'fill="#{CHECK_A[0]:02x}{CHECK_A[1]:02x}{CHECK_A[2]:02x}"/>')

    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" '
        'role="img" aria-label="Sprite Editor">\n'
        f'  <rect width="64" height="64" rx="14" fill="#{BG[0]:02x}{BG[1]:02x}{BG[2]:02x}"/>\n'
        '  <g clip-path="url(#r)">\n'
        '    ' + '\n    '.join(checks + rects) + '\n'
        '  </g>\n'
        '  <defs><clipPath id="r"><rect width="64" height="64" rx="14"/></clipPath></defs>\n'
        '</svg>\n'
    )
    with open(path, 'w', encoding='utf-8') as f:
        f.write(svg)


# ── ICO (Container aus mehreren PNGs) ────────────────────────────────
def write_ico(path, pngs):
    """pngs: [(size, png_bytes)] — Vista+ liest PNG direkt aus der ICO."""
    count = len(pngs)
    header = struct.pack('<HHH', 0, 1, count)
    offset = 6 + 16 * count
    entries, blobs = b'', b''
    for size, data in pngs:
        entries += struct.pack('<BBBBHHII',
                               size if size < 256 else 0, size if size < 256 else 0,
                               0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)
    with open(path, 'wb') as f:
        f.write(header + entries + blobs)


# ── Alles erzeugen ───────────────────────────────────────────────────
def main():
    os.makedirs(OUT, exist_ok=True)
    write_svg(os.path.join(OUT, 'icon.svg'))

    ico_parts = []
    for size in (16, 32, 48):
        data = write_png(os.path.join(OUT, f'favicon-{size}.png'), size, size,
                         render_icon(size, radius_frac=0.18))
        ico_parts.append((size, data))
    write_ico(os.path.join(OUT, 'favicon.ico'), ico_parts)

    # Apple füllt selbst ab — deshalb randlos und ohne eigene Rundung.
    write_png(os.path.join(OUT, 'apple-touch-icon.png'), 180, 180,
              render_icon(180, radius_frac=0.0, inset_frac=0.08))

    for size in (192, 512):
        write_png(os.path.join(OUT, f'icon-{size}.png'), size, size, render_icon(size))

    # Maskierbar: randlos, Motiv in der sicheren Zone (80 %).
    write_png(os.path.join(OUT, 'icon-maskable-512.png'), 512, 512,
              render_icon(512, radius_frac=0.0, inset_frac=0.18))

    write_png(os.path.join(OUT, 'og-image.png'), 1200, 630, render_og())

    for name in sorted(os.listdir(OUT)):
        print(f'  {name:28} {os.path.getsize(os.path.join(OUT, name)):>8} B')


if __name__ == '__main__':
    main()
