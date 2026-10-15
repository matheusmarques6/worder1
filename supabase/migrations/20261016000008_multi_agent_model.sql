-- ============================================================================
-- 20261016000008_multi_agent_model.sql
-- Plano de implementação IA (2026-10-15), M2 passo 13 — modelo multiagente.
--
-- O protótipo tem vários agentes por loja, cada um ligado a ENTRADAS (número
-- de WhatsApp, toques de fluxo), e cada missão pertence a um agente. Hoje o
-- banco permite um agente ativo por org (ai_agents_single_active_per_org) e
-- o runtime escolhe "o agente ativo da org". Esta migration muda o modelo
-- de dados sem mudar comportamento: o runtime continua resolvendo pelo
-- agente ativo até o passo 14 (load_agent_for_entry) e a API continua
-- recusando dois ativos até o passo 15 — por isso o índice único cai aqui
-- (schema) mas o guard de código fica, e nada muda para a org piloto.
--
-- (a) ai_agents.role e ai_agents.status
--     status ('draft' | 'active' | 'paused') é a nova fonte; is_active fica
--     por um release como ESPELHO mantido por trigger nas duas direções:
--       - quem escreve status (UI nova, passo 16) vê is_active acompanhar;
--       - quem escreve is_active (rotas atuais, runtime, factories) vê status
--         virar active/paused.
--     Uma coluna gerada quebraria todo INSERT/UPDATE que ainda escreve
--     is_active (route.ts, factories dos testes db) — o espelho por trigger
--     deixa os dois mundos conviverem até o M7, quando is_active some.
--     Backfill: is_active → active, senão paused (nunca draft: um agente
--     que já existe foi configurado por alguém).
--
-- (b) ai_agent_entries — onde o agente atua
--     kind 'whatsapp_account' (ref_id = whatsapp_business_accounts.id) ou
--     'flow_touch' (ref_id = id do nó/fluxo que aponta para uma missão do
--     agente). Índice único parcial: uma entrada ativa por (org, kind, ref)
--     — dois agentes nunca disputam o mesmo número. Backfill: o agente
--     ativo de cada org ganha uma entrada por conta WhatsApp da org.
--
-- (c) ai_missions.agent_id — missão pertence a um agente
--     Backfill com o agente ativo da org (ou o único agente, se nenhum
--     ativo). Fica NULLABLE por um release: missões de org sem agente
--     continuam válidas e o resolver ignora a coluna até o passo 14.
--     O índice one-active por (organization_id, event_type) permanece.
--
-- (d) conversations.agent_id — quem atendeu
--     Preenchido pelo runtime no conclude_turn a partir do passo 14. A view
--     ai_runtime_activity passa a expor agent_id e agent_name. Recriada
--     com DROP + CREATE (coluna nova no meio muda a forma da view).
--
-- (e) seed_default_missions(p_org, p_agent) — overload que semeia já
--     ligado a um agente; a versão de um argumento continua existindo e
--     chama a nova com agent = agente ativo da org (ou NULL).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (a) role, status e o espelho de is_active
-- ----------------------------------------------------------------------------
alter table public.ai_agents
    add column if not exists role   text,
    add column if not exists status text
        check (status in ('draft', 'active', 'paused'));

update public.ai_agents
   set status = case when coalesce(is_active, false) then 'active' else 'paused' end
 where status is null;

alter table public.ai_agents alter column status set not null;
alter table public.ai_agents alter column status set default 'draft';
-- O default antigo de is_active era `true` — justamente o estado que um
-- agente recém-criado nunca deve ter no modelo novo (nasce rascunho).
alter table public.ai_agents alter column is_active set default false;

create or replace function public.ai_agents_sync_status_is_active()
    returns trigger
    language plpgsql
as $$
begin
    if tg_op = 'INSERT' then
        -- Quem manda status manda; quem só manda is_active=true (rotas
        -- atuais) ganha 'active'; o resto nasce 'draft'.
        if new.status is null or new.status = 'draft' then
            new.status := case when coalesce(new.is_active, false) then 'active' else 'draft' end;
        end if;
        new.is_active := (new.status = 'active');
        return new;
    end if;

    if new.status is distinct from old.status then
        new.is_active := (new.status = 'active');
    elsif new.is_active is distinct from old.is_active then
        new.status := case when coalesce(new.is_active, false) then 'active' else 'paused' end;
    end if;
    return new;
end;
$$;

drop trigger if exists ai_agents_sync_status_is_active on public.ai_agents;
create trigger ai_agents_sync_status_is_active
    before insert or update of status, is_active on public.ai_agents
    for each row execute function public.ai_agents_sync_status_is_active();

comment on column public.ai_agents.status is
    'draft | active | paused. Fonte da verdade desde 2026-10-16; is_active e espelho por trigger ate o M7.';
comment on column public.ai_agents.role is
    'Funcao do agente como o lojista a descreve (ex.: "Vendas no WhatsApp", "Pos-compra").';

