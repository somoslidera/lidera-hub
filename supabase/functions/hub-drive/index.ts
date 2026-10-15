// hub-drive — ponte do Hub · by Lidera com o Google Drive da contato@
// Rotas (sufixo depois de /functions/v1/hub-drive):
//   POST /oauth/url        (admin)   → {url}  link de autorização do Google
//   GET  /oauth/callback             ← Google volta aqui com ?code&state; guarda o refresh token em hub_config
//   POST /status           (membro)  → {conectado,email,pasta,pasta_link}
//   POST /token            (membro)  → {t,exp}  token assinado p/ URLs de arquivo (<img>, <video>, <iframe>)
//   POST /upload           (editor)  multipart (file, pagina_id) ou JSON {pagina_id,nome,mime,dataB64} → arquivo
//   GET  /arquivo?id&modo=view|thumb|download&sz=w1200[&t=]   ← proxy do conteúdo
//   POST /apagar           (editor)  {drive_id}
//   POST /compartilhar     (admin)   {email, papel:'reader'|'writer'}
//   POST /pasta            (editor)  {pagina_id} → garante pasta da página, devolve link
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const GID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GSEC = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const SIGN = Deno.env.get("HUB_SIGN") || SRK;
const APP_URL = Deno.env.get("HUB_APP_URL") || "https://somoslidera.github.io/lidera-hub/";
const ROOT_NAME = "Lidera Hub";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

const admin = createClient(SB_URL, SRK, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json", ...extra } });
const erro = (msg: string, status = 400) => json({ erro: msg }, status);

// ---------- auth ----------
type Quem = { uid: string; email: string; papel: "admin" | "editor" | "leitor" };
async function quem(req: Request, tokenQuery?: string | null): Promise<Quem | null> {
  const h = req.headers.get("Authorization") || "";
  const jwt = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (jwt && jwt !== ANON) {
    const anon = createClient(SB_URL, ANON, { auth: { persistSession: false } });
    const { data } = await anon.auth.getUser(jwt);
    if (data?.user) return await papelDe(data.user.id, data.user.email || "");
  }
  if (tokenQuery) {
    const v = await verificar(tokenQuery);
    if (v) return { uid: v.uid, email: "", papel: "leitor" };
  }
  return null;
}
async function papelDe(uid: string, email: string): Promise<Quem | null> {
  const { data: p } = await admin.from("perfis").select("papel").eq("id", uid).maybeSingle();
  if (p?.papel === "admin") return { uid, email, papel: "admin" };
  const { data: m } = await admin.from("hub_membros").select("papel").eq("user_id", uid).maybeSingle();
  if (m) return { uid, email, papel: m.papel };
  return null;
}
const edita = (q: Quem | null) => !!q && (q.papel === "admin" || q.papel === "editor");

// token assinado p/ URLs de arquivo: base64url(uid.exp).hmac
async function hmac(s: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SIGN), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(s));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function assinar(uid: string, horas = 12) {
  const exp = Math.floor(Date.now() / 1000) + horas * 3600;
  const corpo = `${uid}.${exp}`;
  return { t: `${btoa(corpo).replace(/=+$/, "")}.${await hmac(corpo)}`, exp };
}
async function verificar(t: string) {
  const [b, sig] = t.split(".");
  if (!b || !sig) return null;
  let corpo = "";
  try { corpo = atob(b); } catch { return null; }
  if ((await hmac(corpo)) !== sig) return null;
  const [uid, exp] = corpo.split(".");
  if (+exp < Date.now() / 1000) return null;
  return { uid };
}

// ---------- config ----------
async function cfg(chave: string) {
  const { data } = await admin.from("hub_config").select("valor").eq("chave", chave).maybeSingle();
  return data?.valor || null;
}
async function cfgSet(chave: string, valor: unknown) {
  await admin.from("hub_config").upsert({ chave, valor, atualizado_em: new Date().toISOString() });
}

