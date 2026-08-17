-- Progresso do agente NO CHAT para o caminho do runtime (pedido 17/08):
-- o inbox mostra os chips (assumiu/gerando/verificando/enviada) lendo
-- whatsapp_ai_run_steps por Realtime, filtrado pela conversa CLOUD. O caminho
-- legado escrevia esses passos; o runtime não escrevia nada — o chat ficava
-- mudo enquanto o agente trabalhava.
--
-- Mesma receita do espelho de outbound (migration 20260813000003):
-- função SECURITY DEFINER em `internal`, resolução da conversa cloud por
-- telefone (wa_id) — com a opção de partir da conversa CANÔNICA (worker, que
-- não conhece telefone) via channel_identities.
--
-- CREATE TABLE IF NOT EXISTS conformado ao shape vivo (17/08): no banco real
-- é no-op; no Postgres limpo do CI, bootstrapa a suíte.

create table if not exists public.whatsapp_ai_run_steps (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid        not null,
    conversation_id uuid        not null,
    run_id          uuid        not null,
    agent_id        uuid,
    step            text        not null,
    detail          text,
    metadata        jsonb,
    created_at      timestamptz not null default now()
);

create index if not exists idx_wars_conversation_created
    on public.whatsapp_ai_run_steps (conversation_id, created_at desc);
create index if not exists idx_wars_run
    on public.whatsapp_ai_run_steps (run_id);

create or replace function internal.emit_ai_run_step(
    p_organization_id uuid,
    p_run_id          uuid,
    p_step            text,
    p_detail          text  default null,
    p_agent_id        uuid  default null,
    p_metadata        jsonb default null,
    p_conversation_id uuid  default null,
    p_phone           text  default null
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_phone text := p_phone;
    v_cloud uuid;
begin
    -- Worker: parte da conversa canônica → identidade WhatsApp do contato.
    if v_phone is null and p_conversation_id is not null then
        select ci.external_id into v_phone
          from public.conversations c
          join public.channel_identities ci
            on ci.organization_id = c.organization_id
           and ci.contact_id = c.contact_id
           and ci.channel = 'whatsapp'
         where c.id = p_conversation_id
           and c.organization_id = p_organization_id
         limit 1;
    end if;

    if v_phone is null then
        return false;
    end if;

    -- Mesma resolução do espelho: wa_id com e sem '+'.
    select wcc.id into v_cloud
      from public.whatsapp_cloud_conversations wcc
     where wcc.organization_id = p_organization_id
       and (wcc.wa_id = v_phone or wcc.wa_id = ltrim(v_phone, '+'))
     order by wcc.last_message_at desc nulls last
     limit 1;

    if v_cloud is null then
        -- Sem conversa no inbox (toque frio): sem palco, sem chip — o passo
        -- é adereço de UI, nunca motivo de erro.
        return false;
    end if;

    insert into public.whatsapp_ai_run_steps
        (organization_id, conversation_id, run_id, agent_id, step, detail, metadata)
    values
        (p_organization_id, v_cloud, p_run_id, p_agent_id, p_step, p_detail, p_metadata);
    return true;
end
$$;

revoke execute on function internal.emit_ai_run_step(uuid, uuid, text, text, uuid, jsonb, uuid, text) from public;
grant execute on function internal.emit_ai_run_step(uuid, uuid, text, text, uuid, jsonb, uuid, text) to worker_role;
grant execute on function internal.emit_ai_run_step(uuid, uuid, text, text, uuid, jsonb, uuid, text) to sender_role;
