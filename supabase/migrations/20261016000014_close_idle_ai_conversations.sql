-- ============================================================================
-- 20261016000014_close_idle_ai_conversations.sql
-- Plano de implementação IA (2026-10-15), M5 passo 28 — fechamento.
--
-- Uma conversa atendida por agente "fecha" quando fica ociosa: sem inbound
-- nem resposta há p_idle_hours. Fechar grava closed_at e decide
-- resolved_without_human (não houve transferência), e a resolvida vira o
-- evento "solved" do feed. Chamado pelo cron /api/cron/ai-close-conversations,
-- que em seguida classifica o assunto das fechadas (purpose topic).
--
-- Reversão: drop function public.close_idle_ai_conversations(integer, integer);
-- ============================================================================
create or replace function public.close_idle_ai_conversations(
    p_idle_hours integer default 24,
    p_limit      integer default 500
)
returns table (
    conversation_id uuid,
    organization_id uuid,
    agent_id        uuid,
    transferred     boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    with due as (
        select o.conversation_id
          from public.ai_conversation_outcomes o
          join public.conversations c on c.id = o.conversation_id
         where o.closed_at is null
           and greatest(coalesce(c.last_inbound_at, o.started_at), o.updated_at)
               < now() - make_interval(hours => greatest(p_idle_hours, 1))
         order by o.updated_at
         limit p_limit
         for update of o skip locked
    ),
    closed as (
        update public.ai_conversation_outcomes o
           set closed_at = now(),
               resolved_without_human = coalesce(o.resolved_without_human, not o.transferred),
               updated_at = now()
          from due
         where o.conversation_id = due.conversation_id
        returning o.conversation_id, o.organization_id, o.agent_id, o.transferred, o.contact_id
    ),
    solved as (
        insert into public.ai_activity_events
            (organization_id, agent_id, conversation_id, contact_id, kind, text)
        select closed.organization_id, closed.agent_id, closed.conversation_id, closed.contact_id,
               'solved', 'Conversa resolvida pelo agente, sem a equipe'
          from closed
         where not closed.transferred
        returning 1
    )
    select closed.conversation_id, closed.organization_id, closed.agent_id, closed.transferred
      from closed;
end;
$$;

revoke execute on function public.close_idle_ai_conversations(integer, integer) from public, anon, authenticated;
grant execute on function public.close_idle_ai_conversations(integer, integer) to service_role;