// ---------- google ----------
async function accessToken(): Promise<string> {
  const g = await cfg("google");
  if (!g?.refresh_token) throw new Error("Google Drive não conectado. Peça para um administrador conectar em Configurações.");
  if (g.access_token && g.expira && g.expira > Date.now() / 1000 + 60) return g.access_token;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: GID, client_secret: GSEC, refresh_token: g.refresh_token, grant_type: "refresh_token" }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("Falha ao renovar o acesso ao Google: " + (j.error_description || j.error || r.status));
  await cfgSet("google", { ...g, access_token: j.access_token, expira: Math.floor(Date.now() / 1000) + (j.expires_in || 3600) });
  return j.access_token;
}
async function gapi(path: string, init: RequestInit = {}, raw = false) {
  const tk = await accessToken();
  const r = await fetch(path.startsWith("http") ? path : "https://www.googleapis.com/drive/v3/" + path, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: "Bearer " + tk },
  });
  if (raw) return r;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Google Drive: " + (j.error?.message || r.status));
  return j;
}
async function pastaRaiz(): Promise<string> {
  const g = (await cfg("google")) || {};
  if (g.pasta_id) {
    const ok = await gapi(`files/${g.pasta_id}?fields=id,trashed`, {}, true);
    if (ok.ok) { const j = await ok.json(); if (!j.trashed) return g.pasta_id; }
  }
  const q = encodeURIComponent(`name = '${ROOT_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'root' in parents`);
  const lista = await gapi(`files?q=${q}&fields=files(id,name)`);
  let id = lista.files?.[0]?.id;
  if (!id) {
    const f = await gapi("files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: ROOT_NAME, mimeType: "application/vnd.google-apps.folder" }) });
    id = f.id;
  }
  await cfgSet("google", { ...(await cfg("google")), pasta_id: id });
  return id;
}
function nomeSeguro(s: string) { return (s || "Sem título").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80); }
async function pastaDaPagina(paginaId: string): Promise<string> {
  const { data: p } = await admin.from("hub_paginas").select("id,titulo,drive_pasta").eq("id", paginaId).maybeSingle();
  if (!p) throw new Error("Página não encontrada.");
  if (p.drive_pasta) {
    const ok = await gapi(`files/${p.drive_pasta}?fields=id,trashed`, {}, true);
    if (ok.ok) { const j = await ok.json(); if (!j.trashed) return p.drive_pasta; }
  }
  const raiz = await pastaRaiz();
  const f = await gapi("files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nomeSeguro(p.titulo), mimeType: "application/vnd.google-apps.folder", parents: [raiz] }) });
  await admin.from("hub_paginas").update({ drive_pasta: f.id }).eq("id", paginaId);
  return f.id;
}
async function subpasta(pai: string, nome: string): Promise<string> {
  const q = encodeURIComponent(`name = '${nome.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${pai}' in parents`);
  const lista = await gapi(`files?q=${q}&fields=files(id,name)`);
  if (lista.files?.[0]?.id) return lista.files[0].id;
  const f = await gapi("files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nome, mimeType: "application/vnd.google-apps.folder", parents: [pai] }) });
  return f.id;
}
async function pastaCaminho(paginaId: string, caminho: string): Promise<string> {
  let atual = await pastaDaPagina(paginaId);
  for (const parte of String(caminho || "").split("/").map((x) => nomeSeguro(x.trim())).filter(Boolean)) atual = await subpasta(atual, parte);
  return atual;
}
async function enviar(pasta: string, nome: string, mime: string, bytes: Uint8Array) {
  const meta = JSON.stringify({ name: nome, parents: [pasta] });
  const limite = "hub" + crypto.randomUUID().replace(/-/g, "");
  const enc = new TextEncoder();
  const head = enc.encode(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${limite}\r\nContent-Type: ${mime || "application/octet-stream"}\r\n\r\n`);
  const tail = enc.encode(`\r\n--${limite}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);
  return await gapi("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,thumbnailLink,iconLink", {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${limite}` }, body,
  });
}

// ---------- handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const rota = url.pathname.replace(/^.*\/hub-drive/, "") || "/";
  try {
    // ----- OAuth -----
    if (rota === "/oauth/url" && req.method === "POST") {
      const q = await quem(req);
      if (!q || q.papel !== "admin") return erro("Só administradores conectam o Drive.", 403);
      if (!GID || !GSEC) return erro("GOOGLE_CLIENT_ID/SECRET não configurados na função.", 500);
      const state = crypto.randomUUID();
      await cfgSet("oauth_state", { state, em: Date.now(), por: q.uid });
      const redir = `${SB_URL}/functions/v1/hub-drive/oauth/callback`;
      const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      u.search = new URLSearchParams({ client_id: GID, redirect_uri: redir, response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state }).toString();
      return json({ url: u.toString() });
    }
    if (rota === "/oauth/callback") {
      const code = url.searchParams.get("code"), state = url.searchParams.get("state");
      const st = await cfg("oauth_state");
      if (!code || !state || !st || st.state !== state || Date.now() - st.em > 15 * 60 * 1000) return new Response("Pedido inválido ou expirado. Volte ao Hub e tente de novo.", { status: 400 });
      const redir = `${SB_URL}/functions/v1/hub-drive/oauth/callback`;
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: GID, client_secret: GSEC, redirect_uri: redir, grant_type: "authorization_code" }),
      });
      const j = await r.json();
      if (!j.refresh_token) return new Response("O Google não devolveu o refresh token: " + JSON.stringify(j), { status: 400 });
      await cfgSet("google", { refresh_token: j.refresh_token, access_token: j.access_token, expira: Math.floor(Date.now() / 1000) + (j.expires_in || 3600), em: new Date().toISOString() });
      await cfgSet("oauth_state", {});
      let email = "";
      try { const a = await gapi("about?fields=user"); email = a.user?.emailAddress || ""; } catch { /* ok */ }
      const pasta = await pastaRaiz();
      await cfgSet("google", { ...(await cfg("google")), email, pasta_id: pasta });
      return Response.redirect(APP_URL + (APP_URL.includes("?") ? "&" : "?") + "drive=ok", 302);
    }

    // ----- arquivo (GET, aceita token na query) -----
    if (rota === "/arquivo" && req.method === "GET") {
      const q = await quem(req, url.searchParams.get("t"));
      if (!q) return erro("Não autorizado.", 401);
      const id = url.searchParams.get("id") || "";
      const modo = url.searchParams.get("modo") || "view";
      const sz = (url.searchParams.get("sz") || "w1200").replace(/[^a-z0-9]/gi, "");
      if (!/^[\w-]+$/.test(id)) return erro("id inválido");
      if (modo === "thumb") {
        const meta = await gapi(`files/${id}?fields=thumbnailLink,mimeType,name`);
        if (!meta.thumbnailLink) return erro("Sem miniatura.", 404);
        const tl = meta.thumbnailLink.replace(/=s\d+(-[a-z]+)?$/, "=" + (sz.startsWith("w") || sz.startsWith("s") ? sz : "w" + sz));
        const r = await fetch(tl, { headers: { Authorization: "Bearer " + (await accessToken()) } });
        if (!r.ok) return erro("Miniatura indisponível.", 404);
        return new Response(r.body, { headers: { ...CORS, "Content-Type": r.headers.get("content-type") || "image/jpeg", "Cache-Control": "private, max-age=86400" } });
      }
      const meta = await gapi(`files/${id}?fields=name,mimeType,size`);
      const r = await gapi(`files/${id}?alt=media`, {}, true);
      if (!r.ok) return erro("Arquivo indisponível.", 404);
      const h: Record<string, string> = { ...CORS, "Content-Type": meta.mimeType || "application/octet-stream", "Cache-Control": "private, max-age=3600", "Accept-Ranges": "bytes" };
      if (meta.size) h["Content-Length"] = String(meta.size);
      h["Content-Disposition"] = `${modo === "download" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(meta.name || "arquivo")}`;
      return new Response(r.body, { headers: h });
    }

    // ----- demais rotas: POST autenticado -----
    if (req.method !== "POST") return erro("Rota não encontrada.", 404);
    const q = await quem(req);
    if (!q) return erro("Não autorizado.", 401);

    if (rota === "/status") {
      const g = (await cfg("google")) || {};
      return json({ conectado: !!g.refresh_token, email: g.email || "", pasta: g.pasta_id || "", pasta_link: g.pasta_id ? `https://drive.google.com/drive/folders/${g.pasta_id}` : "", papel: q.papel });
    }
    if (rota === "/token") return json(await assinar(q.uid));

    if (rota === "/upload") {
      if (!edita(q)) return erro("Sem permissão para enviar arquivos.", 403);
      let paginaId = "", nome = "", mime = "", bytes: Uint8Array | null = null, pastaId = "";
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("multipart/form-data")) {
        const fd = await req.formData();
        const f = fd.get("file");
        if (!(f instanceof File)) return erro("Arquivo ausente.");
        paginaId = String(fd.get("pagina_id") || ""); nome = String(fd.get("nome") || f.name || "arquivo"); mime = f.type || "application/octet-stream"; pastaId = String(fd.get("pasta_id") || "");
        bytes = new Uint8Array(await f.arrayBuffer());
      } else {
        const b = await req.json();
        paginaId = b.pagina_id || ""; nome = b.nome || "arquivo"; mime = b.mime || "application/octet-stream"; pastaId = b.pasta_id || "";
        if (!b.dataB64) return erro("dataB64 ausente.");
        const bin = atob(b.dataB64); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      }
      if (!paginaId) return erro("pagina_id ausente.");
      const pasta = /^[\w-]+$/.test(pastaId) ? pastaId : await pastaDaPagina(paginaId);
      const f = await enviar(pasta, nome, mime, bytes!);
      const { data: row } = await admin.from("hub_arquivos").insert({ pagina_id: paginaId, drive_id: f.id, nome: f.name || nome, mime: f.mimeType || mime, tamanho: +(f.size || bytes!.length), link: f.webViewLink || null, pasta_id: pasta, criado_por: q.uid }).select().single();
      return json({ ok: true, arquivo: { id: row?.id, drive_id: f.id, nome: f.name || nome, mime: f.mimeType || mime, tamanho: +(f.size || bytes!.length), link: f.webViewLink, tem_thumb: !!f.thumbnailLink } });
    }
    // ----- upload grande: sessão retomável (o cliente manda os bytes direto ao Google) -----
    if (rota === "/upload/iniciar") {
      if (!edita(q)) return erro("Sem permissão para enviar arquivos.", 403);
      const { pagina_id, nome, mime, tamanho, pasta_id } = await req.json();
      if (!pagina_id || !nome) return erro("pagina_id e nome são obrigatórios.");
      const pasta = /^[\w-]+$/.test(pasta_id || "") ? pasta_id : await pastaDaPagina(pagina_id);
      const origem = req.headers.get("Origin") || "";
      const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,webViewLink,thumbnailLink", {
        method: "POST",
        headers: { Authorization: "Bearer " + (await accessToken()), "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mime || "application/octet-stream", ...(tamanho ? { "X-Upload-Content-Length": String(tamanho) } : {}), ...(origem ? { Origin: origem } : {}) },
        body: JSON.stringify({ name: nome, parents: [pasta] }),
      });
      if (!r.ok) return erro("Google não abriu a sessão de envio: " + (await r.text()).slice(0, 300), 500);
      return json({ ok: true, sessao: r.headers.get("Location"), pasta });
    }
    if (rota === "/upload/concluir") {
      if (!edita(q)) return erro("Sem permissão.", 403);
      const { pagina_id, drive_id, pasta } = await req.json();
      if (!/^[\w-]+$/.test(drive_id || "")) return erro("drive_id inválido");
      const f = await gapi(`files/${drive_id}?fields=id,name,mimeType,size,webViewLink,thumbnailLink,parents`);
      const { data: row } = await admin.from("hub_arquivos").upsert({ pagina_id: pagina_id || null, drive_id: f.id, nome: f.name, mime: f.mimeType, tamanho: +(f.size || 0), link: f.webViewLink || null, pasta_id: pasta || (f.parents || [])[0] || null, criado_por: q.uid }, { onConflict: "drive_id" }).select().single();
      return json({ ok: true, arquivo: { id: row?.id, drive_id: f.id, nome: f.name, mime: f.mimeType, tamanho: +(f.size || 0), link: f.webViewLink, tem_thumb: !!f.thumbnailLink } });
    }
    if (rota === "/apagar") {
      if (!edita(q)) return erro("Sem permissão.", 403);
      const { drive_id } = await req.json();
      if (!/^[\w-]+$/.test(drive_id || "")) return erro("id inválido");
      await gapi(`files/${drive_id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
      await admin.from("hub_arquivos").delete().eq("drive_id", drive_id);
      return json({ ok: true });
    }
    if (rota === "/pasta/criar") {
      if (!edita(q)) return erro("Sem permissão.", 403);
      const { pagina_id, caminho } = await req.json();
      if (!pagina_id) return erro("pagina_id ausente.");
      const id = await pastaCaminho(pagina_id, caminho || "Pasta");
      return json({ ok: true, pasta: id, link: `https://drive.google.com/drive/folders/${id}` });
    }
    if (rota === "/pasta") {
      if (!edita(q)) return erro("Sem permissão.", 403);
      const { pagina_id } = await req.json();
      const id = await pastaDaPagina(pagina_id);
      return json({ ok: true, pasta: id, link: `https://drive.google.com/drive/folders/${id}` });
    }
    // ----- membros (admin) -----
    if (rota === "/membro/criar") {
      if (q.papel !== "admin") return erro("Só administradores.", 403);
      const { email, nome, senha, papel, google_email, trocar_senha } = await req.json();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || "")) return erro("E-mail inválido.");
      const em = String(email).toLowerCase().trim();
      // já existe no Auth? (membro do Flow, por exemplo) → mantém a senha, a não ser que peçam para trocar
      let uid = "";
      const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const ja = lista?.users?.find((u) => (u.email || "").toLowerCase() === em);
      if (ja) { uid = ja.id; if (trocar_senha && senha && senha.length >= 6) await admin.auth.admin.updateUserById(uid, { password: senha }); }
      else {
        if (!senha || senha.length < 6) return erro("Senha com ao menos 6 caracteres.");
        const { data, error } = await admin.auth.admin.createUser({ email: em, password: senha, email_confirm: true, user_metadata: { nome } });
        if (error || !data.user) return erro("Não deu para criar a conta: " + (error?.message || ""), 400);
        uid = data.user.id;
      }
      await admin.from("hub_membros").upsert({ user_id: uid, email: em, nome: nome || "", papel: ["admin", "editor", "leitor"].includes(papel) ? papel : "editor", google_email: google_email || null });
      return json({ ok: true, user_id: uid, ja_existia: !!ja });
    }
    if (rota === "/membro/remover") {
      if (q.papel !== "admin") return erro("Só administradores.", 403);
      const { user_id, apagar_conta } = await req.json();
      await admin.from("hub_membros").delete().eq("user_id", user_id);
      if (apagar_conta) {
        const { data: p } = await admin.from("perfis").select("papel,org_id").eq("id", user_id).maybeSingle();
        if (!p || (!p.org_id && p.papel !== "admin" && p.papel !== "consultor")) await admin.auth.admin.deleteUser(user_id);
      }
      return json({ ok: true });
    }
    if (rota === "/membro/senha") {
      if (q.papel !== "admin") return erro("Só administradores.", 403);
      const { user_id, senha } = await req.json();
      if (!senha || senha.length < 6) return erro("Senha com ao menos 6 caracteres.");
      const { error } = await admin.auth.admin.updateUserById(user_id, { password: senha });
      if (error) return erro(error.message, 400);
      return json({ ok: true });
    }
    if (rota === "/compartilhar") {
      if (q.papel !== "admin") return erro("Só administradores.", 403);
      const { email, papel } = await req.json();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || "")) return erro("E-mail inválido.");
      const raiz = await pastaRaiz();
      await gapi(`files/${raiz}/permissions?sendNotificationEmail=false&fields=id`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "user", role: papel === "writer" ? "writer" : "reader", emailAddress: email }) });
      return json({ ok: true });
    }
    return erro("Rota não encontrada.", 404);
  } catch (e) {
    return erro((e as Error).message || String(e), 500);
  }
});
