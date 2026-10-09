#!/usr/bin/env python3
# ════════════════════════════════════════════════════════════════════
# PIXELSCHRIFT — erzeugt assets/landing/pixel.ttf aus Bitmap-Glyphen
# ════════════════════════════════════════════════════════════════════
# Warum selbst bauen: die Landingpage darf nichts nachladen (kein Google
# Fonts, keine CDN). Eine fremde Schrift ins Repo zu legen wirft dazu eine
# Lizenzfrage auf. Also entsteht sie hier aus einer Bitmap-Tabelle — eigenes
# Werk, keine Abhängigkeit, passt zum Rest des Projekts.
#
#   python tools/make_font.py
#
# Reine Standardbibliothek. Jedes gesetzte Bitmap-Feld wird zu einem
# Rechteck-Kontur im glyf-Table; waagerechte Läufe werden vorher
# zusammengefasst, damit die Datei klein bleibt.
import os
import struct

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'assets', 'landing', 'pixel.ttf')

FAMILY = 'Sprite Pixel'
VERSION = '1.000'

# ── Maße ────────────────────────────────────────────────────────────
# Glyphenzelle 5 x 7 über der Grundlinie, Zeile 7 liegt darunter
# (Unterlängen von g j p q y). 1 Feld = 128 Einheiten, em = 1024.
PX = 128
UPEM = 1024
CELL_W, CELL_H = 5, 8
BASELINE_ROW = 7          # Zeilen 0..6 stehen über der Grundlinie
ASCENT = 7 * PX           # 896
DESCENT = 1 * PX          # 128
ADVANCE = 6 * PX          # .notdef: 5 breit + 1 Feld Abstand
# Proportional: jedes Zeichen ist so breit, wie seine Pixel reichen, plus
# 1 Feld Abstand. Mit fester Breite (monospace) bekam das schmale „i“ links
# und rechts Luft und wirkte in „Pixel“ wie „Pi xel“.
GAP = 1 * PX
SPACE_ADVANCE = 4 * PX    # Wortabstand

