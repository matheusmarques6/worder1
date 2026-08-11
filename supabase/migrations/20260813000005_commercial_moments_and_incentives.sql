-- ============================================================================
-- 20260813000005_commercial_moments_and_incentives.sql
-- Etapa 5 (doc-fonte §3.3.4–3.3.6): a verdade comercial com validade e a
-- concessão auditável.
--
--   * commercial_moments — o que é verdade AGORA na loja (janela por relógio;
--     "ativo" é COMPUTADO: approved + now() na janela + não morto — nunca
--     gravado, nunca no RAG).
--   * incentive_grants — a autorização numerada de benefício. SÓ o
--     offer_engine escreve; a corrida entre dois fluxos morre na
--     idempotency_key UNIQUE (o 2º INSERT conflita e recebe o grant do 1º).
--   * incentive_ledger — a história, append-only de verdade (trigger bloqueia
--     UPDATE; DELETE fica para o purge LGPD via cascade de contato/org).
--
-- Invariantes §3.4: offer_engine único emissor; concession limita a EMISSÃO;
-- a tool valida o GRANT (nunca a missão do turno — reuso legítimo não quebra).
-- ============================================================================

create table public.commercial_moments (
    id                 uuid primary key default gen_random_uuid(),
    organization_id    uuid        not null references public.organizations (id) on delete cascade,
    -- Polimórfica por provedor (shopify_stores hoje, nuvemshop depois) — o
    -- mesmo padrão de outbox.channel_account_id. NULL = a loja toda.
    store_id           uuid,
    name               text        not null,
    starts_at          timestamptz not null,
    ends_at            timestamptz not null,
    -- A frase que a IA PODE afirmar. Fora daqui, momento não vira promessa.
    public_claim       text,
    -- {kind: none|percent|fixed|free_shipping, value, coupon_code?, auto_apply}
    offer              jsonb       not null default '{"kind": "none"}'::jsonb,
    -- Exclusões verificáveis por código (ex.: {collections: [...], min_value: ...})
    exclusions         jsonb       not null default '{}'::jsonb,
    -- Fatos que só valem na janela (["frete grátis acima de R$99 até domingo"])
    temp_facts         jsonb       not null default '[]'::jsonb,
    forbidden          text[]      not null default '{}'::text[],
    -- Sobrepostos: fatos SOMAM, postura promocional é UMA (maior prioridade).
    priority           integer     not null default 0,
    -- Por canal: {"whatsapp": {"template_name": ..., "language": ..., "status": "approved"}}.
    -- Verificado na ativação E no preflight de cada envio (falha → alerta +
    -- supressão do outbound do momento naquele canal).
    template_readiness jsonb       not null default '{}'::jsonb,
    status             text        not null default 'draft'
                           check (status in ('draft', 'approved', 'killed')),
    -- Kill switch vence a janela: matou, morreu, mesmo com ends_at no futuro.
    killed_at          timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    check (ends_at > starts_at)
);

comment on table public.commercial_moments is
    'Verdade comercial com validade (§3.3.4). Ativo é computado: approved AND now() BETWEEN starts_at AND ends_at AND killed_at IS NULL. Nunca entra no RAG.';

create index commercial_moments_active_idx
    on public.commercial_moments (organization_id, priority desc, starts_at)
    where status = 'approved' and killed_at is null;

create trigger commercial_moments_touch
    before update on public.commercial_moments
    for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- incentive_grants — a autorização numerada (o grant_id que a tool exige)
-- ----------------------------------------------------------------------------
create table public.incentive_grants (
    id                 uuid primary key default gen_random_uuid(),
    organization_id    uuid        not null references public.organizations (id) on delete cascade,
    store_id           uuid,
    contact_id         uuid        not null references public.contacts (id) on delete cascade,
    conversation_id    uuid        references public.conversations (id) on delete set null,
    object_kind        text        not null check (object_kind in ('cart', 'checkout', 'order')),
    object_ref         text        not null,
    source             text        not null check (source in ('mission', 'moment')),
    mission_version_id uuid        references public.ai_missions (id) on delete set null,
    moment_id          uuid        references public.commercial_moments (id) on delete set null,
    node_ref           text,
    kind               text        not null check (kind in ('percent', 'fixed', 'free_shipping')),
    value              numeric(12, 2) not null default 0,
    validity_until     timestamptz not null,
    max_uses           integer     not null default 1 check (max_uses >= 1),
    uses               integer     not null default 0 check (uses >= 0),
    status             text        not null default 'issued'
                           check (status in ('issued', 'consumed', 'expired', 'revoked')),
    -- O código de verdade no provedor, gravado pela tool DEPOIS do grant —
    -- reuso legítimo precisa dele. Determinístico a partir do id (retry seguro).
    coupon_code        text,
    -- org:contact:object_kind:object_ref:kind — dois fluxos pedindo o mesmo
    -- benefício para o mesmo objeto recebem O MESMO grant.
    idempotency_key    text        not null unique,
    created_at         timestamptz not null default now()
);

