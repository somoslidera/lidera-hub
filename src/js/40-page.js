/* ===================== roteador, página, início, lixeira ===================== */
async function roteador(){popFechar();const h=location.hash.replace(/^#/,'');const [tipo,id,extra]=h.split('/');
  if(h.indexOf('access_token')>=0||h.indexOf('type=recovery')>=0)return;
  if(PEEK)await peekFechar();
  S.rota={tipo:tipo||'inicio',id:id||null,extra:extra||null};sbToggle(false);
  if(S.rota.tipo==='p'&&id)abrirPaginaView(id);
  else if(S.rota.tipo==='config')viewConfig(extra||id);
  else if(S.rota.tipo==='lixeira')viewLixeira();
  else viewInicio();
  marcarAtivo();}
window.addEventListener('hashchange',roteador);

// trilha no topo: recolhe o meio quando o caminho é longo, como no Notion
let CR_OCULTOS=[];
function setCrumbs(itens){CR_OCULTOS=[];let vis=itens.map(c=>c);
  if(itens.length>4){CR_OCULTOS=itens.slice(1,-2);vis=[itens[0],{dots:true},itens[itens.length-2],itens[itens.length-1]];}
  $('#crumbs').innerHTML=vis.map((c,i)=>(i?'<span class="sep">/</span>':'')+(c.dots?'<a onclick="crumbsOcultos(this)" title="Mostrar o caminho">…</a>':'<a class="'+(i===vis.length-1?'cur':'')+'" '+(c.id?'onclick="abrirPagina(\''+c.id+'\')"':c.go?'onclick="go(\''+c.go+'\')"':'')+'>'+(c.ico?'<span class="ci">'+c.ico+'</span>':'')+'<span>'+esc(c.t)+'</span></a>')).join('');}
function crumbsOcultos(a){const el=pop(a,CR_OCULTOS.map(c=>'<div class="pi" data-id="'+c.id+'"><span class="ico">'+(c.ico||'')+'</span><span>'+esc(c.t)+'</span></div>').join(''));$$('.pi',el).forEach(d=>d.onclick=()=>{popFechar();abrirPagina(d.dataset.id);});}
function editadoTxt(p){return p&&p.atualizado_em?'Editado '+fmtRel(p.atualizado_em):'';}
function renderTopActions(){const el=$('#top_actions');if(!el)return;if(!S.pagina||S.rota.tipo!=='p'||PEEK){if(!PEEK)el.innerHTML='';return;}const p=S.pagina;
  el.innerHTML='<span class="save-st" id="save_st">'+esc(editadoTxt(p))+'</span>'+
    '<button class="ic-btn" title="Copiar link" onclick="copiar(linkPagina(S.pagina.id),\'Link copiado\')">'+IC.link+'</button>'+
    '<button class="ic-btn" title="'+(ehFav(p.id)?'Tirar dos favoritos':'Adicionar aos favoritos')+'" onclick="favToggle(S.pagina.id)">'+(ehFav(p.id)?IC.starOn:IC.star)+'</button>'+
    '<button class="ic-btn" title="Mais" onclick="menuPaginaTop(this)">'+IC.dots+'</button>';}
function menuPaginaTop(anchor){const p=S.pagina;const itens=[{t:p.largura_total?'Largura normal':'Largura total',ico:'↔',f:async()=>{await atualizarPagina(p.id,{largura_total:!p.largura_total});$('.page')&&$('.page').classList.toggle('wide',p.largura_total);}},
    {t:'Histórico de versões',ico:'🕓',f:()=>historicoPagina(p.id)},{t:'Exportar em Markdown',ico:'⇩',f:()=>exportarMD(p)},{t:'Imprimir / PDF',ico:'🖨',f:()=>window.print()},'-',
    {t:'Pasta no Google Drive',ico:'📁',f:()=>abrirPastaDrive(p.id)},'-'];
  if(podeEditar())itens.push({t:'Trocar ícone',ico:'☺',f:()=>emojiPicker(anchor,e=>setIcone(e))},{t:p.capa?'Trocar capa':'Adicionar capa',ico:'🖼',f:()=>capaMenu(anchor)},{t:'Mover para…',ico:'→',f:()=>moverPaginaDialogo(p.id)},{t:'Duplicar',ico:'⧉',f:()=>duplicarPagina(p.id)},'-',{t:'Mover para a lixeira',ico:'🗑',danger:true,f:()=>arquivarPagina(p.id)});
  menu(anchor,itens,{alinhar:'dir'});}
function saveStatus(t,err){const e=$('#save_st');if(e){e.textContent=t||(PEEK?'':editadoTxt(S.pagina));e.classList.toggle('err',!!err);}}

// ---------- abrir página (com cache: abre na hora e confere em segundo plano) ----------
let PAGE_SEQ=0,BAR_T=null;const PRE={};
async function buscarPagina(id){const {data}=await sb.from('hub_paginas').select('*').eq('id',id).maybeSingle();return data||null;}
function prefetch(id){if(!id||S.cache[id]||PRE[id])return;PRE[id]=buscarPagina(id).then(p=>{if(p&&!S.cache[id])S.cache[id]=p;return p;}).finally(()=>{delete PRE[id];});}
function carregando(on){clearTimeout(BAR_T);const b=$('#bar_load'),c=$('#content');if(on){c.classList.add('indo');BAR_T=setTimeout(()=>b.classList.add('on'),140);}else{c.classList.remove('indo');b.classList.remove('on');}}
async function abrirPaginaView(id,forcar){
  if(PEEK)await peekFechar();
  if(S.pagina&&S.pagina.id===id&&!forcar&&S.rota.extra==null){marcarAtivo();return;}
  await salvarAgora();const seq=++PAGE_SEQ;
  let p=forcar?null:S.cache[id];
  if(p){ // já temos: mostra agora e confere se mudou no servidor
    buscarPagina(id).then(n=>{if(!n||seq!==PAGE_SEQ||!S.pagina||S.pagina.id!==id)return;if(n.atualizado_em!==S.pagina.atualizado_em&&!S.dirty&&!S.saving)mostrarPagina(n,true);});
  }else{
    if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
    carregando(true);p=await (PRE[id]||buscarPagina(id));if(seq!==PAGE_SEQ)return;carregando(false);
  }
  if(!p){destruirEditor();$('#content').innerHTML='<div class="vazio-box">Página não encontrada ou sem acesso.<br><br><button class="btn btn-ghost" onclick="go(\'inicio\')">Ir para a página inicial</button></div>';setCrumbs([{t:'Não encontrada'}]);S.pagina=null;renderTopActions();return;}
  mostrarPagina(p,false);}
function mostrarPagina(p,mesma){const id=p.id;destruirEditor();const c=$('#content');const rolagem=mesma?c.scrollTop:0;
  S.pagina=p;S.cache[id]=p;S.dirty=false;recAdd(id);if(!p.base_id&&!mesma)treeRevelar(id);
  const cr=ancestrais(id).map(a=>({id:a.id,t:tituloDe(a),ico:iconeDe(a)}));if(p.base_id&&S.byId[p.base_id]){const b=S.byId[p.base_id];ancestrais(b.id).forEach(a=>cr.push({id:a.id,t:tituloDe(a),ico:iconeDe(a)}));cr.push({id:b.id,t:tituloDe(b),ico:iconeDe(b)});}
  cr.push({id,t:tituloDe(p),ico:iconeDe(p)});setCrumbs(cr);document.title=(p.titulo||'Sem título')+' · Hub';
  const el=paginaElemento(p,{});if(!mesma)el.classList.add('entra');c.innerHTML='';c.appendChild(el);c.scrollTop=rolagem;renderTopActions();
  if(p.tipo==='base')baseMontar(p,$('#base_host',c),{});else montarEditor(p,$('#editor_host',c));
  if(p.base_id)propsMontar(p,$('#props_host',c));
  if(!p.titulo&&podeEditar()&&!mesma)setTimeout(()=>{const t=$('.page-title',c);t&&t.focus();},60);}

function paginaElemento(p,opts){opts=opts||{};const wrap=document.createElement('div');wrap.className='page-wrap';const pe=podeEditar();
  const temCapa=!!p.capa&&!String(p.capa).startsWith('pendente:');const capaCss=capaStyle(p.capa);
  wrap.innerHTML=(temCapa?'<div class="page-cover" style="'+capaCss+'">'+(pe?'<div class="cover-acts"><button class="btn btn-sm" onclick="capaMenu(this)">Alterar capa</button><button class="btn btn-sm" onclick="setCapa(null)">Remover</button></div>':'')+'</div>':'')+
    '<div class="page'+(p.largura_total||p.tipo==='base'?' wide':'')+'">'+
    '<div class="page-head'+(temCapa?' com-capa':'')+(p.icone?'':' sem-icone')+'">'+
    (p.icone?'<div class="page-icon" title="'+(pe?'Trocar ícone':'')+'" onclick="podeEditar()&&emojiPicker(this,e=>setIcone(e))">'+iconeDe(p)+'</div>':'')+
    (pe&&(!p.icone||!temCapa)?'<div class="page-acts">'+(!p.icone?'<button class="btn" onclick="emojiPicker(this,e=>setIcone(e))">'+IC.emoji+'Adicionar ícone</button>':'')+(!temCapa?'<button class="btn" onclick="capaMenu(this)">'+IC.image+'Adicionar capa</button>':'')+'</div>':'<div class="page-acts"></div>')+
    '<h1 class="page-title'+(opts.peek?' sm':'')+'" contenteditable="'+(pe?'true':'false')+'" data-ph="Nova página" spellcheck="false">'+esc(p.titulo||'')+'</h1>'+
    (p.base_id?'<div id="props_host"></div>':'')+
    '</div>'+
    (p.tipo==='base'?'<div id="base_host"></div>':'<div class="editor-wrap"><div id="editor_host"></div></div>')+
    '</div>';
  const t=$('.page-title',wrap);
  const treeDeb=debounce(()=>{renderTree();renderFavoritos();},500);
  t.addEventListener('input',()=>{if(!S.pagina||S.pagina.id!==p.id)return;const v=t.textContent.trim();S.pagina.titulo=v;S.dirty=true;agendarSalvar();const n=S.byId[p.id];if(n){n.titulo=v;treeDeb();}if(!PEEK){document.title=(v||'Sem título')+' · Hub';const cr=$$('#crumbs a.cur span:last-child');cr.length&&(cr[cr.length-1].textContent=v||'Sem título');}});
  t.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='ArrowDown'){e.preventDefault();if(p.tipo==='base'){t.blur();return;}focarEditor();}});
  t.addEventListener('blur',()=>{if(!S.pagina)return;renderTree();renderFavoritos();});
  t.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,(e.clipboardData.getData('text/plain')||'').replace(/\n+/g,' '));});
  // clicar no espaço vazio abaixo do texto leva o cursor para o fim, como no Notion
  const pg=$('.page',wrap);pg.addEventListener('click',e=>{if(e.target!==pg||p.tipo==='base'||!pe)return;const ed=S.editor;if(!ed||S.editorPaginaId!==p.id)return;try{const n=ed.blocks.getBlocksCount();const ult=n?ed.blocks.getBlockByIndex(n-1):null;if(!ult||ult.name!=='paragraph'||!ult.isEmpty)ed.blocks.insert('paragraph',{text:''},{},n,true);ed.caret.setToLastBlock('end');}catch(x){}});
  return wrap;}
