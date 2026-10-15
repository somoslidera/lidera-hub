#!/usr/bin/env python3
"""Passo 2 da migração de anexos: arquivos grandes via sessão retomável do Google (bytes direto), depois corrige as páginas.
Uso: hub_files_grandes.py <hub-import.json> <raw_root> [--min-mb N]"""
import sys, os, json, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hub_import as H, hub_files as F
RAW = os.path.abspath(sys.argv[2])
def main():
    d = json.load(open(sys.argv[1], encoding='utf-8'))
    minmb = float(sys.argv[sys.argv.index('--min-mb') + 1]) if '--min-mb' in sys.argv else 60
    H.login()
    vistos = {}
    for a in d['arquivos']: vistos.setdefault(os.path.relpath(a['caminho'], RAW), []).append(a)
    pend = [(rel, lst[0]) for rel, lst in vistos.items() if not (rel in F.prog and F.prog[rel].get('drive_id')) and os.path.exists(os.path.join(RAW, rel))]
    print('pendentes:', len(pend))
    for rel, a in pend:
        p = os.path.join(RAW, rel); tam = os.path.getsize(p)
        try:
            ini = H.fn('/upload/iniciar', {'pagina_id': a['pagina_id'], 'nome': a['nome'], 'mime': a['mime'], 'tamanho': tam})
            data = open(p, 'rb').read()
            r = urllib.request.Request(ini['sessao'], data=data, method='PUT', headers={'Content-Type': a['mime'], 'Content-Length': str(tam)})
            with urllib.request.urlopen(r, timeout=1800) as resp: g = json.loads(resp.read().decode())
            j = H.fn('/upload/concluir', {'pagina_id': a['pagina_id'], 'drive_id': g['id'], 'pasta': ini.get('pasta')})
            F.prog[rel] = {'drive_id': j['arquivo']['drive_id'], 'link': j['arquivo'].get('link'), 'nome': j['arquivo']['nome'], 'mime': j['arquivo']['mime'], 'tamanho': j['arquivo']['tamanho']}
            F.salva(); print(f'ok {rel[-70:]} ({tam/1048576:.0f} MB)', flush=True)
        except Exception as e:
            print(f'FALHOU {rel[-70:]} {str(e)[:200]}', flush=True)
    F.patch_pages(d)
if __name__ == '__main__': main()