-- O índice único "um ativo por org" sai do schema (vários agentes ativos
-- por loja é o modelo novo). O guard de código das rotas continua até o
-- passo 15, então nenhuma org muda de comportamento com esta migration.
drop index if exists public.ai_agents_single_active_per_org;

-- ----------------------------------------------------------------------------
-- (b) ai_agent_entries
-- ----------------------------------------------------------------------------
create table if not exists public.ai_agent_entries (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete cascade,
    agent_id        uuid not null references public.ai_agents (id) on delete cascade,
    kind            text not null check (kind in ('whatsapp_account', 'flow_touch')),
    ref_id          uuid not null,
    active          boolean not null default true,
    created_at      timestamptz not null default now()
);

create unique index if not exists ai_agent_entries_one_active_per_ref
    on public.ai_agent_entries (organization_id, kind, ref_id) where active;

create index if not exists ai_agent_entries_agent
    on public.ai_agent_entries (agent_id);

comment on table public.ai_agent_entries is
    'Onde um agente atua: whatsapp_account (ref_id = whatsapp_business_accounts.id) ou flow_touch (ref_id = no de fluxo). Uma entrada ativa por (org, kind, ref).';

alter table public.ai_agent_entries enable row level security;

create policy ai_agent_entries_member_all on public.ai_agent_entries
    for all to authenticated
    using (public.user_belongs_to_org(organization_id))
    with check (public.user_belongs_to_org(organization_id));

create policy ai_agent_entries_worker_read on public.ai_agent_entries
    for select to worker_role
    using (organization_id = public.current_app_organization_id());

grant select, insert, update, delete on public.ai_agent_entries to authenticated;
grant select                         on public.ai_agent_entries to worker_role;
grant select, insert, update, delete on public.ai_agent_entries to service_role;

-- Backfill: o agente ativo de cada org passa a atuar em toda conta WhatsApp
-- da org. Orgs sem agente ativo ou sem conta não ganham linha.
insert into public.ai_agent_entries (organization_id, agent_id, kind, ref_id)
select w.organization_id, a.id, 'whatsapp_account', w.id
  from public.whatsapp_business_accounts w
  join public.ai_agents a
    on a.organization_id = w.organization_id and a.status = 'active'
 where not exists (
        select 1 from public.ai_agent_entries e
         where e.organization_id = w.organization_id
           and e.kind = 'whatsapp_account' and e.ref_id = w.id and e.active
       )
   and (select count(*) from public.ai_agents x
         where x.organization_id = w.organization_id and x.status = 'active') = 1;

-- ----------------------------------------------------------------------------
-- (c) ai_missions.agent_id
-- ----------------------------------------------------------------------------
alter table public.ai_missions
    add column if not exists agent_id uuid references public.ai_agents (id) on delete set null;

create index if not exists ai_missions_agent
    on public.ai_missions (agent_id) where agent_id is not null;

update public.ai_missions m
   set agent_id = pick.id
  from (
        select distinct on (organization_id) organization_id, id
          from public.ai_agents
         order by organization_id, (status = 'active') desc, created_at
       ) pick
 where m.agent_id is null
   and pick.organization_id = m.organization_id;

comment on column public.ai_missions.agent_id is
    'Agente dono da missao. NULL so em org sem agente; o resolver passa a filtrar por agente no passo 14.';

-- ----------------------------------------------------------------------------
-- (d) conversations.agent_id + ai_runtime_activity
-- ----------------------------------------------------------------------------
alter table public.conversations
    add column if not exists agent_id uuid references public.ai_agents (id) on delete set null;

create index if not exists conversations_agent
    on public.conversations (organization_id, agent_id, created_at desc)
    where agent_id is not null;

comment on column public.conversations.agent_id is
    'Agente que atende a conversa; gravado pelo runtime em conclude_turn (passo 14). Transferir para outro agente = trocar esta coluna.';

drop view if exists public.ai_runtime_activity;
create view public.ai_runtime_activity as
select c.id                       as conversation_id,
       c.organization_id,
       c.contact_id,
       c.last_channel,
       c.last_inbound_at,
       c.created_at,
       c.agent_id,
       ag.name                    as agent_name,
       c.owner_mission_version_id as mission_version_id,
       m.event_type               as mission_event_type,
       m.objective                as mission_objective,
       calls.llm_calls,
       calls.cost_usd,
       tools.tool_calls,
       judge.verdict              as last_judge_verdict,
       judge.score                as last_judge_score
  from public.conversations c
  left join public.ai_agents ag on ag.id = c.agent_id
  left join public.ai_missions m on m.id = c.owner_mission_version_id
  left join lateral (
      select count(*)::integer as llm_calls, sum(l.cost_usd) as cost_usd
        from internal.llm_calls l
       where l.conversation_id = c.id
  ) calls on true
  left join lateral (
      select count(*)::integer as tool_calls
        from internal.tool_calls t
       where t.conversation_id = c.id
  ) tools on true
  left join lateral (
      select j.verdict, j.score
        from internal.judge_scores j
       where j.conversation_id = c.id
       order by j.created_at desc
       limit 1
  ) judge on true;

