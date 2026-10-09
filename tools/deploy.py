#!/usr/bin/env python3
# ════════════════════════════════════════════════════════════════════
# DEPLOY — beide Repos prüfen, Abhängigkeiten aktualisieren, pushen
# ════════════════════════════════════════════════════════════════════
# Ein Durchgang für Web (dieses Repo) und Desktop (spritebit-rs daneben):
#
#   1. Vorab   alles committet? kein Repo hinter GitHub zurück?
#   2. Pflege  Rust: cargo update (nur verträgliche Versionen) — bleiben die
#              Tests grün, wird Cargo.lock committet, sonst zurückgerollt.
#              Web: Offline-Liste sw.js neu schreiben (tools/make_sw.py).
#   3. Prüfen  Web: npm test + Typprüfung. Rust: cargo test + clippy.
#   4. Pushen  beide Repos, jeweils der aktuelle Branch.
#   5. --live     Web-Branch in main mergen und pushen → Vercel geht online.
#   6. --release  Tag v<Version aus Cargo.toml> pushen → GitHub baut die
#                 Desktop-Release (nur, wenn es die Version noch nicht gibt).
#
# Bei jedem Fehler bricht es ab, bevor etwas gepusht wird.
#
#   python tools/deploy.py                 # prüfen, pflegen, pushen
#   python tools/deploy.py --dry-run       # Probelauf: prüfen, nichts committen, nichts pushen
#   python tools/deploy.py --live          # … und Web live schalten (main)
#   python tools/deploy.py --release       # … und Desktop-Release starten
#   python tools/deploy.py --only web      # nur ein Repo (web | rs)
#   python tools/deploy.py --no-update     # ohne cargo update
#   python tools/deploy.py --rs <ordner>   # spritebit-rs liegt woanders
#
# Reine Standardbibliothek. Braucht git, node/npx, python und cargo.
import argparse
import os
import re
import shutil
import subprocess
import sys

WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RS_DEFAULT = os.path.join(os.path.dirname(WEB), 'spritebit-rs')
LIVE_BRANCH = 'main'   # baut Vercel als Production
WIN = os.name == 'nt'

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


# ── Ausgabe ──────────────────────────────────────────────────────────
def color(code, text):
    return f'\033[{code}m{text}\033[0m' if sys.stdout.isatty() or WIN else text


def step(text):
    print(color('1;36', f'\n▸ {text}'))


def ok(text):
    print(color('32', f'  ✓ {text}'))


def info(text):
    print(f'    {text}')


def warn(text):
    print(color('33', f'  ! {text}'))


class Abort(Exception):
    pass


def fail(text):
    raise Abort(text)


# ── Befehle ──────────────────────────────────────────────────────────
def tool(name):
    """Pfad eines Programms; cargo liegt oft nur in ~/.cargo/bin."""
    found = shutil.which(name)
    if not found and name == 'cargo':
        cand = os.path.join(os.path.expanduser('~'), '.cargo', 'bin', 'cargo' + ('.exe' if WIN else ''))
        found = cand if os.path.exists(cand) else None
    if not found:
        fail(f'„{name}“ nicht gefunden — installiert und im PATH?')
    return found


