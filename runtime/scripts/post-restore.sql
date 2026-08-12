-- Depois do pg_restore: filas vazias + estado de runtime zerado.
-- As filas ficam FORA do dump de propósito: nascer vazia é a salvaguarda
-- contra reprocessar jobs de produção apontando para clientes reais.
select pgmq.create(q)
from unnest(array[
  'q_inbound','q_domain_events','q_scheduled','q_evals',
  'q_inbound_dlq','q_domain_events_dlq','q_scheduled_dlq','q_evals_dlq'
]) as q;

-- Re-espelho por cima de bancada usada: purga o que a rodada anterior enfileirou.
select pgmq.purge_queue(queue_name) from pgmq.meta;

-- Grants do 0002 sobre o mundo pgmq local (o dump não os traz — pgmq está fora dele).
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

-- Quem não pode: explícito, não herdado.
revoke all on schema pgmq from anon, authenticated, service_role;
revoke all on all tables in schema pgmq from anon, authenticated, service_role;

-- Heartbeats são do processo, não dos dados.
truncate internal.runtime_heartbeats;
