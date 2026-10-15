#!/usr/bin/env python3
"""Sobe os arquivos da exportação do Notion para o Google Drive (via Edge Function hub-drive) e
troca as referências 'pendente' nas páginas por drive_id. Idempotente: guarda progresso em hub-files-progress.json.
Uso: hub_files.py <hub-import.json> <raw_root> [--max-mb N] [--so-listar]
"""
import sys, os, json, base64, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hub_import as H
RAW = os.path.abspath(sys.argv[2])
PROG = os.path.join(os.path.dirname(sys.argv[1]), 'hub-files-progress.json')
prog = json.load(open(PROG)) if os.path.exists(PROG) else {}
def salva(): json.dump(prog, open(PROG, 'w'), indent=0)
def main():
    d = json.load(open(sys.argv[1], encoding='utf-8'))
    maxmb = float(sys.argv[sys.argv.index('--max-mb') + 1]) if '--max-mb' in sys.argv else 60
    H.login()
    st = H.fn('/status', {})
    if not st.get('conectado'): print('Drive não conectado. Conecte em Configurações › Google Drive.'); return
    print('Drive:', st.get('email'), st.get('pasta_link'))
    # agrupar pendências por caminho relativo (o mesmo arquivo pode aparecer em várias páginas)
    arqs = d['arquivos']; vistos = {}
    for a in arqs:
        rel = os.path.relpath(a['caminho'], RAW)
        vistos.setdefault(rel, []).append(a)
    print('arquivos únicos:', len(vistos))
    if '--so-listar' in sys.argv:
        for rel, lst in list(vistos.items())[:30]: print(rel, len(lst), lst[0]['uso'])
        return
    falhas = []
    import threading
    from concurrent.futures import ThreadPoolExecutor
    lock = threading.Lock(); fila = []
    for rel, lst in vistos.items():
        if rel in prog and prog[rel].get('drive_id'): continue
        p = os.path.join(RAW, rel)
        if not os.path.exists(p): falhas.append((rel, 'inexistente')); continue
        tam = os.path.getsize(p)
        if tam > maxmb * 1024 * 1024: falhas.append((rel, f'grande {tam/1048576:.0f} MB')); continue
        fila.append((rel, lst[0], p))
    fila.sort(key=lambda x: os.path.getsize(x[2]))   # pequenos primeiro
    def sobe(item):
        rel, a, p = item
        try:
            b64 = base64.b64encode(open(p, 'rb').read()).decode()
            j = H.fn('/upload', {'pagina_id': a['pagina_id'], 'nome': a['nome'], 'mime': a['mime'], 'dataB64': b64})
            with lock:
                prog[rel] = {'drive_id': j['arquivo']['drive_id'], 'link': j['arquivo'].get('link'), 'nome': j['arquivo']['nome'], 'mime': j['arquivo']['mime'], 'tamanho': j['arquivo']['tamanho']}
                salva(); print(f'[{len(prog)}/{len(vistos)}] {rel[-60:]} ok ({os.path.getsize(p)/1048576:.1f} MB)', flush=True)
        except Exception as e:
            with lock: falhas.append((rel, str(e)[:160])); print(f'FALHOU {rel[-60:]} {str(e)[:140]}', flush=True)
    with ThreadPoolExecutor(max_workers=5) as ex: list(ex.map(sobe, fila))
    print('falhas:', len(falhas))
    for f in falhas[:40]: print('  ', f)
    # ---- trocar referências nas páginas ----
    patch_pages(d)
def troca_blocos(blocks, feito):
    n = 0
    for b in blocks:
        dd = b.get('data', {})
        if b['type'] == 'arquivo' and dd.get('pendente') and dd['pendente'] in prog:
            pr = prog[dd['pendente']]; dd.update({'drive_id': pr['drive_id'], 'link': pr.get('link'), 'nome': pr['nome'], 'mime': pr['mime'], 'tamanho': pr['tamanho']}); dd.pop('pendente', None); n += 1
    return n
def patch_pages(d):
    print('atualizando páginas…')
    bases = {p['notion_id']: p for p in d['paginas'] if p['tipo'] == 'base'}
    n = 0
    for p in d['paginas']:
        mudou = troca_blocos(p['conteudo']['blocks'], prog) > 0
        patch = {}
        if mudou: patch['conteudo'] = p['conteudo']
        if p.get('capa') and p['capa'].startswith('pendente:'):
            rel = p['capa'][9:]
            if rel in prog: p['capa'] = 'drive:' + prog[rel]['drive_id']; patch['capa'] = p['capa']
        if p['base_nid']:
            b = bases[p['base_nid']]; mp = False
            for pr in b['esquema']['props']:
                if pr['tipo'] != 'arquivos': continue
                for a in (p['props'].get(pr['id']) or []):
                    if a.get('pendente') and a['pendente'] in prog:
                        q = prog[a['pendente']]; a.update({'drive_id': q['drive_id'], 'link': q.get('link'), 'nome': q['nome'], 'mime': q['mime'], 'tamanho': q['tamanho']}); a.pop('pendente', None); mp = True
            if mp: patch['props'] = p['props']
        if patch:
            H.req('/rest/v1/hub_paginas?id=eq.' + p['id'], patch, method='PATCH', headers={'Prefer': 'return=minimal'}); n += 1
    print('páginas atualizadas:', n)
    json.dump(d, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False)
if __name__ == '__main__': main()