async function focarEditor(){const ed=S.editor;if(!ed)return;try{await ed.isReady;if(!ed.blocks.getBlocksCount())ed.blocks.insert('paragraph',{text:''},{},0,true);else ed.caret.setToFirstBlock('start');ed.focus(false);}catch(e){}}
function capaStyle(c){if(!c||String(c).startsWith('pendente:'))return '';if(c.startsWith('grad:'))return 'background:'+c.slice(5);if(c.startsWith('drive:'))return 'background-image:url('+arqUrl(c.slice(6),'thumb','w1600')+')';return 'background-image:url('+esc(c)+')';}
const GRADS=['#E3E2E0','#FDECC8','#FADEC9','#FFE2DD','#F5E0E9','#E8DEEE','#D3E5EF','#DBEDDB','linear-gradient(135deg,#1D3573,#4567A8)','linear-gradient(135deg,#A48A57,#E3CFA1)','linear-gradient(135deg,#0f2027,#203a43,#2c5364)','linear-gradient(135deg,#f6d365,#fda085)','linear-gradient(135deg,#a1c4fd,#c2e9fb)','linear-gradient(135deg,#d4fc79,#96e6a1)','linear-gradient(135deg,#fbc2eb,#a6c1ee)','linear-gradient(135deg,#37352F,#787774)'];
function capaMenu(anchor){const html='<div class="plbl">Cor e gradiente</div><div class="cores">'+GRADS.map(g=>'<div class="c" style="background:'+g+';width:32px;height:24px" data-g="'+g+'"></div>').join('')+'</div><div class="psep"></div><div class="pi" id="cp_up"><span class="ico">'+IC.upload+'</span><span>Enviar imagem</span><span class="sub">Drive</span></div><div class="pi" id="cp_url"><span class="ico">'+IC.link+'</span><span>Usar link de imagem</span></div>'+(S.pagina.capa?'<div class="pi danger" id="cp_rm"><span class="ico">'+IC.x+'</span><span>Remover capa</span></div>':'');
  const el=pop(anchor,html);$$('.c',el).forEach(c=>c.onclick=()=>{popFechar();setCapa('grad:'+c.dataset.g);});
  $('#cp_up',el).onclick=()=>{popFechar();escolherArquivos(async fs=>{const a=await uploadArquivo(fs[0],S.pagina.id);if(a)setCapa('drive:'+a.drive_id);},'image/*');};
  $('#cp_url',el).onclick=async()=>{popFechar();const u=await perguntar('Link da imagem de capa','',{ph:'https://…'});if(u)setCapa(u.trim());};
  const rm=$('#cp_rm',el);if(rm)rm.onclick=()=>{popFechar();setCapa(null);};}
