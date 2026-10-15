#!/usr/bin/env python3
"""Monta dist/index.html: src/hub.html + src/hub.css + src/js/*.js (ordem alfabética), tudo inline."""
import os, glob
H = os.path.dirname(os.path.abspath(__file__))
rd = lambda p: open(p, encoding='utf-8').read()
js = '\n\n'.join(rd(p) for p in sorted(glob.glob(os.path.join(H, 'src', 'js', '*.js'))))
html = rd(os.path.join(H, 'src', 'hub.html')).replace('/*__CSS__*/', rd(os.path.join(H, 'src', 'hub.css'))).replace('//__JS__', js)
os.makedirs(os.path.join(H, 'dist'), exist_ok=True)
open(os.path.join(H, 'dist', 'index.html'), 'w', encoding='utf-8').write(html)
print('dist/index.html', len(html), 'bytes')