alter view public.ai_runtime_activity set (security_invoker = off);

comment on view public.ai_runtime_activity is
    'Trilha unica (9.4): uma linha por conversa do runtime com agente, missao dona, custo somado e o ultimo veredito do Judge. Leitura so via service_role.';

revoke all on public.ai_runtime_activity from public, anon, authenticated;
grant select on public.ai_runtime_activity to service_role;

-- ----------------------------------------------------------------------------
-- (e) seed_default_missions(p_org, p_agent)
-- ----------------------------------------------------------------------------
create or replace function public.seed_default_missions(p_organization_id uuid, p_agent_id uuid)
    returns integer
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_inserted integer := 0;
    v_row record;
begin
    if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
        raise exception 'org % não existe', p_organization_id;
    end if;
    if p_agent_id is not null and not exists (
        select 1 from public.ai_agents a
         where a.id = p_agent_id and a.organization_id = p_organization_id
    ) then
        raise exception 'agente % não pertence à org %', p_agent_id, p_organization_id;
    end if;

    for v_row in
        select * from (values
            ('whatsapp.received',
             'Um contato mandou mensagem espontânea no WhatsApp da loja.',
             'classificar a intenção e ajudar — vender, suportar ou encaminhar, no viés da loja',
             'a pessoa teve a dúvida resolvida ou avançou para compra',
             'a pessoa desistiu sem resposta ou pediu humano e não foi transferida',
             '{"kind": "none"}'::jsonb, false, 5),
            ('cart.abandoned',
             'O contato deixou itens no carrinho e saiu sem finalizar.',
             'recuperar a compra sem parecer cobrança',
             'checkout finalizado a partir do link do carrinho',
             'pediu para não receber mais este tipo de mensagem',
             '{"kind": "none"}'::jsonb, true, 3),
            ('checkout.abandoned',
             'O contato chegou ao checkout e não concluiu o pagamento.',
             'recuperar a compra sem parecer cobrança',
             'pagamento concluído',
             'pediu para não receber mais este tipo de mensagem',
             '{"kind": "none"}'::jsonb, true, 3),
            ('order.fulfilled',
             'O pedido do contato foi enviado.',
             'responder status com dado real; resolver sem vender',
             'a pessoa ficou tranquila quanto à entrega',
             'a conversa virou reclamação sem resposta',
             '{"kind": "none"}'::jsonb, false, 2),
            ('payment.pix.abandoned',
             'O contato gerou um Pix e não pagou.',
             'reenviar o código e destravar o pagamento',
             'pagamento confirmado',
             'a pessoa pediu cancelamento',
             '{"kind": "none"}'::jsonb, false, 2),
            ('payment.boleto.abandoned',
             'O contato gerou um boleto e não pagou.',
             'reenviar o código e destravar o pagamento',
             'pagamento confirmado',
             'a pessoa pediu cancelamento',
             '{"kind": "none"}'::jsonb, false, 2)
        ) as seeds(event_type, situation, objective, success_criteria,
                   failure_criteria, concession, promote_moment, max_turns)
    loop
        -- Idempotente por (org, agente, família): um segundo agente da mesma
        -- org pode receber as suas próprias missões de seed.
        if not exists (
            select 1 from public.ai_missions m
             where m.organization_id = p_organization_id
               and m.event_type = v_row.event_type
               and m.agent_id is not distinct from p_agent_id
        ) then
            insert into public.ai_missions
                (organization_id, agent_id, event_type, status, origin, situation, objective,
                 success_criteria, failure_criteria, concession, promote_moment,
                 max_turns, change_summary)
            values
                (p_organization_id, p_agent_id, v_row.event_type, 'draft', 'worder_default',
                 v_row.situation, v_row.objective, v_row.success_criteria,
                 v_row.failure_criteria, v_row.concession, v_row.promote_moment,
                 v_row.max_turns,
                 'seed v0 (PENDENTE-2: copy de dev, revisar antes de ativar)');
            v_inserted := v_inserted + 1;
        end if;
    end loop;

    return v_inserted;
end
$$;

-- A versão de um argumento vira atalho: semeia para o agente ativo da org
-- (ou sem agente, se a org ainda não tem nenhum) — mesma idempotência de
-- antes, porque uma org com um só agente tinha todas as missões nele.
create or replace function public.seed_default_missions(p_organization_id uuid)
    returns integer
    language sql
    security definer
    set search_path = pg_catalog, public
as $$
    select public.seed_default_missions(
        p_organization_id,
        (select id from public.ai_agents a
          where a.organization_id = p_organization_id
          order by (a.status = 'active') desc, a.created_at
          limit 1)
    );
$$;

revoke execute on function public.seed_default_missions(uuid, uuid) from public;
grant  execute on function public.seed_default_missions(uuid, uuid) to service_role;
revoke execute on function public.seed_default_missions(uuid) from public;
grant  execute on function public.seed_default_missions(uuid) to service_role;
