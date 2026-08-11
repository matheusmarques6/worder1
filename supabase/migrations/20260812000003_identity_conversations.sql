-- ============================================================================
-- 20260812000003_identity_conversations.sql
-- Identidade agnóstica de canal (doc §3.3.1–2, Etapa 2):
--   * public.conversations  — canônica; contadores, lease+CAS, generation
--   * public.messages       — UNIQUE (conversation_id, direction, seq)
--   * public.channel_identities — quem é a pessoa em cada canal
--   * public.alerts         — alertas genéricos org-scoped (whatsapp_alerts
--                             segue intocada; esta é a trilha do runtime)
--   * public.ai_runtime_rollout — flag de migração por org (D3)
--   * internal.message_outbox   — nada chega ao canal exceto por aqui
--
-- Adaptações declaradas vs o motor (runtime/FORK.md):
--   tenant_id→organization_id; sem channels_accounts (o canal resolve por
--   channel_identities + contas por canal); status open|human|closed no lugar
--   de ia|humano|encerrada; sem origin_occasion/slots (contexto vem da
--   missão); + owner_mission_version_id, last_channel, last_inbound_at
--   (janela 24h); TTL de messages fixo em 24 meses (organizations não tem
--   retention_months — knob por org é roadmap).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- conversations
-- ----------------------------------------------------------------------------
create table public.conversations (
    id                       uuid primary key default gen_random_uuid(),
    organization_id          uuid        not null references public.organizations (id) on delete cascade,
    store_id                 uuid,       -- reservado; v1 sempre NULL (escopo da org)
    contact_id               uuid        not null references public.contacts (id) on delete cascade,
    status                   text        not null default 'open'
                                 check (status in ('open', 'human', 'closed')),
    -- Dona do turno; trocada pelo resolver, nunca pelo modelo. FK para
    -- ai_missions chega com a tabela (Etapa 3, expand-contract).
    owner_mission_version_id uuid,
    -- Deadline do debounce. Mensagem nova empurra; só o coalescer limpa.
    pending_response_at      timestamptz,
    last_processed_seq       integer     not null default 0,
    next_inbound_seq         integer     not null default 0,
    next_outbound_seq        integer     not null default 0,
    -- Bump SOMENTE pelo coalescer, dentro da transação única dele.
    processing_generation    integer     not null default 0,
    processing_token         uuid,
    processing_until         timestamptz,
    version                  integer     not null default 0,
    last_channel             text        check (last_channel in ('whatsapp', 'email', 'instagram')),
    last_inbound_at          timestamptz,
    takeover_user_id         uuid        references auth.users (id),
    takeover_at              timestamptz,
    closed_at                timestamptz,
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now(),
    -- Lease pela metade é bug de quem escreveu — e faria a condição de claim
    -- (processing_until < now()) ler "livre" com um token ainda apontando dono.
    constraint conversations_lease_is_whole
        check ((processing_token is null) = (processing_until is null))
);

-- Uma conversa canônica por pessoa por org (agnóstica de canal): é o fio da
-- pessoa; canais entram e saem por channel_identities/last_channel.
create unique index conversations_org_contact_uniq
    on public.conversations (organization_id, contact_id);

-- O scan do coalescer, a cada 2s. Parcial: a maioria não espera deadline.
create index conversations_pending_idx on public.conversations (pending_response_at)
    where pending_response_at is not null;

create trigger conversations_touch_updated_at
    before update on public.conversations
    for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- internal.message_outbox
