-- ============================================================================
-- 20260813000001_ai_missions.sql
-- O catálogo de missões por evento (doc §3.3.3) — append-only no padrão local
-- de ai_agent_versions: versões nunca são editadas em produção; ativar cria
-- linha nova e arquiva a anterior (a API faz isso; o índice parcial garante).
--
-- event_type NÃO é enum fechado (1ª leva: cart.abandoned, checkout.abandoned,
-- whatsapp.received, order.fulfilled, payment.pix.abandoned,
-- payment.boleto.abandoned). `concession` limita a EMISSÃO de benefício
-- (offer engine); a tool valida o GRANT, nunca a concession do turno.
-- ============================================================================

create table public.ai_missions (
    id                 uuid primary key default gen_random_uuid(),
    organization_id    uuid        not null references public.organizations (id) on delete cascade,
    store_id           uuid,       -- reservado; v1 sempre NULL
    event_type         text        not null,
    parent_version_id  uuid        references public.ai_missions (id) on delete set null,
    status             text        not null default 'draft'
                           check (status in ('draft', 'active', 'archived')),
    origin             text        not null default 'lojista'
                           check (origin in ('worder_default', 'lojista', 'flywheel')),
    situation          text,
    objective          text        not null,
    success_criteria   text,
    failure_criteria   text,
    context_fields     jsonb       not null default '[]'::jsonb,
    enabled_tools      text[]      not null default '{}'::text[],
    forbidden          text[]      not null default '{}'::text[],
    max_turns          integer     not null default 3,
    topic_change_policy text       not null default 'cede'
                           check (topic_change_policy in ('cede', 'insiste', 'transfere')),
    promote_moment     boolean     not null default false,
    concession         jsonb       not null default '{"kind": "none"}'::jsonb,
    tone_delta         text,
    change_summary     text,
    created_at         timestamptz not null default now(),
    activated_at       timestamptz
);

-- UM active por família (organization_id, event_type). O resolver depende
-- disto para ser determinístico; a API de ativação arquiva-e-ativa na mesma
-- transação e este índice transforma corrida em erro, não em duas ativas.
create unique index ai_missions_one_active_per_family
    on public.ai_missions (organization_id, event_type)
    where status = 'active';

create index ai_missions_family_idx
    on public.ai_missions (organization_id, event_type, created_at desc);

-- A dona do turno em conversations agora tem FK (expand da Etapa 2, onde a
-- coluna nasceu sem alvo). ON DELETE SET NULL: apagar história de missão não
-- pode derrubar conversas.
alter table public.conversations
    add constraint conversations_owner_mission_fk
    foreign key (owner_mission_version_id)
    references public.ai_missions (id) on delete set null;

-- ----------------------------------------------------------------------------
-- Grants + RLS. Escrita é do app server (service_role, via API com org da
-- sessão); o runtime só LÊ (resolver); o lojista lê pela Data API.
-- ----------------------------------------------------------------------------
grant select on public.ai_missions to worker_role;
grant select on public.ai_missions to authenticated;

alter table public.ai_missions enable row level security;

create policy ai_missions_member_read on public.ai_missions
    for select to authenticated
    using (public.user_belongs_to_org(organization_id));

create policy ai_missions_worker_read on public.ai_missions
    for select to worker_role
    using (organization_id = public.current_app_organization_id());
