-- ============================================================================
-- 20261016000009_alert_no_agent_for_entry.sql
-- Plano de implementação IA (2026-10-15), M2 passo 14.
--
-- Novo tipo de alerta `no_agent_for_entry`: a org tem mais de um agente
-- ativo e nenhuma entrada (ai_agent_entries) para o número que recebeu a
-- mensagem. O runtime não escolhe por conta própria — alerta (dedup por
-- número) e deixa a conversa avançar em silêncio, o mesmo padrão de
-- `no_active_mission`. Reversão: recriar a CHECK sem o valor novo.
-- ============================================================================
alter table public.alerts drop constraint if exists alerts_type_check;
alter table public.alerts add constraint alerts_type_check check (
    type in ('critical_violation', 'no_active_mission', 'no_org_llm_key',
             'window_closed_no_template', 'moment_template_not_ready',
             'judge_blocked', 'send_failed', 'mission_touch_failed', 'handoff',
             'coupon_code_conflict', 'budget_exceeded', 'no_agent_for_entry')
);
