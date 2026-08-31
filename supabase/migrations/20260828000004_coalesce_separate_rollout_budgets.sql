-- ============================================================================
-- item 09 da auditoria, rodada de fix 1 — o orçamento do runtime para de
-- competir com o do legado.
--
-- Achado do review de bb9acd8d: o `due` de 20260828000003 ordenava runtime e
-- legacy JUNTOS por `pending_response_at` e só depois cortava em `p_limit` —
-- um orçamento único disputado pelos dois lados. Bem no cenário que este item
-- existe para proteger (uma org acabou de voltar para legacy), as conversas
-- legacy carregam os prazos MAIS VELHOS — foram as primeiras a ficar
-- pendentes, antes do flip. Um tique podia gastar o `p_limit` inteiro
-- limpando legacy e deixar conversas runtime devidas esperando o próximo
-- tique: a resposta ao vivo atrasava exatamente na janela que a filtragem
-- por rollout foi escrita para proteger. Autolimitante (o backlog esvazia),
-- mas real enquanto durasse.
--
-- A correção é separar a contabilidade, não abrir mão da limpeza: `p_limit`
-- é o orçamento de TRABALHO do runtime — só conta linha que vira job. A
-- limpeza de legacy ganha seu próprio corte, bounded, reaproveitando o
-- mesmo `p_limit` como teto (não é um parâmetro novo — é o mesmo número
-- servindo dois orçamentos independentes). `due_runtime` já filtra por
-- `mode = 'runtime'` ANTES do `limit p_limit`, então uma fila de legacy,
-- por maior que seja, nunca ocupa uma vaga do runtime. `due_legacy` faz o
-- mesmo do lado dele, com seu próprio `limit p_limit` — se sobrar legacy
-- depois do corte, o próximo tique pega o resto, do jeito que o `p_limit`
-- de sempre já atrasa (não descarta) o que não coube.
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
    with due_runtime as (
        -- INNER JOIN, não LEFT: o orçamento do runtime só existe para quem
        -- TEM linha com mode = 'runtime' — é o filtro entrando ANTES do
        -- limit, para nenhuma legacy tomar uma vaga daqui.
        select c.id
          from public.conversations c
          join public.ai_runtime_rollout r
            on r.organization_id = c.organization_id
           and r.mode = 'runtime'
         where c.pending_response_at is not null
           and c.pending_response_at <= now()
         order by c.pending_response_at
         for update of c skip locked
         limit p_limit
    ),
    bumped as (
        update public.conversations c
           set processing_generation = c.processing_generation + 1,
               pending_response_at = null
          from due_runtime
         where c.id = due_runtime.id
        returning c.id, c.processing_generation, c.next_inbound_seq, c.organization_id
    ),
    due_legacy as (
        -- Orçamento PRÓPRIO, mesmo teto p_limit — nunca compete com
        -- due_runtime pelas mesmas vagas porque são conjuntos disjuntos
        -- (uma org é runtime OU legacy, nunca as duas) e cada CTE aplica o
        -- corte no seu próprio SELECT.
        select c.id
          from public.conversations c
          left join public.ai_runtime_rollout r on r.organization_id = c.organization_id
         where c.pending_response_at is not null
           and c.pending_response_at <= now()
           and coalesce(r.mode, 'legacy') = 'legacy'
         order by c.pending_response_at
         for update of c skip locked
         limit p_limit
    ),
    -- Prazo limpo, sem job, sem bump de geração (ruling do item 09) — sem ser
    -- lida pelo SELECT final, mas dentro do mesmo WITH ela executa do mesmo
    -- jeito: uma CTE que só atualiza roda por estar na lista, não por ser
    -- referenciada depois (confirmado ao vivo contra o Postgres local antes
    -- de confiar nisso, na 20260828000003 original).
    legacy_cleared as (
        update public.conversations c
           set pending_response_at = null
          from due_legacy
         where c.id = due_legacy.id
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