# ── Glyphen ─────────────────────────────────────────────────────────
# Sieben Zeilen je Zeichen, '#' = gesetzt. Unterlängen bekommen acht.
G = {
    ' ': '...../...../...../...../...../...../.....',
    '!': '..#../..#../..#../..#../..#../...../..#..',
    '"': '.#.#./.#.#./...../...../...../...../.....',
    "'": '..#../..#../...../...../...../...../.....',
    '(': '...#./..#../..#../..#../..#../..#../...#.',
    ')': '.#.../..#../..#../..#../..#../..#../.#...',
    '*': '...../.#.#./..#../#####/..#../.#.#./.....',
    '+': '...../..#../..#../#####/..#../..#../.....',
    ',': '...../...../...../...../...../..#../..#../.#...',
    '-': '...../...../...../#####/...../...../.....',
    '.': '...../...../...../...../...../...../..#..',
    '/': '....#/...#./..#../..#../.#.../#..../.....',
    ':': '...../..#../...../...../...../..#../.....',
    ';': '...../..#../...../...../..#../..#../.#...',
    '?': '.###./#...#/....#/...#./..#../...../..#..',
    '_': '...../...../...../...../...../...../#####',
    '·': '...../...../...../..#../...../...../.....',
    '—': '...../...../...../#####/...../...../.....',
    '·': '...../...../...../..#../...../...../.....',

    '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
    '1': '..#../.##../..#../..#../..#../..#../.###.',
    '2': '.###./#...#/....#/...#./..#../.#.../#####',
    '3': '#####/...#./..#../...#./....#/#...#/.###.',
    '4': '...#./..##./.#.#./#..#./#####/...#./...#.',
    '5': '#####/#..../####./....#/....#/#...#/.###.',
    '6': '..##./.#.../#..../####./#...#/#...#/.###.',
    '7': '#####/....#/...#./..#../.#.../.#.../.#...',
    '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
    '9': '.###./#...#/#...#/.####/....#/...#./.##..',

    'A': '.###./#...#/#...#/#####/#...#/#...#/#...#',
    'B': '####./#...#/#...#/####./#...#/#...#/####.',
    'C': '.###./#...#/#..../#..../#..../#...#/.###.',
    'D': '####./#...#/#...#/#...#/#...#/#...#/####.',
    'E': '#####/#..../#..../####./#..../#..../#####',
    'F': '#####/#..../#..../####./#..../#..../#....',
    'G': '.###./#...#/#..../#..##/#...#/#...#/.####',
    'H': '#...#/#...#/#...#/#####/#...#/#...#/#...#',
    'I': '.###./..#../..#../..#../..#../..#../.###.',
    'J': '..###/...#./...#./...#./...#./#..#./.##..',
    'K': '#...#/#..#./#.#../##.../#.#../#..#./#...#',
    'L': '#..../#..../#..../#..../#..../#..../#####',
    'M': '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
    'N': '#...#/#...#/##..#/#.#.#/#..##/#...#/#...#',
    'O': '.###./#...#/#...#/#...#/#...#/#...#/.###.',
    'P': '####./#...#/#...#/####./#..../#..../#....',
    'Q': '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
    'R': '####./#...#/#...#/####./#.#../#..#./#...#',
    'S': '.####/#..../#..../.###./....#/....#/####.',
    'T': '#####/..#../..#../..#../..#../..#../..#..',
    'U': '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
    'V': '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
    'W': '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
    'X': '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
    'Y': '#...#/#...#/.#.#./..#../..#../..#../..#..',
    'Z': '#####/....#/...#./..#../.#.../#..../#####',

    'a': '...../...../.###./....#/.####/#...#/.####',
    'b': '#..../#..../####./#...#/#...#/#...#/####.',
    'c': '...../...../.####/#..../#..../#..../.####',
    'd': '....#/....#/.####/#...#/#...#/#...#/.####',
    'e': '...../...../.###./#...#/#####/#..../.###.',
    'f': '..##./.#.../.#.../####./.#.../.#.../.#...',
    'g': '...../...../.####/#...#/#...#/.####/....#/.###.',
    'h': '#..../#..../####./#...#/#...#/#...#/#...#',
    'i': '..#../...../.##../..#../..#../..#../.###.',
    'j': '...#./...../..##./...#./...#./...#./#..#./.##..',
    'k': '#..../#..../#..#./#.#../##.../#.#../#..#.',
    'l': '.##../..#../..#../..#../..#../..#../.###.',
    'm': '...../...../##.#./#.#.#/#.#.#/#...#/#...#',
    'n': '...../...../####./#...#/#...#/#...#/#...#',
    'o': '...../...../.###./#...#/#...#/#...#/.###.',
    'p': '...../...../####./#...#/#...#/####./#..../#....',
    'q': '...../...../.####/#...#/#...#/.####/....#/....#',
    'r': '...../...../#.##./##..#/#..../#..../#....',
    's': '...../...../.####/#..../.###./....#/####.',
    't': '.#.../.#.../####./.#.../.#.../.#..#/..##.',
    'u': '...../...../#...#/#...#/#...#/#...#/.####',
    'v': '...../...../#...#/#...#/#...#/.#.#./..#..',
    'w': '...../...../#...#/#...#/#.#.#/#.#.#/.#.#.',
    'x': '...../...../#...#/.#.#./..#../.#.#./#...#',
    'y': '...../...../#...#/#...#/#...#/.####/....#/.###.',
    'z': '...../...../#####/...#./..#../.#.../#####',
}

# Umlaute und ß aus den Grundformen ableiten.
G['Ä'] = '#...#/.###./#...#/#####/#...#/#...#/#...#'
G['Ö'] = '#...#/.###./#...#/#...#/#...#/#...#/.###.'
G['Ü'] = '#...#/...../#...#/#...#/#...#/#...#/.###.'
G['ä'] = '.#.#./...../.###./....#/.####/#...#/.####'
G['ö'] = '.#.#./...../.###./#...#/#...#/#...#/.###.'
G['ü'] = '.#.#./...../#...#/#...#/#...#/#...#/.####'
G['ß'] = '.##../#..#./#..#./##.../#...#/#...#/####.'
G['„'] = '...../...../...../...../.#.#./.#.#./#.#..'
G['“'] = '.#.#./#.#../...../...../...../...../.....'
G['…'] = '...../...../...../...../...../...../#.#.#'


# ── Breite eines Zeichens ───────────────────────────────────────────
def span(bitmap):
    """(erste, letzte) belegte Spalte oder None für leere Glyphen."""
    cols = [x for row in bitmap.split('/') for x, c in enumerate(row) if c == '#']
    return (min(cols), max(cols)) if cols else None


def advance_of(ch):
    if ch is None:
        return ADVANCE
    sp = span(G[ch])
    return SPACE_ADVANCE if sp is None else (sp[1] - sp[0] + 1) * PX + GAP


