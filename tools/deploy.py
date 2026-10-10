#!/usr/bin/env python3
# ════════════════════════════════════════════════════════════════════
# DEPLOY — beide Repos prüfen, Abhängigkeiten aktualisieren, pushen
# ════════════════════════════════════════════════════════════════════
# Ein Durchgang für Web (dieses Repo) und Desktop (spritebit-rs daneben):
#
#   0. Version fragt nach der neuen Version für Web und Desktop (Enter =
#              bleibt), trägt sie ein und committet sie
#   1. Vorab   alles committet? kein Repo hinter GitHub zurück?
#   2. Pflege  Rust: cargo update (nur verträgliche Versionen) — bleiben die
#              Tests grün, wird Cargo.lock committet, sonst zurückgerollt.
#              Web: Offline-Liste sw.js neu schreiben (tools/make_sw.py).
#   3. Prüfen  Web: npm test + Typprüfung. Rust: cargo test + clippy.
#   4. Main    Web: der Branch wird lokal nach main gemergt (Konflikte werden
#              vorab erkannt; weicht main inhaltlich ab, laufen die Tests dort
#              noch einmal) — kein Pull Request auf GitHub nötig.
#              Die Knöpfe der Startseite bekommen die Versionen (Web aus
#              package.json, Desktop = höchster veröffentlichter v…-Tag).
#   5. Pushen  erst Desktop (samt Release-Tag), dann Web: Branch und main, dann der Vercel Deploy Hook
#              (tools/deploy-hook.txt) → die Website wird gebaut.
#   6. --release  Tag v<Version aus Cargo.toml> pushen → GitHub baut die
#                 Desktop-Release (nur, wenn es die Version noch nicht gibt).
#                 Jede Desktop-Version braucht ihre Notizen in
#                 spritebit-rs/notes/<version>.md („Was ist neu?“ in der App) —
#                 fehlen sie, bricht es gleich am Anfang ab. Ebenso eine neue
#                 Web-Version ohne ihren Abschnitt oben in notes/web.md
#                 (Hilfe → „Was ist neu?“ im Editor).
#
# Bei jedem Fehler bricht es ab, bevor etwas gepusht wird.
#
#   python tools/deploy.py                 # prüfen, pflegen, nach main mergen, pushen
#   python tools/deploy.py --dry-run       # Probelauf: prüfen, nichts committen, nichts pushen
#   python tools/deploy.py --no-main       # Web nur den Branch pushen, nicht nach main
#   python tools/deploy.py --release       # … und Desktop-Release starten
#   python tools/deploy.py --only web      # nur ein Repo (web | rs)
#   python tools/deploy.py --no-update     # ohne cargo update
#   python tools/deploy.py --rs <ordner>   # spritebit-rs liegt woanders
#   python tools/deploy.py --web-version 3.2.0 --rs-version 1.0.1   # ohne Nachfragen
#   python tools/deploy.py --yes           # nichts fragen, Versionen bleiben
#
# Reine Standardbibliothek. Braucht git, node/npx, python und cargo.
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request

WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RS_DEFAULT = os.path.join(os.path.dirname(WEB), 'spritebit-rs')
LIVE_BRANCH = 'main'   # baut Vercel als Production
# Vercel Deploy Hook: startet den Build von main auch dann, wenn Vercel die
# Pushes nicht mitbekommt. Die Adresse ist geheim (wer sie kennt, kann Builds
# auslösen) und steht darum NICHT im Repo, sondern in dieser Datei
# (.gitignore) oder in der Umgebungsvariable SPRITEBIT_DEPLOY_HOOK.
HOOK_FILE = os.path.join(WEB, 'tools', 'deploy-hook.txt')
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


# ── Versionen ────────────────────────────────────────────────────────
# Web: "version" in package.json. Desktop: [workspace.package] in Cargo.toml
# (dazu die Anforderung der App an spritebit-core, sonst baut sie nicht).
SEMVER = re.compile(r'^(\d+)\.(\d+)\.(\d+)$')
APP_TOML = os.path.join('crates', 'spritebit-app', 'Cargo.toml')


def parse_ver(v):
    m = SEMVER.match(v.strip())
    return tuple(int(x) for x in m.groups()) if m else None


def bump_patch(v):
    a, b, c = parse_ver(v)
    return f'{a}.{b}.{c + 1}'


def web_version():
    m = re.search(r'"version":\s*"([^"]+)"', open(os.path.join(WEB, 'package.json'), encoding='utf-8').read())
    return m.group(1) if m else '0.0.0'


