/* ===================== Editor.js: configuração, blocos próprios, arquivos ===================== */
const I18N={messages:{ui:{blockTunes:{toggler:{'Click to tune':'Opções','or drag to move':'ou arraste'}},inlineToolbar:{converter:{'Convert to':'Converter em'}},toolbar:{toolbox:{Add:'Adicionar',Filter:'Buscar','Nothing found':'Nada encontrado'}},popover:{Filter:'Buscar','Nothing found':'Nada encontrado','Convert to':'Converter em'}},
  toolNames:{Text:'Texto',Heading:'Título',List:'Lista','Unordered List':'Lista',Checklist:'Checklist','Ordered List':'Lista numerada',Quote:'Citação',Delimiter:'Divisor',Code:'Código',Table:'Tabela',Link:'Link',Bold:'Negrito',Italic:'Itálico',Underline:'Sublinhado',InlineCode:'Código',Marker:'Marcar',Embed:'Embed'},
  tools:{header:{'Heading 1':'Título 1','Heading 2':'Título 2','Heading 3':'Título 3','Heading 4':'Título 4'},list:{Unordered:'Com marcadores',Ordered:'Numerada',Checklist:'Checklist','Start with':'Começar em','Counter type':'Tipo de contador'},quote:{'Align Left':'Alinhar à esquerda','Align Center':'Centralizar'},table:{'With headings':'Com cabeçalho','Without headings':'Sem cabeçalho','Add row above':'Linha acima','Add row below':'Linha abaixo','Delete row':'Excluir linha','Add column to left':'Coluna à esquerda','Add column to right':'Coluna à direita','Delete column':'Excluir coluna','Stretch':'Esticar','Collapse':'Encolher'},embed:{'Enter a caption':'Legenda'},link:{'Add a link':'Cole um link'},stub:{'The block can not be displayed correctly.':'Este bloco não pode ser exibido.'}},
  blockTunes:{delete:{Delete:'Excluir','Click to delete':'Clique para excluir'},moveUp:{'Move up':'Mover para cima'},moveDown:{'Move down':'Mover para baixo'}}}};

/* ---- bloco: Callout ---- */
class Callout{static get toolbox(){return {title:'Destaque',icon:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 9h8M8 13h5"/></svg>'};}
  static get isReadOnlySupported(){return true;}static get sanitize(){return {text:{br:true,b:true,i:true,a:{href:true},u:true,code:true,mark:true,span:true}};}
  constructor({data,readOnly}){this.d={icon:data.icon||'💡',text:data.text||'',cor:data.cor||'gold'};this.ro=readOnly;}
  render(){const w=document.createElement('div');w.className='hb-callout '+this.d.cor;w.innerHTML='<span class="ci" title="Trocar ícone">'+esc(this.d.icon)+'</span><div class="ct" contenteditable="'+(!this.ro)+'">'+this.d.text+'</div>';this.w=w;
    $('.ci',w).onclick=e=>{if(this.ro)return;emojiPicker(e.target,em=>{this.d.icon=em||'💡';$('.ci',w).textContent=this.d.icon;});};
    $('.ct',w).addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();document.execCommand('insertLineBreak');}});return w;}
  renderSettings(){const cores=['gold','gray','brown','orange','yellow','green','blue','purple','pink','red'];return cores.map(c=>({icon:'<span class="dot '+(c==='gold'?'':c)+'" style="'+(c==='gold'?'background:var(--gold)':'')+'"></span>',label:({gold:'Dourado',gray:'Cinza',brown:'Marrom',orange:'Laranja',yellow:'Amarelo',green:'Verde',blue:'Azul',purple:'Roxo',pink:'Rosa',red:'Vermelho'})[c],onActivate:()=>{this.d.cor=c;this.w.className='hb-callout '+c;},closeOnActivate:true,isActive:this.d.cor===c}));}
  save(w){return {icon:this.d.icon,text:$('.ct',w).innerHTML,cor:this.d.cor};}}

