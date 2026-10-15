-- Hub · by Lidera — wiki/base de conhecimento (substituto do Notion)
-- Roda no projeto Supabase do Flow (fvcbxorfstqqeewocxkf). Idempotente.
create extension if not exists pg_trgm;

-- ---------- membros ----------
create table if not exists hub_membros (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  nome         text,
  papel        text not null default 'editor' check (papel in ('admin','editor','leitor')),
  google_email text,
  criado_em    timestamptz not null default now()
);

create or replace function hub_pode() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select true from perfis where id = auth.uid() and papel = 'admin'), false)
      or exists (select 1 from hub_membros where user_id = auth.uid());
$$;
create or replace function hub_edita() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select true from perfis where id = auth.uid() and papel = 'admin'), false)
      or exists (select 1 from hub_membros where user_id = auth.uid() and papel in ('admin','editor'));
$$;
create or replace function hub_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select true from perfis where id = auth.uid() and papel = 'admin'), false)
      or exists (select 1 from hub_membros where user_id = auth.uid() and papel = 'admin');
$$;

-- ---------- páginas (e bases, e linhas de bases) ----------
create table if not exists hub_paginas (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid references hub_paginas(id) on delete cascade,
  base_id       uuid references hub_paginas(id) on delete cascade,   -- linha de uma base
  tipo          text not null default 'pagina' check (tipo in ('pagina','base')),
  titulo        text not null default '',
  icone         text,
  capa          text,
  conteudo      jsonb not null default '{"blocks":[]}'::jsonb,       -- Editor.js
  texto         text not null default '',                            -- texto plano p/ busca (o app preenche)
  props         jsonb not null default '{}'::jsonb,                  -- valores das propriedades (linha de base)
  esquema       jsonb,                                               -- base: {props:[{id,nome,tipo,opcoes}]}
  visoes        jsonb,                                               -- base: [{id,nome,tipo,...}]
  ordem         double precision not null default 0,
  largura_total boolean not null default false,
  arquivada     boolean not null default false,
  notion_id     text unique,
  criado_por    uuid,
  atualizado_por uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  busca         tsvector generated always as (
                  setweight(to_tsvector('portuguese', coalesce(titulo,'')), 'A') ||
                  setweight(to_tsvector('portuguese', coalesce(texto,'')), 'B')) stored
);
create index if not exists hub_paginas_parent on hub_paginas(parent_id);
create index if not exists hub_paginas_base on hub_paginas(base_id);
create index if not exists hub_paginas_busca on hub_paginas using gin(busca);
create index if not exists hub_paginas_titulo_trgm on hub_paginas using gin (titulo gin_trgm_ops);

create or replace function hub_touch() returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  if new.criado_por is null then new.criado_por := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists trg_hub_touch on hub_paginas;
create trigger trg_hub_touch before insert or update on hub_paginas for each row execute function hub_touch();

-- ---------- histórico de versões (1 a cada 10 min por página, últimas 40) ----------
create table if not exists hub_versoes (
  id         bigserial primary key,
  pagina_id  uuid not null references hub_paginas(id) on delete cascade,
  titulo     text,
  conteudo   jsonb,
  props      jsonb,
  por        uuid,
  em         timestamptz not null default now()
);
create index if not exists hub_versoes_pag on hub_versoes(pagina_id, em desc);
create or replace function hub_snapshot() returns trigger language plpgsql security definer set search_path = public as $$
declare ult timestamptz;
begin
  if old.conteudo is not distinct from new.conteudo and old.titulo is not distinct from new.titulo and old.props is not distinct from new.props then return new; end if;
  select max(em) into ult from hub_versoes where pagina_id = old.id;
  if ult is null or ult < now() - interval '10 minutes' then
    insert into hub_versoes(pagina_id, titulo, conteudo, props, por) values (old.id, old.titulo, old.conteudo, old.props, old.atualizado_por);
    delete from hub_versoes where pagina_id = old.id and id not in (select id from hub_versoes where pagina_id = old.id order by em desc limit 40);
  end if;
  return new;
end $$;
drop trigger if exists trg_hub_snapshot on hub_paginas;
create trigger trg_hub_snapshot before update on hub_paginas for each row execute function hub_snapshot();