def rs_version(root):
    m = re.search(r'(?m)^version = "([^"]+)"', open(os.path.join(root, 'Cargo.toml'), encoding='utf-8').read())
    return m.group(1) if m else '0.0.0'


def sub_file(path, pattern, repl):
    s = open(path, encoding='utf-8').read()
    new, n = re.subn(pattern, repl, s, count=1, flags=re.M)
    if not n:
        fail(f'Version in {path} nicht gefunden.')
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(new)


def set_web_version(v):
    sub_file(os.path.join(WEB, 'package.json'), r'"version":\s*"[^"]+"', f'"version": "{v}"')


def require_rs_notes(root, v):
    """Notizen der Desktop-Version (Text der Release, „Was ist neu?“ in der App)."""
    path = os.path.join(root, 'notes', f'{v}.md')
    if not os.path.exists(path):
        fail(f'Desktop {v}: {os.path.relpath(path, root)} fehlt — erst die Notizen schreiben '
             '(Abschnitte „## Deutsch“ und „## English“ mit kurzen Punkten „- …“).')
    if not re.search(r'(?m)^## Deutsch', open(path, encoding='utf-8').read()):
        fail(f'Desktop {v}: {os.path.relpath(path, root)} hat keinen Abschnitt „## Deutsch“.')


def require_web_notes(v):
    """Notizen der Web-Version oben in notes/web.md (Hilfe → „Was ist neu?“)."""
    path = os.path.join(WEB, 'notes', 'web.md')
    text = open(path, encoding='utf-8').read() if os.path.exists(path) else ''
    m = re.search(r'(?m)^#\s+(\S+)', text)
    if not m or m.group(1) != v:
        fail(f'Web {v}: in notes/web.md steht oben nicht „# {v}“ — erst die Notizen schreiben '
             '(neueste Version oben, Abschnitte „## Deutsch“ und „## English“).')


def set_rs_version(root, v):
    sub_file(os.path.join(root, 'Cargo.toml'), r'^version = "[^"]+"', f'version = "{v}"')
    sub_file(os.path.join(root, APP_TOML), r'(spritebit-core = \{ version = ")[^"]+(")', rf'\g<1>{v}\g<2>')


def ask(name, current, given, interactive):
    """Neue Version: per Option, per Eingabe oder unverändert."""
    if given:
        v = given
    elif not interactive:
        return current
    else:
        hint = bump_patch(current) if parse_ver(current) else ''
        while True:
            v = input(f'  {name}: jetzt {color("1", current)} — neue Version (Enter = bleibt, z. B. {hint}): ').strip()
            if not v:
                return current
            if parse_ver(v) and parse_ver(v) >= (parse_ver(current) or (0, 0, 0)):
                break
            warn('Bitte in der Form 1.2.3 angeben, nicht kleiner als die jetzige.')
    if not parse_ver(v):
        fail(f'{name}: „{v}“ ist keine Version der Form 1.2.3.')
    if parse_ver(current) and parse_ver(v) < parse_ver(current):
        fail(f'{name}: {v} ist kleiner als die jetzige Version {current}.')
    return v


def ask_versions(args):
    interactive = sys.stdin.isatty() and not args.yes
    if interactive:
        step('Versionen')
    args.web_new = None
    args.rs_new = None
    if args.only != 'rs':
        cur = web_version()
        v = ask('Web', cur, args.web_version, interactive)
        args.web_new = v if v != cur else None
        if args.web_new:
            require_web_notes(v)
    if args.only != 'web' and os.path.isdir(args.rs):
        cur = rs_version(args.rs)
        v = ask('Desktop', cur, args.rs_version, interactive)
        args.rs_new = v if v != cur else None
        if args.rs_new and not args.release and interactive:
            a = input(f'  Desktop-Release v{v} gleich starten? [J/n]: ').strip().lower()
            args.release = a in ('', 'j', 'ja', 'y', 'yes')
        # Vor allem anderen: sonst steht schon der Versions-Commit da, wenn
        # die Tests (diese_version_hat_notizen) über die fehlende Datei stolpern.
        if args.rs_new or args.release:
            require_rs_notes(args.rs, v)


# ── Versionen an den Knöpfen der Startseite (js/site-links.js) ───────
SITE_LINKS = os.path.join('js', 'site-links.js')


def released_desktop(root):
    """Höchste veröffentlichte Desktop-Version (v…-Tags auf GitHub) oder None."""
    if not os.path.isdir(os.path.join(root, '.git')):
        return None
    out = git(root, 'ls-remote', '--tags', 'origin', check=False)
    vers = [parse_ver(m) for m in re.findall(r'refs/tags/v(\d+\.\d+\.\d+)$', out, re.M)]
    vers = [v for v in vers if v]
    return '.'.join(map(str, max(vers))) if vers else None