comment on table public.incentive_grants is
    'Autorização numerada de benefício (§3.3.5). Só o offer_engine escreve. A validação da tool é contra O GRANT (existe, não expirou, não consumiu, contato+objeto certos, valor bate) — nunca contra a concession da missão do turno.';

-- Quem autorizou tem que existir na linha: missão OU momento, conforme source.
alter table public.incentive_grants add constraint incentive_grants_source_ref check (
    (source = 'mission' and mission_version_id is not null)
    or (source = 'moment' and moment_id is not null)
);

create index incentive_grants_reuse_idx
    on public.incentive_grants (organization_id, contact_id, status, validity_until);

-- ----------------------------------------------------------------------------
-- incentive_ledger — a história (append-only)
-- ----------------------------------------------------------------------------
create table public.incentive_ledger (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid        not null references public.organizations (id) on delete cascade,
    contact_id      uuid        not null references public.contacts (id) on delete cascade,
    entry_kind      text        not null
                        check (entry_kind in ('issued', 'reused', 'denied',
                                              'consumed', 'expired', 'revoked')),
    -- 'denied' não tem grant — a negativa também é história.
    grant_id        uuid        references public.incentive_grants (id) on delete set null,
    reason          text        not null,
    created_at      timestamptz not null default now()
);

comment on table public.incentive_ledger is
    'História da concessão (§3.3.6): entra no bloco de estado do prompt e na timeline do contato. Append-only por trigger; DELETE só via purge LGPD (cascade).';

create index incentive_ledger_timeline_idx
    on public.incentive_ledger (organization_id, contact_id, created_at desc);

create function internal.forbid_ledger_update()
    returns trigger
    language plpgsql
as $$
begin
    raise exception 'incentive_ledger é append-only: a história não se reescreve';
end
$$;

create trigger incentive_ledger_append_only
    before update on public.incentive_ledger
    for each row execute function internal.forbid_ledger_update();

-- ----------------------------------------------------------------------------
-- Grants + RLS — tudo nasce trancado
-- ----------------------------------------------------------------------------
-- Worker: lê momentos no turno; o engine (dentro do worker) escreve grants e
-- ledger. Ledger sem UPDATE/DELETE nem por grant. Sender não lê nada disso
-- direto (o preflight é SECURITY DEFINER). Hub lê pela Data API (authenticated)
-- e escreve pelos endpoints do app (service_role).
grant select                 on public.commercial_moments to worker_role, authenticated;
grant select, insert, update on public.incentive_grants   to worker_role;
grant select                 on public.incentive_grants   to authenticated;
grant select, insert         on public.incentive_ledger   to worker_role;
grant select                 on public.incentive_ledger   to authenticated;

alter table public.commercial_moments enable row level security;
alter table public.incentive_grants   enable row level security;
alter table public.incentive_ledger   enable row level security;

create policy moments_member_read on public.commercial_moments
    for select to authenticated
    using (public.user_belongs_to_org(organization_id));

create policy moments_worker_read on public.commercial_moments
    for select to worker_role
    using (organization_id = public.current_app_organization_id());

create policy grants_member_read on public.incentive_grants
    for select to authenticated
    using (public.user_belongs_to_org(organization_id));

create policy grants_worker_scoped on public.incentive_grants
    for all to worker_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());

create policy ledger_member_read on public.incentive_ledger
    for select to authenticated
    using (public.user_belongs_to_org(organization_id));

create policy ledger_worker_scoped on public.incentive_ledger
    for all to worker_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());
