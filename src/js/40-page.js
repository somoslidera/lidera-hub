/* ===================== roteador, página, início, lixeira ===================== */
function roteador(){popFechar();const h=location.hash.replace(/^#/,'');const [tipo,id,extra]=h.split('/');
  if(h.indexOf('access_token')>=0||h.indexOf('type=recovery')>=0)return;
  S.rota={tipo:tipo||'inicio',id:id||null,extra:extra||null};sbToggle(false);
  if(S.rota.tipo==='p'&&id)abrirPaginaView(id);
  else if(S.rota.tipo==='config')viewConfig(extra||id);
  else if(S.rota.tipo==='lixeira')viewLixeira();
  else viewInicio();
  marcarAtivo();}
window.addEventListener('hashchange',roteador);

function setCrumbs(itens){$('#crumbs').innerHTML=itens.map((c,i)=>(i?'<span class="sep">/</span>':'')+'<a class="'+(i===itens.length-1?'cur':'')+'" '+(c.id?'onclick="abrirPagina(\''+c.id+'\')"':c.go?'onclick="go(\''+c.go+'\')"':'')+'>'+(c.ico?'<span>'+c.ico+'</span>':'')+'<span>'+esc(c.t)+'</span></a>').join('');}
function renderTopActions(){const el=$('#top_actions');if(!el)return;if(!S.pagina||S.rota.tipo!=='p'){el.innerHTML='';return;}const p=S.pagina;
  el.innerHTML='<span class="save-st" id="save_st"></span>'+
    '<button class="ic-btn" title="'+(ehFav(p.id)?'Tirar dos favoritos':'Favoritar')+'" onclick="favToggle(S.pagina.id)" style="color:'+(ehFav(p.id)?'var(--gold)':'')+'">'+(ehFav(p.id)?'★':'☆')+'</button>'+
    '<button class="ic-btn" title="Copiar link" onclick="copiar(linkPagina(S.pagina.id),\'Link copiado\')">🔗</button>'+
    '<button class="ic-btn" title="Mais" onclick="menuPaginaTop(this)">···</button>';}
function menuPaginaTop(anchor){const p=S.pagina;const itens=[{t:p.largura_total?'Largura normal':'Largura total',ico:'↔',f:async()=>{await atualizarPagina(p.id,{largura_total:!p.largura_total});$('.page')&&$('.page').classList.toggle('wide',p.largura_total);}},
    {t:'Histórico de versões',ico:'🕓',f:()=>historicoPagina(p.id)},{t:'Exportar em Markdown',ico:'⇩',f:()=>exportarMD(p)},{t:'Imprimir / PDF',ico:'🖨',f:()=>window.print()},'-',
    {t:'Pasta no Google Drive',ico:'📁',f:()=>abrirPastaDrive(p.id)},'-'];
  if(podeEditar())itens.push({t:'Trocar ícone',ico:'☺',f:()=>emojiPicker(anchor,e=>setIcone(e))},{t:p.capa?'Trocar capa':'Adicionar capa',ico:'🖼',f:()=>capaMenu(anchor)},{t:'Mover para…',ico:'→',f:()=>moverPaginaDialogo(p.id)},{t:'Duplicar',ico:'⧉',f:()=>duplicarPagina(p.id)},'-',{t:'Arquivar (lixeira)',ico:'🗑',danger:true,f:()=>arquivarPagina(p.id)});
  menu(anchor,itens,{alinhar:'dir'});}
function saveStatus(t,err){const e=$('#save_st');if(e){e.textContent=t||'';e.classList.toggle('err',!!err);}}

// ---------- abrir página ----------
let PAGE_SEQ=0;
async function abrirPaginaView(id,forcar){if(S.pagina&&S.pagina.id===id&&!forcar&&S.rota.extra==null){marcarAtivo();return;}
  await salvarAgora();const seq=++PAGE_SEQ;destruirEditor();
  $('#content').innerHTML='<div class="carregando"><span class="spin"></span> Carregando…</div>';
  const {data:p,error}=await sb.from('hub_paginas').select('*').eq('id',id).maybeSingle();if(seq!==PAGE_SEQ)return;
  if(!p){$('#content').innerHTML='<div class="vazio-box">Página não encontrada ou sem acesso.<br><br><button class="btn btn-ghost" onclick="go(\'inicio\')">Ir para o início</button></div>';setCrumbs([{t:'Não encontrada'}]);S.pagina=null;renderTopActions();return;}
  S.pagina=p;S.dirty=false;recAdd(id);if(!p.base_id)treeRevelar(id);
  const cr=ancestrais(id).map(a=>({id:a.id,t:tituloDe(a),ico:iconeDe(a)}));if(p.base_id&&S.byId[p.base_id]){const b=S.byId[p.base_id];cr.push({id:b.id,t:tituloDe(b),ico:iconeDe(b)});}
  cr.push({id,t:tituloDe(p),ico:iconeDe(p)});setCrumbs(cr);document.title=(p.titulo||'Sem título')+' · Hub';
  const c=$('#content');c.innerHTML='';c.appendChild(paginaElemento(p,{}));renderTopActions();
  if(p.tipo==='base')baseMontar(p,$('#base_host',c),{});else montarEditor(p,$('#editor_host',c));
  if(p.base_id)propsMontar(p,$('#props_host',c));
  if(!p.titulo&&podeEditar())setTimeout(()=>{const t=$('.page-title',c);t&&t.focus();},60);}

function paginaElemento(p,opts){opts=opts||{};const el=document.createElement('div');el.className='page'+(p.largura_total||p.tipo==='base'?' wide':'');
  const temCapa=!!p.capa;const capaCss=capaStyle(p.capa);
  el.innerHTML=(temCapa?'<div class="page-cover" style="'+capaCss+'">'+(podeEditar()?'<div class="cover-acts"><button class="btn btn-sm" onclick="capaMenu(this)">Trocar capa</button><button class="btn btn-sm" onclick="setCapa(null)">Remover</button></div>':'')+'</div>':'')+
    '<div class="page-head'+(temCapa?' com-capa':'')+'">'+
    (p.icone?'<div class="page-icon" onclick="podeEditar()&&emojiPicker(this,e=>setIcone(e))">'+iconeDe(p)+'</div>':'')+
    (podeEditar()?'<div class="page-acts">'+(!p.icone?'<button class="btn" onclick="emojiPicker(this,e=>setIcone(e))">☺ Adicionar ícone</button>':'')+(!temCapa?'<button class="btn" onclick="capaMenu(this)">🖼 Adicionar capa</button>':'')+'</div>':'')+
    '<h1 class="page-title'+(opts.peek?' sm':'')+'" contenteditable="'+(podeEditar()?'true':'false')+'" data-ph="Sem título" spellcheck="false">'+esc(p.titulo||'')+'</h1>'+
    (p.base_id?'<div id="props_host"></div>':'')+
    '<div class="page-meta"><span>Editado '+esc(fmtRel(p.atualizado_em))+(p.atualizado_por&&nomeMembro(p.atualizado_por)?' por '+esc(nomeMembro(p.atualizado_por)):'')+'</span></div>'+
    '</div>'+
    (p.tipo==='base'?'<div id="base_host"></div>':'<div class="editor-wrap"><div id="editor_host"></div></div>');
  const t=$('.page-title',el);
  t.addEventListener('input',()=>{const v=t.textContent.trim();S.pagina.titulo=v;S.dirty=true;agendarSalvar();const n=S.byId[p.id];if(n){n.titulo=v;}document.title=(v||'Sem título')+' · Hub';});
  t.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(S.editor&&S.editor.focus)S.editor.focus();else if(p.tipo==='base'){t.blur();}}});
  t.addEventListener('blur',()=>{renderTree();renderFavoritos();const cr=$$('#crumbs a.cur span:last-child');cr.length&&(cr[cr.length-1].textContent=S.pagina.titulo||'Sem título');});
  t.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,(e.clipboardData.getData('text/plain')||'').replace(/\n+/g,' '));});
  return el;}
