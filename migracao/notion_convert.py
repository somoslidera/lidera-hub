#!/usr/bin/env python3
"""Converte a exportação HTML do Notion (pasta raw) em JSON para o Hub · by Lidera.
Uso: notion_convert.py <raw_root> <saida.json>
Saída: {"paginas":[...], "arquivos":[...], "avisos":[...]}
  pagina: {id, notion_id, parent_notion, base_notion, tipo, titulo, icone, capa, conteudo{blocks}, props, esquema, visoes, ordem, path}
  arquivo: {pagina_id, caminho (abs), nome, mime, uso: 'bloco'|'capa'|'prop'}
"""
import sys, os, re, json, uuid, csv, mimetypes, html as HTML
from urllib.parse import unquote
from bs4 import BeautifulSoup, NavigableString, Tag

RAW = os.path.abspath(sys.argv[1]); OUT = sys.argv[2]
NS = uuid.UUID('7b1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b')
hid = lambda nid: str(uuid.uuid5(NS, nid))               # id estável no Hub a partir do id do Notion
sid = lambda s: re.sub(r'[^a-z0-9]', '', uuid.uuid5(NS, s).hex[:8])
AVISOS = []
KB_NID = '2904c6be-1360-8084-a9e0-f0633798c6ec'   # 'Base de Conhecimento Lidera' (raiz do Notion)

ICONES = {'groups':'👥','friends':'👥','document':'📄','database':'🗂','cellular':'📶','iterate':'🔁','flag-checkered':'🏁','binoculars':'🔭','pencil':'✏️','map-pin-alternate':'📍','calendar':'📅','font':'🔤','clock':'🕓','burst':'✨','user-circle':'👤','arrow-circle-down':'⬇️','checkmark':'✅','star':'⭐','book':'📖','briefcase':'💼','chart':'📊','graph':'📈','target':'🎯','lightbulb':'💡','megaphone':'📢','rocket':'🚀','gear':'⚙️','settings':'⚙️','folder':'📁','file':'📄','clipboard':'📋','list':'📋','checklist':'☑️','trophy':'🏆','money':'💰','dollar':'💰','credit-card':'💳','people':'👥','person':'👤','bell':'🔔','home':'🏠','building':'🏢','storefront':'🏪','truck':'🚚','bag':'🛍','cart':'🛒','pin':'📍','mail':'✉️','phone':'☎️','laptop':'💻','monitor':'🖥','camera':'📷','video':'🎬','music':'🎵','heart':'❤️','fire':'🔥','key':'🔑','lock':'🔒','link':'🔗','tag':'🏷','bookmark':'🔖','paper-plane':'✈️','globe':'🌎','map':'🗺','compass':'🧭','flag':'🚩','sun':'☀️','moon':'🌙','leaf':'🍃','drink':'🥤','tableware':'🍽','coffee':'☕','hammer':'🔨','wrench':'🔧','pie-chart':'📊','bar-chart':'📊','table':'▦','kanban':'▥','timeline':'📆','calendar-day':'📅','help':'❓','info':'ℹ️','warning':'⚠️','lightning':'⚡','sparkles':'✨','magic-wand':'🪄','gift':'🎁','medal':'🏅','graduation':'🎓','trophy-cup':'🏆','brain':'🧠','mic':'🎙','playbook':'📘','thumbs-up':'👍','handshake':'🤝','shield':'🛡','check':'✅','chat':'💬','comment':'💬','notification':'🔔','search':'🔍','magnifying-glass':'🔍','archive':'🗄','box':'📦','inbox':'📥','outbox':'📤','newspaper':'📰','image':'🖼','palette':'🎨','drama':'🎭','gym':'🏋️','running':'🏃','pizza':'🍕','meat':'🥩','restaurant':'🍽','chef':'👨‍🍳','cake':'🍰','wheat':'🌾','sprout':'🌱','sprinkle':'✨'}
def icone_de(v):
    if not v: return None
    v = v.strip()
    m = re.search(r'/icons/([a-z0-9-]+?)(?:_[a-z]+)?\.svg', v)
    if m:
        nome = m.group(1)
        return ICONES.get(nome) or ICONES.get(nome.split('-')[0]) or None
    if v.startswith('http'): return v
    return v  # emoji

# ---------- utilidades ----------
def rel(path): return os.path.relpath(path, RAW)
def nid_de_nome(nome):
    m = re.search(r'([0-9a-f]{32})(?:\.html|\.csv)?$', nome)
    if not m: return None
    h = m.group(1); return f'{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}'
def limpa(s): return re.sub(r'\s+', ' ', (s or '')).strip()
def mime_de(nome):
    m, _ = mimetypes.guess_type(nome); return m or 'application/octet-stream'