-- ----------------------------------------------------------------------------
create table internal.message_outbox (
    id                  uuid primary key default gen_random_uuid(),
    organization_id     uuid        not null references public.organizations (id) on delete cascade,
    -- Nullable: um toque de funil pode preceder a conversa que vai abrir.
    conversation_id     uuid        references public.conversations (id) on delete cascade,
    contact_id          uuid        not null references public.contacts (id) on delete cascade,
    channel             text        not null default 'whatsapp'
                            check (channel in ('whatsapp', 'email', 'instagram')),
    -- Conta do canal (whatsapp → whatsapp_business_accounts.id). Sem FK por
    -- ser polimórfica por canal; o sender resolve e valida.
    channel_account_id  uuid,
    kind                text        not null
                            check (kind in ('reply', 'funnel_touch', 'followup', 'correction')),
    payload             jsonb       not null,
    -- Determinística; viaja em biz_opaque_callback_data para correlacionar o
    -- webhook de status de volta a esta linha.
    idempotency_key     text        not null unique,
    payload_hash        text,
    -- IDs de momento que o preflight do sender re-checa (template_readiness).
    moment_ids          uuid[]      not null default '{}'::uuid[],
    status              text        not null default 'pending'
                            check (status in ('pending', 'sending', 'sent', 'failed',
                                              'unknown', 'manual_review')),
    attempt_count       integer     not null default 0,
    next_attempt_at     timestamptz not null default now(),
    locked_by           text,
    locked_until        timestamptz,
    request_started_at  timestamptz,
    last_error          text,
    provider_message_id text,
    created_at          timestamptz not null default now(),
    sent_at             timestamptz
);

create index message_outbox_claim_idx on internal.message_outbox (status, next_attempt_at);

-- ----------------------------------------------------------------------------
-- messages
-- ----------------------------------------------------------------------------
create table public.messages (
    id                  uuid primary key default gen_random_uuid(),
    organization_id     uuid        not null references public.organizations (id) on delete cascade,
    conversation_id     uuid        not null references public.conversations (id) on delete cascade,
    direction           text        not null check (direction in ('inbound', 'outbound')),
    seq                 integer     not null check (seq > 0),
    channel             text        not null
                            check (channel in ('whatsapp', 'email', 'instagram')),
    author_type         text        not null check (author_type in ('contact', 'agent', 'human')),
    author_user_id      uuid        references auth.users (id),
    content             jsonb       not null,
    provider_message_id text,
    outbox_id           uuid        references internal.message_outbox (id) on delete set null,
    -- TTL rolante (LGPD), preenchido pelo trigger. 24 meses fixo no v1.
    expires_at          timestamptz not null,
    created_at          timestamptz not null default now(),
    -- A restrição que torna seq duplicado impossível, não só improvável.
    unique (conversation_id, direction, seq)
);

create index messages_expiry_idx on public.messages (expires_at);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

-- Dedup de espelho: o mesmo wamid nunca entra duas vezes na canônica.
create unique index messages_provider_message_id_uniq
    on public.messages (provider_message_id)
    where provider_message_id is not null;

create function public.set_message_expiry()
    returns trigger
    language plpgsql
    set search_path = pg_catalog, public
as $$
begin
    if new.expires_at is null then
        -- Constante v1 (roadmap: knob por org). 24 meses cobre o teto LGPD
        -- praticado no produto.
        new.expires_at := now() + interval '24 months';
    end if;
    return new;
end
$$;

create trigger messages_set_expiry
    before insert on public.messages
    for each row execute function public.set_message_expiry();

-- ----------------------------------------------------------------------------
-- channel_identities
-- ----------------------------------------------------------------------------
create table public.channel_identities (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid        not null references public.organizations (id) on delete cascade,
    contact_id      uuid        not null references public.contacts (id) on delete cascade,
    channel         text        not null check (channel in ('whatsapp', 'email', 'instagram')),
    -- E.164 / e-mail normalizado / IGSID
    external_id     text        not null,
    created_at      timestamptz not null default now(),
    unique (organization_id, channel, external_id)
);

create index channel_identities_contact_idx on public.channel_identities (contact_id);

-- ----------------------------------------------------------------------------
-- alerts (genérica do runtime; organization_id NULL = alerta de plataforma,
-- invisível a qualquer lojista)
-- ----------------------------------------------------------------------------
create table public.alerts (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid        references public.organizations (id) on delete cascade,
    type            text        not null
                        check (type in ('critical_violation', 'no_active_mission',
                                        'no_org_llm_key', 'window_closed_no_template',
                                        'moment_template_not_ready', 'judge_blocked',
                                        'send_failed', 'mission_touch_failed', 'handoff')),
    severity        text        not null default 'warning'
                        check (severity in ('info', 'warning', 'critical')),
    title           text        not null,
    body            text,
    metadata        jsonb       not null default '{}'::jsonb,
    dedup_key       text,
    status          text        not null default 'open'
                        check (status in ('open', 'acknowledged', 'resolved')),
    acknowledged_at timestamptz,
    acknowledged_by uuid,
    resolved_at     timestamptz,
    created_at      timestamptz not null default now()
);