async function setCapa(c){const id=S.pagina.id;await atualizarPagina(id,{capa:c});if(PEEK)peekRedesenhar();else mostrarPagina(S.pagina,true);}
async function setIcone(e){const id=S.pagina.id;await atualizarPagina(id,{icone:e});if(PEEK)peekRedesenhar();else mostrarPagina(S.pagina,true);}
async function abrirPastaDrive(id){try{const j=await fn('/pasta',{pagina_id:id});window.open(j.link,'_blank');}catch(e){toast(e.message,{erro:true});}}

// ---------- salvar ----------
const agendarSalvar=debounce(()=>salvarAgora(),900);
async function salvarAgora(){if(!S.pagina||!S.dirty||!podeEditar())return;const p=S.pagina;S.saving=true;saveStatus('Salvando…');
  try{let conteudo=p.conteudo;if(S.editor&&S.editorPaginaId===p.id){try{conteudo=await S.editor.save();}catch(e){}}
    const texto=textoPlano(conteudo,p.props,p.esquema);
    const patch={titulo:p.titulo||'',conteudo,texto,props:p.props||{}};if(p.tipo==='base'){patch.esquema=p.esquema;patch.visoes=p.visoes;}
    const {data,error}=await sb.from('hub_paginas').update(patch).eq('id',p.id).select('atualizado_em').maybeSingle();if(error)throw error;
    p.conteudo=conteudo;if(data&&data.atualizado_em)p.atualizado_em=data.atualizado_em;S.dirty=false;saveStatus('');
    const n=S.byId[p.id];if(n){n.atualizado_em=p.atualizado_em;if(n.titulo!==p.titulo){n.titulo=p.titulo;renderTree();}}
    localStorage.removeItem('hub_bkp_'+p.id);
  }catch(e){saveStatus('Não salvou',true);try{localStorage.setItem('hub_bkp_'+p.id,JSON.stringify({titulo:p.titulo,conteudo:p.conteudo,em:Date.now()}));}catch(x){}toast('Não deu para salvar: '+(e.message||e),{erro:true});}
  S.saving=false;}