def resolve(base_dir, href):
    """href relativo (url-encoded) → caminho absoluto, ou None se externo/inexistente"""
    if not href or re.match(r'^[a-z]+:', href): return None
    p = os.path.normpath(os.path.join(base_dir, unquote(href.split('#')[0])))
    return p if os.path.exists(p) else None

# ---------- inline (rich text) ----------
INLINE_OK = {'b','i','u','a','br','mark','code','s'}
def inline_html(el, pages_by_nid, base_dir):
    """converte os filhos de el em HTML aceito pelo Editor.js"""
    out = []
    for c in el.children:
        if isinstance(c, NavigableString):
            out.append(HTML.escape(str(c), quote=False)); continue
        if not isinstance(c, Tag): continue
        n = c.name
        if n in ('strong','b'): out.append('<b>' + inline_html(c, pages_by_nid, base_dir) + '</b>')
        elif n in ('em','i'): out.append('<i>' + inline_html(c, pages_by_nid, base_dir) + '</i>')
        elif n == 'u' or (n == 'span' and 'underline' in (c.get('style') or '')): out.append('<u class="cdx-underline">' + inline_html(c, pages_by_nid, base_dir) + '</u>')
        elif n in ('s','del','strike'): out.append('<s>' + inline_html(c, pages_by_nid, base_dir) + '</s>')
        elif n == 'code': out.append('<code class="inline-code">' + inline_html(c, pages_by_nid, base_dir) + '</code>')
        elif n == 'mark':
            cls = ' '.join(c.get('class') or [])
            inner = inline_html(c, pages_by_nid, base_dir)
            out.append('<mark class="cdx-marker">' + inner + '</mark>' if 'background' in cls or 'yellow' in cls or 'orange' in cls else '<b>' + inner + '</b>' if False else '<mark class="cdx-marker">' + inner + '</mark>')
        elif n == 'br': out.append('<br>')
        elif n == 'a':
            href = c.get('href') or ''
            nid = c.get('data-notion-page-id')
            inner = inline_html(c, pages_by_nid, base_dir) or HTML.escape(limpa(c.get_text()))
            if nid and nid in pages_by_nid: out.append(f'<a href="#p/{hid(nid)}">{inner}</a>')
            elif href.endswith('.html') and nid_de_nome(unquote(href)) in pages_by_nid: out.append(f'<a href="#p/{hid(nid_de_nome(unquote(href)))}">{inner}</a>')
            elif re.match(r'^https?:', href): out.append(f'<a href="{HTML.escape(href)}">{inner}</a>')
            else: out.append(inner)
        elif n == 'time': out.append(HTML.escape(limpa(c.get_text())))
        elif n == 'span':
            if c.get('data-emoji'): continue      # ícone de página dentro de link
            cls = ' '.join(c.get('class') or [])
            if 'icon' in cls: continue
            out.append(inline_html(c, pages_by_nid, base_dir))
        elif n == 'img': continue
        elif n == 'input': continue
        elif n in ('div','p'):
            if 'indented' in (c.get('class') or []): continue   # filhos tratados fora
            out.append(inline_html(c, pages_by_nid, base_dir))
        else: out.append(inline_html(c, pages_by_nid, base_dir))
    return ''.join(out)
def so_texto(h): return limpa(BeautifulSoup(h, 'html.parser').get_text())