# ── Bitmap → Rechtecke (waagerechte Läufe zusammenfassen) ───────────
def rects(bitmap):
    rows = bitmap.split('/')
    sp = span(bitmap)
    shift = sp[0] if sp else 0   # an den linken Rand rücken
    out = []
    for r, row in enumerate(rows):
        x = 0
        while x < len(row):
            if row[x] != '#':
                x += 1
                continue
            w = 1
            while x + w < len(row) and row[x + w] == '#':
                w += 1
            # y-Achse zeigt in TrueType nach oben; Zeile BASELINE_ROW-1
            # sitzt direkt auf der Grundlinie.
            y0 = (BASELINE_ROW - 1 - r) * PX
            out.append(((x - shift) * PX, y0, w * PX, PX))
            x += w
    return out


# ── glyf-Eintrag für eine Glyphe ────────────────────────────────────
def glyph_data(bitmap):
    rs = rects(bitmap)
    if not rs:
        return b''
    xs, ys, ends, flags, xdel, ydel = [], [], [], [], [], []
    px, py = 0, 0
    for (x, y, w, h) in rs:
        # Kontur im Uhrzeigersinn (TrueType füllt bei non-zero winding)
        pts = [(x, y), (x, y + h), (x + w, y + h), (x + w, y)]
        for (cx, cy) in pts:
            xdel.append(cx - px)
            ydel.append(cy - py)
            px, py = cx, cy
            flags.append(1)  # on-curve
        ends.append(len(flags) - 1)
        xs += [p[0] for p in pts]
        ys += [p[1] for p in pts]

    data = struct.pack('>hhhhh', len(rs), min(xs), min(ys), max(xs), max(ys))
    data += b''.join(struct.pack('>H', e) for e in ends)
    data += struct.pack('>H', 0)                      # keine Instruktionen
    data += bytes(flags)
    for d in xdel:
        data += struct.pack('>h', d)
    for d in ydel:
        data += struct.pack('>h', d)
    while len(data) % 4:
        data += b'\0'
    return data


