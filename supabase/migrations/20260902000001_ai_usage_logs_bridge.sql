-- ============================================================================
-- 20260902000001_ai_usage_logs_bridge.sql
-- Auditoria 2026-08-28, item 37 (parte 1 — ai_usage_logs; agent_traces fica
-- de fora, ver runtime/FORK.md).
--
-- Achado: `ai_usage_logs` só tem escritor do lado TS (`cost-tracker.ts`); o
-- runtime nunca gravou nela. Para org migrada, `/api/ai/usage` mostra custo
-- zero (silencioso) e `budget.ts:101-112`, ao somar zero, deixa a org SEM
-- teto de gasto — falha ABERTA. É esse o efeito que importa (ruling A do
-- item): o painel é secundário, o teto de custo é a razão do item.
--
-- Ruling B do item: entre fechar as lacunas de `internal.llm_calls` (que já
-- tem quase tudo) e espelhar para `ai_usage_logs`, ou abrir uma segunda
-- escrita em Python, a ponte cabe inteira:
--   - `input_tokens`→`prompt_tokens`, `output_tokens`→`completion_tokens`,
--     `latency_ms`→`duration_ms`, `cost_usd`→`cost_usd` já batem 1:1;
--   - faltava `agent_id` — fechado abaixo como coluna nova em
--     `internal.llm_calls`, preenchida pelo escritor atual
--     (`repository/llm_calls.py`, chamado por `responder.py`/`toucher.py`);
--   - faltava `success` — não vira coluna nova: `agent_core/metering.py`
--     (`MeteredLlm._bill`) só grava uma linha em `llm_calls` quando a
--     chamada TERMINOU (uma falhada não deixa `CallRecord` nenhum — ver
--     `metering.py:13-15` e o teste
--     `test_llm_metering.py::TestWhatIsNotRecorded::test_a_failed_call_leaves_no_cost_row`).
--     Todo espelho é, por definição, uma chamada que teve sucesso; gravar
--     `success = true` fixo é o fato, não uma invenção — inventar coluna
--     para guardar uma constante seria o oposto de YAGNI.
--   - `purpose`→`feature` PRECISA de mapa explícito (vocabulários diferentes:
--     o runtime fala `agent_reply`/`judge_pre`/...; o TS fala
--     `whatsapp_agent`/`eval_judge`/...). O mapa abaixo usa valores
--     `runtime_*` deliberadamente — não reaproveita os nomes do TS, porque
--     não é a mesma coisa (o TS não tem "judge_pre" nem "prompt_generator")
--     e fingir que é viraria o defeito que este mesmo ruling B proíbe:
--     "feature com valor inventado é pior que coluna vazia". Coberto por
--     teste sem banco: `tests/unit/test_ai_usage_logs_bridge.py` lê este
--     arquivo e o CHECK de `internal.llm_calls` e falha se os dois
--     divergirem.
--
-- Ruling E: a RLS de `ai_usage_logs` (`FOR ALL USING (true)`, sem isolamento
-- real por org) fica como está — não é este item que muda postura de
-- segurança que atinge o lado TS também. Registrado no checklist.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. A lacuna que fecha: agent_id. O escritor atual (`_recorder`, chamado de
--    `responder.py`/`toucher.py`) já tem `version.agent_id` em memória no
--    mesmo ponto em que grava `internal.llm_calls` — só faltava a coluna.
-- --------------------------------------------------------------------------
alter table internal.llm_calls
    add column agent_id uuid references public.ai_agents (id) on delete set null;

-- --------------------------------------------------------------------------
-- 2. O worker passa a escrever também em ai_usage_logs (a trilha do
--    lojista) — hoje só o service-role TS grava lá.
-- --------------------------------------------------------------------------
grant insert on public.ai_usage_logs to worker_role;

-- --------------------------------------------------------------------------
-- 3. O espelho: uma linha em internal.llm_calls concluída vira uma linha em
--    ai_usage_logs. `security invoker` (padrão) — roda com os privilégios de
--    quem gravou llm_calls (worker_role, com o GRANT acima), sem precisar de
--    security definer: RLS de ai_usage_logs já é `USING (true)` (ruling E),
--    não há isolamento a furar.
-- --------------------------------------------------------------------------
create function internal.mirror_llm_call_to_usage_logs()
    returns trigger
    language plpgsql
as $$
declare
    v_feature text;
begin
    if new.organization_id is null then
        -- Chamada de plataforma (pack base, sem org por trás) — nada do
        -- lojista para contabilizar, e ai_usage_logs.organization_id é
        -- NOT NULL.
        return new;
    end if;

    -- Mapa purpose -> feature, explícito e travado por teste (ver cabeçalho
    -- desta migration). Um purpose sem `when` cai no `else`, que falha alto
    -- em vez de gravar uma feature inventada. CASE-statement (não
    -- CASE-expression): o `else` precisa caber um RAISE, que é comando, não
    -- valor.
    case new.purpose
        when 'agent_reply'      then v_feature := 'runtime_agent_reply';
        when 'judge_pre'        then v_feature := 'runtime_judge_pre';
        when 'judge_async'      then v_feature := 'runtime_judge_async';
        when 'prompt_generator' then v_feature := 'runtime_prompt_generator';
        when 'copy_variation'   then v_feature := 'runtime_copy_variation';
        when 'embedding'        then v_feature := 'runtime_embedding';
        else
            raise exception
                'internal.llm_calls.purpose sem mapa para ai_usage_logs.feature: %', new.purpose;
    end case;

    insert into public.ai_usage_logs
        (organization_id, provider, model, feature, agent_id, conversation_id,
         prompt_tokens, completion_tokens, cost_usd, duration_ms, success)
    values
        (new.organization_id, new.provider, new.model, v_feature, new.agent_id,
         new.conversation_id, coalesce(new.input_tokens, 0), coalesce(new.output_tokens, 0),
         coalesce(new.cost_usd, 0), new.latency_ms, true);

    return new;
end;
$$;

create trigger llm_calls_mirror_to_usage_logs
    after insert on internal.llm_calls
    for each row
    execute function internal.mirror_llm_call_to_usage_logs();
