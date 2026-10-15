/* ===================== boot ===================== */
async function bootApp(){temaAplicar();
  const h=location.hash;
  if(h.indexOf('type=recovery')>=0){await sleep(400);telaNovaSenha();return;}
  if(h.indexOf('access_token')>=0){await sleep(600);history.replaceState(null,'',location.pathname);}
  if(location.search.indexOf('drive=ok')>=0){history.replaceState(null,'',location.pathname+'#config/drive');toast('Google Drive conectado!');}
  let session=null;try{session=(await sb.auth.getSession()).data.session;}catch(e){}
  if(!session){showLogin();return;}
  await afterAuth();}
sb.auth.onAuthStateChange((ev)=>{if(ev==='PASSWORD_RECOVERY')telaNovaSenha();if(ev==='SIGNED_OUT'){S.me=null;showLogin();}});
document.addEventListener('DOMContentLoaded',bootApp);