# ── Tabellen ────────────────────────────────────────────────────────
def build():
    chars = sorted(G.keys(), key=ord)
    # Glyph 0 muss .notdef sein.
    order = [None] + chars
    glyf, loca = b'', [0]
    for ch in order:
        glyf += glyph_data('...../.....' if ch is None else G[ch])
        loca.append(len(glyf))

    n = len(order)
    adv = [advance_of(ch) for ch in order]
    head = struct.pack(
        '>IIIIHHQQhhhhHHhhh',
        0x00010000, 0x00010000, 0, 0x5F0F3CF5,
        0b11, UPEM, 0, 0,                    # flags, upem, created, modified
        0, -DESCENT, CELL_W * PX, ASCENT,    # xMin yMin xMax yMax
        0, 8, 2,                             # macStyle, lowestRec, direction
        1, 0)                                # indexToLocFormat=1 (long), glyphDataFormat
    hhea = struct.pack('>IhhhHhhhhhhhhhhhH',
                       0x00010000, ASCENT, -DESCENT, 0,
                       max(adv), 0, 0, CELL_W * PX,
                       1, 0, 0, 0, 0, 0, 0, 0, n)
    # version, numGlyphs, dann 13 weitere Felder bis maxComponentDepth.
    # maxPoints/maxContours aus den echten Glyphen ableiten, nicht raten -
    # zu kleine Werte lassen den Font-Pruefer die Datei verwerfen.
    max_c = max(len(rects('...../.....' if c is None else G[c])) for c in order)
    maxp = struct.pack('>IH13H', 0x00010000, n,
                       max_c * 4, max_c, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0)
    hmtx = b''.join(struct.pack('>Hh', a, 0) for a in adv)

    # cmap Format 4, ein Segment je zusammenhängendem Bereich
    codes = [ord(c) for c in chars]
    segs = []
    s = e = codes[0]
    for c in codes[1:]:
        if c == e + 1:
            e = c
        else:
            segs.append((s, e)); s = e = c
    segs.append((s, e))
    segs.append((0xFFFF, 0xFFFF))
    segc = len(segs)
    ends = b''.join(struct.pack('>H', b) for _, b in segs)
    starts = b''.join(struct.pack('>H', a) for a, _ in segs)
    # idDelta ist int16, wird aber modulo 65536 gerechnet — deshalb maskiert
    # als unsigned schreiben.
    deltas, ranges = b'', b''
    for (a, b) in segs:
        if a == 0xFFFF:
            deltas += struct.pack('>H', 1)
        else:
            gid = order.index(chr(a))
            deltas += struct.pack('>H', (gid - a) & 0xFFFF)
        ranges += struct.pack('>H', 0)

    search = 2 ** (segc.bit_length() - 1) * 2
    sub = (struct.pack('>HHHHHHH', 4, 16 + segc * 8, 0, segc * 2,
                       search, (search // 2).bit_length() - 1,
                       segc * 2 - search)
           + ends + struct.pack('>H', 0) + starts + deltas + ranges)
    cmap = struct.pack('>HHHHI', 0, 1, 3, 1, 12) + sub

    names = [(1, FAMILY), (2, 'Regular'), (3, f'{FAMILY} {VERSION}'),
             (4, FAMILY), (5, f'Version {VERSION}'),
             (6, FAMILY.replace(' ', ''))]
    recs, strs = b'', b''
    for nid, val in names:
        b = val.encode('utf-16-be')
        recs += struct.pack('>HHHHHH', 3, 1, 0x409, nid, len(b), len(strs))
        strs += b
    name = struct.pack('>HHH', 0, len(names), 6 + len(names) * 12) + recs + strs

    # OS/2 Version 4 muss exakt 96 Byte lang sein und die Felder in genau
    # dieser Folge tragen. Eine zu kurze Tabelle laesst den Font-Pruefer des
    # Browsers die ganze Datei verwerfen - sichtbar nur als "network error".
    first, last = min(codes), max(codes)
    os2 = struct.pack(
        '>HhHHH'          # version, xAvgCharWidth, usWeightClass, usWidthClass, fsType
        'hhhhhhhh'        # Sub- und Superscript, acht Felder
        'hh'              # yStrikeoutSize, yStrikeoutPosition
        'h'               # sFamilyClass
        '10s'             # panose
        'IIII'            # ulUnicodeRange 1-4
        '4s'              # achVendID
        'HHH'             # fsSelection, usFirstCharIndex, usLastCharIndex
        'hhh'             # sTypoAscender, sTypoDescender, sTypoLineGap
        'HH'              # usWinAscent, usWinDescent
        'II'              # ulCodePageRange 1-2
        'hh'              # sxHeight, sCapHeight
        'HHH',            # usDefaultChar, usBreakChar, usMaxContext
        4, sum(adv) // len(adv), 400, 5, 0,
        PX * 3, PX * 3, 0, 0, PX * 3, PX * 3, 0, 0,
        PX, PX * 2,
        0,
        bytes((2, 0, 5, 3, 0, 0, 0, 0, 0, 0)),   # panose: proportional
        1, 0, 0, 0,
        b'PXSE',
        0x0040, first, min(last, 0xFFFF),
        ASCENT, -DESCENT, 0,
        ASCENT, DESCENT,
        1, 0,
        PX * 5, PX * 7,
        0, 32, 1)
    post = struct.pack('>IIhhIIIII', 0x00030000, 0, 0, 0, 0, 0, 0, 0, 0)  # isFixedPitch = 0
    loca_b = b''.join(struct.pack('>I', o) for o in loca)

    tables = {b'OS/2': os2, b'cmap': cmap, b'glyf': glyf, b'head': head,
              b'hhea': hhea, b'hmtx': hmtx, b'loca': loca_b, b'maxp': maxp,
              b'name': name, b'post': post}

    def pad(b):
        return b + b'\0' * (-len(b) % 4)

    def csum(b):
        b = pad(b)
        return sum(struct.unpack('>%dI' % (len(b) // 4), b)) & 0xFFFFFFFF

    keys = sorted(tables)
    nt = len(keys)
    sr = 2 ** (nt.bit_length() - 1) * 16
    header = struct.pack('>IHHHH', 0x00010000, nt, sr,
                         nt.bit_length() - 1, nt * 16 - sr)
    offset = 12 + nt * 16
    dir_, body = b'', b''
    for k in keys:
        d = pad(tables[k])
        dir_ += k + struct.pack('>III', csum(tables[k]), offset + len(body), len(tables[k]))
        body += d
    font = header + dir_ + body

    # head.checkSumAdjustment nachtragen
    total = csum(font)
    adj = (0xB1B0AFBA - total) & 0xFFFFFFFF
    hpos = font.index(b'head')
    hoff = struct.unpack('>I', font[hpos + 8:hpos + 12])[0]
    font = font[:hoff + 8] + struct.pack('>I', adj) + font[hoff + 12:]
    return font, n


if __name__ == '__main__':
    data, n = build()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'wb') as f:
        f.write(data)
    print(f'{OUT}  {len(data)} B, {n} Glyphen')
