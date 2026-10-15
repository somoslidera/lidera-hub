#!/usr/bin/env python3
"""Importa o JSON gerado por notion_convert.py no Supabase do Hub (via PostgREST, logado como o usuário de migração).
Uso: hub_import.py <hub-import.json> [--so-membros] [--limite N]
Variáveis em hub/.migracao.env: HUB_MIG_EMAIL, HUB_MIG_SENHA
"""
import sys, os, json, re, time, urllib.request, html as HTML
SUPA = 'https://fvcbxorfstqqeewocxkf.supabase.co'
ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2Y2J4b3Jmc3RxcWVld29jeGtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNzM5MjgsImV4cCI6MjA5Njg0OTkyOH0.X9gnZt535F1ASHpUaL24eEZysHHECwzfBwjaR4kVnyw'
HERE = os.path.dirname(os.path.abspath(__file__))
ENV = {}
for l in open(os.path.join(HERE, '..', 'hub', '.migracao.env')):
    if '=' in l: k, v = l.strip().split('=', 1); ENV[k] = v
JWT = None
def req(path, body=None, method=None, headers=None, raw=False):
    h = {'apikey': ANON, 'Content-Type': 'application/json'}
    if JWT: h['Authorization'] = 'Bearer ' + JWT
    h.update(headers or {})
    data = None if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
    r = urllib.request.Request(SUPA + path, data=data, headers=h, method=method or ('POST' if body is not None else 'GET'))
    for tent in range(4):
        try:
            with urllib.request.urlopen(r, timeout=180) as resp:
                b = resp.read(); return b if raw else (json.loads(b) if b else None)
        except urllib.error.HTTPError as e:
            txt = e.read().decode()[:800]
            if e.code in (502, 503, 504, 429) and tent < 3: time.sleep(3 * (tent + 1)); continue
            raise RuntimeError(f'HTTP {e.code} {path}: {txt}')
        except Exception as e:
            if tent < 3: time.sleep(3); continue
            raise
def login():
    global JWT
    j = req('/auth/v1/token?grant_type=password', {'email': ENV['HUB_MIG_EMAIL'], 'password': ENV['HUB_MIG_SENHA']})
    JWT = j['access_token']; return j['user']['id']
def fn(rota, body):
    return req('/functions/v1/hub-drive' + rota, body)

def sem_tags(h): return re.sub(r'\s+', ' ', HTML.unescape(re.sub(r'<[^>]+>', ' ', str(h or '')))).strip()
def texto_plano(conteudo, props, esquema):
    out = []
    def itens(l):
        for i in l or []: out.append(sem_tags(i.get('content'))); itens(i.get('items'))
    for b in conteudo.get('blocks', []):
        d = b.get('data', {}); t = b['type']
        if t in ('paragraph', 'header', 'callout', 'toggle'): out.append(sem_tags(d.get('text')))
        elif t == 'list': itens(d.get('items'))
        elif t == 'quote': out.append(sem_tags(d.get('text'))); out.append(sem_tags(d.get('caption')))
        elif t == 'table': [out.append(' '.join(sem_tags(c) for c in r)) for r in d.get('content', [])]
        elif t == 'code': out.append(d.get('code', ''))
        elif t == 'arquivo': out.append(d.get('nome', '')); out.append(d.get('legenda', ''))
        elif t == 'link': out.append(d.get('titulo', '')); out.append(d.get('url', ''))
    if props and esquema:
        for pr in esquema.get('props', []):
            v = props.get(pr['id'])
            if v in (None, '', [], {}): continue
            if isinstance(v, list): out.append(' '.join(x.get('nome', '') if isinstance(x, dict) else str(x) for x in v))
            elif isinstance(v, dict): out.append(str(v.get('inicio', '')))
            else: out.append(str(v))
    return '\n'.join(x for x in out if x)[:200000]