# ---------- blocos ----------
class Conv:
    def __init__(self, page_dir, pages_by_nid, arquivos, pagina_hid, bases):
        self.dir = page_dir; self.pn = pages_by_nid; self.arquivos = arquivos; self.pid = pagina_hid; self.bases = bases
    def inline(self, el): return inline_html(el, self.pn, self.dir)
    def arquivo_bloco(self, href, nome, modo=None, legenda=''):
        p = resolve(self.dir, href)
        nome = nome or unquote(os.path.basename(href or '')) or 'arquivo'
        if p:
            mime = mime_de(p)
            modo = modo or ('imagem' if mime.startswith('image/') else 'video' if mime.startswith('video/') else 'arquivo')
            self.arquivos.append({'pagina_id': self.pid, 'caminho': p, 'nome': nome, 'mime': mime, 'uso': 'bloco'})
            return {'type':'arquivo','data':{'modo':modo,'pendente':rel(p),'nome':nome,'mime':mime,'tamanho':os.path.getsize(p),'legenda':legenda}}
        if href and re.match(r'^https?:', href):
            return {'type':'link','data':{'url':href,'titulo':nome or href,'embed':True}}
        return {'type':'paragraph','data':{'text':HTML.escape(nome)}}
    def children(self, el):
        """converte os filhos de el em uma lista de blocos"""
        blocks = []; kids = [c for c in el.children if isinstance(c, Tag) or (isinstance(c, NavigableString) and limpa(str(c)))]
        i = 0
        while i < len(kids):
            c = kids[i]
            if isinstance(c, NavigableString):
                blocks.append({'type':'paragraph','data':{'text':HTML.escape(limpa(str(c)))}}); i += 1; continue
            cls = c.get('class') or []; n = c.name
            # listas: juntar irmãos consecutivos do mesmo tipo
            if n in ('ul','ol') and ('bulleted-list' in cls or 'numbered-list' in cls or 'to-do-list' in cls):
                estilo = 'checklist' if 'to-do-list' in cls else 'ordered' if n == 'ol' else 'unordered'
                itens = []; extras = []
                j = i
                while j < len(kids) and isinstance(kids[j], Tag) and kids[j].name == n and set(cls) & set(kids[j].get('class') or []):
                    for li in kids[j].find_all('li', recursive=False):
                        it, ex = self.list_item(li, estilo); itens.append(it); extras += ex
                    j += 1
                blocks.append({'type':'list','data':{'style':estilo,'meta':({'start':int(kids[i].get('start') or 1)} if estilo=='ordered' and kids[i].get('start') else {}),'items':itens}})
                blocks += extras; i = j; continue
            blocks += self.block(c); i += 1
        return blocks
    def list_item(self, li, estilo):
        """item de lista → (item, blocos_extras_que_não_couberam)"""
        extras = []; sub = []
        ind = li.find('div', class_='indented', recursive=False)
        chk = li.find('input', recursive=False)
        # conteúdo inline do li = tudo menos o indented e o checkbox
        tmp = BeautifulSoup('<li></li>', 'html.parser').li
        for c in li.children:
            if isinstance(c, Tag) and (('indented' in (c.get('class') or [])) or c.name == 'input'): continue
            tmp.append(c.__copy__() if isinstance(c, Tag) else NavigableString(str(c)))
        content = self.inline(tmp).strip()
        if ind is not None:
            inner = self.children(ind)
            for b in inner:
                if b['type'] == 'list' and b['data']['style'] == estilo: sub += b['data']['items']
                elif b['type'] == 'list': sub += b['data']['items']   # mistura de tipos: achata
                else: extras.append(b)
        meta = {}
        if estilo == 'checklist': meta = {'checked': bool(chk is not None and chk.has_attr('checked'))}
        return {'content': content, 'meta': meta, 'items': sub}, extras
    def block(self, c):
        n = c.name; cls = c.get('class') or []
        if n == 'p':
            txt = self.inline(c).strip()
            ind = c.find('div', class_='indented', recursive=False)
            out = [{'type':'paragraph','data':{'text':txt}}] if txt else []
            if ind is not None: out += self.children(ind)
            return out
        if n in ('h1','h2','h3','h4'):
            lvl = {'h1':1,'h2':2,'h3':3,'h4':4}[n]
            return [{'type':'header','data':{'text':self.inline(c).strip() or ' ','level':lvl}}]
        if n == 'hr': return [{'type':'delimiter','data':{}}]
        if n == 'br': return []
        if n == 'blockquote': return [{'type':'quote','data':{'text':self.inline(c).strip(),'caption':'','alignment':'left'}}]
        if n == 'pre':
            code = c.get_text()
            return [{'type':'code','data':{'code':code}}]
        if n == 'details':
            summ = c.find('summary'); titulo = self.inline(summ).strip() if summ else 'Toggle'
            inner = []
            for k in c.children:
                if isinstance(k, Tag) and k.name == 'summary': continue
                if isinstance(k, Tag): inner += self.children_of_single(k)
            return [{'type':'toggle','data':{'text':titulo,'status':'closed','items':len(inner)}}] + inner
        if n == 'figure':
            if 'link-to-page' in cls:
                a = c.find('a'); nid = a.get('data-notion-page-id') if a else None
                if nid and nid in self.pn: return [{'type':'pagina','data':{'id':hid(nid)}}]
                if a and a.get('href','').endswith('.html'):
                    nid2 = nid_de_nome(unquote(a['href']))
                    if nid2 in self.pn: return [{'type':'pagina','data':{'id':hid(nid2)}}]
                AVISOS.append(f'link-to-page sem alvo: {limpa(c.get_text())[:60]}')
                return [{'type':'paragraph','data':{'text':'→ '+HTML.escape(limpa(c.get_text()))}}]
            if 'image' in cls or c.find('img'):
                img = c.find('img'); src = img.get('src') if img else None
                cap = c.find('figcaption'); legenda = limpa(cap.get_text()) if cap else ''
                if src and re.match(r'^https?:', src): return [{'type':'arquivo','data':{'modo':'imagem','url':src,'nome':'imagem','mime':'image/*','legenda':legenda}}]
                return [self.arquivo_bloco(src, None, 'imagem', legenda)]
            if 'callout' in cls or c.find('div', class_='callout'):
                ic = c.find('span', class_='icon'); emoji = (ic.get('data-emoji') if ic else None) or '💡'
                body = c.find('div', style=lambda s: s and 'width:100%' in s) or c
                inner = self.children(body)
                texto = ' '.join(b['data'].get('text','') for b in inner if b['type'] in ('paragraph','header'))
                outros = [b for b in inner if b['type'] not in ('paragraph','header')]
                cor = 'gold'
                for k in cls:
                    m = re.match(r'block-color-(\w+?)(?:_background)?$', k)
                    if m and m.group(1) in ('gray','brown','orange','yellow','green','blue','purple','pink','red'): cor = m.group(1)
                return [{'type':'callout','data':{'icon':emoji,'text':texto,'cor':cor}}] + outros
            src = c.find('div', class_='source')
            if src is not None:
                a = src.find('a')
                if a is not None:
                    href = a.get('href') or ''; nome = a.get('data-notion-file-alias') or limpa(a.get_text())
                    cap = c.find('figcaption'); legenda = limpa(cap.get_text()) if cap else ''
                    if a.get('data-notion-file') or (href and not re.match(r'^[a-z]+:', href)): return [self.arquivo_bloco(href, nome, None, legenda)]
                    return [{'type':'link','data':{'url':href,'titulo':nome or href,'embed':True}}]
                ifr = src.find('iframe')
                if ifr is not None and ifr.get('src'): return [{'type':'link','data':{'url':ifr['src'],'titulo':ifr['src'],'embed':True}}]
                return [{'type':'paragraph','data':{'text':HTML.escape(limpa(src.get_text()))}}] if limpa(src.get_text()) else []
            a = c.find('a', class_='bookmark')
            if a is not None:
                t = a.find(class_='bookmark-title'); return [{'type':'link','data':{'url':a.get('href',''),'titulo':limpa(t.get_text()) if t else a.get('href',''),'embed':False}}]
            if 'equation' in cls: return [{'type':'paragraph','data':{'text':HTML.escape(limpa(c.get_text()))}}]
            # figura genérica: tentar filhos
            return self.children(c)
        if n == 'table':
            if 'collection-content' in cls: return []   # tratada no wrapper
            rows = []
            for tr in c.find_all('tr'):
                rows.append([self.inline(td).strip() for td in tr.find_all(['td','th'], recursive=False)])
            if not rows: return []
            w = max(len(r) for r in rows); rows = [r + ['']*(w-len(r)) for r in rows]
            heads = bool(rows and all(re.match(r'^\s*<b>.*</b>\s*$', x) or x == '' for x in rows[0]) and any(rows[0]))
            return [{'type':'table','data':{'withHeadings':heads,'stretched':False,'content':rows}}]
        if n == 'div':
            if 'collection-content' in cls:
                dbid = c.get('id')
                if dbid and dbid in self.bases: return [{'type':'base','data':{'id':hid(dbid)}}]
                h4 = c.find('h4'); tit = limpa(h4.get_text()) if h4 else ''
                # visão vinculada de outra base: casa pelo título
                alvo = next((b for b in self.bases.values() if tit and b['titulo'] == tit), None)
                if alvo is None and tit:
                    # título da base pode estar no html da própria base
                    for b in self.bases.values():
                        if b.get('html') and tit in os.path.basename(b['html']): alvo = b; break
                if alvo: return [{'type':'base','data':{'id':hid(alvo['nid'])}}]
                AVISOS.append(f'base inline sem registro: {dbid} {tit}')
                return [{'type':'paragraph','data':{'text':'<i>(visão de base: '+HTML.escape(tit)+')</i>'}}] if tit else []
            if 'collection-content-wrapper' in cls or 'column-list' in cls or 'column' in cls or 'indented' in cls:
                return self.children(c)
            if 'transcription' in cls:
                out = []
                for k in c.children:
                    if not isinstance(k, Tag): continue
                    if k.name == 'div' and (k.get('style') or '').startswith('border-bottom'):
                        out.append({'type':'header','data':{'text':HTML.escape(limpa(k.get_text())),'level':3}})
                    else: out += self.children_of_single(k)
                return [{'type':'toggle','data':{'text':'Anotações da reunião (Notion)','status':'closed','items':len(out)}}] + out
            if 'callout' in cls:
                return self.block_callout_div(c)
            return self.children(c)
        if n == 'nav' and 'table_of_contents' in cls: return [{'type':'sumario','data':{}}]
        if n == 'img':
            return [self.arquivo_bloco(c.get('src'), None, 'imagem')]
        if n in ('ul','ol'):
            # lista fora do padrão: tratar cada li
            itens = []; extras = []
            for li in c.find_all('li', recursive=False):
                it, ex = self.list_item(li, 'ordered' if n == 'ol' else 'unordered'); itens.append(it); extras += ex
            return [{'type':'list','data':{'style':'ordered' if n=='ol' else 'unordered','meta':{},'items':itens}}] + extras
        if n in ('span','strong','em','a','mark','code','time'):
            t = self.inline(BeautifulSoup('<p></p>','html.parser').p.append(c.__copy__()) or c).strip() if False else inline_html(BeautifulSoup(str(c),'html.parser'), self.pn, self.dir).strip()
            return [{'type':'paragraph','data':{'text':t}}] if t else []
        if n in ('header','footer','script','style'): return []
        return self.children(c)
    def children_of_single(self, k): return self.children(BeautifulSoup('<div></div>','html.parser').div.__class__ and _wrap(k))
    def block_callout_div(self, c):
        ic = c.find('span', class_='icon'); emoji = (ic.get('data-emoji') if ic else None) or '💡'
        inner = self.children(c)
        texto = ' '.join(b['data'].get('text','') for b in inner if b['type'] in ('paragraph','header'))
        outros = [b for b in inner if b['type'] not in ('paragraph','header')]
        return [{'type':'callout','data':{'icon':emoji,'text':texto,'cor':'gold'}}] + outros