def run(cmd, cwd, quiet=False, check=True):
    """Befehl ausführen; quiet = Ausgabe nur bei Fehler zeigen."""
    exe = [tool(cmd[0])] + cmd[1:]
    if quiet:
        r = subprocess.run(exe, cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if check and r.returncode != 0:
            print(r.stdout[-4000:])
            print(r.stderr[-4000:])
            fail(f'{" ".join(cmd)} ist fehlgeschlagen (in {os.path.basename(cwd)})')
        return r
    r = subprocess.run(exe, cwd=cwd)
    if check and r.returncode != 0:
        fail(f'{" ".join(cmd)} ist fehlgeschlagen (in {os.path.basename(cwd)})')
    return r


def git(cwd, *args, check=True):
    return run(['git', *args], cwd, quiet=True, check=check).stdout.strip()


# ── Git-Helfer ───────────────────────────────────────────────────────
def branch(cwd):
    return git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')


def require_clean(cwd, name):
    dirty = git(cwd, 'status', '--porcelain')
    if dirty:
        info(dirty.replace('\n', '\n    '))
        fail(f'{name}: nicht committete Änderungen — erst committen (oder verwerfen).')


def require_not_behind(cwd, name, br):
    git(cwd, 'fetch', '--quiet', 'origin')
    if not git(cwd, 'ls-remote', '--heads', 'origin', br):
        return 0  # Branch gibt es auf GitHub noch nicht — wird angelegt
    behind = int(git(cwd, 'rev-list', '--count', f'HEAD..origin/{br}'))
    if behind:
        fail(f'{name}: {br} ist {behind} Commit(s) hinter GitHub — erst „git pull“.')
    return int(git(cwd, 'rev-list', '--count', f'origin/{br}..HEAD'))


def commit_if_changed(cwd, paths, message, dry=False):
    if dry:
        if git(cwd, 'status', '--porcelain', *paths):
            git(cwd, 'checkout', '--', *paths)
            info(f'(Probelauf) würde committen: {message} — wieder zurückgesetzt')
        return False
    git(cwd, 'add', *paths)
    if git(cwd, 'diff', '--cached', '--name-only'):
        git(cwd, 'commit', '-q', '-m', message)
        ok(f'committet: {message}')
        return True
    return False


def push(cwd, name, br, dry):
    if dry:
        info(f'(Probelauf) würde pushen: {name} → origin/{br}')
        return
    run(['git', 'push', '-u', 'origin', br], cwd)
    ok(f'{name}: {br} gepusht')


# ── Web ──────────────────────────────────────────────────────────────
def web(args):
    step('Web (sprite-editor)')
    br = branch(WEB)
    require_clean(WEB, 'Web')
    ahead = require_not_behind(WEB, 'Web', br)
    ok(f'Branch {br}, {ahead} Commit(s) noch nicht auf GitHub')

    info('Offline-Liste (sw.js) …')
    run([sys.executable, os.path.join('tools', 'make_sw.py')], WEB, quiet=True)
    commit_if_changed(WEB, ['sw.js'], 'Offline-Liste aktualisiert (tools/make_sw.py)', args.dry_run)

    info('Tests …')
    r = run(['npm', 'test'], WEB, quiet=True)
    m = re.search(r'# pass (\d+)', r.stdout)
    ok(f'Tests grün ({m.group(1) if m else "?"} bestanden)')

    info('Typprüfung …')
    run(['npx', '--yes', '-p', 'typescript@5', 'tsc', '-p', 'jsconfig.json'], WEB, quiet=True)
    ok('Typprüfung sauber')

    push(WEB, 'Web', br, args.dry_run)

    if args.live:
        live(br, args.dry_run)


def live(br, dry):
    step(f'Web live schalten ({br} → {LIVE_BRANCH})')
    if br == LIVE_BRANCH:
        ok(f'Schon auf {LIVE_BRANCH} — der Push oben geht direkt online.')
        return
    if dry:
        info(f'(Probelauf) würde {br} in {LIVE_BRANCH} mergen und pushen')
        return
    git(WEB, 'checkout', '-q', LIVE_BRANCH)
    try:
        git(WEB, 'pull', '-q', '--ff-only', 'origin', LIVE_BRANCH)
        r = run(['git', 'merge', '--no-ff', '-m', f'Merge {br} nach {LIVE_BRANCH}', br], WEB, quiet=True, check=False)
        if r.returncode != 0:
            git(WEB, 'merge', '--abort', check=False)
            fail(f'Merge {br} → {LIVE_BRANCH} hat Konflikte — bitte von Hand lösen.')
        run(['git', 'push', 'origin', LIVE_BRANCH], WEB)
        ok(f'{LIVE_BRANCH} gepusht — Vercel baut jetzt die Website.')
    finally:
        git(WEB, 'checkout', '-q', br)


# ── Rust ─────────────────────────────────────────────────────────────
def rs(args):
    step('Desktop (spritebit-rs)')
    root = args.rs
    if not os.path.isdir(os.path.join(root, '.git')):
        fail(f'spritebit-rs nicht gefunden unter {root} — mit --rs <ordner> angeben.')
    br = branch(root)
    require_clean(root, 'Rust')
    ahead = require_not_behind(root, 'Rust', br)
    ok(f'Branch {br}, {ahead} Commit(s) noch nicht auf GitHub')

    if args.no_update:
        info('cargo update übersprungen (--no-update)')
    else:
        info('Abhängigkeiten (cargo update) …')
        run(['cargo', 'update'], root, quiet=True)
        if git(root, 'status', '--porcelain', 'Cargo.lock'):
            changes = git(root, 'diff', '--stat', 'Cargo.lock')
            info(changes.splitlines()[-1] if changes else 'Cargo.lock geändert')
            try:
                tests_rs(root)
            except Abort:
                git(root, 'checkout', '--', 'Cargo.lock')
                warn('Mit den neuen Versionen schlagen Tests fehl — Cargo.lock zurückgerollt.')
                raise
            commit_if_changed(root, ['Cargo.lock'], 'Abhängigkeiten aktualisiert (cargo update)', args.dry_run)
        else:
            ok('Abhängigkeiten schon aktuell')
            tests_rs(root)
    if args.no_update:
        tests_rs(root)

    push(root, 'Rust', br, args.dry_run)

    if args.release:
        release(root, args.dry_run)


def tests_rs(root):
    info('cargo test …')
    r = run(['cargo', 'test', '--workspace'], root, quiet=True)
    n = sum(int(x) for x in re.findall(r'test result: ok\. (\d+) passed', r.stdout))
    ok(f'Tests grün ({n} bestanden)')
    info('cargo clippy …')
    run(['cargo', 'clippy', '--all-targets', '--', '-D', 'warnings'], root, quiet=True)
    ok('Clippy ohne Warnungen')


def release(root, dry):
    step('Desktop-Release')
    toml = open(os.path.join(root, 'Cargo.toml'), encoding='utf-8').read()
    m = re.search(r'(?m)^version = "([^"]+)"', toml)
    if not m:
        fail('Keine Version in Cargo.toml gefunden.')
    tag = 'v' + m.group(1)
    if git(root, 'ls-remote', '--tags', 'origin', tag):
        warn(f'{tag} gibt es schon auf GitHub — für eine neue Release erst die Version in Cargo.toml anheben.')
        return
    if dry:
        info(f'(Probelauf) würde Tag {tag} anlegen und pushen')
        return
    if not git(root, 'tag', '--list', tag):
        git(root, 'tag', tag)
    run(['git', 'push', 'origin', tag], root)
    ok(f'{tag} gepusht — GitHub baut die Release (Actions → Release).')


# ── Ablauf ───────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description='Beide spritebit-Repos prüfen, pflegen und pushen.')
    ap.add_argument('--dry-run', action='store_true', help='Probelauf: prüfen, nichts committen, nichts pushen')
    ap.add_argument('--live', action='store_true', help=f'Web-Branch in {LIVE_BRANCH} mergen und pushen')
    ap.add_argument('--release', action='store_true', help='Desktop-Release mit der Version aus Cargo.toml starten')
    ap.add_argument('--only', choices=['web', 'rs'], help='nur ein Repo')
    ap.add_argument('--no-update', action='store_true', help='ohne cargo update')
    ap.add_argument('--rs', default=RS_DEFAULT, help='Ordner von spritebit-rs')
    args = ap.parse_args()
    if args.dry_run:
        print(color('33', 'Probelauf — es wird nichts gepusht.'))
    try:
        if args.only != 'rs':
            web(args)
        if args.only != 'web':
            rs(args)
    except Abort as e:
        print(color('1;31', f'\n✗ Abgebrochen: {e}'))
        sys.exit(1)
    print(color('1;32', '\n✓ Fertig.'))


if __name__ == '__main__':
    main()
