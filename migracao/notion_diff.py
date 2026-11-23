#!/usr/bin/env python3
"""Compara duas exportações HTML do Notion (antiga, nova) por id de página: novas, removidas, mudadas (corpo/título/props)."""
import sys, os, re, hashlib
A, B = sys.argv[1], sys.argv[2]
def idx(root):
    m = {}
    for dp, dn, fn in os.walk(root):
        for f in fn:
            if not f.endswith('.html'): continue
            g = re.search(r'([0-9a-f]{32})\.html$', f)
            if not g: continue
            h = open(os.path.join(dp, f), encoding='utf-8', errors='replace').read()
            t = re.search(r'<h1 class="page-title"[^>]*>(.*?)</h1>', h, re.S); titulo = re.sub(r'<[^>]+>', '', t.group(1)).strip() if t else ''
            b = h[h.find('<div class="page-body">'):] if '<div class="page-body">' in h else h
            b = re.sub(r'\s+', ' ', re.sub(r'(src|href|data-notion-file|data-notion-image)="[^"]*"', '', b))
            props = re.search(r'<table class="properties">(.*?)</table>', h, re.S); p = re.sub(r'\s+', ' ', re.sub(r'(src|href)="[^"]*"', '', props.group(1))) if props else ''
            m[g.group(1)] = (titulo, hashlib.md5(b.encode()).hexdigest(), hashlib.md5(p.encode()).hexdigest(), os.path.relpath(os.path.join(dp, f), root))
    return m
a, b = idx(A), idx(B)
novas = [k for k in b if k not in a]; sumidas = [k for k in a if k not in b]
mud = [k for k in b if k in a and (a[k][0] != b[k][0] or a[k][1] != b[k][1] or a[k][2] != b[k][2])]
print(f'antiga {len(a)} páginas | nova {len(b)} páginas')
print(f'NOVAS {len(novas)}'); [print('  +', b[k][0] or '(sem título)', '|', b[k][3][:110]) for k in novas[:80]]
print(f'REMOVIDAS {len(sumidas)}'); [print('  -', a[k][0] or '(sem título)', '|', a[k][3][:110]) for k in sumidas[:80]]
print(f'MUDADAS {len(mud)}'); [print('  ~', b[k][0] or '(sem título)', '|', b[k][3][:110], '| título' if a[k][0]!=b[k][0] else '', '| corpo' if a[k][1]!=b[k][1] else '', '| props' if a[k][2]!=b[k][2] else '') for k in mud[:120]]
