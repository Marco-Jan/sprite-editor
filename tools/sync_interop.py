#!/usr/bin/env python3
"""Gleicht die Beispieldateien für den Austausch Web ↔ Desktop ab.

Beide Repos haben `tests/interop/` mit denselben zwei Dateien:

    web-sprite.bitty      schreibt die Web-Version  (tests/interop.test.js)
    desktop-sprite.bitty  schreibt die Desktop-App  (crates/spritebit-core/tests/interop.rs)

Jede Seite ist für ihre eigene Datei zuständig — dieses Skript kopiert sie
jeweils ins andere Repo. Danach prüfen beide Testläufe, dass sie die Datei
der anderen Seite richtig lesen.

    python tools/sync_interop.py            # abgleichen
    python tools/sync_interop.py --check    # nur prüfen (deploy.py), Exit 1 bei Abweichung
    python tools/sync_interop.py --rs <ordner>

Reine Standardbibliothek.
"""
import argparse
import os
import shutil
import sys

WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RS_DEFAULT = os.path.join(os.path.dirname(WEB), 'spritebit-rs')
# Datei → welches Repo sie schreibt
OWNER = {'web-sprite.bitty': 'web', 'desktop-sprite.bitty': 'rs'}


def same(a, b):
    """Gleich bis auf Zeilenenden (git kann sie unter Windows umstellen)."""
    if not (os.path.isfile(a) and os.path.isfile(b)):
        return False
    with open(a, 'rb') as fa, open(b, 'rb') as fb:
        return fa.read().replace(b'\r\n', b'\n') == fb.read().replace(b'\r\n', b'\n')


def differing(rs_root):
    """Dateien, die in den beiden Repos nicht gleich sind."""
    out = []
    for name in OWNER:
        if not same(os.path.join(WEB, 'tests', 'interop', name), os.path.join(rs_root, 'tests', 'interop', name)):
            out.append(name)
    return out


def main():
    # Windows-Konsole: sonst scheitern ✓ und → an cp1252 (wie in deploy.py).
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Beispieldateien Web ↔ Desktop abgleichen.')
    ap.add_argument('--check', action='store_true', help='nur prüfen, nichts kopieren')
    ap.add_argument('--rs', default=RS_DEFAULT, help='Ordner von spritebit-rs')
    args = ap.parse_args()
    if not os.path.isdir(args.rs):
        print(f'spritebit-rs nicht gefunden unter {args.rs} — mit --rs <ordner> angeben.')
        sys.exit(1)
    bad = differing(args.rs)
    if args.check:
        for name in bad:
            print(f'✗ tests/interop/{name} ist in den beiden Repos verschieden')
        sys.exit(1 if bad else 0)
    for name in bad:
        src_root, dst_root = (WEB, args.rs) if OWNER[name] == 'web' else (args.rs, WEB)
        src = os.path.join(src_root, 'tests', 'interop', name)
        if not os.path.isfile(src):
            print(f'✗ {src} fehlt — erst dort die Tests mit UPDATE_INTEROP=1 laufen lassen')
            sys.exit(1)
        os.makedirs(os.path.join(dst_root, 'tests', 'interop'), exist_ok=True)
        shutil.copyfile(src, os.path.join(dst_root, 'tests', 'interop', name))
        print(f'✓ {name}: {"Web → Desktop" if OWNER[name] == "web" else "Desktop → Web"}')
    if not bad:
        print('✓ Beide Repos haben dieselben Beispieldateien.')


if __name__ == '__main__':
    main()
