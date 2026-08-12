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
grant select, insert, update, delete on all tables in schema pgmq to worker_role;
grant usage, select on all sequences in schema pgmq to worker_role;

-- Heartbeats são do processo, não dos dados.
truncate internal.runtime_heartbeats;