/* ---- bloco: link para página ---- */
class PaginaLink{static get toolbox(){return {title:'Página',icon:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>'};}
  static get isReadOnlySupported(){return true;}
  constructor({data,api,block}){this.d={id:data.id||null};this.api=api;this.block=block;}
  render(){const w=document.createElement('div');this.w=w;this.desenhar();if(!this.d.id&&podeEditar()){this.criar();}return w;}
  desenhar(){const n=this.d.id?(S.byId[this.d.id]||null):null;this.w.innerHTML='';const a=document.createElement('a');a.className='hb-pagina'+(n?'':' sem');
    if(n){a.innerHTML='<span class="pi">'+iconeDe(n)+'</span><span class="pt">'+esc(tituloDe(n))+'</span>';a.onclick=()=>abrirPagina(this.d.id);}
    else if(this.d.id){a.innerHTML='<span class="pi">📄</span><span class="pt">Página (abrir)</span>';a.onclick=()=>abrirPagina(this.d.id);}
    else a.innerHTML='<span class="pi">📄</span><span class="pt">Criando página…</span>';
    this.w.appendChild(a);}
  async criar(){const pai=S.pagina;const p=await novaPagina(pai?pai.id:null,{silencioso:true});if(p){this.d.id=p.id;this.desenhar();S.dirty=true;agendarSalvar();}}
  save(){return {id:this.d.id};}}

/* ---- bloco: arquivo / imagem (Google Drive) ---- */
const MIME_ICO=m=>!m?'📎':m.startsWith('image/')?'🖼':m.startsWith('video/')?'🎬':m.startsWith('audio/')?'🎵':m.includes('pdf')?'📕':m.includes('sheet')||m.includes('excel')||m.includes('csv')?'📊':m.includes('word')||m.includes('document')?'📝':m.includes('presentation')||m.includes('powerpoint')?'📽':m.includes('zip')||m.includes('compressed')?'🗜':'📎';
class Arquivo{static get toolbox(){return [{title:'Imagem',icon:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-8 8"/></svg>',data:{modo:'imagem'}},{title:'Arquivo',icon:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/></svg>',data:{modo:'arquivo'}},{title:'Vídeo',icon:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/></svg>',data:{modo:'video'}}];}
  static get isReadOnlySupported(){return true;}static get sanitize(){return {legenda:{}};}
  constructor({data,readOnly,api,block}){this.d=Object.assign({modo:'arquivo',drive_id:null,nome:'',mime:'',tamanho:0,link:'',legenda:'',url:''},data);this.ro=readOnly;this.api=api;this.block=block;}
  render(){const w=document.createElement('div');this.w=w;this.desenhar();return w;}
  desenhar(){const d=this.d,w=this.w;w.innerHTML='';
    if(!d.drive_id&&!d.url&&d.pendente){w.innerHTML='<div class="hb-arquivo"><div class="fa-row"><div class="fa-ico">'+MIME_ICO(d.mime)+'</div><div class="grow" style="min-width:0"><div class="fa-nome">'+esc(d.nome||'arquivo')+'</div><div class="fa-meta">'+(d.tamanho?fmtBytes(d.tamanho)+' · ':'')+'migrando do Notion para o Drive…</div></div></div></div>';return;}
    if(!d.drive_id&&!d.url){if(this.ro){w.innerHTML='<div class="hb-upload">Arquivo não enviado</div>';return;}
      const accept=d.modo==='imagem'?'image/*':d.modo==='video'?'video/*':'';
      w.innerHTML='<div class="hb-upload"><div>'+(d.modo==='imagem'?'🖼 Clique ou arraste uma imagem':d.modo==='video'?'🎬 Clique ou arraste um vídeo':'📎 Clique ou arraste um arquivo')+'<div class="small soft" style="margin-top:4px">vai para o Google Drive da Lidera</div></div><input type="file" '+(accept?'accept="'+accept+'"':'')+'></div><div class="hb-url-form"><input class="input sm" placeholder="…ou cole um link (imagem, vídeo, Drive)"><button class="btn btn-sm btn-ghost">OK</button></div>';
      const up=$('.hb-upload',w),inp=$('input[type=file]',w);up.onclick=()=>inp.click();inp.onchange=()=>this.enviar(inp.files[0]);
      up.ondragover=e=>{e.preventDefault();up.classList.add('over');};up.ondragleave=()=>up.classList.remove('over');up.ondrop=e=>{e.preventDefault();up.classList.remove('over');if(e.dataTransfer.files[0])this.enviar(e.dataTransfer.files[0]);};
      const ui=$('.hb-url-form input',w);$('.hb-url-form button',w).onclick=()=>{const u=ui.value.trim();if(!u)return;d.url=u;d.nome=d.nome||u.split('/').pop().split('?')[0];d.mime=d.mime||(/\.(png|jpe?g|gif|webp|svg)$/i.test(u)?'image/*':/\.(mp4|webm|mov)$/i.test(u)?'video/mp4':'');this.desenhar();this.api.blocks&&this.mudou();};ui.onkeydown=e=>{if(e.key==='Enter')$('.hb-url-form button',w).click();};return;}
    const ehImg=(d.mime||'').startsWith('image/')||d.modo==='imagem',ehVid=(d.mime||'').startsWith('video/')||d.modo==='video',ehAud=(d.mime||'').startsWith('audio/'),ehPdf=(d.mime||'').includes('pdf');
    const src=d.drive_id?arqUrl(d.drive_id,'view'):d.url;const thumb=d.drive_id?arqUrl(d.drive_id,'thumb','w1600'):d.url;
    let prev='';if(ehImg)prev='<div class="fa-prev"><img src="'+esc(thumb)+'" alt="" loading="lazy" onerror="this.onerror=null;this.src=\''+esc(src)+'\'"></div>';
    else if(ehVid)prev='<div class="fa-prev"><video src="'+esc(src)+'" controls preload="metadata"></video></div>';
    else if(ehAud)prev='<div class="fa-prev" style="background:transparent"><audio src="'+esc(src)+'" controls style="width:100%"></audio></div>';
    else if(ehPdf&&d.drive_id)prev='<div class="fa-prev" id="pdfp" style="display:none"><iframe src="'+esc(src)+'#view=FitH"></iframe></div>';
    const cab=ehImg?'':'<div class="fa-row"><div class="fa-ico">'+MIME_ICO(d.mime)+'</div><div class="grow" style="min-width:0"><div class="fa-nome">'+esc(d.nome||'arquivo')+'</div><div class="fa-meta">'+(d.tamanho?fmtBytes(d.tamanho)+' · ':'')+(d.drive_id?'Google Drive':'link externo')+'</div></div><div class="fa-acts">'+(ehPdf&&d.drive_id?'<button class="btn btn-sm btn-ghost" data-a="pdf">Ver</button>':'')+(d.link?'<a class="btn btn-sm btn-ghost" href="'+esc(d.link)+'" target="_blank">Drive</a>':'')+'<a class="btn btn-sm btn-ghost" href="'+esc(d.drive_id?arqUrl(d.drive_id,'download'):d.url)+'" target="_blank" download>Baixar</a></div></div>';
    w.innerHTML='<div class="hb-arquivo'+(ehImg?' img-only':'')+'">'+prev+cab+(ehImg||ehVid?'<div class="fa-cap" contenteditable="'+(!this.ro)+'">'+esc(d.legenda||'')+'</div>':'')+'</div>';
    const pb=$('[data-a=pdf]',w);if(pb)pb.onclick=()=>{const p=$('#pdfp',w);p.style.display=p.style.display==='none'?'flex':'none';pb.textContent=p.style.display==='none'?'Ver':'Fechar';};
    const im=$('.fa-prev img',w);if(im)im.onclick=()=>window.open(src,'_blank');
    const cap=$('.fa-cap',w);if(cap)cap.addEventListener('input',()=>{d.legenda=cap.textContent;});}
  async enviar(file){if(!file)return;const w=this.w;$('.hb-upload',w).innerHTML='<span class="spin"></span> Enviando '+esc(file.name)+' ('+fmtBytes(file.size)+')…';
    const a=await uploadArquivo(file,S.pagina.id);if(!a){this.desenhar();return;}Object.assign(this.d,{drive_id:a.drive_id,nome:a.nome,mime:a.mime,tamanho:a.tamanho,link:a.link});this.desenhar();this.mudou();}
  mudou(){S.dirty=true;agendarSalvar();}
  renderSettings(){if(!podeEditar()||!this.d.drive_id)return [];return [{icon:'🗑',label:'Apagar do Drive também',onActivate:async()=>{if(await confirmar('Apagar arquivo','Remove o bloco e manda o arquivo para a lixeira do Google Drive.',{danger:true,ok:'Apagar'})){try{await fn('/apagar',{drive_id:this.d.drive_id});}catch(e){}this.api.blocks.delete(this.api.blocks.getCurrentBlockIndex());S.dirty=true;agendarSalvar();}},closeOnActivate:true}];}
  save(){return {...this.d};}}

/* ---- bloco: link / embed (Google Docs, Sheets, Slides, Drive, sites) ---- */
function embedDeUrl(u){try{const x=new URL(u);const h=x.hostname;
  let m=u.match(/docs\.google\.com\/(document|spreadsheets|presentation|forms)\/d\/([\w-]+)/);if(m)return 'https://docs.google.com/'+m[1]+'/d/'+m[2]+(m[1]==='forms'?'/viewform?embedded=true':m[1]==='presentation'?'/embed':'/preview');
  m=u.match(/drive\.google\.com\/file\/d\/([\w-]+)/);if(m)return 'https://drive.google.com/file/d/'+m[1]+'/preview';
  m=u.match(/drive\.google\.com\/drive\/folders\/([\w-]+)/);if(m)return 'https://drive.google.com/embeddedfolderview?id='+m[1]+'#list';
  m=u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);if(m)return 'https://www.youtube.com/embed/'+m[1];
  m=u.match(/loom\.com\/share\/([\w-]+)/);if(m)return 'https://www.loom.com/embed/'+m[1];
  m=u.match(/canva\.com\/design\/([\w-]+)\/([\w-]+)\/(view|edit)/);if(m)return 'https://www.canva.com/design/'+m[1]+'/'+m[2]+'/view?embed';
  if(/figma\.com\/(file|design|proto)\//.test(u))return 'https://www.figma.com/embed?embed_host=hub&url='+encodeURIComponent(u);
  if(/\.(pdf)(\?|$)/i.test(u))return u;return null;}catch(e){return null;}}
class LinkCard{static get toolbox(){return [{title:'Link / Embed',icon:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>'}];}
  static get isReadOnlySupported(){return true;}static get sanitize(){return {titulo:{}};}
  constructor({data,readOnly}){this.d=Object.assign({url:'',titulo:'',embed:true},data);this.ro=readOnly;}
  render(){const w=document.createElement('div');this.w=w;this.desenhar();return w;}
  desenhar(){const d=this.d,w=this.w;w.innerHTML='';if(!d.url){if(this.ro){w.innerHTML='';return;}w.innerHTML='<div class="hb-url-form"><input class="input sm" placeholder="Cole o link (Google Docs, Sheets, Drive, YouTube, site…)"><button class="btn btn-sm btn-primary">Inserir</button></div>';const i=$('input',w);const ok=()=>{const u=i.value.trim();if(!u)return;d.url=u.startsWith('http')?u:'https://'+u;d.titulo=d.titulo||d.url.replace(/^https?:\/\//,'').split(/[?#]/)[0];this.desenhar();S.dirty=true;agendarSalvar();};$('button',w).onclick=ok;i.onkeydown=e=>{if(e.key==='Enter')ok();};setTimeout(()=>i.focus(),20);return;}
    const em=d.embed!==false?embedDeUrl(d.url):null;
    if(em){w.innerHTML='<div class="hb-embed"><iframe src="'+esc(em)+'" allow="autoplay; fullscreen" loading="lazy"></iframe><div class="em-bar"><span>🔗</span><span class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" contenteditable="'+(!this.ro)+'">'+esc(d.titulo||d.url)+'</span><a href="'+esc(d.url)+'" target="_blank">Abrir ↗</a></div></div>';const t=$('.em-bar span[contenteditable]',w);t.addEventListener('input',()=>{d.titulo=t.textContent;});}
    else{w.innerHTML='<a class="hb-link" href="'+esc(d.url)+'" target="_blank" rel="noopener"><div class="lk-body"><div class="lk-t" contenteditable="'+(!this.ro)+'">'+esc(d.titulo||d.url)+'</div><div class="lk-u">'+esc(d.url)+'</div></div><div class="lk-ico">🔗</div></a>';const t=$('.lk-t',w);t.addEventListener('input',()=>{d.titulo=t.textContent;});t.onclick=e=>{if(!this.ro)e.preventDefault();};}}
  renderSettings(){const it=[{icon:'✎',label:'Trocar link',onActivate:()=>{this.d.url='';this.desenhar();},closeOnActivate:true}];if(embedDeUrl(this.d.url))it.unshift({icon:'▣',label:this.d.embed!==false?'Mostrar só como link':'Mostrar embutido',onActivate:()=>{this.d.embed=this.d.embed===false;this.desenhar();S.dirty=true;agendarSalvar();},closeOnActivate:true});return it;}
  save(){return {...this.d};}}

/* ---- bloco: base de dados inline ---- */
class BaseInline{static get toolbox(){return {title:'Base de dados',icon:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></svg>'};}
  static get isReadOnlySupported(){return true;}
  constructor({data,api,block}){this.d={id:data.id||null,visao:data.visao||null};this.api=api;}
  render(){const w=document.createElement('div');w.className='hb-base';this.w=w;if(!this.d.id){if(podeEditar())this.criar();else w.innerHTML='<div class="soft small">Base vazia</div>';}else this.montar();return w;}
  async criar(){const p=await novaPagina(S.pagina?S.pagina.id:null,{silencioso:true,tipo:'base',titulo:'',esquema:baseEsquemaPadrao(),visoes:baseVisoesPadrao()});if(!p)return;this.d.id=p.id;S.dirty=true;agendarSalvar();this.montar();}
  async montar(){const w=this.w;w.innerHTML='<div class="carregando"><span class="spin"></span></div>';const {data:b}=await sb.from('hub_paginas').select('*').eq('id',this.d.id).maybeSingle();if(!b){w.innerHTML='<div class="soft small">Base não encontrada (foi apagada?)</div>';return;}
    w.innerHTML='<div class="bs-head"><div class="bs-title" title="Abrir a base em página"><span>'+iconeDe(b)+'</span><span class="bt-t" contenteditable="'+(podeEditar())+'" spellcheck="false">'+esc(b.titulo||'')+'</span></div></div><div class="bs-host"></div>';
    const t=$('.bt-t',w);t.addEventListener('input',debounce(()=>{sb.from('hub_paginas').update({titulo:t.textContent.trim()}).eq('id',b.id);const n=S.byId[b.id];if(n){n.titulo=t.textContent.trim();renderTree();}},600));t.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();t.blur();}};
    $('.bs-title span:first-child',w).onclick=()=>abrirPagina(b.id);
    baseMontar(b,$('.bs-host',w),{inline:true,visao:this.d.visao,onVisao:v=>{this.d.visao=v;}});}
  save(){return {id:this.d.id,visao:this.d.visao};}}

/* ---- bloco: sumário ---- */
class Sumario{static get toolbox(){return {title:'Sumário',icon:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h13"/></svg>'};}
  static get isReadOnlySupported(){return true;}constructor({api}){this.api=api;}
  render(){const w=document.createElement('div');w.className='hb-toc';const atualizar=()=>{const hs=$$('.ce-header',this.api.ui?document:document);w.innerHTML=hs.length?hs.map((h,i)=>'<a class="n'+h.tagName[1]+'" data-i="'+i+'">'+esc(h.textContent)+'</a>').join(''):'<span class="soft small">Os títulos da página aparecem aqui.</span>';$$('a',w).forEach(a=>a.onclick=()=>{const h=$$('.ce-header')[+a.dataset.i];h&&h.scrollIntoView({behavior:'smooth',block:'start'});});};setTimeout(atualizar,300);w.onmouseenter=atualizar;return w;}
  save(){return {};}}

/* ---- upload ---- */
function escolherArquivos(cb,accept,multi){const i=document.createElement('input');i.type='file';if(accept)i.accept=accept;if(multi)i.multiple=true;i.onchange=()=>cb(Array.from(i.files));i.click();}
async function uploadArquivo(file,paginaId){if(!file)return null;if(file.size>45*1024*1024){toast('Arquivo acima de 45 MB. Suba direto no Google Drive e cole o link aqui.',{erro:true,ms:6000});return null;}
  const fd=new FormData();fd.append('file',file);fd.append('pagina_id',paginaId);fd.append('nome',file.name);
  try{const j=await fn('/upload',fd);toast('Arquivo enviado para o Drive');return j.arquivo;}catch(e){toast('Falha no envio: '+e.message,{erro:true,ms:6000});return null;}}

/* ---- montar / destruir ---- */
function montarEditor(p,host){if(!host)return;destruirEditor();const ro=!podeEditar();
  const ed=new EditorJS({holder:host,data:p.conteudo&&p.conteudo.blocks?p.conteudo:{blocks:[]},placeholder:ro?'':'Escreva algo, ou digite "/" para inserir um bloco…',readOnly:ro,i18n:I18N,autofocus:false,minHeight:120,
    tools:{
      header:{class:Header,inlineToolbar:true,config:{levels:[1,2,3,4],defaultLevel:2,placeholder:'Título'},shortcut:'CMD+SHIFT+H'},
      paragraph:{inlineToolbar:true},
      list:{class:EditorjsList,inlineToolbar:true,config:{defaultStyle:'unordered'}},
      callout:{class:Callout,inlineToolbar:true},
      quote:{class:Quote,inlineToolbar:true,config:{quotePlaceholder:'Citação',captionPlaceholder:'Autor'}},
      toggle:{class:ToggleBlock,inlineToolbar:true,config:{placeholder:'Toggle'}},
      table:{class:Table,inlineToolbar:true,config:{rows:2,cols:3,withHeadings:true}},
      code:{class:CodeTool,config:{placeholder:'Código'}},
      delimiter:Delimiter,
      arquivo:{class:Arquivo},
      link:{class:LinkCard},
      embed:{class:Embed,config:{services:{youtube:true,vimeo:true,instagram:true,twitter:true,figma:true,miro:true}}},
      pagina:{class:PaginaLink},
      base:{class:BaseInline},
      sumario:{class:Sumario},
      underline:Underline,marker:{class:Marker,shortcut:'CMD+SHIFT+M'},inlineCode:{class:InlineCode,shortcut:'CMD+E'},
    },
    onChange:(api,ev)=>{if(ro)return;S.dirty=true;agendarSalvar();},
    onReady:()=>{if(ro)return;try{new Undo({editor:ed});new DragDrop(ed);}catch(e){}}
  });
  S.editor=ed;S.editorPaginaId=p.id;
  // colar arquivos/imagens direto no editor
  host.addEventListener('paste',async e=>{if(ro)return;const fs=Array.from(e.clipboardData.files||[]);if(!fs.length)return;e.preventDefault();for(const f of fs){const a=await uploadArquivo(f,p.id);if(a){ed.blocks.insert('arquivo',{modo:a.mime.startsWith('image/')?'imagem':'arquivo',...a});}}S.dirty=true;agendarSalvar();});
  host.addEventListener('drop',async e=>{if(ro)return;const fs=Array.from(e.dataTransfer.files||[]);if(!fs.length)return;e.preventDefault();e.stopPropagation();for(const f of fs){const a=await uploadArquivo(f,p.id);if(a)ed.blocks.insert('arquivo',{modo:a.mime.startsWith('image/')?'imagem':'arquivo',...a});}S.dirty=true;agendarSalvar();},true);
  // backup local não enviado?
  try{const b=JSON.parse(localStorage.getItem('hub_bkp_'+p.id)||'null');if(b&&b.em>new Date(p.atualizado_em).getTime()){toast('Há alterações não enviadas desta página.',{acao:'Restaurar',onAcao:async()=>{await ed.isReady;ed.render(b.conteudo);S.pagina.titulo=b.titulo;$('.page-title').textContent=b.titulo;S.dirty=true;agendarSalvar();},ms:10000});}}catch(e){}}
function destruirEditor(){if(S.editor){try{S.editor.destroy();}catch(e){}S.editor=null;S.editorPaginaId=null;}}

/* ---- texto plano (busca) e markdown ---- */
function semTags(h){const d=document.createElement('div');d.innerHTML=String(h||'');return d.textContent||'';}
function textoPlano(conteudo,props,esquema){const out=[];const bl=(conteudo&&conteudo.blocks)||[];const itens=l=>(l||[]).forEach(i=>{out.push(semTags(i.content));itens(i.items);});
  bl.forEach(b=>{const d=b.data||{};switch(b.type){case 'paragraph':case 'header':out.push(semTags(d.text));break;case 'list':itens(d.items);break;case 'callout':out.push(semTags(d.text));break;case 'quote':out.push(semTags(d.text),semTags(d.caption));break;case 'toggle':out.push(semTags(d.text));break;case 'table':(d.content||[]).forEach(r=>out.push(r.map(semTags).join(' ')));break;case 'code':out.push(d.code);break;case 'arquivo':out.push(d.nome,d.legenda);break;case 'link':out.push(d.titulo,d.url);break;default:if(d.text)out.push(semTags(d.text));}});
  if(props&&esquema&&esquema.props)esquema.props.forEach(pr=>{const v=props[pr.id];if(v==null||v==='')return;if(Array.isArray(v))out.push(v.map(x=>typeof x==='object'?(x.nome||''):x).join(' '));else if(typeof v==='object')out.push(v.inicio||'');else out.push(String(v));});
  return out.filter(Boolean).join('\n').slice(0,200000);}
function blocosParaMD(conteudo){const bl=(conteudo&&conteudo.blocks)||[];const inl=h=>semTags(String(h||'').replace(/<b>|<strong>/g,'**').replace(/<\/b>|<\/strong>/g,'**').replace(/<i>|<em>/g,'_').replace(/<\/i>|<\/em>/g,'_').replace(/<br\s*\/?>/g,'\n'));
  const lista=(it,niv,st,n)=>(it||[]).map((i,k)=>'  '.repeat(niv)+(st==='ordered'?(k+1)+'. ':st==='checklist'?'- ['+(i.meta&&i.meta.checked?'x':' ')+'] ':'- ')+inl(i.content)+'\n'+lista(i.items,niv+1,st)).join('');
  return bl.map(b=>{const d=b.data||{};switch(b.type){case 'header':return '#'.repeat(d.level||2)+' '+inl(d.text)+'\n';case 'list':return lista(d.items,0,d.style);case 'callout':return '> '+(d.icon||'')+' '+inl(d.text)+'\n';case 'quote':return '> '+inl(d.text)+'\n';case 'toggle':return '▸ **'+inl(d.text)+'**\n';case 'delimiter':return '---\n';case 'code':return '```\n'+(d.code||'')+'\n```\n';case 'table':return (d.content||[]).map((r,i)=>'| '+r.map(inl).join(' | ')+' |'+(i===0?'\n| '+r.map(()=>'---').join(' | ')+' |':'')).join('\n')+'\n';case 'arquivo':return '['+(d.nome||'arquivo')+']('+(d.link||d.url||'')+')\n';case 'link':return '['+(d.titulo||d.url)+']('+d.url+')\n';case 'pagina':return '→ '+(S.byId[d.id]?tituloDe(S.byId[d.id]):'página')+'\n';case 'base':return '(base de dados)\n';default:return inl(d.text||'')+'\n';}}).join('\n');}