create index alerts_org_created_idx on public.alerts (organization_id, created_at desc);

-- Mesmo problema aberto nunca duplica (padrão do whatsapp_alerts local).
create unique index alerts_dedup_uniq on public.alerts (organization_id, dedup_key)
    where dedup_key is not null and status = 'open';

-- ----------------------------------------------------------------------------
-- ai_runtime_rollout — a flag de migração por loja (D3). Uma conversa nunca
-- está nos dois mecanismos: o webhook lê isto para decidir QStash × coalescer.
-- ----------------------------------------------------------------------------
create table public.ai_runtime_rollout (
    organization_id uuid primary key references public.organizations (id) on delete cascade,
    store_id        uuid,       -- reservado; v1 sempre NULL
    mode            text        not null default 'legacy'
                        check (mode in ('legacy', 'runtime')),
    migrated_at     timestamptz,
    notes           text,
    updated_at      timestamptz not null default now()
);

create trigger ai_runtime_rollout_touch_updated_at
    before update on public.ai_runtime_rollout
    for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Grants — o role ganha o privilégio, a RLS faz o escopo
-- ----------------------------------------------------------------------------
grant select, insert, update on public.conversations      to worker_role;
grant select, insert         on public.messages           to worker_role;
grant select, insert         on public.channel_identities to worker_role;
grant select, insert         on public.alerts             to worker_role;
grant select                 on public.ai_runtime_rollout to worker_role;
-- Cria envio; nunca executa um.
grant select, insert         on internal.message_outbox   to worker_role;

-- O sender executa: drena a outbox (via claim SECURITY DEFINER), checa
-- janela/opt-out, alerta. Não escreve em messages (espelho do inbox é em
-- whatsapp_cloud_messages, Etapa 4).
grant select, update         on internal.message_outbox   to sender_role;
grant select                 on public.conversations      to sender_role;
grant select, insert         on public.alerts             to sender_role;
grant select                 on public.contacts           to sender_role;

-- Hub lê pela Data API como authenticated; RLS escopa por organização.
grant select on public.conversations, public.messages, public.channel_identities,
                public.alerts, public.ai_runtime_rollout to authenticated;

revoke all on all tables in schema internal from anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- RLS — todas as tabelas novas nascem trancadas
-- ----------------------------------------------------------------------------
alter table public.conversations      enable row level security;
alter table public.messages           enable row level security;
alter table public.channel_identities enable row level security;
alter table public.alerts             enable row level security;
alter table public.ai_runtime_rollout enable row level security;
alter table internal.message_outbox   enable row level security;

create policy conversations_member_read on public.conversations
    for select to authenticated
    using (public.user_belongs_to_org(organization_id));

create policy conversations_worker_scoped on public.conversations
    for all to worker_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());

create policy conversations_sender_read on public.conversations
    for select to sender_role
    using (organization_id = public.current_app_organization_id());

create policy messages_member_read on public.messages
    for select to authenticated
    using (public.user_belongs_to_org(organization_id));

create policy messages_worker_scoped on public.messages
    for all to worker_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());

create policy channel_identities_member_read on public.channel_identities
    for select to authenticated
    using (public.user_belongs_to_org(organization_id));

create policy channel_identities_worker_scoped on public.channel_identities
    for all to worker_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());

-- Alertas de plataforma (org NULL) não aparecem para NINGUÉM via Data API.
create policy alerts_member_read on public.alerts
    for select to authenticated
    using (organization_id is not null and public.user_belongs_to_org(organization_id));

create policy alerts_app_scoped on public.alerts
    for all to worker_role, sender_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());

create policy rollout_member_read on public.ai_runtime_rollout
    for select to authenticated
    using (public.user_belongs_to_org(organization_id));

create policy rollout_worker_read on public.ai_runtime_rollout
    for select to worker_role
    using (organization_id = public.current_app_organization_id());

create policy outbox_worker_scoped on internal.message_outbox
    for all to worker_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());

create policy outbox_sender_scoped on internal.message_outbox
    for all to sender_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());
