/* ===================== árvore lateral, favoritos, realtime ===================== */
function indexarArvore(){S.byId={};S.tree.forEach(n=>{S.byId[n.id]=n;});}
function filhosDe(pid){return S.tree.filter(n=>(n.parent_id||null)===(pid||null)&&!n.arquivada&&!n.base_id).sort((a,b)=>(a.ordem-b.ordem)||a.titulo.localeCompare(b.titulo,'pt'));}
function ancestrais(id){const out=[];let n=S.byId[id];let g=0;while(n&&n.parent_id&&g++<40){n=S.byId[n.parent_id];if(n)out.unshift(n);}return out;}
function tituloDe(n){return (n&&n.titulo)||'Sem título';}

function renderTree(){const el=$('#nav_tree');if(!el)return;const raiz=filhosDe(null);
  el.innerHTML=raiz.length?raiz.map(n=>nodeHTML(n,0)).join(''):'<div class="vazio">Nenhuma página ainda. Clique em + para criar.</div>';
  marcarAtivo();}
function nodeHTML(n,nivel){const kids=filhosDe(n.id);const aberto=!!S.open[n.id];const tem=kids.length>0||n.tem_filhos;
  return '<div class="tnode" data-id="'+n.id+'"><div class="tn" data-id="'+n.id+'" draggable="'+(podeEditar()?'true':'false')+'" onclick="abrirPagina(\''+n.id+'\')" oncontextmenu="event.preventDefault();menuPagina(event.currentTarget,\''+n.id+'\')">'+
    '<span class="chev'+(aberto?' open':'')+(tem?'':' none')+'" onclick="event.stopPropagation();treeToggle(\''+n.id+'\')">▶</span>'+
    '<span class="ti">'+iconeDe(n)+'</span><span class="tt">'+esc(tituloDe(n))+'</span>'+
    (podeEditar()?'<span class="ta"><button class="ic-btn" title="Mais" onclick="event.stopPropagation();menuPagina(this,\''+n.id+'\')">···</button><button class="ic-btn" title="Nova subpágina" onclick="event.stopPropagation();novaPagina(\''+n.id+'\')">+</button></span>':'')+
    '</div>'+(aberto&&kids.length?'<div class="tk">'+kids.map(k=>nodeHTML(k,nivel+1)).join('')+'</div>':'')+'</div>';}
function treeToggle(id){S.open[id]=!S.open[id];localStorage.setItem('hub_open',JSON.stringify(S.open));renderTree();}
function treeRevelar(id){ancestrais(id).forEach(a=>S.open[a.id]=true);localStorage.setItem('hub_open',JSON.stringify(S.open));renderTree();}
function marcarAtivo(){const id=S.rota&&S.rota.tipo==='p'?S.rota.id:null;$$('#nav_tree .tn').forEach(d=>d.classList.toggle('active',d.dataset.id===id));$$('.sb-item').forEach(a=>a.classList.toggle('active',!!S.rota&&a.dataset.rota===S.rota.tipo));
  const a=$('#nav_tree .tn.active');if(a&&!ehMobile())a.scrollIntoView({block:'nearest'});}

function renderFavoritos(){const el=$('#nav_fav');if(!el)return;const favs=S.favoritos.map(f=>S.byId[f.pagina_id]).filter(Boolean);
  el.innerHTML=favs.length?'<div class="nav-lbl"><span>FAVORITOS</span></div><div class="tree">'+favs.map(n=>'<div class="tn" data-id="'+n.id+'" onclick="abrirPagina(\''+n.id+'\')"><span class="chev none">▶</span><span class="ti">'+iconeDe(n)+'</span><span class="tt">'+esc(tituloDe(n))+'</span></div>').join('')+'</div>':'';}

// ---- criar / renomear / mover / arquivar ----
async function novaPagina(parentId,opts){opts=opts||{};if(!podeEditar())return toast('Você só tem permissão de leitura.',{erro:true});
  const irmaos=filhosDe(parentId);const ordem=irmaos.length?Math.max(...irmaos.map(i=>i.ordem))+1:1;
  const row={parent_id:parentId||null,base_id:opts.base_id||null,tipo:opts.tipo||'pagina',titulo:opts.titulo||'',icone:opts.icone||null,conteudo:opts.conteudo||{blocks:[]},props:opts.props||{},esquema:opts.esquema||null,visoes:opts.visoes||null,ordem};
  const {data,error}=await sb.from('hub_paginas').insert(row).select().single();if(error){toast('Não deu para criar: '+error.message,{erro:true});return null;}
  if(!data.base_id){S.tree.push({id:data.id,parent_id:data.parent_id,base_id:null,tipo:data.tipo,titulo:data.titulo,icone:data.icone,ordem:data.ordem,arquivada:false,atualizado_em:data.atualizado_em,tem_filhos:false});indexarArvore();if(parentId){S.open[parentId]=true;localStorage.setItem('hub_open',JSON.stringify(S.open));}renderTree();}
  if(!opts.silencioso)abrirPagina(data.id);return data;}
