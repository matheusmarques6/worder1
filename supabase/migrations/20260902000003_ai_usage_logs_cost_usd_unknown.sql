-- ============================================================================
-- 20260902000003_ai_usage_logs_cost_usd_unknown.sql
-- Auditoria 2026-08-28, item 42 — custo vindo do provedor, não de tabela
-- hardcoded (parte de schema).
--
-- Achado: modelo fora de `cost-tracker.ts::PRICING` virava `0` USD gravado,
-- silenciosamente — e `ai_usage_logs.cost_usd NUMERIC(10,6) DEFAULT 0` mais
-- `ai_monthly_cost_usd`'s `COALESCE(SUM(cost_usd), 0)` repetiam o mesmo
-- achatamento no schema: mesmo se a função TS parasse de inventar zero, um
-- INSERT que omitisse a coluna ainda ganhava `0` do DEFAULT, e um mês
-- inteiro de chamadas de custo desconhecido somava exatamente igual a um
-- mês sem nenhum gasto — as duas coisas davam `0`, indistinguíveis. Ruling B
-- do item: consertar só a função move o lugar onde o zero nasce, sem tirá-lo
-- do caminho — as três camadas (função, tipo TS, schema) têm de mudar
-- juntas. `estimateCostUsd` (cost-tracker.ts) agora devolve `null` para
-- modelo sem preço; esta migration completa o lado do banco.
--
-- Ruling C: a tabela de preços NÃO morre — OpenAI/Anthropic não devolvem
-- custo na resposta da API, só o dono da tabela pode estimar. O que muda é
-- as chaves passarem a ter namespace `<provider>/<model>` e ausência
-- significar desconhecido, não zero (ver cost-tracker.ts).
--
-- 1) cost_usd perde o DEFAULT 0 — coluna já era NULLABLE (sem NOT NULL),
--    mas todo INSERT explícito de `trackAiUsage` sempre mandava um número;
--    o DEFAULT só importava para um INSERT que omitisse a coluna (nenhum
--    caminho atual faz isso, mas o default mentia sobre a intenção: "sem
--    dado = gratuito" é o mesmo bug que este item mata em código).
--
-- 2) ai_monthly_cost_usd passa a devolver `(spent_usd, has_unknown_cost)`
--    em vez de um NUMERIC solto. SUM(cost_usd) já ignora NULL em SQL padrão
--    — soma só o que é conhecido, honestamente — mas o valor sozinho não
--    dizia se era completo ou parcial (0 por "não gastou" e 0 por "só
--    gastou em modelo sem preço" eram o mesmo número). `has_unknown_cost`
--    fecha essa ambiguidade: `budget.ts::checkAiBudget` usa para logar
--    (ruling D) quando o `spentUsd` que ele calcula é parcial. Assinatura
--    muda de retorno (NUMERIC → TABLE), por isso DROP + CREATE em vez de
--    CREATE OR REPLACE (Postgres não troca o tipo de retorno em um REPLACE).
--
-- 3) internal.mirror_llm_call_to_usage_logs (item 37,
--    20260902000001_ai_usage_logs_bridge.sql) gravava
--    `coalesce(new.cost_usd, 0)` — o mesmo achatamento, encontrado durante
--    esta tarefa (não estava na recon original do item 42, que não olhou
--    esse trigger). `internal.llm_calls.cost_usd` é `float | None` no
--    Python por decisão deliberada (agent_core/llm.py — "Absent stays
--    absent"); o espelho para `ai_usage_logs` forçava esse `None` a virar
--    `0` na hora de cruzar para o lado TS. Corrigido para propagar
--    `new.cost_usd` como está. O mapa `purpose`→`feature` (o que o teste
--    `runtime/tests/unit/test_ai_usage_logs_bridge.py` trava) não muda —
--    só o valor de `cost_usd` no INSERT do espelho.
--
-- Fix round 1 (review, 0 Critical/0 Important, 4 Minor):
--
-- Minor 1 — `ai_usage_logs` não nasce em `supabase/migrations/` (vem de
-- setup fora de banda). Mesma classe do item 0a: `20260621_phase0_foundations.sql`
-- tinha um `CREATE INDEX` fora do bloco guardado e derrubava `supabase start`
-- num banco limpo, porque `IF NOT EXISTS` fala do índice, nunca da tabela.
-- Esta migration tinha o MESMO risco herdado — `ALTER TABLE ai_usage_logs`
-- quebra se a tabela não existir, e nada aqui garantia isso antes desta
-- migration no stream versionado (o item 37, que criou o trigger do passo 3,
-- já corria esse risco; herdado não é justificativa). Migration inteira
-- agora dentro de um `DO $guard$ ... $guard$` guardado por
-- `to_regclass('public.ai_usage_logs')`, no molde exato de
-- `20260621_phase0_foundations.sql` — se a tabela não existir, `RAISE NOTICE`
-- e sai sem tocar em nada.
--
-- Minor 2 — linhas gravadas ANTES desta migration com `cost_usd = 0` ficam
-- ambíguas: podiam significar "gasto real zero" OU "modelo fora da tabela de
-- preços" (o comportamento antigo que este item mata). Não há como
-- distinguir os dois retroativamente sem reprocessar cada chamada contra o
-- provider — não é backfill deste item (pedir isso sem saber o volume seria
-- inventar trabalho). Declarado via `COMMENT ON COLUMN` abaixo: uma soma de
-- `cost_usd` sobre um período que cruza esta data é um PISO, não um total.
-- ============================================================================

DO $guard$
BEGIN
    IF to_regclass('public.ai_usage_logs') IS NULL THEN
        RAISE NOTICE 'ai_usage_logs ausente — pulando migration de cost_usd desconhecido (item 42)';
        RETURN;
    END IF;

    -- --------------------------------------------------------------------
    -- 1. cost_usd sem DEFAULT 0 — ausência de dado não vira gasto zero.
    -- --------------------------------------------------------------------
    ALTER TABLE public.ai_usage_logs
        ALTER COLUMN cost_usd DROP DEFAULT;

    COMMENT ON COLUMN public.ai_usage_logs.cost_usd IS
        'Custo USD da chamada, reportado pelo provedor (OpenRouter) ou estimado por tabela (direto). '
        'NULL = modelo fora da tabela de precos (desconhecido) -- nunca gasto zero inventado (item 42). '
        'Linhas gravadas antes de 2026-09-02 usavam 0 pros dois casos (gasto real zero E modelo sem '
        'preco) -- ambiguas; uma soma sobre um periodo que cruza essa data e um piso, nao um total.';

    -- --------------------------------------------------------------------
    -- 2. ai_monthly_cost_usd devolve (spent_usd, has_unknown_cost). Muda o
    --    tipo de retorno (NUMERIC → TABLE) — Postgres não deixa trocar isso
    --    com CREATE OR REPLACE, precisa DROP + CREATE. DROP já derruba os
    --    GRANTs da versão antiga; refeitos abaixo, idênticos ao original.
    -- --------------------------------------------------------------------
    DROP FUNCTION IF EXISTS ai_monthly_cost_usd(uuid, timestamptz);

    CREATE FUNCTION ai_monthly_cost_usd(
        p_organization_id uuid,
        p_month_start     timestamptz
    )
    RETURNS TABLE (spent_usd numeric, has_unknown_cost boolean)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $body$
        SELECT
            COALESCE(SUM(cost_usd), 0)                AS spent_usd,
            COALESCE(BOOL_OR(cost_usd IS NULL), false) AS has_unknown_cost
        FROM   ai_usage_logs
        WHERE  organization_id = p_organization_id
          AND  created_at >= p_month_start;
    $body$;

    -- Mesma postura de segurança da versão original (20260616_ai_budgets.sql):
    -- só service_role, nunca anon/authenticated/public.
    REVOKE EXECUTE ON FUNCTION ai_monthly_cost_usd(uuid, timestamptz) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION ai_monthly_cost_usd(uuid, timestamptz) FROM anon;
    REVOKE EXECUTE ON FUNCTION ai_monthly_cost_usd(uuid, timestamptz) FROM authenticated;
    GRANT EXECUTE ON FUNCTION ai_monthly_cost_usd(uuid, timestamptz) TO service_role;

    -- --------------------------------------------------------------------
    -- 3. O espelho do item 37 parava de inventar 0 pro custo desconhecido do
    --    runtime. Redefine a função inteira (mesmo corpo de
    --    20260902000001_ai_usage_logs_bridge.sql, só a linha do cost_usd no
    --    INSERT muda) — signature idêntica, CREATE OR REPLACE basta aqui.
    -- --------------------------------------------------------------------
    CREATE OR REPLACE FUNCTION internal.mirror_llm_call_to_usage_logs()
        RETURNS TRIGGER
        LANGUAGE plpgsql
    AS $body$
    DECLARE
        v_feature text;
    BEGIN
        IF new.organization_id IS NULL THEN
            -- Chamada de plataforma (pack base, sem org por trás) — nada do
            -- lojista para contabilizar, e ai_usage_logs.organization_id é
            -- NOT NULL.
            RETURN new;
        END IF;

        CASE new.purpose
            WHEN 'agent_reply'      THEN v_feature := 'runtime_agent_reply';
            WHEN 'judge_pre'        THEN v_feature := 'runtime_judge_pre';
            WHEN 'judge_async'      THEN v_feature := 'runtime_judge_async';
            WHEN 'prompt_generator' THEN v_feature := 'runtime_prompt_generator';
            WHEN 'copy_variation'   THEN v_feature := 'runtime_copy_variation';
            WHEN 'embedding'        THEN v_feature := 'runtime_embedding';
            ELSE
                RAISE EXCEPTION
                    'internal.llm_calls.purpose sem mapa para ai_usage_logs.feature: %', new.purpose;
        END CASE;

        INSERT INTO public.ai_usage_logs
            (organization_id, provider, model, feature, agent_id, conversation_id,
             prompt_tokens, completion_tokens, cost_usd, duration_ms, success)
        VALUES
            (new.organization_id, new.provider, new.model, v_feature, new.agent_id,
             new.conversation_id, COALESCE(new.input_tokens, 0), COALESCE(new.output_tokens, 0),
             new.cost_usd, new.latency_ms, true);
        -- ^ item 42: `new.cost_usd` propagado como está (NULL fica NULL) — era
        -- `coalesce(new.cost_usd, 0)`. `llm.py`'s `Usage.cost_usd: float | None`
        -- é `None` de propósito para OpenAI/Anthropic direto (a API não devolve
        -- custo); forçar 0 aqui era o mesmo achatamento que este item mata do
        -- outro lado (cost-tracker.ts).

        RETURN new;
    END;
    $body$;
END
$guard$;
