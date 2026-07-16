#!/usr/bin/env python3
import sys, re, pathlib

def parse_frontmatter(text):
    m = re.match(r'^---\n(.*?)\n---\n', text, re.S)
    if not m: return None, text
    fm = {}
    for line in m.group(1).splitlines():
        if ':' in line:
            k, _, v = line.partition(':')
            fm[k.strip()] = v.strip()
    return fm, text[m.end():]

def main():
    # usage: lint_agent.py FILE --kind agent|skill --sections "A|B|C" --forbid "x|y"
    args = sys.argv[1:]
    path = pathlib.Path(args[0])
    kind = args[args.index('--kind')+1] if '--kind' in args else 'agent'
    sections = args[args.index('--sections')+1].split('|') if '--sections' in args else []
    forbid = args[args.index('--forbid')+1].split('|') if '--forbid' in args else []
    text = path.read_text(encoding='utf-8')
    errors = []
    fm, body = parse_frontmatter(text)
    if fm is None: errors.append('нет YAML-frontmatter')
    else:
        if not fm.get('name'): errors.append('пустой name')
        if not fm.get('description'): errors.append('пустой description')
        if kind == 'agent' and not fm.get('tools'): errors.append('нет tools')
    for s in sections:
        if s and s not in body: errors.append(f'нет секции: {s!r}')
    for f in forbid:
        if f and f in text: errors.append(f'запрещённая подстрока: {f!r}')
    if errors:
        print(f'FAIL {path.name}:'); [print('  -', e) for e in errors]; sys.exit(1)
    print(f'OK {path.name}'); sys.exit(0)

if __name__ == '__main__':
    main()