-- ---------- arquivos no Google Drive ----------
create table if not exists hub_arquivos (
  id         uuid primary key default gen_random_uuid(),
  pagina_id  uuid references hub_paginas(id) on delete set null,
  drive_id   text not null unique,
  nome       text not null,
  mime       text,
  tamanho    bigint,
  link       text,
  pasta_id   text,
  criado_por uuid,
  criado_em  timestamptz not null default now()
);
create index if not exists hub_arquivos_pag on hub_arquivos(pagina_id);

-- ---------- favoritos ----------
create table if not exists hub_favoritos (
  user_id   uuid not null references auth.users(id) on delete cascade,
  pagina_id uuid not null references hub_paginas(id) on delete cascade,
  ordem     double precision not null default 0,
  primary key (user_id, pagina_id)
);

-- ---------- config (só service_role) ----------
create table if not exists hub_config (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- ---------- RLS ----------
alter table hub_membros   enable row level security;
alter table hub_paginas   enable row level security;
alter table hub_versoes   enable row level security;
alter table hub_arquivos  enable row level security;
alter table hub_favoritos enable row level security;
alter table hub_config    enable row level security;

drop policy if exists hub_membros_sel on hub_membros;
create policy hub_membros_sel on hub_membros for select using (hub_pode());
drop policy if exists hub_membros_adm on hub_membros;
create policy hub_membros_adm on hub_membros for all using (hub_admin()) with check (hub_admin());

drop policy if exists hub_paginas_sel on hub_paginas;
create policy hub_paginas_sel on hub_paginas for select using (hub_pode());
drop policy if exists hub_paginas_ins on hub_paginas;
create policy hub_paginas_ins on hub_paginas for insert with check (hub_edita());
drop policy if exists hub_paginas_upd on hub_paginas;
create policy hub_paginas_upd on hub_paginas for update using (hub_edita()) with check (hub_edita());
drop policy if exists hub_paginas_del on hub_paginas;
create policy hub_paginas_del on hub_paginas for delete using (hub_edita());

drop policy if exists hub_versoes_sel on hub_versoes;
create policy hub_versoes_sel on hub_versoes for select using (hub_pode());

drop policy if exists hub_arquivos_sel on hub_arquivos;
create policy hub_arquivos_sel on hub_arquivos for select using (hub_pode());
drop policy if exists hub_arquivos_upd on hub_arquivos;
create policy hub_arquivos_upd on hub_arquivos for update using (hub_edita()) with check (hub_edita());
drop policy if exists hub_arquivos_del on hub_arquivos;
create policy hub_arquivos_del on hub_arquivos for delete using (hub_edita());

drop policy if exists hub_fav_all on hub_favoritos;
create policy hub_fav_all on hub_favoritos for all using (user_id = auth.uid()) with check (user_id = auth.uid() and hub_pode());

revoke all on hub_config from anon, authenticated;

-- ---------- busca ----------
create or replace function hub_busca(q text, lim int default 30)
returns table (id uuid, titulo text, icone text, tipo text, parent_id uuid, base_id uuid, trecho text, rank real)
language sql stable security invoker as $$
  with tq as (select websearch_to_tsquery('portuguese', q) as t)
  select p.id, p.titulo, p.icone, p.tipo, p.parent_id, p.base_id,
         ts_headline('portuguese', left(p.texto, 4000), tq.t, 'MaxFragments=1, MaxWords=18, MinWords=8, StartSel=<b>, StopSel=</b>') as trecho,
         (ts_rank(p.busca, tq.t) + case when p.titulo ilike '%'||q||'%' then 1 else 0 end)::real as rank
  from hub_paginas p, tq
  where not p.arquivada and (p.busca @@ tq.t or p.titulo ilike '%'||q||'%')
  order by rank desc, p.atualizado_em desc
  limit lim;
$$;

-- ---------- árvore leve (sidebar) ----------
create or replace function hub_arvore()
returns table (id uuid, parent_id uuid, base_id uuid, tipo text, titulo text, icone text, ordem double precision, arquivada boolean, atualizado_em timestamptz, tem_filhos boolean)
language sql stable security invoker as $$
  select p.id, p.parent_id, p.base_id, p.tipo, p.titulo, p.icone, p.ordem, p.arquivada, p.atualizado_em,
         exists (select 1 from hub_paginas f where f.parent_id = p.id and f.base_id is null and not f.arquivada) as tem_filhos
  from hub_paginas p
  where p.base_id is null;
$$;

-- realtime
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='hub_paginas') then
    alter publication supabase_realtime add table hub_paginas;
  end if;
end $$;

grant execute on function hub_busca(text,int) to authenticated;
grant execute on function hub_arvore() to authenticated;