def main():
    arq = sys.argv[1]; d = json.load(open(arq, encoding='utf-8'))
    uid = login(); print('logado como', uid)
    # ---- membros ----
    membros = req('/rest/v1/hub_membros?select=user_id,email,nome,papel')
    print('membros atuais:', [(m['email'], m['papel']) for m in membros])
    desejados = [('charles.cadavezmelhor@gmail.com', 'Charles Simon', 'admin'), ('andressagrmedeiros@gmail.com', 'Andressa Medeiros', 'editor'), ('fgupires@gmail.com', 'Gustavo Freitas', 'editor'), ('guilherme.emerim10@gmail.com', 'Guilherme Emerim', 'editor')]
    import secrets
    for em, nome, papel in desejados:
        if any(m['email'] == em for m in membros): continue
        j = fn('/membro/criar', {'email': em, 'nome': nome, 'papel': papel, 'senha': secrets.token_urlsafe(14), 'trocar_senha': False})
        print('membro criado', em, j.get('ja_existia'))
    membros = req('/rest/v1/hub_membros?select=user_id,email,nome,papel')
    contato = req('/rest/v1/perfis?select=id,nome,papel&papel=eq.admin')
    nome_id = {}
    for m in membros: nome_id[m['nome']] = m['user_id']
    for p in contato: nome_id['Lidera Soluções'] = p['id']; nome_id['LLidera Soluções'] = p['id']; nome_id['Lidera'] = p['id']
    nome_id.setdefault('Charles Simon', nome_id.get('Charles Simon'))
    if '--so-membros' in sys.argv: return
    # ---- páginas ----
    pags = d['paginas']
    by_id = {p['id']: p for p in pags}
    # mapear pessoas → ids; se algum nome não mapear, a propriedade vira seleção
    bases = {p['notion_id']: p for p in pags if p['tipo'] == 'base'}
    for b in bases.values():
        for pr in b['esquema']['props']:
            if pr['tipo'] != 'pessoa': continue
            nomes = set()
            for p in pags:
                if p['base_nid'] == b['notion_id']:
                    for v in (p['props'].get(pr['id']) or []): nomes.add(v)
            if nomes and all(n in nome_id and nome_id[n] for n in nomes):
                for p in pags:
                    if p['base_nid'] == b['notion_id'] and p['props'].get(pr['id']): p['props'][pr['id']] = [nome_id[n] for n in p['props'][pr['id']]]
            else:
                pr['tipo'] = 'multi'; pr['opcoes'] = [{'id': re.sub(r'[^a-z0-9]', '', n.lower())[:12] or 'x', 'nome': n.replace('LLidera', 'Lidera'), 'cor': 'blue'} for n in sorted(nomes)]
                mp = {o['nome'].replace('Lidera Soluções', 'LLidera Soluções') if False else o['nome']: o['id'] for o in pr['opcoes']}
                for p in pags:
                    if p['base_nid'] == b['notion_id'] and p['props'].get(pr['id']): p['props'][pr['id']] = [mp.get(n.replace('LLidera', 'Lidera'), n) for n in p['props'][pr['id']]]
    # ordem por profundidade
    def depth(p, g=0):
        pid = p.get('parent_nid'); return 0 if not pid or g > 60 else 1 + depth(next((x for x in pags if x['notion_id'] == pid), {'parent_nid': None}), g + 1)
    nid_pag = {p['notion_id']: p for p in pags}
    def depth2(p):
        n = 0; cur = p
        while cur and cur.get('parent_nid') and n < 80: cur = nid_pag.get(cur['parent_nid']); n += 1
        return n
    pags.sort(key=depth2)
    lim = int(sys.argv[sys.argv.index('--limite') + 1]) if '--limite' in sys.argv else None
    if lim: pags = pags[:lim]
    linhas = []
    for p in pags:
        base = nid_pag.get(p['base_nid']) if p['base_nid'] else None
        parent = nid_pag.get(p['parent_nid']) if p['parent_nid'] else None
        row = {'id': p['id'], 'notion_id': p['notion_id'], 'parent_id': parent['id'] if parent else None, 'base_id': base['id'] if base else None, 'tipo': p['tipo'], 'titulo': p['titulo'] or '', 'icone': p['icone'], 'capa': p['capa'], 'conteudo': p['conteudo'], 'props': p['props'] or {}, 'esquema': p['esquema'], 'visoes': p['visoes'], 'ordem': p['ordem'], 'texto': texto_plano(p['conteudo'], p['props'], base['esquema'] if base else None), 'arquivada': False}
        linhas.append(row)
    print('a importar:', len(linhas))
    # upsert em lotes, pais antes dos filhos (já ordenado por profundidade)
    lote = 100; n = 0
    for i in range(0, len(linhas), lote):
        chunk = linhas[i:i+lote]
        req('/rest/v1/hub_paginas?on_conflict=notion_id', chunk, headers={'Prefer': 'resolution=merge-duplicates,return=minimal'})
        n += len(chunk); print(f'  {n}/{len(linhas)}', flush=True)
    print('OK páginas')
if __name__ == '__main__': main()