def _wrap(k):
    w = BeautifulSoup('<div></div>', 'html.parser').div; w.append(k.__copy__()); return w

# ---------- propriedades ----------
NOTION_CORES = {'default':'gray','gray':'gray','brown':'brown','orange':'orange','yellow':'yellow','green':'green','blue':'blue','purple':'purple','pink':'pink','red':'red'}
def tipo_por_classe(tr_cls):
    for k in tr_cls:
        m = re.match(r'property-row-(\w+)', k)
        if m and m.group(1) != 'row': return m.group(1)
    return None
def valor_td(td, tipo_hint, pages_by_nid, base_dir):
    """td de propriedade → (tipo, valor, opcoes[{nome,cor}])"""
    sels = td.select('span.selected-value')
    if sels:
        ops = []
        for s in sels:
            cor = 'gray'
            for k in s.get('class') or []:
                m = re.match(r'select-value-color-(\w+)', k)
                if m: cor = NOTION_CORES.get(m.group(1), 'gray')
            ops.append({'nome': limpa(s.get_text()), 'cor': cor})
        if tipo_hint == 'multi_select' or len(ops) > 1: return 'multi', [o['nome'] for o in ops], ops
        return 'select', ops[0]['nome'], ops
    st = td.select_one('span.status-value')
    if st is not None:
        cor = 'gray'; dot = st.find('div', class_='status-dot')
        if dot:
            for k in dot.get('class') or []:
                m = re.match(r'status-dot-color-(\w+)', k)
                if m: cor = NOTION_CORES.get(m.group(1), 'gray')
        nome = limpa(st.get_text()); return 'status', nome, [{'nome':nome,'cor':cor}]
    chk = td.find('input', class_='checkbox') or td.find('div', class_='checkbox')
    if chk is not None:
        on = chk.has_attr('checked') or 'checkbox-on' in (chk.get('class') or []); return 'checkbox', on, []
    times = td.find_all('time')
    if times:
        a = times[0].get('datetime') or ''; b = times[1].get('datetime') if len(times) > 1 else ''
        return 'data', {'inicio': a, 'fim': b or '', 'hora': 'T' in a}, []
    users = td.select('span.user')
    if users: return 'pessoa', [limpa(u.get_text()) for u in users], []
    links = td.find_all('a')
    if links:
        pags = [l for l in links if l.get('data-notion-page-id') or (l.get('href','').endswith('.html'))]
        if pags and len(pags) == len(links):
            ids = []
            for l in pags:
                nid = l.get('data-notion-page-id') or nid_de_nome(unquote(l.get('href','')))
                if nid: ids.append(nid)
            return 'relacao', ids, []
        arqs = []
        for l in links:
            href = l.get('href') or ''; p = resolve(base_dir, href)
            arqs.append({'pendente': rel(p) if p else None, 'url': None if p else href, 'nome': limpa(l.get_text()) or os.path.basename(unquote(href)), 'mime': mime_de(p) if p else mime_de(href)})
        if tipo_hint in ('url','email','phone_number') and len(links) == 1: return {'url':'url','email':'email','phone_number':'telefone'}[tipo_hint], links[0].get('href') or limpa(links[0].get_text()), []
        return 'arquivos', arqs, []
    txt = limpa(td.get_text())
    if tipo_hint == 'number':
        try: return 'numero', float(txt.replace('.', '').replace(',', '.')) if re.match(r'^-?[\d.,]+$', txt) else txt, []
        except: return 'texto', txt, []
    if tipo_hint in ('url','email','phone_number'): return {'url':'url','email':'email','phone_number':'telefone'}[tipo_hint], txt, []
    if tipo_hint in ('created_time','last_edited_time'): return {'created_time':'criado_em','last_edited_time':'atualizado_em'}[tipo_hint], None, []
    if tipo_hint in ('created_by','last_edited_by'): return 'pessoa', [txt] if txt else [], []
    if tipo_hint == 'formula' or tipo_hint == 'rollup': return 'texto', txt, []
    if tipo_hint == 'date': return 'data', ({'inicio':txt,'fim':'','hora':False} if txt else None), []
    if tipo_hint in ('select','status'): return 'select', (txt or None), ([{'nome':txt,'cor':'gray'}] if txt else [])
    if tipo_hint == 'multi_select': return 'multi', [x.strip() for x in txt.split(',') if x.strip()], [{'nome':x.strip(),'cor':'gray'} for x in txt.split(',') if x.strip()]
    if tipo_hint == 'checkbox': return 'checkbox', txt.lower() in ('yes','sim','true'), []
    return 'texto', txt, []

