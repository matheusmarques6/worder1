-- ============================================================================
-- item 09 da auditoria de 28/08 — o coalescer aprende o rollout.
--
-- O achado: `grep -rn "ai_runtime_rollout" runtime/src/` só acha um comentário
-- — o runtime nunca lê o modo. `internal.coalesce_due_conversations` é
-- SECURITY DEFINER e cross-org, e ignorava `ai_runtime_rollout` por completo.
-- Voltar uma org para 'legacy' não parava o Python: jobs que já estavam em
-- `q_inbound` continuavam sendo consumidos, e qualquer `pending_response_at`
-- já gravado seguia sendo coalescido enquanto o TS (QStash + cloud-runner) já
-- tinha retomado a mesma conversa — dois mecanismos respondendo à mesma loja.
--
-- A checagem mora AQUI, no coalescer, e não em `agents_runtime`, porque a
-- função já é `security definer` cross-org: um passe só cobre TODAS as orgs.
-- Um filtro no worker Python seria por-org e chegaria tarde demais — o job já
-- teria sido lido da fila antes do worker saber que a org tinha voltado para
-- legacy. Filtrar aqui é o único ponto por onde toda org passa antes de virar
-- job.
--
-- `ai_runtime_rollout` (20260812000003) documenta linha ausente = legacy
-- (fail-closed — o mesmo contrato que src/lib/ai/runtime-rollout.ts usa do
-- lado TS). O LEFT JOIN + coalesce(mode, 'legacy') reproduz exatamente isso:
-- uma org sem linha nunca entra no conjunto `runtime`.
--
-- Org em legacy tem o `pending_response_at` LIMPO no mesmo passe, sem virar
-- job e sem bump de `processing_generation`. `pending_response_at` é o
-- agendamento DO RUNTIME; em legacy quem responde é o caminho TS, com o
-- próprio debounce (`ai_debounce_until`/`ai_pending`). Deixar a linha
-- pendente faria a resposta velha do runtime disparar no instante em que a
-- org voltasse a 'runtime' — mesmo que o TS já tivesse respondido havia
-- muito. O custo do lado errado: uma conversa com resposta agendada bem no
-- instante do flip perde essa rodada; o próximo inbound reagenda pelo
-- caminho TS normalmente.
--
-- Assinatura, retorno e grants continuam os mesmos de 20260813000012 — só o
-- corpo muda. `drop function` explícito + `create function` novo, o padrão
-- do repositório para nunca haver duas versões divergindo.
-- ============================================================================

drop function internal.coalesce_due_conversations(text, integer, jsonb);

create function internal.coalesce_due_conversations(
    p_queue text default 'q_inbound',
    p_limit integer default 100,
    p_otel  jsonb default null
)
    returns setof internal.coalesced_job
    language plpgsql
    security definer
    set search_path = pg_catalog, public, internal
as $$
declare
    v_jobs internal.coalesced_job[];
    v_job  internal.coalesced_job;
begin
    with due as (
        select c.id, coalesce(r.mode, 'legacy') as mode
          from public.conversations c
          left join public.ai_runtime_rollout r on r.organization_id = c.organization_id
         where c.pending_response_at is not null
           and c.pending_response_at <= now()
         order by c.pending_response_at
         -- `of c`: o LEFT JOIN põe `ai_runtime_rollout` do lado que pode ser
         -- nulo, e o Postgres recusa `FOR UPDATE` puro nesse caso
         -- (FeatureNotSupported). A trava só precisa mesmo de `conversations`
         -- — é a linha que este passe vai (talvez) atualizar.
         for update of c skip locked
         limit p_limit
    ),
    bumped as (
        update public.conversations c
           set processing_generation = c.processing_generation + 1,
               pending_response_at = null
          from due
         where c.id = due.id
           and due.mode = 'runtime'
        returning c.id, c.processing_generation, c.next_inbound_seq, c.organization_id
    ),
    -- Legado no mesmo passe: prazo limpo, sem job, sem bump de geração — ver
    -- o comentário do cabeçalho. Continua dentro do WITH mesmo sem ser
    -- referenciada pelo SELECT final: um CTE que só atualiza é executada por
    -- fazer parte da mesma lista WITH, não por ser lida depois.
    legacy_cleared as (
        update public.conversations c
           set pending_response_at = null
          from due
         where c.id = due.id
           and due.mode = 'legacy'
        returning c.id
    )
    select array_agg(
               row(id, processing_generation, next_inbound_seq, organization_id, p_otel)
                   ::internal.coalesced_job
           )
      into v_jobs
      from bumped;

    foreach v_job in array coalesce(v_jobs, array[]::internal.coalesced_job[])
    loop
        perform pgmq.send(
            p_queue,
            jsonb_build_object(
                'conversation_id', v_job.conversation_id,
                'generation', v_job.generation,
                'target_seq', v_job.target_seq,
                'organization_id', v_job.organization_id,
                'otel', v_job.otel
            )
        );
        return next v_job;
    end loop;
end
$$;

revoke execute on function internal.coalesce_due_conversations(text, integer, jsonb) from public;
grant execute on function internal.coalesce_due_conversations(text, integer, jsonb) to worker_role;