function capaStyle(c){if(!c)return '';if(c.startsWith('grad:'))return 'background:'+c.slice(5);if(c.startsWith('drive:'))return 'background-image:url('+arqUrl(c.slice(6),'thumb','w1600')+')';return 'background-image:url('+esc(c)+')';}
const GRADS=['linear-gradient(135deg,#1D3573,#4567A8)','linear-gradient(135deg,#A48A57,#E3CFA1)','linear-gradient(135deg,#0f2027,#203a43,#2c5364)','linear-gradient(135deg,#f6d365,#fda085)','linear-gradient(135deg,#a1c4fd,#c2e9fb)','linear-gradient(135deg,#d4fc79,#96e6a1)','linear-gradient(135deg,#fbc2eb,#a6c1ee)','linear-gradient(135deg,#1B2235,#6B7384)'];
function capaMenu(anchor){const html='<div class="plbl">GRADIENTES</div><div class="cores">'+GRADS.map(g=>'<div class="c" style="background:'+g+';width:34px;height:26px" data-g="'+g+'"></div>').join('')+'</div><div class="psep"></div><div class="pi" id="cp_up"><span class="ico">⇧</span><span>Enviar imagem (Drive)</span></div><div class="pi" id="cp_url"><span class="ico">🔗</span><span>Usar link de imagem</span></div>'+(S.pagina.capa?'<div class="pi danger" id="cp_rm"><span class="ico">✕</span><span>Remover capa</span></div>':'');
  const el=pop(anchor,html);$$('.c',el).forEach(c=>c.onclick=()=>{popFechar();setCapa('grad:'+c.dataset.g);});
  $('#cp_up',el).onclick=()=>{popFechar();escolherArquivos(async fs=>{const a=await uploadArquivo(fs[0],S.pagina.id);if(a)setCapa('drive:'+a.drive_id);},'image/*');};
  $('#cp_url',el).onclick=async()=>{popFechar();const u=await perguntar('Link da imagem de capa','',{ph:'https://…'});if(u)setCapa(u.trim());};
  const rm=$('#cp_rm',el);if(rm)rm.onclick=()=>{popFechar();setCapa(null);};}
