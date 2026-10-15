-- ============================================================================
-- 20261016000010_knowledge_model.sql
-- Plano de implementação IA (2026-10-15), M3 passo 18 — conhecimento da loja.
--
-- No protótipo o conhecimento é da LOJA (notas em pastas, com callouts regra /
-- resposta / atenção e links entre notas) e cada nota diz quais agentes a
-- leem. Hoje ai_agent_sources pertence a UM agente. Esta migration muda o
-- modelo de dados sem mudar comportamento:
--
-- (a) ai_agent_sources vira ai_sources (RENAME preserva índices, FKs,
--     policies e grants). Uma view `ai_agent_sources` com security_invoker
--     mantém o nome antigo por um release: as 27 leituras/escritas do app e
--     as 2 do runtime continuam funcionando (view simples é atualizável), e
--     a RLS da tabela continua valendo para quem passa pela view.
-- (b) ai_sources.agent_id deixa de ser obrigatório; novas colunas: folder,
--     tags, body_markdown, kind, read_only, updated_by, links. `kind` é
--     derivado de source_type no backfill.
-- (c) ai_source_agents (source_id, agent_id): "lida por". Backfill a partir
--     do agent_id antigo, e um trigger mantém o vínculo quando alguém ainda
--     insere/atualiza fonte com agent_id (rotas antigas até o passo 21).
-- (d) ai_agent_chunks: agent_id nullable; + chunk_kind (text | regra |
--     resposta | atencao) e + position.
-- (e) search_agent_knowledge (mesma assinatura — rag.ts chama) passa a
--     filtrar pela M:N (fonte lida pelo agente), aceitando também o vínculo
--     antigo por c.agent_id, e ordena com peso 1,3 para chunk_kind='resposta'.
-- (f) ai_knowledge_gaps: as lacunas (seção 13 da correlação).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (a) rename + view de compatibilidade
-- ----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.ai_sources') is null
       and to_regclass('public.ai_agent_sources') is not null
       and (select relkind from pg_class where oid = 'public.ai_agent_sources'::regclass) = 'r'
    then
        alter table public.ai_agent_sources rename to ai_sources;
    end if;
end $$;

-- ----------------------------------------------------------------------------
-- (b) colunas da nota
-- ----------------------------------------------------------------------------
alter table public.ai_sources alter column agent_id drop not null;

alter table public.ai_sources
    add column if not exists folder        text    not null default 'geral',
    add column if not exists tags          text[]  not null default '{}'::text[],
    add column if not exists body_markdown text,
    add column if not exists kind          text,
    add column if not exists read_only     boolean not null default false,
    add column if not exists updated_by    uuid,
    add column if not exists links         text[]  not null default '{}'::text[];

update public.ai_sources
   set kind = case
                when source_type in ('text', 'note') then 'note'
                when source_type in ('faq') then 'faq'
                when source_type in ('url', 'website', 'site_page') then 'url'
                when source_type in ('shopify', 'products', 'integration', 'catalog') then 'catalog'
                else 'document'
              end,
       read_only = (source_type in ('shopify', 'products', 'integration', 'catalog')),
       body_markdown = coalesce(body_markdown, case when source_type in ('text', 'note', 'faq') then text_content end)
 where kind is null;

alter table public.ai_sources alter column kind set default 'note';
alter table public.ai_sources alter column kind set not null;
alter table public.ai_sources drop constraint if exists ai_sources_kind_check;
alter table public.ai_sources add constraint ai_sources_kind_check
    check (kind in ('note', 'document', 'url', 'faq', 'catalog', 'site_page'));

create index if not exists ai_sources_org_folder on public.ai_sources (organization_id, folder);

comment on table public.ai_sources is
    'Conhecimento da loja (era ai_agent_sources). Uma fonte e lida por N agentes via ai_source_agents; agent_id fica por um release como atalho das rotas antigas.';

-- A view com o nome antigo (security_invoker: a RLS de ai_sources vale para
-- quem consulta através dela). View simples sobre uma tabela aceita
-- INSERT/UPDATE/DELETE, então as rotas antigas seguem escrevendo.
create or replace view public.ai_agent_sources
    with (security_invoker = on)
    as select * from public.ai_sources;

grant select, insert, update, delete on public.ai_agent_sources to service_role;
grant select, insert, update, delete on public.ai_agent_sources to authenticated;
grant select                         on public.ai_agent_sources to worker_role;

-- ----------------------------------------------------------------------------
-- (c) ai_source_agents — "lida por"
-- ----------------------------------------------------------------------------
create table if not exists public.ai_source_agents (
    source_id       uuid not null references public.ai_sources (id) on delete cascade,
    agent_id        uuid not null references public.ai_agents (id) on delete cascade,
    organization_id uuid not null references public.organizations (id) on delete cascade,
    created_at      timestamptz not null default now(),
    primary key (source_id, agent_id)
);

create index if not exists ai_source_agents_agent on public.ai_source_agents (agent_id);

alter table public.ai_source_agents enable row level security;

create policy ai_source_agents_member_all on public.ai_source_agents
    for all to authenticated
    using (public.user_belongs_to_org(organization_id))
    with check (public.user_belongs_to_org(organization_id));

create policy ai_source_agents_worker_read on public.ai_source_agents
    for select to worker_role
    using (organization_id = public.current_app_organization_id());

grant select, insert, update, delete on public.ai_source_agents to authenticated;
grant select, insert, update, delete on public.ai_source_agents to service_role;
grant select                         on public.ai_source_agents to worker_role;

insert into public.ai_source_agents (source_id, agent_id, organization_id)
select s.id, s.agent_id, s.organization_id
  from public.ai_sources s
 where s.agent_id is not null
