-- W3-T6a: `internal.legacy_conversation_guard_state` sempre varria as
-- mensagens do bot para contar quantas já saíram, mesmo quando o agente não
-- usa teto por conversa (`max_messages_per_conversation`) nem parada por
-- resposta humana (`stop_on_human_reply`) — uma varredura desperdiçada em
-- todo turno.
--
-- A armadilha: a lateral antiga projeta `count(*)` E `max(timestamp)` juntos.
-- Pôr o knob nessa ÚNICA lateral apagaria `last_bot_message_at` junto com a
-- contagem — e o guard de cooldown curto (anti-loop, `guards.py`
-- RECENT_REPLY_COOLDOWN_SECONDS), que lê SEMPRE `last_bot_message_at`
-- independente de qualquer knob de loja, pararia de disparar em silêncio.
-- Por isso duas laterais: uma de contagem (gated por `p_count_bot`), uma de
-- último timestamp do bot (não gated pela contagem — só por `p_check_human`
-- não existe aqui; ela sempre roda, porque o cooldown curto não é knob de
-- loja). O `is not null` preserva a semântica de `max(timestamp)`.
--
-- Assinatura nova: dois parâmetros adicionados ao FINAL, ambos com default
-- `true` — preserva todo chamador existente. Como Postgres identifica função
-- pela assinatura completa, a antiga (uuid, uuid, uuid) fica como overload
-- morto se não for removida: dropamos ela explicitamente.
drop function internal.legacy_conversation_guard_state(uuid, uuid, uuid);

create function internal.legacy_conversation_guard_state(
    p_organization_id uuid,
    p_conversation_id uuid,
    p_waba_id uuid default null,
    p_count_bot boolean default true,
    p_check_human boolean default true
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
    v_waba_id uuid;
    v_phone text;
    v_cloud uuid;
begin
    if p_waba_id is not null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, p_waba_id);
    end if;
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
    if v_waba_id is null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, null);
    end if;

    select wcc.id into v_cloud
      from public.whatsapp_cloud_conversations wcc
     where wcc.organization_id = p_organization_id
       and wcc.waba_id = v_waba_id
       and (wcc.wa_id = v_phone or wcc.wa_id = ltrim(v_phone, '+'))
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
           last_bot.last_at,
           coalesce(human.exists_, false)
      from public.whatsapp_cloud_conversations wcc
      left join lateral (
          select count(*) as total
            from public.whatsapp_cloud_messages wcm
           where wcm.organization_id = p_organization_id
             and wcm.conversation_id = wcc.id
             and wcm.sent_by_bot
             and p_count_bot
      ) bot on true
      left join lateral (
          select wcm."timestamp" as last_at
            from public.whatsapp_cloud_messages wcm
           where wcm.organization_id = p_organization_id
             and wcm.conversation_id = wcc.id
             and wcm.sent_by_bot
             and wcm."timestamp" is not null
           order by wcm."timestamp" desc
           limit 1
      ) last_bot on true
      left join lateral (
          select true as exists_
            from public.whatsapp_cloud_messages wcm
           where wcm.organization_id = p_organization_id
             and wcm.conversation_id = wcc.id
             and wcm.sender = 'human'
             and p_check_human
           limit 1
      ) human on true
     where wcc.id = v_cloud;
end
$$;
revoke all on function internal.legacy_conversation_guard_state(uuid, uuid, uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function internal.legacy_conversation_guard_state(uuid, uuid, uuid, boolean, boolean) to worker_role;