window.addEventListener('beforeunload',e=>{if(S.dirty){salvarAgora();e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)salvarAgora();});
setInterval(()=>{if(S.pagina&&!S.dirty&&!S.saving&&!PEEK)saveStatus('');},60000);

// ---------- histórico ----------
async function historicoPagina(id){const {data}=await sb.from('hub_versoes').select('id,titulo,por,em').eq('pagina_id',id).order('em',{ascending:false}).limit(40);
  const bg=modal('<div class="modal-h">Histórico de versões<button class="ic-btn" onclick="fecharModal()">'+IC.x+'</button></div><div class="modal-b">'+((data||[]).length?data.map(v=>'<div class="ver"><span>'+esc(fmtData(v.em,true))+'</span><span class="muted small">'+esc(nomeMembro(v.por)||'')+'</span><span class="muted small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px">'+esc(v.titulo||'')+'</span>'+(podeEditar()?'<button class="btn btn-sm btn-ghost" data-v="'+v.id+'">Restaurar</button>':'')+'</div>').join(''):'<div class="vazio-box">Ainda não há versões anteriores. Uma versão é guardada a cada 10 minutos de edição.</div>')+'</div>',{lg:false});
  $('.modal',bg).style.maxWidth='560px';
  $$('button[data-v]',bg).forEach(b=>b.onclick=async()=>{if(!await confirmar('Restaurar versão','O conteúdo atual será substituído por esta versão (ele fica guardado no histórico).'))return;const {data:v}=await sb.from('hub_versoes').select('*').eq('id',b.dataset.v).single();await sb.from('hub_paginas').update({titulo:v.titulo,conteudo:v.conteudo,props:v.props||{}}).eq('id',id);fecharModal(bg);toast('Versão restaurada');abrirPaginaView(id,true);});}