async function setCapa(c){await atualizarPagina(S.pagina.id,{capa:c});abrirPaginaView(S.pagina.id,true);}
async function setIcone(e){await atualizarPagina(S.pagina.id,{icone:e});abrirPaginaView(S.pagina.id,true);}
async function abrirPastaDrive(id){try{const j=await fn('/pasta',{pagina_id:id});window.open(j.link,'_blank');}catch(e){toast(e.message,{erro:true});}}

// ---------- salvar ----------
const agendarSalvar=debounce(()=>salvarAgora(),900);
async function salvarAgora(){if(!S.pagina||!S.dirty||!podeEditar())return;const p=S.pagina;S.saving=true;saveStatus('Salvando…');
  try{let conteudo=p.conteudo;if(S.editor&&S.editorPaginaId===p.id){try{conteudo=await S.editor.save();}catch(e){}}
    const texto=textoPlano(conteudo,p.props,p.esquema);
    const patch={titulo:p.titulo||'',conteudo,texto,props:p.props||{}};if(p.tipo==='base'){patch.esquema=p.esquema;patch.visoes=p.visoes;}
    const {error}=await sb.from('hub_paginas').update(patch).eq('id',p.id);if(error)throw error;
    p.conteudo=conteudo;S.dirty=false;saveStatus('Salvo');setTimeout(()=>{if(!S.dirty)saveStatus('');},2000);
    const n=S.byId[p.id];if(n&&n.titulo!==p.titulo){n.titulo=p.titulo;renderTree();}
    localStorage.removeItem('hub_bkp_'+p.id);
  }catch(e){saveStatus('Não salvou',true);try{localStorage.setItem('hub_bkp_'+p.id,JSON.stringify({titulo:p.titulo,conteudo:p.conteudo,em:Date.now()}));}catch(x){}toast('Não deu para salvar: '+(e.message||e),{erro:true});}
  S.saving=false;}
window.addEventListener('beforeunload',e=>{if(S.dirty){salvarAgora();e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)salvarAgora();});

// ---------- histórico ----------
async function historicoPagina(id){const {data}=await sb.from('hub_versoes').select('id,titulo,por,em').eq('pagina_id',id).order('em',{ascending:false}).limit(40);
  const bg=modal('<div class="modal-h">Histórico de versões<button class="ic-btn" onclick="fecharModal()">✕</button></div><div class="modal-b">'+((data||[]).length?data.map(v=>'<div class="ver"><span>'+esc(fmtData(v.em,true))+'</span><span class="muted small">'+esc(nomeMembro(v.por)||'')+'</span><span class="muted small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px">'+esc(v.titulo||'')+'</span>'+(podeEditar()?'<button class="btn btn-sm btn-ghost" data-v="'+v.id+'">Restaurar</button>':'')+'</div>').join(''):'<div class="vazio-box">Ainda não há versões anteriores. Uma versão é guardada a cada 10 minutos de edição.</div>')+'</div>');
  $$('button[data-v]',bg).forEach(b=>b.onclick=async()=>{if(!await confirmar('Restaurar versão','O conteúdo atual será substituído por esta versão (ele fica guardado no histórico).'))return;const {data:v}=await sb.from('hub_versoes').select('*').eq('id',b.dataset.v).single();await sb.from('hub_paginas').update({titulo:v.titulo,conteudo:v.conteudo,props:v.props||{}}).eq('id',id);fecharModal(bg);toast('Versão restaurada');abrirPaginaView(id,true);});}

