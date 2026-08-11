-- ============================================================================
-- 20260812000002_runtime_roles_and_internal.sql
-- Infra de execução do runtime (fork do motor, ver runtime/FORK.md):
--   * roles worker_role / sender_role (NOLOGIN, NOBYPASSRLS)
--   * schema `internal` (fora da Data API — nunca entra nos exposed schemas)
--   * public.current_app_organization_id() (o escopo das pools do app)
--   * extensão pgmq + 4 filas + 4 DLQs, com grants exatos
--
-- Disciplina herdada do motor: cada objeto novo ganha seus grants na própria
-- migration; pgmq roda como o chamador, então consumir fila exige privilégio
-- de TABELA, não só EXECUTE; Data API (anon/authenticated/service_role) fica
-- explicitamente sem nada aqui.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Roles. NOLOGIN de propósito: LOGIN exigiria senha, e senha em migration é
-- segredo vazado. Produção conecta no pooler e faz SET ROLE (envs
-- AGENTS_WORKER_SET_ROLE / AGENTS_SENDER_SET_ROLE).
-- ----------------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'worker_role') then
        create role worker_role nologin nobypassrls;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'sender_role') then
        create role sender_role nologin nobypassrls;
    end if;
end
$$;

-- O admin precisa poder entrar nos papéis do app (SET ROLE) — é assim que
-- migração, operador e testes verificam uma policy do ponto de vista do app.
grant worker_role, sender_role to postgres;

grant usage on schema public to worker_role, sender_role;

-- Grants mínimos desta fase (cada etapa seguinte concede o que introduz):
-- o runtime resolve a org (policy loader) e a cascata de chaves BYO.
grant select on public.organizations        to worker_role, sender_role;
grant select on public.contacts             to worker_role;
grant select on public.organization_api_keys to worker_role;

-- ----------------------------------------------------------------------------
-- Escopo da unidade de trabalho. Vazio/ausente/lixo vira NULL — e
-- `organization_id = NULL` nunca é verdadeiro: pool que esqueceu de escopar
-- lê NADA, não lê tudo (fail-closed sem falhar barulhento para sempre).
-- ----------------------------------------------------------------------------
create or replace function public.current_app_organization_id()
    returns uuid
    language plpgsql
    stable
    set search_path = pg_catalog
as $$
begin
    return nullif(current_setting('app.organization_id', true), '')::uuid;
exception
    when invalid_text_representation then
        return null;
end
$$;

revoke execute on function public.current_app_organization_id() from public;
grant execute on function public.current_app_organization_id() to worker_role, sender_role;

-- ----------------------------------------------------------------------------
-- Schema internal: outbox, filas de missão, trilhas de plataforma. Nunca
-- entra nos exposed schemas; Data API sem USAGE.
-- ----------------------------------------------------------------------------
create schema if not exists internal;

grant usage on schema internal to worker_role, sender_role;
revoke all on schema internal from anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- pgmq: as 4 filas do motor + 1 DLQ por fila. Payloads carregam otel
-- (traceparent) e mission_ref quando a origem é fluxo (doc §3.3.7).
-- ----------------------------------------------------------------------------
create extension if not exists pgmq;

select pgmq.create('q_inbound');
select pgmq.create('q_domain_events');
select pgmq.create('q_scheduled');
select pgmq.create('q_evals');

select pgmq.create('q_inbound_dlq');
select pgmq.create('q_domain_events_dlq');
select pgmq.create('q_scheduled_dlq');
select pgmq.create('q_evals_dlq');

comment on table pgmq.q_q_inbound is
    'Jobs inbound, criados SOMENTE pelo coalescer (ingestão nunca enfileira). Payload {conversation_id, generation, target_seq, organization_id, otel?}.';
comment on table pgmq.q_q_domain_events is
    'Toques de missão e eventos de plataforma. Payload {mission_job_id, organization_id, mission_ref?, otel?}.';
comment on table pgmq.q_q_scheduled is
    'Toques agendados. Payload {scheduled_touch_id}.';
comment on table pgmq.q_q_evals is
    'Avaliação, melhor esforço. Payload {kind, conversation_id?, eval_run_id?}.';

-- Quem pode dirigir as filas: worker_role, com privilégio de TABELA (read
-- atualiza VT; archive move para a_*). sender_role ausente de propósito —
-- sender drena a outbox, não consome job.
grant usage on schema pgmq to worker_role;
grant select on pgmq.meta to worker_role;

grant select, insert, update, delete on
    pgmq.q_q_inbound,
    pgmq.q_q_domain_events,
    pgmq.q_q_scheduled,
    pgmq.q_q_evals,
    pgmq.q_q_inbound_dlq,
    pgmq.q_q_domain_events_dlq,
    pgmq.q_q_scheduled_dlq,
    pgmq.q_q_evals_dlq
to worker_role;

grant select, insert on
    pgmq.a_q_inbound,
    pgmq.a_q_domain_events,
    pgmq.a_q_scheduled,
    pgmq.a_q_evals,
    pgmq.a_q_inbound_dlq,
    pgmq.a_q_domain_events_dlq,
    pgmq.a_q_scheduled_dlq,
    pgmq.a_q_evals_dlq
to worker_role;

grant usage, select on all sequences in schema pgmq to worker_role;

-- Quem não pode: explícito, não herdado. O privilégio que morde é o da
-- TABELA (pgmq.send de um role da Data API falha no INSERT, não no call).
revoke all on schema pgmq from anon, authenticated, service_role;
revoke all on all tables in schema pgmq from anon, authenticated, service_role;
