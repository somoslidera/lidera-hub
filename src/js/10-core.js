/* ===================== Hub · by Lidera — núcleo ===================== */
'use strict';
const SUPA_URL='https://fvcbxorfstqqeewocxkf.supabase.co';
const SUPA_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2Y2J4b3Jmc3RxcWVld29jeGtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNzM5MjgsImV4cCI6MjA5Njg0OTkyOH0.X9gnZt535F1ASHpUaL24eEZysHHECwzfBwjaR4kVnyw';
const FN_URL=SUPA_URL+'/functions/v1/hub-drive';
const sb=window.supabase.createClient(SUPA_URL,SUPA_ANON,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

// ---- estado global ----
const S={
  me:null,           // {id,email}
  papel:'leitor',    // admin|editor|leitor
  membros:[],        // hub_membros + nomes
  tree:[],           // hub_arvore()
  byId:{},           // id -> nó da árvore
  rota:null,         // rota atual {tipo,id}
  pagina:null,       // página aberta (objeto completo)
  editor:null,
  dirty:false,
  saving:false,
  arqToken:null, arqExp:0,
  open:JSON.parse(localStorage.getItem('hub_open')||'{}'),   // nós expandidos
  recentes:JSON.parse(localStorage.getItem('hub_rec')||'[]'),
  favoritos:[],
  rt:null,
};
const $=(s,r)=>(r||document).querySelector(s);
const $$=(s,r)=>Array.from((r||document).querySelectorAll(s));
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID();
const sid=()=>Math.random().toString(36).slice(2,9);
const debounce=(f,ms)=>{let t;return (...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),ms);};};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hoje=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
function fmtData(s,comHora){if(!s)return '';const d=new Date(s.length<=10?s+'T12:00:00':s);if(isNaN(d))return s;const dd=String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();return comHora&&s.length>10?dd+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'):dd;}
function fmtRel(s){if(!s)return '';const d=new Date(s),diff=(Date.now()-d)/1000;if(diff<60)return 'agora';if(diff<3600)return Math.floor(diff/60)+' min atrás';if(diff<86400)return Math.floor(diff/3600)+' h atrás';if(diff<86400*7)return Math.floor(diff/86400)+' d atrás';return fmtData(s);}
function fmtBytes(n){n=+n||0;if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(0)+' KB';if(n<1073741824)return (n/1048576).toFixed(1)+' MB';return (n/1073741824).toFixed(2)+' GB';}
function fmtNum(n,fmt){if(n==null||n==='')return '';n=+n;if(isNaN(n))return '';if(fmt==='reais')return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});if(fmt==='pct')return n.toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';return n.toLocaleString('pt-BR',{maximumFractionDigits:4});}
const podeEditar=()=>S.papel==='admin'||S.papel==='editor';
const ehAdmin=()=>S.papel==='admin';
const ehMobile=()=>window.matchMedia('(max-width:860px)').matches;

// ---- toasts ----
function toast(msg,opts){opts=opts||{};const t=document.createElement('div');t.className='toast'+(opts.erro?' err':'');t.innerHTML='<span>'+esc(msg)+'</span>'+(opts.acao?'<button class="btn">'+esc(opts.acao)+'</button>':'');if(opts.acao)t.querySelector('button').onclick=()=>{t.remove();opts.onAcao&&opts.onAcao();};$('#toasts').appendChild(t);setTimeout(()=>t.remove(),opts.ms||(opts.acao?6000:2800));}