// ---------- exportar markdown ----------
function exportarMD(p){const md=blocosParaMD(p.conteudo);const blob=new Blob(['# '+(p.titulo||'Sem título')+'\n\n'+md],{type:'text/markdown'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(p.titulo||'pagina').replace(/[\\/:*?"<>|]/g,'-')+'.md';a.click();}

// ---------- início ----------
function viewInicio(){destruirEditor();S.pagina=null;renderTopActions();document.title='Hub · by Lidera';setCrumbs([{t:'Início',go:'inicio'}]);
  const h=new Date().getHours();const sauda=h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';const nome=(S.me.nome||S.me.email).split(' ')[0].split('@')[0];
  const raiz=filhosDe(null);const rec=S.recentes.map(id=>S.byId[id]).filter(Boolean).slice(0,8);const favs=S.favoritos.map(f=>S.byId[f.pagina_id]).filter(Boolean);
  const card=n=>'<div class="hcard" onclick="abrirPagina(\''+n.id+'\')"><div class="hi">'+iconeDe(n)+'</div><div class="ht">'+esc(tituloDe(n))+'</div><div class="hs">'+esc(fmtRel(n.atualizado_em))+'</div></div>';
  $('#content').innerHTML='<div class="home"><h1>'+sauda+', '+esc(nome)+'.</h1><div class="sub">A base de conhecimento da Lidera. Tudo que a equipe precisa, num lugar só.</div>'+
    '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-primary" onclick="buscaAbrir()">⌕ Buscar</button>'+(podeEditar()?'<button class="btn btn-ghost" onclick="novaPagina(null)">+ Nova página</button>':'')+'</div>'+
    (rec.length?'<h2>RECENTES</h2><div class="rec">'+rec.map(card).join('')+'</div>':'')+
    (favs.length?'<h2>FAVORITOS</h2><div class="cards">'+favs.map(card).join('')+'</div>':'')+
    '<h2>PÁGINAS</h2><div class="cards">'+raiz.map(card).join('')+(podeEditar()?'<div class="hcard add" onclick="novaPagina(null)">+ Nova página</div>':'')+'</div></div>';}

// ---------- lixeira ----------
async function viewLixeira(){destruirEditor();S.pagina=null;renderTopActions();setCrumbs([{t:'Lixeira',go:'lixeira'}]);document.title='Lixeira · Hub';
  const {data}=await sb.from('hub_paginas').select('id,titulo,icone,tipo,parent_id,base_id,atualizado_em').eq('arquivada',true).order('atualizado_em',{ascending:false}).limit(300);
  $('#content').innerHTML='<div class="cfg"><h1>Lixeira</h1><div class="card"><p>Páginas arquivadas ficam aqui. Você pode restaurar ou apagar de vez (apagar remove também as subpáginas).</p></div><div class="card lst">'+((data||[]).length?data.map(p=>'<div class="it"><span style="font-size:20px">'+iconeDe(p)+'</span><div class="grow"><div class="nm">'+esc(p.titulo||'Sem título')+'</div><div class="em">'+esc(fmtData(p.atualizado_em,true))+'</div></div>'+(podeEditar()?'<button class="btn btn-sm btn-ghost" onclick="restaurar(\''+p.id+'\')">Restaurar</button><button class="btn btn-sm btn-danger" style="margin-left:6px" onclick="apagarDeVez(\''+p.id+'\')">Apagar</button>':'')+'</div>').join(''):'<div class="vazio-box">A lixeira está vazia.</div>')+'</div></div>';}
async function restaurar(id){await sb.from('hub_paginas').update({arquivada:false}).eq('id',id);const n=S.byId[id];if(n){n.arquivada=false;renderTree();}toast('Página restaurada');viewLixeira();}
async function apagarDeVez(id){if(!await confirmar('Apagar de vez','Isso apaga a página, as subpáginas e o histórico. Os arquivos continuam no Google Drive. Não dá para desfazer.',{danger:true,ok:'Apagar'}))return;await sb.from('hub_paginas').delete().eq('id',id);S.tree=S.tree.filter(x=>x.id!==id);indexarArvore();renderTree();toast('Apagada');viewLixeira();}

// ---------- busca ----------
function buscaAbrir(){if($('.busca'))return;let sel=0,res=[];const bg=modal('<div class="busca-in"><span class="ico">⌕</span><input id="bq" placeholder="Buscar páginas, bases e conteúdo…" autocomplete="off"><kbd style="background:var(--hover);color:var(--soft)">esc</kbd></div><div class="busca-res" id="bres"></div>',{cls:'busca'});
  const render=()=>{const el=$('#bres',bg);if(!res.length){const rec=S.recentes.map(id=>S.byId[id]).filter(Boolean).slice(0,6);el.innerHTML=(rec.length?'<div class="busca-lbl">RECENTES</div>'+rec.map((n,i)=>'<div class="br'+(i===sel?' sel':'')+'" data-id="'+n.id+'"><span class="bi">'+iconeDe(n)+'</span><div class="grow"><div class="bt">'+esc(tituloDe(n))+'</div><div class="bp">'+esc(ancestrais(n.id).map(tituloDe).join(' / '))+'</div></div></div>').join(''):'<div class="vazio-box">Digite para buscar.</div>');res=rec.map(n=>({id:n.id}));}
    else el.innerHTML=res.map((r,i)=>'<div class="br'+(i===sel?' sel':'')+'" data-id="'+r.id+'"><span class="bi">'+iconeDe(r)+'</span><div class="grow" style="min-width:0"><div class="bt">'+esc(r.titulo||'Sem título')+'</div><div class="bp">'+esc(caminhoDe(r))+'</div>'+(r.trecho?'<div class="bs">'+r.trecho.replace(/<(?!\/?b>)[^>]*>/g,'')+'</div>':'')+'</div></div>').join('');
    $$('.br',el).forEach(d=>d.onclick=()=>{fecharModal(bg);abrirPagina(d.dataset.id);});};
  const buscar=debounce(async q=>{if(!q){res=[];render();return;}const {data}=await sb.rpc('hub_busca',{q,lim:30});res=data||[];sel=0;render();},220);
  const inp=$('#bq',bg);inp.oninput=()=>buscar(inp.value.trim());inp.onkeydown=e=>{if(e.key==='ArrowDown'){sel=Math.min(sel+1,res.length-1);render();e.preventDefault();}else if(e.key==='ArrowUp'){sel=Math.max(sel-1,0);render();e.preventDefault();}else if(e.key==='Enter'&&res[sel]){fecharModal(bg);abrirPagina(res[sel].id);}};
  render();}
function caminhoDe(r){const pid=r.base_id||r.parent_id;if(!pid)return r.tipo==='base'?'Base':'Página';const n=S.byId[pid];if(!n)return '';return ancestrais(n.id).map(tituloDe).concat([tituloDe(n)]).join(' / ');}
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();buscaAbrir();}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();S.dirty=true;salvarAgora();}});

// ---------- peek (abrir linha de base num modal) ----------
async function peek(id){await salvarAgora();const {data:p}=await sb.from('hub_paginas').select('*').eq('id',id).maybeSingle();if(!p)return toast('Página não encontrada',{erro:true});
  const prevPagina=S.pagina,prevEditor=S.editor,prevEdId=S.editorPaginaId;
  const bg=modal('<div class="modal-h" style="padding:10px 16px 0"><button class="btn btn-sm btn-ghost" onclick="fecharModal();abrirPagina(\''+id+'\')">↗ Abrir como página</button><button class="ic-btn" onclick="fecharModal()" style="margin-left:auto">✕</button></div><div class="modal-b" id="peek_b"></div>',{cls:'peek',lg:true,onFechar:async()=>{await salvarAgora();destruirEditor();S.pagina=prevPagina;S.editor=prevEditor;S.editorPaginaId=prevEdId;S.dirty=false;if(typeof baseAtualizarLinha==='function')baseAtualizarLinha(id);}});
  // fechar pelo X também precisa restaurar
  const x=$('.modal-h .ic-btn',bg);x.onclick=async()=>{fecharModal(bg);await salvarAgora();destruirEditor();S.pagina=prevPagina;S.editor=prevEditor;S.editorPaginaId=prevEdId;S.dirty=false;if(typeof baseAtualizarLinha==='function')baseAtualizarLinha(id);};
  const abrir=$('.modal-h .btn',bg);abrir.onclick=async()=>{fecharModal(bg);await salvarAgora();destruirEditor();S.pagina=null;abrirPagina(id);};
  S.editor=null;S.pagina=p;S.dirty=false;const host=$('#peek_b',bg);host.appendChild(paginaElemento(p,{peek:true}));
  if(p.tipo==='base')baseMontar(p,$('#base_host',host),{});else montarEditor(p,$('#editor_host',host));
  if(p.base_id)propsMontar(p,$('#props_host',host));}