on conflict do nothing;

-- Rotas antigas ainda escrevem agent_id na fonte: o vínculo nasce junto.
create or replace function public.ai_sources_link_agent()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
as $$
begin
    if new.agent_id is not null then
        insert into public.ai_source_agents (source_id, agent_id, organization_id)
        values (new.id, new.agent_id, new.organization_id)
        on conflict do nothing;
    end if;
    return new;
end;
$$;

revoke execute on function public.ai_sources_link_agent() from public;

drop trigger if exists ai_sources_link_agent on public.ai_sources;
create trigger ai_sources_link_agent
    after insert or update of agent_id on public.ai_sources
    for each row execute function public.ai_sources_link_agent();

-- ----------------------------------------------------------------------------
-- (d) chunks tipados
-- ----------------------------------------------------------------------------
alter table public.ai_agent_chunks alter column agent_id drop not null;

alter table public.ai_agent_chunks
    add column if not exists chunk_kind text not null default 'text',
    add column if not exists position   integer;

alter table public.ai_agent_chunks drop constraint if exists ai_agent_chunks_chunk_kind_check;
alter table public.ai_agent_chunks add constraint ai_agent_chunks_chunk_kind_check
    check (chunk_kind in ('text', 'regra', 'resposta', 'atencao'));

create index if not exists ai_agent_chunks_source_kind
    on public.ai_agent_chunks (source_id, chunk_kind);

-- ----------------------------------------------------------------------------
-- (e) search_agent_knowledge pela M:N, com peso por chunk_kind
-- ----------------------------------------------------------------------------
create or replace function public.search_agent_knowledge(
    p_agent_id        uuid,
    p_organization_id uuid,
    p_query_embedding vector(1536),
    p_match_threshold float default 0.7,
    p_match_count     int   default 5
)
returns table (
    chunk_id   uuid,
    source_id  uuid,
    content    text,
    metadata   jsonb,
    similarity float
)
language plpgsql
security definer
set search_path = public
as $body$
begin
    return query
    select c.id as chunk_id,
           c.source_id,
           c.content,
           c.metadata || jsonb_build_object('chunk_kind', c.chunk_kind) as metadata,
           (1 - (c.embedding <=> p_query_embedding))::float as similarity
      from public.ai_agent_chunks c
     where c.organization_id = p_organization_id
       and c.embedding is not null
       and c.embedding_model = 'openai:text-embedding-3-small'
       and (1 - (c.embedding <=> p_query_embedding)) >= p_match_threshold
       and (
            c.agent_id = p_agent_id
            or exists (
                select 1 from public.ai_source_agents sa
                 where sa.source_id = c.source_id and sa.agent_id = p_agent_id
            )
       )
     order by (1 - (c.embedding <=> p_query_embedding))
              * (case when c.chunk_kind = 'resposta' then 1.3 else 1.0 end) desc
     limit p_match_count;
end;
$body$;

revoke execute on function public.search_agent_knowledge(uuid, uuid, vector, float, int) from public;
revoke execute on function public.search_agent_knowledge(uuid, uuid, vector, float, int) from anon;
revoke execute on function public.search_agent_knowledge(uuid, uuid, vector, float, int) from authenticated;
grant  execute on function public.search_agent_knowledge(uuid, uuid, vector, float, int) to service_role;

-- ----------------------------------------------------------------------------
-- (f) ai_knowledge_gaps
-- ----------------------------------------------------------------------------
create table if not exists public.ai_knowledge_gaps (
    id                uuid primary key default gen_random_uuid(),
    organization_id   uuid not null references public.organizations (id) on delete cascade,
    cluster_key       text,
    question          text not null,
    examples          jsonb not null default '[]'::jsonb,
    count             integer not null default 1,
    agent_ids         uuid[] not null default '{}'::uuid[],
    outcome           text not null default 'no_source'
                        check (outcome in ('transferred', 'answered_without_source', 'blocked', 'no_source')),
    conversation_id   uuid,
    suggested_answer  text,
    suggested_kind    text check (suggested_kind in ('note', 'faq', 'limit')),
    linked_source_id  uuid references public.ai_sources (id) on delete set null,
    status            text not null default 'open'
                        check (status in ('open', 'ignored_until', 'resolved')),
    ignored_until     timestamptz,
    safe              boolean not null default true,
    first_seen        timestamptz not null default now(),
    last_seen         timestamptz not null default now(),
    resolved_at       timestamptz
);

create index if not exists ai_knowledge_gaps_org_status
    on public.ai_knowledge_gaps (organization_id, status, last_seen desc);
create index if not exists ai_knowledge_gaps_cluster
    on public.ai_knowledge_gaps (organization_id, cluster_key) where cluster_key is not null;

alter table public.ai_knowledge_gaps enable row level security;

create policy ai_knowledge_gaps_member_all on public.ai_knowledge_gaps
    for all to authenticated
    using (public.user_belongs_to_org(organization_id))
    with check (public.user_belongs_to_org(organization_id));

-- O runtime emite e atualiza (contagem/last_seen) a lacuna da sua org.
create policy ai_knowledge_gaps_worker_scoped on public.ai_knowledge_gaps
    for all to worker_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());

grant select, insert, update, delete on public.ai_knowledge_gaps to authenticated;
grant select, insert, update, delete on public.ai_knowledge_gaps to service_role;
grant select, insert, update         on public.ai_knowledge_gaps to worker_role;

comment on table public.ai_knowledge_gaps is
    'Perguntas que o agente nao conseguiu responder com as fontes (emitidas pelo runtime, passo 20); agrupadas e sugeridas pela rotina diaria (passo 23).';