async function atualizarPagina(id,patch){const {data,error}=await sb.from('hub_paginas').update(patch).eq('id',id).select('id,parent_id,base_id,tipo,titulo,icone,ordem,arquivada,atualizado_em').single();if(error){toast('Erro ao salvar: '+error.message,{erro:true});return null;}
  const n=S.byId[id];if(n){Object.assign(n,{titulo:data.titulo,icone:data.icone,parent_id:data.parent_id,ordem:data.ordem,arquivada:data.arquivada,atualizado_em:data.atualizado_em});renderTree();renderFavoritos();}
  if(S.pagina&&S.pagina.id===id)Object.assign(S.pagina,patch);return data;}
function menuPagina(anchor,id){const n=S.byId[id]||(S.pagina&&S.pagina.id===id?S.pagina:null);if(!n)return;const itens=[
  {t:ehFav(id)?'Tirar dos favoritos':'Adicionar aos favoritos',ico:'★',f:()=>favToggle(id)},
  {t:'Copiar link',ico:'🔗',f:()=>copiar(linkPagina(id),'Link copiado')},'-'];
  if(podeEditar())itens.push({t:'Renomear',ico:'✎',f:async()=>{const v=await perguntar('Renomear página',n.titulo);if(v!=null)atualizarPagina(id,{titulo:v});}},
    {t:'Trocar ícone',ico:'☺',f:()=>emojiPicker(anchor,e=>atualizarPagina(id,{icone:e}))},
    {t:'Nova subpágina',ico:'+',f:()=>novaPagina(id)},
    {t:'Duplicar',ico:'⧉',f:()=>duplicarPagina(id)},
    {t:'Mover para…',ico:'→',f:()=>moverPaginaDialogo(id)},'-',
    {t:'Arquivar (lixeira)',ico:'🗑',danger:true,f:()=>arquivarPagina(id)});
  menu(anchor,itens);}
async function arquivarPagina(id){const n=S.byId[id];if(!n)return;await atualizarPagina(id,{arquivada:true});toast('"'+tituloDe(n)+'" foi para a lixeira',{acao:'Desfazer',onAcao:()=>atualizarPagina(id,{arquivada:false})});if(S.rota&&S.rota.tipo==='p'&&S.rota.id===id)go('inicio');}
async function duplicarPagina(id){const {data:p}=await sb.from('hub_paginas').select('*').eq('id',id).single();if(!p)return;const copia=await novaPagina(p.parent_id,{titulo:(p.titulo||'Sem título')+' (cópia)',icone:p.icone,tipo:p.tipo,conteudo:p.conteudo,props:p.props,esquema:p.esquema,visoes:p.visoes,base_id:p.base_id,silencioso:true});
  if(copia&&p.tipo==='base'){const {data:rows}=await sb.from('hub_paginas').select('*').eq('base_id',id);for(const r of (rows||[])){await sb.from('hub_paginas').insert({parent_id:copia.id,base_id:copia.id,tipo:'pagina',titulo:r.titulo,icone:r.icone,conteudo:r.conteudo,props:r.props,ordem:r.ordem});}}
  if(copia)abrirPagina(copia.id);}
function moverPaginaDialogo(id){const n=S.byId[id];const desc=new Set([id]);const marcar=pid=>filhosDe(pid).forEach(k=>{desc.add(k.id);marcar(k.id);});marcar(id);
  const opcoes=[{id:'',t:'(raiz)'}].concat(S.tree.filter(x=>!desc.has(x.id)&&!x.arquivada&&!x.base_id).map(x=>({id:x.id,t:ancestrais(x.id).map(tituloDe).concat([tituloDe(x)]).join(' / ')})).sort((a,b)=>a.t.localeCompare(b.t,'pt')));
  const bg=modal('<div class="modal-h">Mover "'+esc(tituloDe(n))+'" para</div><div class="modal-b"><input class="input" id="mv_f" placeholder="Filtrar…"><div id="mv_l" style="max-height:50vh;overflow:auto;margin-top:8px"></div></div>');
  const render=q=>{$('#mv_l',bg).innerHTML=opcoes.filter(o=>!q||o.t.toLowerCase().includes(q)).slice(0,200).map(o=>'<div class="pi" data-id="'+o.id+'"><span class="ico">'+(o.id?iconeDe(S.byId[o.id]):'⌂')+'</span><span>'+esc(o.t)+'</span></div>').join('');$$('.pi',bg).forEach(d=>d.onclick=async()=>{fecharModal(bg);await atualizarPagina(id,{parent_id:d.dataset.id||null,ordem:Date.now()/1000});toast('Página movida');});};
  render('');$('#mv_f',bg).oninput=e=>render(e.target.value.toLowerCase());}

