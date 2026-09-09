#!/usr/bin/env python3
# ════════════════════════════════════════════════════════════════════
# FLAGGEN — Pixel-Flaggen für den Sprachumschalter
# ════════════════════════════════════════════════════════════════════
# Erzeugt assets/flag-de.png und assets/flag-en.png als winzige Rastergrafik.
# Bewusst gezeichnet statt als CSS-Verlauf: ein Union Jack braucht Diagonalen,
# und die würden im Verlauf weichgezeichnet — in einer Pixel-Oberfläche fällt
# das sofort auf. Als Raster bleibt jede Kante hart.
#
#   python tools/make_flags.py
#
# Reine Standardbibliothek. 15x9 entspricht genau dem Seitenverhältnis der
# deutschen Flagge (5:3); der Union Jack ist eigentlich 2:1 und hier auf
# dasselbe Format gebracht, damit beide Knöpfe gleich groß sind.
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets')

W, H = 15, 9

SCHWARZ = (0x1a, 0x1a, 0x1a)   # nicht ganz schwarz, sonst verschwindet es im Panel
ROT_DE  = (0xdd, 0x00, 0x00)
GOLD    = (0xff, 0xce, 0x00)

BLAU    = (0x01, 0x21, 0x69)
WEISS   = (0xff, 0xff, 0xff)
ROT_UK  = (0xc8, 0x10, 0x2e)

ROT_AT  = (0xed, 0x29, 0x39)


def flagge_de():
    """Drei waagerechte Bahnen zu je drei Zeilen."""
    px = []
    for y in range(H):
        farbe = SCHWARZ if y < 3 else (ROT_DE if y < 6 else GOLD)
        px.append([farbe] * W)
    return px


def flagge_at():
    """Rot-Weiss-Rot, drei waagerechte Bahnen zu je drei Zeilen."""
    px = []
    for y in range(H):
        farbe = ROT_AT if y < 3 else (WEISS if y < 6 else ROT_AT)
        px.append([farbe] * W)
    return px


def flagge_uk():
    """Union Jack: blaues Feld, weisses Andreaskreuz, rotes Georgskreuz.
    Die Diagonalen werden gerastert, nicht gezeichnet — deshalb pruefen wir
    je Pixel den Abstand zur idealen Linie."""
    px = [[BLAU] * W for _ in range(H)]

    def auf_diagonale(x, y, gespiegelt, dicke):
        # Ideale Linie von Ecke zu Ecke, in Zellmitten gerechnet.
        xf = (x + 0.5) / W
        yf = (y + 0.5) / H
        if gespiegelt:
            xf = 1 - xf
        return abs(xf - yf) * min(W, H) < dicke

    # Weisses Andreaskreuz, breit
    for y in range(H):
        for x in range(W):
            if auf_diagonale(x, y, False, 1.15) or auf_diagonale(x, y, True, 1.15):
                px[y][x] = WEISS

    # Rote Diagonalen, schmaler und in der weissen Bahn liegend
    for y in range(H):
        for x in range(W):
            if auf_diagonale(x, y, False, 0.5) or auf_diagonale(x, y, True, 0.5):
                px[y][x] = ROT_UK

    # Weisses Georgskreuz: drei Spalten und drei Zeilen um die Mitte
    mx, my = W // 2, H // 2
    for y in range(H):
        for x in range(W):
            if mx - 1 <= x <= mx + 1 or my - 1 <= y <= my + 1:
                px[y][x] = WEISS

    # Rotes Georgskreuz: die Mittelspalte und Mittelzeile
    for y in range(H):
        px[y][mx] = ROT_UK
    for x in range(W):
        px[my][x] = ROT_UK

    return px


def schreibe(pfad, px):
    roh = bytearray()
    for zeile in px:
        roh.append(0)                       # Filter „None" — bei 15px egal
        for (r, g, b) in zeile:
            roh += bytes((r, g, b, 255))

    def block(tag, daten):
        c = struct.pack('>I', len(daten)) + tag + daten
        return c + struct.pack('>I', zlib.crc32(tag + daten) & 0xffffffff)

    with open(pfad, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n'
                + block(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0))
                + block(b'IDAT', zlib.compress(bytes(roh), 9))
                + block(b'IEND', b''))
    return os.path.getsize(pfad)


def vorschau(px, name):
    """Grobe Textansicht zur Kontrolle im Terminal."""
    zeichen = {SCHWARZ: '#', ROT_DE: 'R', GOLD: 'G',
               BLAU: '.', WEISS: 'w', ROT_UK: 'R', ROT_AT: 'A'}
    print(f'  {name}')
    for zeile in px:
        print('    ' + ''.join(zeichen.get(p, '?') for p in zeile))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, bauen in (('flag-de', flagge_de), ('flag-en', flagge_uk),
                        ('flag-at', flagge_at)):
        px = bauen()
        n = schreibe(os.path.join(OUT, name + '.png'), px)
        vorschau(px, f'{name}.png  {W}x{H}  {n} B')