def sync_site_versions(args):
    path = os.path.join(WEB, SITE_LINKS)
    s = open(path, encoding='utf-8').read()
    want = {'web': web_version(), 'desktop': released_desktop(args.rs)}
    new = s
    for key, ver in want.items():
        if ver:
            new = re.sub(rf"(\b{key}:\s*')[^']*(')", rf"\g<1>{ver}\g<2>", new, count=1)
    if new == s:
        ok(f'Versionen auf der Startseite aktuell (Web {want["web"]}, Desktop {want["desktop"] or "–"})')
        return
    if args.dry_run:
        info(f'(Probelauf) würde auf der Startseite eintragen: Web {want["web"]}, Desktop {want["desktop"]}')
        return
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(new)
    commit_if_changed(WEB, [SITE_LINKS], f'Startseite: Versionen Web {want["web"]}, Desktop {want["desktop"]}')


# ── Web ──────────────────────────────────────────────────────────────
def web(args):
    step('Web (sprite-editor)')
    br = branch(WEB)
    require_clean(WEB, 'Web')
    ahead = require_not_behind(WEB, 'Web', br)
    ok(f'Branch {br}, {ahead} Commit(s) noch nicht auf GitHub')

    if args.web_new:
        if args.dry_run:
            info(f'(Probelauf) würde Version {args.web_new} in package.json eintragen')
        else:
            set_web_version(args.web_new)
            commit_if_changed(WEB, ['package.json'], f'Version {args.web_new}')

    sync_site_versions(args)

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

    to_main = not args.no_main and br != LIVE_BRANCH
    if hook_url():  # vor jedem Push prüfen, ob die Adresse taugt
        ok('Vercel Deploy Hook eingerichtet')
    if to_main:
        # Vorab, ohne etwas anzufassen: lässt sich der Branch konfliktfrei mergen?
        r = run(['git', 'merge-tree', '--write-tree', f'origin/{LIVE_BRANCH}', br], WEB, quiet=True, check=False)
        if r.returncode != 0:
            fail(f'{br} lässt sich nicht konfliktfrei nach {LIVE_BRANCH} mergen — bitte von Hand lösen.')
        ok(f'{br} lässt sich konfliktfrei nach {LIVE_BRANCH} mergen')

    push(WEB, 'Web', br, args.dry_run)
    if to_main:
        merge_to_main(br, args.dry_run)
    elif br == LIVE_BRANCH:
        if args.dry_run:
            info('(Probelauf) würde den Vercel-Build anstoßen')
        else:
            vercel_hook()


def merge_to_main(br, dry):
    step(f'Web nach {LIVE_BRANCH} ({br} → {LIVE_BRANCH})')
    if dry:
        info(f'(Probelauf) würde {br} nach {LIVE_BRANCH} mergen und pushen → Vercel')
        return
    if not git(WEB, 'branch', '--list', LIVE_BRANCH):
        git(WEB, 'branch', LIVE_BRANCH, f'origin/{LIVE_BRANCH}')
    git(WEB, 'checkout', '-q', LIVE_BRANCH)
    try:
        git(WEB, 'merge', '-q', '--ff-only', f'origin/{LIVE_BRANCH}')
        before = git(WEB, 'rev-parse', 'HEAD')
        r = run(['git', 'merge', '--no-ff', '-m', f'Merge {br} nach {LIVE_BRANCH}', br], WEB, quiet=True, check=False)
        if r.returncode != 0:
            git(WEB, 'merge', '--abort', check=False)
            fail(f'Merge {br} → {LIVE_BRANCH} hat Konflikte — bitte von Hand lösen.')
        # Hatte main eigene Änderungen, ist das Ergebnis ungetestet — dann hier testen.
        if git(WEB, 'rev-parse', 'HEAD^{tree}') != git(WEB, 'rev-parse', f'{br}^{{tree}}'):
            info(f'{LIVE_BRANCH} weicht vom getesteten Branch ab — Tests auf dem Ergebnis …')
            try:
                run(['npm', 'test'], WEB, quiet=True)
            except Abort:
                git(WEB, 'reset', '-q', '--hard', before)
                raise
            ok('Tests auf dem Ergebnis grün')
        ok(f'{br} nach {LIVE_BRANCH} gemergt')
        run(['git', 'push', 'origin', LIVE_BRANCH], WEB)
        ok(f'{LIVE_BRANCH} gepusht')
    finally:
        git(WEB, 'checkout', '-q', br)
    vercel_hook()


