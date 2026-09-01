-- ============================================================================
-- Auditoria 2026-08-28, item 30 (correção round 1) — `ai_enabled` no estado
-- dos guards.
--
-- A entrega anterior portou os oito knobs de `settings` e deixou de fora o
-- guard mais básico do TS: `cloud-runner.ts:390-392` cala o turno com
-- `skipped: 'ai_disabled'` quando `conversation.ai_enabled === false`. O
-- argumento era que o webhook já freia no ingest
-- (`webhook-processor.ts:513-520` chama `cancel_pending_ai_response`).
--
-- Só que o runtime tem DOIS produtores de fala, e o toque de missão não passa
-- pelo ingest: ele nasce de `emit_ai_mission_job`. Com o freio morando só no
-- ingest, a transferência que o próprio item 30 construiu (`mark_ai_handoff`
-- grava `ai_enabled = false`) se desfazia pela outra porta — o cliente pedia
-- um humano e o bot voltava a falar no toque seguinte. O freio precisa morar
-- onde a decisão mora.
--
-- `create or replace` não muda a lista de OUT params: o drop é obrigatório.
-- ============================================================================

drop function if exists internal.legacy_conversation_guard_state(uuid, uuid);

create function internal.legacy_conversation_guard_state(
    p_organization_id uuid,
    p_conversation_id uuid
)
    returns table (
        ai_enabled           boolean,
        ai_agent_id          uuid,
        ai_transferred_at    timestamptz,
        bot_message_count    integer,
        last_bot_message_at  timestamptz,
        has_human_reply      boolean
    )
    language plpgsql
    stable
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_phone text;
    v_cloud uuid;
begin
    -- Canônica → identidade WhatsApp do contato, exatamente como o
    -- emit_ai_run_step faz. `and c.organization_id = p_organization_id` é o
    -- escopo: sem RLS aqui, quem escopa é a query (FORK.md item 6).
    select ci.external_id into v_phone
      from public.conversations c
      join public.channel_identities ci
        on ci.organization_id = c.organization_id
       and ci.contact_id = c.contact_id
       and ci.channel = 'whatsapp'
     where c.id = p_conversation_id
       and c.organization_id = p_organization_id
     limit 1;

    if v_phone is null then
        return;
    end if;

    -- Mesma resolução do espelho: wa_id com e sem '+'.
    select wcc.id into v_cloud
      from public.whatsapp_cloud_conversations wcc
     where wcc.organization_id = p_organization_id
       and (wcc.wa_id = v_phone or wcc.wa_id = ltrim(v_phone, '+'))
     order by wcc.last_message_at desc nulls last
     limit 1;

    if v_cloud is null then
        -- Conversa que ainda não existe no inbox legado: zero linhas. Quem
        -- chama lê isso como "ninguém transferiu, o bot não respondeu, nenhum
        -- humano falou" — que é a verdade, não um default otimista. E o bot
        -- segue LIGADO: ninguém o desligou.
        return;
    end if;

    return query
    -- `is distinct from false` é o `=== false` do TS: NULL é bot ligado.
    select wcc.ai_enabled is distinct from false,
           wcc.ai_agent_id,
           wcc.ai_transferred_at,
           -- sent_by_bot cobre os dois motores: o mirror do sender do runtime
           -- grava a resposta com sent_by_bot = true (sender_preflight.sql:257).
           coalesce(bot.total, 0)::integer,
           bot.last_at,
           coalesce(human.exists_, false)
      from public.whatsapp_cloud_conversations wcc
      left join lateral (
          select count(*) as total, max(wcm."timestamp") as last_at
            from public.whatsapp_cloud_messages wcm
           where wcm.organization_id = p_organization_id
             and wcm.conversation_id = wcc.id
             and wcm.sent_by_bot
      ) bot on true
      left join lateral (
          select true as exists_
            from public.whatsapp_cloud_messages wcm
           where wcm.organization_id = p_organization_id
             and wcm.conversation_id = wcc.id
             and wcm.sender = 'human'
           limit 1
      ) human on true
     where wcc.id = v_cloud;
end
$$;

revoke execute on function internal.legacy_conversation_guard_state(uuid, uuid) from public;
grant execute on function internal.legacy_conversation_guard_state(uuid, uuid) to worker_role;
