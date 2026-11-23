#!/usr/bin/env python3
"""Completa a migração: páginas/bases novas da exportação de nov/2026 e PDFs baixados pela API (pasta extra/<notion_id>/arquivo)."""
import sys, os, json, base64, uuid, mimetypes
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hub_import as H
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTRA = os.path.join(S, 'notion-export', 'extra')
NS = uuid.UUID('7b1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b'); hid = lambda n: str(uuid.uuid5(NS, n))
novo = json.load(open(os.path.join(S, 'notion-export', 'hub-new.json'), encoding='utf-8'))
pags = {p['notion_id']: p for p in novo['paginas']}
H.login()
existentes = {r['notion_id']: r for r in H.req('/rest/v1/hub_paginas?select=id,notion_id,conteudo,props&notion_id=in.(' + ','.join('"%s"' % n for n in list(os.listdir(EXTRA)) + ['3ce4c6be-1360-8062-8422-d9283bcfaa3d']) + ')')}
# 1) páginas/bases novas (sem linha no Hub)
for nid in list(os.listdir(EXTRA)) + ['3ce4c6be-1360-8062-8422-d9283bcfaa3d']:
    if nid in existentes or nid not in pags: continue
    p = pags[nid]; base = pags.get(p['base_nid']); parent = pags.get(p['parent_nid'])
    row = {'id': p['id'], 'notion_id': nid, 'parent_id': parent['id'] if parent else None, 'base_id': base['id'] if base else None, 'tipo': p['tipo'], 'titulo': p['titulo'] or '', 'icone': p['icone'], 'capa': None,
           'conteudo': {'blocks': [b for b in p['conteudo']['blocks'] if b['type'] not in ('arquivo', 'link', 'paragraph')] if nid in os.listdir(EXTRA) else p['conteudo']['blocks']} if False else {'blocks': []},
           'props': p['props'] or {}, 'esquema': p['esquema'], 'visoes': p['visoes'], 'ordem': p['ordem'], 'texto': '', 'arquivada': False}
    if p['tipo'] == 'base': row['conteudo'] = p['conteudo']
    H.req('/rest/v1/hub_paginas?on_conflict=notion_id', [row], headers={'Prefer': 'resolution=merge-duplicates,return=minimal'})
    existentes[nid] = {'id': p['id'], 'notion_id': nid, 'conteudo': row['conteudo'], 'props': row['props']}
    print('criada:', p['tipo'], p['titulo'])
# 2) PDFs → Drive → bloco arquivo
for nid in sorted(os.listdir(EXTRA)):
    r = existentes.get(nid)
    if not r: print('sem página no Hub:', nid); continue
    for nome in os.listdir(os.path.join(EXTRA, nid)):
        caminho = os.path.join(EXTRA, nid, nome)
        blocos = r['conteudo'].get('blocks', [])
        if any(b['type'] == 'arquivo' and b['data'].get('nome') == nome for b in blocos): print('já tinha:', nome); continue
        mime = mimetypes.guess_type(nome)[0] or 'application/octet-stream'
        j = H.fn('/upload', {'pagina_id': r['id'], 'nome': nome, 'mime': mime, 'dataB64': base64.b64encode(open(caminho, 'rb').read()).decode()})
        a = j['arquivo']
        blocos = [b for b in blocos if not (b['type'] == 'paragraph' and nome.replace('_', ' ') in H.sem_tags(b['data'].get('text', '')).replace('_', ' '))]
        blocos.append({'type': 'arquivo', 'data': {'modo': 'arquivo', 'drive_id': a['drive_id'], 'nome': a['nome'], 'mime': a['mime'], 'tamanho': a['tamanho'], 'link': a.get('link'), 'legenda': ''}})
        r['conteudo'] = {'blocks': blocos}
        base = pags.get(pags[nid]['base_nid']) if nid in pags else None
        texto = H.texto_plano(r['conteudo'], r.get('props'), base['esquema'] if base else None)
        H.req('/rest/v1/hub_paginas?id=eq.' + r['id'], {'conteudo': r['conteudo'], 'texto': texto}, method='PATCH', headers={'Prefer': 'return=minimal'})
        print('ok:', nome, '->', a['drive_id'])
print('fim')