// ---- arrastar na árvore ----
let DRAG=null;
document.addEventListener('dragstart',e=>{const tn=e.target.closest&&e.target.closest('#nav_tree .tn');if(!tn)return;DRAG=tn.dataset.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',DRAG);document.body.classList.add('dragging-tree');});
document.addEventListener('dragend',()=>{DRAG=null;document.body.classList.remove('dragging-tree');$$('#nav_tree .tn').forEach(t=>t.classList.remove('drop-into','drop-before','drop-after'));});
document.addEventListener('dragover',e=>{if(!DRAG)return;const tn=e.target.closest&&e.target.closest('#nav_tree .tn');if(!tn||tn.dataset.id===DRAG)return;e.preventDefault();const r=tn.getBoundingClientRect();const y=(e.clientY-r.top)/r.height;tn.classList.remove('drop-into','drop-before','drop-after');tn.classList.add(y<.25?'drop-before':y>.75?'drop-after':'drop-into');});
document.addEventListener('dragleave',e=>{const tn=e.target.closest&&e.target.closest('#nav_tree .tn');if(tn)tn.classList.remove('drop-into','drop-before','drop-after');});
document.addEventListener('drop',async e=>{if(!DRAG)return;const tn=e.target.closest&&e.target.closest('#nav_tree .tn');if(!tn)return;e.preventDefault();const alvo=tn.dataset.id,src=DRAG;DRAG=null;if(alvo===src)return;
  const modo=tn.classList.contains('drop-before')?'antes':tn.classList.contains('drop-after')?'depois':'dentro';tn.classList.remove('drop-into','drop-before','drop-after');
  // não deixar mover para dentro de si mesma
  let a=S.byId[alvo],g=0;while(a&&g++<40){if(a.id===src)return toast('Não dá para mover uma página para dentro dela mesma.',{erro:true});a=S.byId[a.parent_id];}
  const t=S.byId[alvo];let parent,ordem;
  if(modo==='dentro'){parent=alvo;const k=filhosDe(alvo);ordem=k.length?Math.max(...k.map(x=>x.ordem))+1:1;S.open[alvo]=true;}
  else{parent=t.parent_id||null;const irm=filhosDe(parent).filter(x=>x.id!==src);const i=irm.findIndex(x=>x.id===alvo);const pos=modo==='antes'?i:i+1;const antes=irm[pos-1],depois=irm[pos];ordem=antes&&depois?(antes.ordem+depois.ordem)/2:antes?antes.ordem+1:depois?depois.ordem-1:1;}
  const n=S.byId[src];n.parent_id=parent;n.ordem=ordem;renderTree();await sb.from('hub_paginas').update({parent_id:parent,ordem}).eq('id',src);});

// ---- realtime ----
function assinarRealtime(){if(S.rt)return;S.rt=sb.channel('hub').on('postgres_changes',{event:'*',schema:'public',table:'hub_paginas'},p=>{
  const n=p.new||{},o=p.old||{};
  if(p.eventType==='DELETE'){if(S.byId[o.id]){S.tree=S.tree.filter(x=>x.id!==o.id);indexarArvore();renderTree();renderFavoritos();}if(S.pagina&&S.pagina.base_id===o.base_id&&o.base_id)baseRecarregar&&baseRecarregar(o.base_id);return;}
  if(n.base_id){ // linha de base
    if(typeof baseLinhaRealtime==='function')baseLinhaRealtime(n,p.eventType);
  }else{
    const cur=S.byId[n.id];
    if(!cur){S.tree.push({id:n.id,parent_id:n.parent_id,base_id:null,tipo:n.tipo,titulo:n.titulo,icone:n.icone,ordem:n.ordem,arquivada:n.arquivada,atualizado_em:n.atualizado_em,tem_filhos:false});indexarArvore();renderTree();}
    else{const mudou=cur.titulo!==n.titulo||cur.icone!==n.icone||cur.parent_id!==n.parent_id||cur.ordem!==n.ordem||cur.arquivada!==n.arquivada;Object.assign(cur,{titulo:n.titulo,icone:n.icone,parent_id:n.parent_id,ordem:n.ordem,arquivada:n.arquivada,atualizado_em:n.atualizado_em});if(mudou){renderTree();renderFavoritos();}}
  }
  // página aberta editada por outra pessoa
  if(S.pagina&&S.pagina.id===n.id&&n.atualizado_por&&n.atualizado_por!==S.me.id&&!S.saving){const antes=JSON.stringify(S.pagina.conteudo);if(JSON.stringify(n.conteudo)!==antes||n.titulo!==S.pagina.titulo){toast((nomeMembro(n.atualizado_por)||'Outra pessoa')+' editou esta página',{acao:'Recarregar',onAcao:()=>abrirPaginaView(n.id,true),ms:9000});}}
}).subscribe();}