// ---- popover genérico ----
let POP=null;
function popFechar(){if(POP){POP.el.remove();document.removeEventListener('mousedown',POP.h,true);document.removeEventListener('keydown',POP.k,true);POP=null;}}
function pop(anchor,html,opts){opts=opts||{};popFechar();const el=document.createElement('div');el.className='pop'+(opts.cls?' '+opts.cls:'');el.innerHTML=html;document.body.appendChild(el);
  const r=anchor.getBoundingClientRect?anchor.getBoundingClientRect():{left:anchor.x,top:anchor.y,bottom:anchor.y,right:anchor.x,width:0,height:0};
  const w=el.offsetWidth,h=el.offsetHeight;let x=opts.alinhar==='dir'?r.right-w:r.left,y=r.bottom+4;
  if(x+w>window.innerWidth-8)x=window.innerWidth-w-8;if(x<8)x=8;if(y+h>window.innerHeight-8)y=Math.max(8,r.top-h-4);
  el.style.left=x+'px';el.style.top=y+'px';
  const h1=e=>{if(!el.contains(e.target)&&!(opts.manter&&anchor.contains&&anchor.contains(e.target))){popFechar();opts.onFechar&&opts.onFechar();}};
  const k=e=>{if(e.key==='Escape'){popFechar();opts.onFechar&&opts.onFechar();}};
  setTimeout(()=>{document.addEventListener('mousedown',h1,true);document.addEventListener('keydown',k,true);},0);
  POP={el,h:h1,k};const inp=el.querySelector('input,textarea');if(inp&&!opts.semFoco)setTimeout(()=>inp.focus(),30);return el;}
function menu(anchor,itens,opts){const html=itens.map(it=>it==='-'?'<div class="psep"></div>':(it.lbl?'<div class="plbl">'+esc(it.lbl)+'</div>':'<div class="pi'+(it.danger?' danger':'')+'" data-k="'+esc(it.k||'')+'"><span class="ico">'+(it.ico||'')+'</span><span>'+esc(it.t)+'</span>'+(it.sub?'<span class="sub">'+esc(it.sub)+'</span>':'')+'</div>')).join('');
  const el=pop(anchor,html,opts);$$('.pi',el).forEach((d,i)=>{d.onclick=()=>{const it=itens.filter(x=>x!=='-'&&!x.lbl)[i];popFechar();it&&it.f&&it.f();};});return el;}

// ---- modais ----
function modal(html,opts){opts=opts||{};const bg=document.createElement('div');bg.className='modal-bg'+(opts.cls?' '+opts.cls:'');bg.innerHTML='<div class="modal'+(opts.lg?' lg':'')+'">'+html+'</div>';$('#modais').appendChild(bg);
  bg.addEventListener('mousedown',e=>{if(e.target===bg&&!opts.fixo){fecharModal(bg);opts.onFechar&&opts.onFechar();}});
  const k=e=>{if(e.key==='Escape'&&!POP){fecharModal(bg);opts.onFechar&&opts.onFechar();}};document.addEventListener('keydown',k);bg._k=k;
  const inp=bg.querySelector('input:not([type=hidden]),textarea');if(inp&&!opts.semFoco)setTimeout(()=>inp.focus(),40);return bg;}
function fecharModal(bg){if(!bg)bg=$('#modais').lastElementChild;if(!bg)return;document.removeEventListener('keydown',bg._k);bg.remove();}
function confirmar(titulo,texto,opts){opts=opts||{};return new Promise(res=>{const bg=modal('<div class="modal-h">'+esc(titulo)+'</div><div class="modal-b"><p style="font-size:14px;color:var(--muted);line-height:1.5">'+esc(texto)+'</p></div><div class="modal-f"><button class="btn btn-ghost" id="c_nao">Cancelar</button><button class="btn '+(opts.danger?'btn-danger':'btn-primary')+'" id="c_sim">'+esc(opts.ok||'Confirmar')+'</button></div>',{onFechar:()=>res(false)});$('#c_nao',bg).onclick=()=>{fecharModal(bg);res(false);};$('#c_sim',bg).onclick=()=>{fecharModal(bg);res(true);};setTimeout(()=>$('#c_sim',bg).focus(),30);});}
function perguntar(titulo,valor,opts){opts=opts||{};return new Promise(res=>{const bg=modal('<div class="modal-h">'+esc(titulo)+'</div><div class="modal-b"><input class="input" id="p_v" value="'+esc(valor||'')+'" placeholder="'+esc(opts.ph||'')+'"></div><div class="modal-f"><button class="btn btn-ghost" id="p_nao">Cancelar</button><button class="btn btn-primary" id="p_sim">'+esc(opts.ok||'OK')+'</button></div>',{onFechar:()=>res(null)});const i=$('#p_v',bg);i.onkeydown=e=>{if(e.key==='Enter'){fecharModal(bg);res(i.value);}};$('#p_nao',bg).onclick=()=>{fecharModal(bg);res(null);};$('#p_sim',bg).onclick=()=>{fecharModal(bg);res(i.value);};setTimeout(()=>{i.focus();i.select();},40);});}

