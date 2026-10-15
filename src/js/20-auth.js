/* ===================== autenticação ===================== */
function authBox(){return $('#authScreen');}
function showLogin(){const b=authBox();b.style.display='flex';b.innerHTML=`<div class="auth-card">
    <div class="auth-wm">Hub</div><div class="auth-by">by Lidera</div>
    <div class="auth-err" id="auth_err"></div>
    <div class="field"><label>E-mail</label><input class="input" id="auth_email" type="email" autocomplete="username" placeholder="voce@somoslidera.com.br"></div>
    <div class="field"><label>Senha</label><input class="input" id="auth_pass" type="password" autocomplete="current-password" placeholder="••••••••" onkeydown="if(event.key==='Enter')doLogin()"></div>
    <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:6px" onclick="doLogin()">Entrar</button>
    <div style="text-align:center;margin-top:12px"><a onclick="telaEsqueci()" style="color:var(--muted);cursor:pointer;font-size:12.5px">Esqueci minha senha</a></div>
    <div style="text-align:center;font-size:12px;color:var(--soft);margin-top:16px">Mesmo login do Flow. Sem acesso? Peça a um administrador.</div>
  </div>`;setTimeout(()=>$('#auth_email').focus(),50);}
function hideLogin(){authBox().style.display='none';}
function authErr(m){const e=$('#auth_err');if(e){e.style.display=m?'block':'none';e.textContent=m||'';}}
async function doLogin(){const email=$('#auth_email').value.trim(),pass=$('#auth_pass').value;if(!email||!pass)return authErr('Informe e-mail e senha.');
  const {error}=await sb.auth.signInWithPassword({email,password:pass});if(error)return authErr('E-mail ou senha inválidos.');await afterAuth();}
function telaEsqueci(){const b=authBox();b.innerHTML=`<div class="auth-card"><div class="auth-wm">Hub</div><div class="auth-by">by Lidera</div>
    <div style="font-size:14px;color:var(--muted);margin-bottom:14px;line-height:1.5">Informe seu e-mail. Enviamos um link para você criar uma senha nova.</div>
    <div class="auth-err" id="auth_err"></div>
    <div class="field"><label>E-mail</label><input class="input" id="auth_email" type="email"></div>
    <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="enviarReset()">Enviar link</button>
    <div style="text-align:center;margin-top:12px"><a onclick="showLogin()" style="color:var(--muted);cursor:pointer;font-size:12.5px">Voltar</a></div></div>`;}
async function enviarReset(){const email=$('#auth_email').value.trim();if(!email)return authErr('Informe o e-mail.');const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)return authErr(error.message);authErr('');toast('Link enviado. Confira seu e-mail.');}
function telaNovaSenha(){const b=authBox();b.style.display='flex';b.innerHTML=`<div class="auth-card"><div class="auth-wm">Hub</div><div class="auth-by">by Lidera</div>
    <div style="font-size:14px;color:var(--muted);margin-bottom:14px">Crie sua nova senha.</div><div class="auth-err" id="auth_err"></div>
    <div class="field"><label>Nova senha</label><input class="input" id="np1" type="password" autocomplete="new-password"></div>
    <div class="field"><label>Repita</label><input class="input" id="np2" type="password" autocomplete="new-password"></div>
    <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="salvarNovaSenha()">Salvar senha</button></div>`;}
async function salvarNovaSenha(){const a=$('#np1').value,b=$('#np2').value;if(a.length<6)return authErr('Ao menos 6 caracteres.');if(a!==b)return authErr('As senhas não conferem.');const {error}=await sb.auth.updateUser({password:a});if(error)return authErr(error.message);history.replaceState(null,'',location.pathname);toast('Senha salva!');await afterAuth();}
async function logout(){await sb.auth.signOut();location.hash='';location.reload();}

async function afterAuth(){
  let user;try{user=(await sb.auth.getUser()).data.user;}catch(e){}
  if(!user){showLogin();return;}
  S.me={id:user.id,email:(user.email||'').toLowerCase(),nome:(user.user_metadata&&user.user_metadata.nome)||''};
  // papel: admin do Flow ou membro do Hub
  let papel=null;
  try{const p=(await sb.from('perfis').select('papel,nome').eq('id',user.id).maybeSingle()).data;if(p&&p.papel==='admin')papel='admin';if(p&&p.nome&&!S.me.nome)S.me.nome=p.nome;}catch(e){}
  try{const m=(await sb.from('hub_membros').select('*').eq('user_id',user.id).maybeSingle()).data;if(m){papel=papel==='admin'?'admin':m.papel;if(m.nome)S.me.nome=m.nome;}}catch(e){}
  if(!papel){const b=authBox();b.style.display='flex';b.innerHTML=`<div class="auth-card" style="text-align:center"><div class="auth-wm">Hub</div><div class="auth-by">by Lidera</div>
      <div style="font-size:15px;font-weight:600;margin-bottom:6px">Sem acesso ao Hub</div><div style="font-size:13.5px;color:var(--muted);line-height:1.5">A conta <b>${esc(S.me.email)}</b> ainda não foi liberada. Peça a um administrador para adicionar você em Configurações › Membros.</div>
      <button class="btn btn-ghost" style="margin-top:18px" onclick="logout()">Sair</button></div>`;return;}
  S.papel=papel;hideLogin();
  $('#footName').textContent=S.me.nome||S.me.email;$('#footPapel').textContent=({admin:'Administrador',editor:'Editor',leitor:'Leitor'})[papel];
  await carregarBase();
  roteador();
  assinarRealtime();
}
async function carregarBase(){
  const [tree,fav,mem]=await Promise.all([sb.rpc('hub_arvore'),sb.from('hub_favoritos').select('*').eq('user_id',S.me.id).order('ordem'),sb.from('hub_membros').select('*')]);
  S.tree=tree.data||[];indexarArvore();S.favoritos=fav.data||[];S.membros=mem.data||[];
  if(!S.membros.some(m=>m.user_id===S.me.id))S.membros.push({user_id:S.me.id,email:S.me.email,nome:S.me.nome,papel:S.papel});
  renderTree();renderFavoritos();arqToken();
}
function nomeMembro(id){const m=S.membros.find(x=>x.user_id===id);return m?(m.nome||m.email):'';}