# ---------- varredura ----------
def main():
    htmls = []
    for dp, dn, fn in os.walk(RAW):
        for f in fn:
            if f.endswith('.html') and nid_de_nome(f): htmls.append(os.path.join(dp, f))
    csvs = {}
    for dp, dn, fn in os.walk(RAW):
        for f in fn:
            if f.endswith('.csv') and nid_de_nome(f): csvs[nid_de_nome(f)] = os.path.join(dp, f)
    print('html', len(htmls), 'csv', len(csvs))
    # índice por notion id
    by_nid = {}
    for p in htmls:
        nid = nid_de_nome(os.path.basename(p)); by_nid[nid] = p
    # a raiz "Base de Conhecimento Lidera" é uma base; suas linhas viram páginas de raiz
    raiz_db = [n for n, p in by_nid.items() if os.path.dirname(p) == os.path.join(RAW, 'Particular e Compartilhado')]
    # bases: id → {titulo, parent_nid, pasta_linhas, inline, html(opcional)}
    bases = {}
    for nid, p in csvs.items():
        d = os.path.dirname(p); nome = re.sub(r'\s+[0-9a-f]{32}\.csv$', '', os.path.basename(p))
        pasta = os.path.join(d, nome)
        full = nid in by_nid and os.path.dirname(by_nid[nid]) == d   # html da própria base ao lado do csv
        # pai: a página dona da pasta d
        pai_html = None
        pd, pn = os.path.split(d)
        for cand in os.listdir(pd) if os.path.isdir(pd) else []:
            if cand.endswith('.html') and re.sub(r'\s+[0-9a-f]{32}\.html$', '', cand) == pn: pai_html = os.path.join(pd, cand)
        bases[nid] = {'nid': nid, 'titulo': '' if nome == 'Sem título' else nome, 'pasta': pasta if os.path.isdir(pasta) else None, 'full': full, 'parent_nid': nid_de_nome(os.path.basename(pai_html)) if pai_html else None, 'csv': p, 'html': by_nid.get(nid) if full else None, 'props': {}, 'ordem_props': [], 'linhas': []}
    # linhas de cada base: páginas dentro da pasta da base
    linha_base = {}   # nid da página → nid da base
    for b in bases.values():
        if not b['pasta']: continue
        for f in os.listdir(b['pasta']):
            if f.endswith('.html') and nid_de_nome(f): linha_base[nid_de_nome(f)] = b['nid']
    # pai de cada página pela pasta
    def pai_de(path):
        d = os.path.dirname(path); pd, pn = os.path.split(d)
        if not os.path.isdir(pd): return None
        for cand in os.listdir(pd):
            if cand.endswith('.html') and nid_de_nome(cand) and re.sub(r'\s+[0-9a-f]{32}\.html$', '', cand) == pn: return nid_de_nome(cand)
        # pasta de base (linhas): pai = página dona da pasta acima
        return None
    paginas = {}; arquivos = []
    ordem_links = {}   # parent nid → [child nids na ordem do conteúdo]
    for p in htmls:
        nid = nid_de_nome(os.path.basename(p))
        if nid in bases and bases[nid]['full']: continue   # html de tabela da base: não é página
        try: soup = BeautifulSoup(open(p, encoding='utf-8', errors='replace').read(), 'html.parser')
        except Exception as e: AVISOS.append(f'falha ao ler {rel(p)}: {e}'); continue
        art = soup.find('article')
        if art is None: AVISOS.append(f'sem article: {rel(p)}'); continue
        titulo = limpa(art.select_one('h1.page-title').get_text()) if art.select_one('h1.page-title') else re.sub(r'\s+[0-9a-f]{32}\.html$', '', os.path.basename(p))
        icone = icone_de(art.get('data-notion-page-icon'))
        cover = art.select_one('img.page-cover-image'); capa = None
        if cover is not None:
            src = cover.get('src') or ''
            if re.match(r'^https?:', src): capa = src
            else:
                cp = resolve(os.path.dirname(p), src)
                if cp: capa = 'pendente:' + rel(cp); arquivos.append({'pagina_id': hid(nid), 'caminho': cp, 'nome': os.path.basename(cp), 'mime': mime_de(cp), 'uso': 'capa'})
        desc = art.select_one('p.page-description'); desc = limpa(desc.get_text()) if desc else ''
        base_nid = linha_base.get(nid)
        if base_nid == KB_NID: base_nid = None   # seções de raiz (linhas da base-raiz) viram páginas de raiz
        parent_nid = bases[base_nid]['parent_nid'] if base_nid else pai_de(p)
        if base_nid and not bases[base_nid]['full']: parent_nid = bases[base_nid]['parent_nid']
        if linha_base.get(nid) == KB_NID: parent_nid = None
        props = {}
        tabela = art.select_one('header table.properties')
        if tabela is not None and base_nid:
            b = bases[base_nid]
            for tr in tabela.find_all('tr'):
                th = tr.find('th'); td = tr.find('td')
                if th is None or td is None: continue
                nome = limpa(th.get_text()); hint = tipo_por_classe(tr.get('class') or [])
                tipo, valor, ops = valor_td(td, hint, by_nid, os.path.dirname(p))
                if nome not in b['props']: b['props'][nome] = {'id': sid(base_nid + '|' + nome), 'nome': nome, 'tipo': tipo, 'opcoes': {}}; b['ordem_props'].append(nome)
                pr = b['props'][nome]
                # tipo mais rico vence
                rank = {'texto':0,'select':2,'multi':3,'status':2,'data':2,'pessoa':2,'checkbox':2,'url':1,'email':1,'telefone':1,'arquivos':2,'relacao':2,'numero':1,'criado_em':2,'atualizado_em':2}
                if rank.get(tipo,0) > rank.get(pr['tipo'],0): pr['tipo'] = tipo
                if tipo == 'select' and pr['tipo'] == 'multi' and valor is not None: valor = [valor]
                for o in ops: pr['opcoes'].setdefault(o['nome'], o['cor'])
                if tipo == 'arquivos':
                    for a in valor:
                        if a.get('pendente'): arquivos.append({'pagina_id': hid(nid), 'caminho': os.path.join(RAW, a['pendente']), 'nome': a['nome'], 'mime': a['mime'], 'uso': 'prop'})
                if valor not in (None, '', [], {}): props[pr['id']] = valor
        # conteúdo
        body = art.select_one('.page-body')
        conv = Conv(os.path.dirname(p), by_nid, arquivos, hid(nid), bases)
        blocks = conv.children(body) if body is not None else []
        if desc: blocks.insert(0, {'type':'paragraph','data':{'text':'<i>' + HTML.escape(desc) + '</i>'}})
        # ordem dos filhos pelo conteúdo
        ordem_links[nid] = [b['data']['id'] for b in blocks if b['type'] == 'pagina'] + [b['data']['id'] for b in blocks if b['type'] == 'base']
        paginas[nid] = {'id': hid(nid), 'notion_id': nid, 'parent_nid': parent_nid, 'base_nid': base_nid, 'tipo': 'pagina', 'titulo': titulo, 'icone': icone, 'capa': capa, 'conteudo': {'blocks': blocks}, 'props': props, 'esquema': None, 'visoes': None, 'path': rel(p)}
    # bases viram páginas tipo 'base'
    for b in bases.values():
        if b['nid'] == KB_NID: continue   # a base-raiz do Notion não existe no Hub
        esquema = {'props': []}
        for nome in b['ordem_props']:
            pr = b['props'][nome]; d = {'id': pr['id'], 'nome': nome, 'tipo': pr['tipo']}
            if pr['tipo'] in ('select','multi','status'): d['opcoes'] = [{'id': sid(b['nid']+'|'+nome+'|'+on), 'nome': on, 'cor': oc} for on, oc in pr['opcoes'].items()]
            esquema['props'].append(d)
        # remapear valores de select/multi/relacao para ids de opção / ids do hub
        for pnid, pg in paginas.items():
            if pg['base_nid'] != b['nid']: continue
            for d in esquema['props']:
                v = pg['props'].get(d['id'])
                if v is None: continue
                if d['tipo'] in ('select','status'):
                    o = next((o for o in d['opcoes'] if o['nome'] == v), None); pg['props'][d['id']] = o['id'] if o else v
                elif d['tipo'] == 'multi':
                    pg['props'][d['id']] = [next((o['id'] for o in d['opcoes'] if o['nome'] == x), x) for x in (v if isinstance(v, list) else [v])]
                elif d['tipo'] == 'relacao':
                    pg['props'][d['id']] = [hid(x) for x in v if x in by_nid]
                elif d['tipo'] == 'pessoa':
                    pg['props'][d['id']] = v   # nomes; o importador troca por ids de membros
        # título/ícone/visões
        titulo = b['titulo']
        if b['html']:
            try:
                s2 = BeautifulSoup(open(b['html'], encoding='utf-8', errors='replace').read(), 'html.parser'); a2 = s2.find('article')
                titulo = limpa(a2.select_one('h1.page-title').get_text()) if a2 and a2.select_one('h1.page-title') else titulo
                b['icone'] = icone_de(a2.get('data-notion-page-icon')) if a2 else None
                dd = a2.select_one('p.page-description') if a2 else None; b['desc'] = limpa(dd.get_text()) if dd else ''
            except Exception: pass
        elif b['parent_nid'] in by_nid:
            # título do h4.collection-title na página-mãe
            try:
                s2 = BeautifulSoup(open(by_nid[b['parent_nid']], encoding='utf-8', errors='replace').read(), 'html.parser')
                col = s2.find('div', id=b['nid'])
                if col is not None:
                    h4 = col.find('h4'); titulo = limpa(h4.get_text()) if h4 and limpa(h4.get_text()) else titulo
            except Exception: pass
        tipos = {d['nome']: d for d in esquema['props']}
        visoes = [{'id':'v1','nome':'Tabela','tipo':'tabela','props':None}]
        st = next((d for d in esquema['props'] if d['tipo'] in ('status','select') and d['nome'].lower().startswith('status')), None) or next((d for d in esquema['props'] if d['tipo'] in ('status','select')), None)
        if st: visoes.append({'id':'v2','nome':'Kanban','tipo':'kanban','agrupar':st['id'],'props':None})
        dt = next((d for d in esquema['props'] if d['tipo'] == 'data'), None)
        if dt: visoes.append({'id':'v3','nome':'Calendário','tipo':'calendario','calendarioPor':dt['id'],'props':None})
        blocks = []
        if b.get('desc'): blocks.append({'type':'paragraph','data':{'text':'<i>'+HTML.escape(b['desc'])+'</i>'}})
        paginas[b['nid']] = {'id': hid(b['nid']), 'notion_id': b['nid'], 'parent_nid': b['parent_nid'], 'base_nid': None, 'tipo': 'base', 'titulo': titulo or 'Base de dados', 'icone': b.get('icone'), 'capa': None, 'conteudo': {'blocks': blocks}, 'props': {}, 'esquema': esquema, 'visoes': visoes, 'path': rel(b['csv']), 'inline': not b['full']}
        # linhas: parent = base
        for pnid, pg in paginas.items():
            if pg['base_nid'] == b['nid']: pg['parent_nid'] = b['nid']
    # ordem
    for nid, pg in paginas.items():
        pid = pg['parent_nid']; pg['ordem'] = 0
        lst = ordem_links.get(pid) or []
        if pg['id'] in lst: pg['ordem'] = lst.index(pg['id']) + 1
        else: pg['ordem'] = 1000 + sum(ord(c) for c in pg['titulo'][:3]) * 0.001
    out = {'paginas': list(paginas.values()), 'arquivos': arquivos, 'avisos': AVISOS}
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
    tipos = {}
    for pg in paginas.values(): tipos[pg['tipo'] + ('/linha' if pg['base_nid'] else '')] = tipos.get(pg['tipo'] + ('/linha' if pg['base_nid'] else ''), 0) + 1
    print('paginas', len(paginas), tipos, 'arquivos', len(arquivos), 'avisos', len(AVISOS))
    bl = {}
    for pg in paginas.values():
        for b in pg['conteudo']['blocks']: bl[b['type']] = bl.get(b['type'], 0) + 1
    print('blocos', bl)
    for a in AVISOS[:15]: print('  aviso:', a)
if __name__ == '__main__': main()