// ---- tema ----
function temaAplicar(){const t=localStorage.getItem('hub_tema')||'auto';const dark=t==='escuro'||(t==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.body.classList.toggle('dark',dark);const b=$('#temaBtn');if(b)b.title='Tema: '+(t==='auto'?'automático':t);}
function temaCiclar(){const t=localStorage.getItem('hub_tema')||'auto';const nx={auto:'claro',claro:'escuro',escuro:'auto'}[t];localStorage.setItem('hub_tema',nx);temaAplicar();toast('Tema: '+(nx==='auto'?'automático':nx));}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',temaAplicar);

// ---- sidebar mobile ----
function sbToggle(on){document.body.classList.toggle('sb-open',on===undefined?!document.body.classList.contains('sb-open'):on);}

// ---- Edge Function ----
async function fn(rota,body,opts){opts=opts||{};const s=(await sb.auth.getSession()).data.session;const h={'apikey':SUPA_ANON,'Authorization':'Bearer '+(s?s.access_token:'')};let b=body;if(!(body instanceof FormData)){h['Content-Type']='application/json';b=JSON.stringify(body||{});}
  const r=await fetch(FN_URL+rota,{method:'POST',headers:h,body:b});let j={};try{j=await r.json();}catch(e){}if(!r.ok){throw new Error(j.erro||('Erro '+r.status));}return j;}
async function arqToken(){if(S.arqToken&&S.arqExp>Date.now()/1000+600)return S.arqToken;try{const j=await fn('/token');S.arqToken=j.t;S.arqExp=j.exp;}catch(e){S.arqToken=null;}return S.arqToken;}
function arqUrl(driveId,modo,sz){return FN_URL+'/arquivo?id='+encodeURIComponent(driveId)+'&modo='+(modo||'view')+(sz?'&sz='+sz:'')+(S.arqToken?'&t='+S.arqToken:'');}

// ---- ícones ----
const ICO={pagina:'📄',base:'🗂',tabela:'▦',kanban:'▥',lista:'☰',galeria:'▣',calendario:'📅',
  texto:'≡',numero:'#',select:'◉',multi:'☷',status:'◐',data:'📅',pessoa:'👤',checkbox:'☑',url:'🔗',email:'✉',telefone:'☎',arquivos:'📎',relacao:'↗',criado_em:'🕓',atualizado_em:'🕓',titulo:'Aa'};
function iconeDe(p){if(!p)return ICO.pagina;const i=p.icone;if(!i)return p.tipo==='base'?ICO.base:ICO.pagina;if(/^(https?:|data:)/.test(i))return '<img src="'+esc(i)+'" style="width:1em;height:1em;object-fit:contain;vertical-align:-2px">';return esc(i);}
const EMOJIS={'Trabalho':'📄 📁 📂 🗂 📋 📌 📎 🗒 📝 📊 📈 📉 🗓 📅 🕓 ✅ ☑️ ✏️ 🖊 📐 💼 🧾 🧮 🗃 🗄 📤 📥 📦 🏷 🔖 📣 📢 🔔 💡 🎯 🧭 🚀 🛠 ⚙️ 🔧 🔩 🧩 🔑 🔒 🔓 🗝 📬 ✉️ 📞 ☎️ 💻 🖥 📱 🔍 🔎 🧠 ⭐ 🌟 ✨ 🔥 💎 🏆 🥇 🎓 📚 📖 📕 📗 📘 📙 🧪 🔬 🧬 ⚖️ 🏦 💰 💵 💳 🪙 🧲 🧱 🛡',
  'Pessoas':'👤 👥 🙋 👨‍💼 👩‍💼 👨‍🍳 👩‍🍳 🧑‍🏫 🤝 👋 👍 👏 💪 🙌 🧑‍💻 👨‍🔧 🧑‍🎓 🧑‍🤝‍🧑 👪 🫶 ❤️ 💙 💛 💚 🧡 💜 🤍 😀 😄 😎 🤔 😮 🥳 🤩 🫡',
  'Comida':'🍕 🍔 🍟 🌭 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🥘 🍳 🥩 🍗 🍖 🥓 🧀 🥐 🍞 🥖 🧇 🥞 🍰 🎂 🧁 🍩 🍪 🍫 🍦 ☕ 🍵 🧃 🥤 🍺 🍷 🥂 🍽 🍴 🥄 🔪 🧂 🧊 🍅 🥑 🥕 🌽 🍋 🍎 🍇 🍓',
  'Lugares':'🏠 🏢 🏬 🏪 🏭 🏥 🏫 🏛 🏟 🏨 🏦 🏗 🛒 🛵 🚚 🚗 ✈️ 🌎 🗺 📍 🏁 🚩 🎪 🎭 🏞 🌆 🌃',
  'Símbolos':'🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ ❗ ❓ ⚠️ ✖️ ➕ ➖ ✔️ ❌ 🔁 🔄 ▶️ ⏸ ⏩ 🔼 🔽 ➡️ ⬅️ ⬆️ ⬇️ 🆕 🆗 🆙 🔝 🔚 💬 💭 🗯 🏁 🎉 🎊 🎁 🎈 🧨 🪄 🪜 🧰 🪧'};
function emojiPicker(anchor,cb,opts){opts=opts||{};let html='<input class="input sm pin" placeholder="Cole um emoji ou link de imagem…" id="emj_in">';
  for(const k in EMOJIS)html+='<div class="emoji-cat">'+k.toUpperCase()+'</div><div class="emoji-grid">'+EMOJIS[k].split(' ').map(e=>'<button data-e="'+e+'">'+e+'</button>').join('')+'</div>';
  html+='<div class="psep"></div><div class="pi" id="emj_rem"><span class="ico">✕</span><span>Remover ícone</span></div>';
  const el=pop(anchor,html,{cls:'emoji-pop'});$$('.emoji-grid button',el).forEach(b=>b.onclick=()=>{popFechar();cb(b.dataset.e);});
  $('#emj_rem',el).onclick=()=>{popFechar();cb(null);};
  $('#emj_in',el).onkeydown=e=>{if(e.key==='Enter'){const v=e.target.value.trim();if(v){popFechar();cb(v);}}};}

// ---- recentes / favoritos ----
function recAdd(id){S.recentes=[id].concat(S.recentes.filter(x=>x!==id)).slice(0,12);localStorage.setItem('hub_rec',JSON.stringify(S.recentes));}
function ehFav(id){return S.favoritos.some(f=>f.pagina_id===id);}
async function favToggle(id){if(ehFav(id)){await sb.from('hub_favoritos').delete().eq('user_id',S.me.id).eq('pagina_id',id);S.favoritos=S.favoritos.filter(f=>f.pagina_id!==id);toast('Removido dos favoritos');}
  else{await sb.from('hub_favoritos').insert({user_id:S.me.id,pagina_id:id,ordem:Date.now()});S.favoritos.push({pagina_id:id,ordem:Date.now()});toast('Adicionado aos favoritos');}
  renderFavoritos();renderTopActions();}

// ---- rotas ----
function go(rota,id,extra){const h=id?'#'+rota+'/'+id+(extra?'/'+extra:''):'#'+rota;if(location.hash===h){roteador();}else location.hash=h;}
function abrirPagina(id){go('p',id);}
function linkPagina(id){return location.origin+location.pathname+'#p/'+id;}
async function copiar(txt,msg){try{await navigator.clipboard.writeText(txt);toast(msg||'Copiado');}catch(e){prompt('Copie:',txt);}}
