-- ============================================================================
-- 9.4 (Adendo §B) — uma trilha só na UI: as views de compatibilidade.
--
-- A Atividade herdada passa a ler a trilha NOVA (internal.llm_calls /
-- tool_calls / judge_scores + conversations) sem tocar no schema internal:
-- três views em public, com semântica DEFINER (dono postgres alcança
-- internal), lidas exclusivamente pelo service_role via rota autenticada.
--
-- Segurança: os defaults do Supabase dão SELECT a anon/authenticated em tudo
-- que nasce em public — aqui isso é revogado explicitamente. A trilha interna
-- é operação da plataforma; o que o lojista vê passa pela rota, escopado pela
-- org da sessão.
--
-- Os legados (agent_traces, ai_message_logs) ficam CONGELADOS para consulta
-- histórica — nenhuma view os toca, nenhuma escrita nova chega neles pelo
-- runtime.
-- ============================================================================

create view public.ai_runtime_activity as
select c.id                       as conversation_id,
       c.organization_id,
       c.contact_id,
       c.last_channel,
       c.last_inbound_at,
       c.created_at,
       c.owner_mission_version_id as mission_version_id,
       m.event_type               as mission_event_type,
       m.objective                as mission_objective,
       calls.llm_calls,
       calls.cost_usd,
       tools.tool_calls,
       judge.verdict              as last_judge_verdict,
       judge.score                as last_judge_score
  from public.conversations c
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

comment on view public.ai_runtime_activity is
    'Trilha única (9.4): uma linha por conversa do runtime com missão dona, '
    'custo somado e o último veredito do Judge. Leitura só via service_role.';

create view public.ai_runtime_activity_calls as
select l.id,
       l.organization_id,
       l.conversation_id,
       l.purpose,
       l.provider,
       l.model,
       l.input_tokens,
       l.output_tokens,
       l.cost_usd,
       l.latency_ms,
       l.created_at
  from internal.llm_calls l
 where l.conversation_id is not null;

create view public.ai_runtime_activity_tools as
select t.id,
       t.organization_id,
       t.conversation_id,
       t.tool_name,
       t.input,
       t.output,
       t.success,
       t.error,
       t.latency_ms,
       t.created_at
  from internal.tool_calls t;

revoke all on public.ai_runtime_activity        from public, anon, authenticated;
revoke all on public.ai_runtime_activity_calls  from public, anon, authenticated;
revoke all on public.ai_runtime_activity_tools  from public, anon, authenticated;

grant select on public.ai_runtime_activity       to service_role;
grant select on public.ai_runtime_activity_calls to service_role;
grant select on public.ai_runtime_activity_tools to service_role;