def hook_url():
    """Adresse des Deploy Hooks oder None; eine falsche Adresse bricht ab."""
    url = os.environ.get('SPRITEBIT_DEPLOY_HOOK', '').strip()
    if not url and os.path.exists(HOOK_FILE):
        url = open(HOOK_FILE, encoding='utf-8').read().strip()
    if url and not url.startswith('https://api.vercel.com/'):
        fail(f'{os.path.relpath(HOOK_FILE, WEB)} enthält keine Vercel-Adresse (https://api.vercel.com/…).')
    return url or None


def vercel_hook():
    url = hook_url()
    if not url:
        warn('Kein Vercel Deploy Hook eingerichtet — ob Vercel baut, hängt dann an der Git-Verbindung.')
        info('Einrichten: Vercel → Projekt → Settings → Git → Deploy Hooks → Branch „main“ →')
        info(f'Adresse in {os.path.relpath(HOOK_FILE, WEB)} speichern (wird nicht committet).')
        return
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method='POST'), timeout=30) as r:
            body = json.loads(r.read().decode('utf-8') or '{}')
        state = body.get('job', {}).get('state', 'angenommen')
        ok(f'Vercel-Build angestoßen ({state}) — in ein, zwei Minuten ist die Website aktuell.')
    except Exception as e:
        warn(f'Vercel Deploy Hook fehlgeschlagen: {e} — im Vercel-Dashboard von Hand deployen.')


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

    if args.rs_new:
        if args.dry_run:
            info(f'(Probelauf) würde Version {args.rs_new} in Cargo.toml eintragen')
        else:
            set_rs_version(root, args.rs_new)
            run(['cargo', 'update', '--workspace'], root, quiet=True)  # nur die eigenen Pakete im Lockfile
            commit_if_changed(root, ['Cargo.toml', APP_TOML, 'Cargo.lock'], f'Version {args.rs_new}')

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
def require_interop(args):
    """Beispieldateien für den Austausch Web ↔ Desktop (tests/interop/) müssen
    in beiden Repos gleich sein — sonst testet jede Seite gegen einen alten
    Stand der anderen. Abgleichen: python tools/sync_interop.py"""
    if not os.path.isdir(args.rs):
        return
    sys.path.insert(0, os.path.join(WEB, 'tools'))
    from sync_interop import differing
    bad = differing(args.rs)
    if bad:
        fail('tests/interop/ ist in den beiden Repos verschieden (' + ', '.join(bad)
             + ') — python tools/sync_interop.py gleicht ab, dann beide Tests laufen lassen.')
    ok('Beispieldateien Web ↔ Desktop gleich')


def main():
    ap = argparse.ArgumentParser(description='Beide spritebit-Repos prüfen, pflegen und pushen.')
    ap.add_argument('--dry-run', action='store_true', help='Probelauf: prüfen, nichts committen, nichts pushen')
    ap.add_argument('--no-main', action='store_true', help=f'Web nur den Branch pushen, nicht nach {LIVE_BRANCH} mergen')
    ap.add_argument('--live', action='store_true', help=argparse.SUPPRESS)  # früher nötig, jetzt Standard
    ap.add_argument('--release', action='store_true', help='Desktop-Release mit der Version aus Cargo.toml starten')
    ap.add_argument('--only', choices=['web', 'rs'], help='nur ein Repo')
    ap.add_argument('--no-update', action='store_true', help='ohne cargo update')
    ap.add_argument('--rs', default=RS_DEFAULT, help='Ordner von spritebit-rs')
    ap.add_argument('--web-version', help='neue Web-Version (ohne Nachfrage)')
    ap.add_argument('--rs-version', help='neue Desktop-Version (ohne Nachfrage)')
    ap.add_argument('--yes', action='store_true', help='nichts fragen — Versionen bleiben, wenn nicht angegeben')
    args = ap.parse_args()
    if args.dry_run:
        print(color('33', 'Probelauf — es wird nichts gepusht.'))
    try:
        require_interop(args)
        ask_versions(args)
        # Erst der Desktop: ein neuer Release-Tag steht danach schon auf GitHub
        # und landet im selben Durchgang als Versionsnummer auf der Website.
        if args.only != 'web':
            rs(args)
        if args.only != 'rs':
            web(args)
    except Abort as e:
        print(color('1;31', f'\n✗ Abgebrochen: {e}'))
        sys.exit(1)
    print(color('1;32', '\n✓ Fertig.'))


if __name__ == '__main__':
    main()
