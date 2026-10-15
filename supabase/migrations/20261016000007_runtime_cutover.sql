-- ============================================================================
-- 20261016000007_runtime_cutover.sql
-- Plano de implementação IA (2026-10-15), M1 passo 12 — cutover geral.
--
-- O contrato "linha ausente em ai_runtime_rollout = legacy" fica como está:
-- é lido em três lugares com a mesma semântica (src/lib/ai/runtime-rollout.ts,
-- internal.coalesce_due_conversations e internal.emit_ai_mission_job) e os
-- testes db travam isso. Inverter o padrão em um só lugar abriria uma janela
-- em que o webhook enfileira para o runtime e o coalescer ignora a conversa.
--
-- O que muda, então, é QUEM cria a linha:
--   1. Backfill: toda org que já tem agente e não tem linha ganha
--      mode = 'runtime' agora, com migrated_at e notes para auditoria.
--      Orgs com linha explícita (runtime OU legacy) não são tocadas — o
--      rollback por org continua sendo `update ... set mode = 'legacy'`.
--   2. Trigger: o primeiro agente de uma org cria a linha em 'runtime'
--      (`on conflict do nothing`), para que uma loja nova nunca caia no
--      legado por esquecimento. A linha nasce no mesmo commit do agente.
--
-- Reversão: drop trigger/function; as linhas de backfill têm
-- notes = 'cutover 2026-10-16' e podem ser apagadas por esse marcador.
-- ============================================================================

insert into public.ai_runtime_rollout (organization_id, mode, migrated_at, notes)
select distinct a.organization_id, 'runtime', now(), 'cutover 2026-10-16'
  from public.ai_agents a
 where not exists (
        select 1 from public.ai_runtime_rollout r
         where r.organization_id = a.organization_id
       );

create or replace function public.ai_agents_default_runtime_rollout()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
as $$
begin
    insert into public.ai_runtime_rollout (organization_id, mode, migrated_at, notes)
    values (new.organization_id, 'runtime', now(), 'primeiro agente da org')
    on conflict (organization_id) do nothing;
    return new;
end;
$$;

revoke execute on function public.ai_agents_default_runtime_rollout() from public;

drop trigger if exists ai_agents_default_runtime_rollout on public.ai_agents;
create trigger ai_agents_default_runtime_rollout
    after insert on public.ai_agents
    for each row execute function public.ai_agents_default_runtime_rollout();

comment on table public.ai_runtime_rollout is
    'Mecanismo de resposta por org: runtime (Python) ou legacy (QStash + cloud-runner). '
    'Desde 2026-10-16 toda org com agente nasce em runtime (trigger em ai_agents); '
    'legacy e opt-out explicito por org, congelado, remocao no M7.';
