-- ============================================================================
-- Auditoria 2026-08-28, item 30 — os guards de comportamento no runtime.
--
-- O lojista configura ativação manual, cooldown pós-transferência, teto de
-- respostas por conversa e "parar quando um humano responder" na órbita do
-- agente. O caminho TypeScript honra tudo (`cloud-runner.ts:462+`); o runtime
-- Python lia a MESMA linha de `ai_agents` e ignorava todas essas chaves.
--
-- O estado que esses guards precisam NÃO existe na canônica: `public.
-- conversations` não tem `ai_transferred_at`, `ai_agent_id` nem `ai_enabled`,
-- e `public.messages` não recebe outbound humano (nada escreve
-- `author_type='human'` fora do backfill de criação — ausência 29 do FORK.md).
-- Quem sabe é o espelho legado do inbox, que continua sendo escrito pelas
-- rotas do app: `whatsapp_cloud_conversations` e `whatsapp_cloud_messages`.
--
-- Por que SECURITY DEFINER em vez de `grant select` direto ao worker_role: as
-- tabelas legadas têm RLS DESLIGADA, então um grant de tabela daria ao worker
-- leitura do inbox de TODA org. A função recebe `p_organization_id` e filtra
-- por ele — mesmo desenho de `internal.emit_ai_run_step` e de
-- `internal.mirror_outbound_to_inbox`, que já resolvem canônica → espelho
-- assim.
--
-- A função NÃO decide nada: devolve estado cru. A decisão dos guards mora em
-- Python (`agent_core/guards.py`), num lugar só, testável sem banco.
-- ============================================================================

create or replace function internal.legacy_conversation_guard_state(
    p_organization_id uuid,
    p_conversation_id uuid
)
    returns table (
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
        -- humano falou" — que é a verdade, não um default otimista.
        return;
    end if;

    return query
    select wcc.ai_agent_id,
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

-- ----------------------------------------------------------------------------
-- Transferência para humano (handoff por keyword e tópico bloqueado).
--
-- Escreve onde o freio do runtime já é lido: `whatsapp_cloud_conversations.
-- ai_enabled = false` faz o webhook chamar `cancel_pending_ai_response` para
-- org migrada (`webhook-processor.ts:513-520`), então desligar aqui cala o
-- agente nos turnos seguintes, e não só neste. `ai_transferred_at` alimenta o
-- cooldown pós-transferência — e continua preenchido depois que um humano
-- religa a IA, de propósito (guards.ts:61-69).
-- ----------------------------------------------------------------------------
create or replace function internal.mark_ai_handoff(
    p_organization_id uuid,
    p_conversation_id uuid,
    p_reason          text
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_phone text;
    v_cloud uuid;
begin
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
        return false;
    end if;

    select wcc.id into v_cloud
      from public.whatsapp_cloud_conversations wcc
     where wcc.organization_id = p_organization_id
       and (wcc.wa_id = v_phone or wcc.wa_id = ltrim(v_phone, '+'))
     order by wcc.last_message_at desc nulls last
     limit 1;

    if v_cloud is null then
        return false;
    end if;

    update public.whatsapp_cloud_conversations
       set ai_enabled = false,
           ai_disabled_at = now(),
           ai_disabled_reason = p_reason,
           ai_transferred_at = now(),
           updated_at = now()
     where id = v_cloud
       and organization_id = p_organization_id;

    return true;
end
$$;

revoke execute on function internal.mark_ai_handoff(uuid, uuid, text) from public;
grant execute on function internal.mark_ai_handoff(uuid, uuid, text) to worker_role;