// ---------- exportar markdown ----------
function exportarMD(p){const md=blocosParaMD(p.conteudo);const blob=new Blob(['# '+(p.titulo||'Sem título')+'\n\n'+md],{type:'text/markdown'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(p.titulo||'pagina').replace(/[\\/:*?"<>|]/g,'-')+'.md';a.click();}

// ---------- página inicial ----------
function cartao(n){return '<a class="hcard" onclick="abrirPagina(\''+n.id+'\')" onmouseenter="prefetch(\''+n.id+'\')"><div class="hc-top"></div><div class="hc-ico">'+iconeDe(n)+'</div><div class="hc-t">'+esc(tituloDe(n))+'</div><div class="hc-m">'+esc(fmtRel(n.atualizado_em))+'</div></a>';}
function viewInicio(){destruirEditor();S.pagina=null;renderTopActions();document.title='Hub · by Lidera';setCrumbs([{t:'Página inicial',go:'inicio',ico:IC.home}]);
  const h=new Date().getHours();const sauda=h<5?'Boa noite':h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';const nome=(S.me.nome||S.me.email).split(' ')[0].split('@')[0];
  const raiz=filhosDe(null);const rec=S.recentes.map(id=>S.byId[id]).filter(n=>n&&!n.arquivada).slice(0,10);const favs=S.favoritos.map(f=>S.byId[f.pagina_id]).filter(Boolean);
  const c=$('#content');c.scrollTop=0;
  c.innerHTML='<div class="home entra"><h1>'+sauda+', '+esc(nome)+'</h1>'+
    (rec.length?'<div class="h-sec"><div class="h-lbl">'+IC.clock+'Visitadas recentemente</div><div class="rec">'+rec.map(cartao).join('')+'</div></div>':'')+
    (favs.length?'<div class="h-sec"><div class="h-lbl">'+IC.star+'Favoritos</div><div class="cards">'+favs.map(cartao).join('')+'</div></div>':'')+
    '<div class="h-sec"><div class="h-lbl">'+IC.page+'Páginas</div><div class="cards">'+raiz.map(cartao).join('')+(podeEditar()?'<a class="hcard add" onclick="novaPagina(null)">'+IC.plus+'Nova página</a>':'')+'</div></div></div>';}

// ---------- lixeira ----------
async function viewLixeira(){destruirEditor();S.pagina=null;renderTopActions();setCrumbs([{t:'Lixeira',go:'lixeira',ico:IC.trash}]);document.title='Lixeira · Hub';
  const {data}=await sb.from('hub_paginas').select('id,titulo,icone,tipo,parent_id,base_id,atualizado_em').eq('arquivada',true).order('atualizado_em',{ascending:false}).limit(300);
  $('#content').innerHTML='<div class="cfg entra"><h1>Lixeira</h1><div class="card"><p>Páginas movidas para a lixeira ficam aqui. Você pode restaurar ou excluir de vez (isso remove também as subpáginas).</p></div><div class="lst">'+((data||[]).length?data.map(p=>'<div class="it"><span class="bi" style="font-size:18px;display:flex;width:22px;justify-content:center;color:var(--muted)">'+iconeDe(p)+'</span><div class="grow"><div class="nm">'+esc(p.titulo||'Sem título')+'</div><div class="em">'+esc(fmtRel(p.atualizado_em))+'</div></div>'+(podeEditar()?'<button class="btn btn-sm btn-ghost" onclick="restaurar(\''+p.id+'\')">Restaurar</button><button class="btn btn-sm btn-danger" style="margin-left:6px" onclick="apagarDeVez(\''+p.id+'\')">Excluir</button>':'')+'</div>').join(''):'<div class="vazio-box">A lixeira está vazia.</div>')+'</div></div>';}
async function restaurar(id){await sb.from('hub_paginas').update({arquivada:false}).eq('id',id);const n=S.byId[id];if(n){n.arquivada=false;renderTree();}toast('Página restaurada');viewLixeira();}
async function apagarDeVez(id){if(!await confirmar('Excluir de vez','Isso apaga a página, as subpáginas e o histórico. Os arquivos continuam no Google Drive. Não dá para desfazer.',{danger:true,ok:'Excluir'}))return;await sb.from('hub_paginas').delete().eq('id',id);delete S.cache[id];S.tree=S.tree.filter(x=>x.id!==id);indexarArvore();renderTree();toast('Página excluída');viewLixeira();}

// ---------- busca ----------
function buscaAbrir(){if($('.busca'))return;let sel=0,res=[];const bg=modal('<div class="busca-in"><span class="ico">'+IC.search+'</span><input id="bq" placeholder="Buscar em Lidera…" autocomplete="off"></div><div class="busca-res" id="bres"></div>',{cls:'busca'});
  const linha=(r,i,trecho)=>'<div class="br'+(i===sel?' sel':'')+'" data-id="'+r.id+'"><span class="bi">'+iconeDe(r)+'</span><div class="grow" style="min-width:0"><div class="bt">'+esc(r.titulo||'Sem título')+'</div>'+(caminhoDe(r)?'<div class="bp">'+esc(caminhoDe(r))+'</div>':'')+(trecho?'<div class="bs">'+trecho.replace(/<(?!\/?b>)[^>]*>/g,'')+'</div>':'')+'</div></div>';
  const render=()=>{const el=$('#bres',bg);const q=$('#bq',bg).value.trim();
    if(!q){const rec=S.recentes.map(id=>S.byId[id]).filter(Boolean).slice(0,8);res=rec;el.innerHTML=rec.length?'<div class="busca-lbl">Recentes</div>'+rec.map((n,i)=>linha(n,i)).join(''):'<div class="vazio-box">Digite para buscar em todas as páginas.</div>';}
    else el.innerHTML=res.length?res.map((r,i)=>linha(r,i,r.trecho)).join(''):'<div class="vazio-box">Nenhum resultado.</div>';
    $$('.br',el).forEach(d=>{d.onclick=()=>{fecharModal(bg);abrirPagina(d.dataset.id);};d.onmouseenter=()=>prefetch(d.dataset.id);});
    const s=$('.br.sel',el);s&&s.scrollIntoView({block:'nearest'});};
  // primeiro os títulos que já estão na memória (instantâneo), depois o conteúdo no servidor
  const local=q=>{const k=q.toLowerCase();return S.tree.filter(n=>!n.arquivada&&(n.titulo||'').toLowerCase().includes(k)).slice(0,12);};
  const buscar=debounce(async q=>{if(!q)return;const {data}=await sb.rpc('hub_busca',{q,lim:30});if($('#bq',bg)&&$('#bq',bg).value.trim()!==q)return;const ids=new Set((data||[]).map(r=>r.id));res=(data||[]).concat(local(q).filter(n=>!ids.has(n.id)));sel=Math.min(sel,Math.max(res.length-1,0));render();},180);
  const inp=$('#bq',bg);inp.oninput=()=>{const q=inp.value.trim();sel=0;res=q?local(q):[];render();buscar(q);};
  inp.onkeydown=e=>{if(e.key==='ArrowDown'){sel=Math.min(sel+1,res.length-1);render();e.preventDefault();}else if(e.key==='ArrowUp'){sel=Math.max(sel-1,0);render();e.preventDefault();}else if(e.key==='Enter'&&res[sel]){fecharModal(bg);abrirPagina(res[sel].id);}};
  render();}
function caminhoDe(r){const pid=r.base_id||r.parent_id;if(!pid)return '';const n=S.byId[pid];if(!n)return '';return ancestrais(n.id).map(tituloDe).concat([tituloDe(n)]).join(' / ');}
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();buscaAbrir();}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();S.dirty=true;salvarAgora();}});

// ---------- espiada lateral (abrir linha de base ao lado, como no Notion) ----------
let PEEK=null,PEEK_FIM=Promise.resolve();
function peekFechar(){if(!PEEK)return PEEK_FIM;const k=PEEK;if(k.bg.isConnected)fecharModal(k.bg);
  PEEK_FIM=(async()=>{await salvarAgora();destruirEditor();PEEK=null;S.pagina=k.prevPagina;S.editor=k.prevEditor;S.editorPaginaId=k.prevEdId;S.dirty=false;if(typeof baseAtualizarLinha==='function')baseAtualizarLinha(k.id);})();
  return PEEK_FIM;}
function peekRedesenhar(){if(!PEEK)return;const p=S.pagina,host=$('#peek_b',PEEK.bg);destruirEditor();host.innerHTML='';host.appendChild(paginaElemento(p,{peek:true}));
  if(p.tipo==='base')baseMontar(p,$('#base_host',host),{});else montarEditor(p,$('#editor_host',host));
  if(p.base_id)propsMontar(p,$('#props_host',host));}
async function peek(id){if(PEEK)await peekFechar();await PEEK_FIM;await salvarAgora();
  const bg=modal('<div class="modal-h"><button class="ic-btn" id="pk_x" title="Fechar">'+IC.expandir+'</button><button class="ic-btn" id="pk_full" title="Abrir como página inteira">'+IC.full+'</button><span class="grow"></span><button class="ic-btn" id="pk_link" title="Copiar link">'+IC.link+'</button></div><div class="modal-b" id="peek_b"><div class="carregando"><span class="spin"></span></div></div>',{cls:'peek',lg:true,semFoco:true,onFechar:()=>{peekFechar();}});
  PEEK={bg,id,prevPagina:S.pagina,prevEditor:S.editor,prevEdId:S.editorPaginaId};
  // clicar fora fecha e repassa o clique (outra linha abre direto na espiada)
  bg.addEventListener('mousedown',e=>{if(e.target!==bg)return;const x=e.clientX,y=e.clientY;setTimeout(async()=>{await PEEK_FIM;const el=document.elementFromPoint(x,y);if(el&&!el.closest('.modal-bg')&&el.closest('.content'))el.click();},0);});
  $('#pk_x',bg).onclick=()=>peekFechar();
  $('#pk_full',bg).onclick=async()=>{await peekFechar();abrirPagina(id);};
  $('#pk_link',bg).onclick=()=>copiar(linkPagina(id),'Link copiado');
  const p=S.cache[id]||await buscarPagina(id);if(!PEEK||PEEK.bg!==bg)return;
  if(!p){peekFechar();return toast('Página não encontrada',{erro:true});}
  S.cache[id]=p;S.editor=null;S.editorPaginaId=null;S.pagina=p;S.dirty=false;peekRedesenhar();
  if(!p.titulo&&podeEditar())setTimeout(()=>{const t=$('.page-title',bg);t&&t.focus();},80);}
