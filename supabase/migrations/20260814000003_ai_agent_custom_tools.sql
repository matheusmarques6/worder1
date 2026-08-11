-- ============================================================================
-- 10.7 (Adendo §B, D7) — tool custom v1: a tabela.
--
-- A tool custom LÊ E CONSULTA, nunca concede — e a regra dupla começa no
-- schema: método só GET/POST, endpoint só https, nome nunca colide com uma
-- tool nativa (create_coupon em particular: o caminho do dinheiro tem UM
-- emissor). "Testar chamada obrigatório antes de ligar" também é CHECK:
-- enabled exige last_test_status = 'ok'.
--
-- auth_header_value guarda secret-box v2 OU plaintext legado — o mesmo codec
-- das chaves de provedor (o runtime decodifica com crypto/secret_box.py).
-- ============================================================================

create table public.ai_agent_custom_tools (
    id                uuid primary key default gen_random_uuid(),
    organization_id   uuid        not null references public.organizations (id) on delete cascade,
    name              text        not null
                          constraint custom_tools_name_slug
                          check (name ~ '^[a-z][a-z0-9_]{2,40}$'),
    label             text        not null,
    description       text        not null,
    when_to_use       text        not null,
    endpoint          text        not null
                          constraint custom_tools_https_only
                          check (endpoint like 'https://%'),
    method            text        not null default 'GET'
                          constraint custom_tools_read_only_methods
                          check (method in ('GET', 'POST')),
    auth_header_name  text        not null default 'Authorization',
    auth_header_value text,
    -- [{"name","type":"string|number|boolean","description","required":bool}]
    params            jsonb       not null default '[]'::jsonb,
    timeout_ms        integer     not null default 5000
                          check (timeout_ms between 500 and 10000),
    enabled           boolean     not null default false,
    last_test_status  text        check (last_test_status in ('ok', 'failed')),
    last_tested_at    timestamptz,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique (organization_id, name),
    constraint custom_tools_never_shadow_builtin check (
        name not in ('create_coupon', 'search_knowledge', 'transfer_to_human',
                     'save_customer', 'save_interests', 'timeline')
    ),
    constraint custom_tools_test_before_enable check (
        not enabled or last_test_status = 'ok'
    )
);

comment on table public.ai_agent_custom_tools is
    'Tools custom do lojista (10.7/D7): HTTP read-only no tool-loop. '
    'Nunca concede — dinheiro é do offer engine, sempre.';

create index custom_tools_org_enabled_idx
    on public.ai_agent_custom_tools (organization_id, enabled);

alter table public.ai_agent_custom_tools enable row level security;

create policy custom_tools_worker_scoped on public.ai_agent_custom_tools
    for select to worker_role
    using (organization_id = public.current_app_organization_id());

grant select on public.ai_agent_custom_tools to worker_role;
