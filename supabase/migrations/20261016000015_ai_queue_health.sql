-- ============================================================================
-- 20261016000015_ai_queue_health.sql
-- Plano de implementação IA (2026-10-15), M5 passo 30 — saúde das filas.
--
-- O painel /api/admin/whatsapp-health passa a mostrar quantas mensagens há em
-- cada fila do runtime e nas DLQs (o piloto morreu com 4 mensagens paradas na
-- q_inbound_dlq sem ninguém ver). pgmq vive fora da Data API; esta função
-- devolve só contagens, para o service_role.
--
-- Reversão: drop function public.ai_queue_health();
-- ============================================================================
create or replace function public.ai_queue_health()
returns table (queue_name text, queue_length bigint, oldest_msg_age_sec integer)
language sql
security definer
set search_path = public, pgmq
as $$
    select m.queue_name::text, m.queue_length, m.oldest_msg_age_sec
      from pgmq.metrics_all() m
     where m.queue_name like 'q\_%'
     order by m.queue_name;
$$;

revoke execute on function public.ai_queue_health() from public, anon, authenticated;
grant execute on function public.ai_queue_health() to service_role;
