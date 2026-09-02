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
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. cost_usd sem DEFAULT 0 — ausência de dado não vira gasto zero.
-- --------------------------------------------------------------------------
alter table public.ai_usage_logs
    alter column cost_usd drop default;

-- --------------------------------------------------------------------------
-- 2. ai_monthly_cost_usd devolve (spent_usd, has_unknown_cost). Muda o
--    tipo de retorno (NUMERIC → TABLE) — Postgres não deixa trocar isso
--    com CREATE OR REPLACE, precisa DROP + CREATE. DROP já derruba os
--    GRANTs da versão antiga; refeitos abaixo.
-- --------------------------------------------------------------------------
drop function if exists ai_monthly_cost_usd(uuid, timestamptz);

create function ai_monthly_cost_usd(
    p_organization_id uuid,
    p_month_start     timestamptz
)
returns table (spent_usd numeric, has_unknown_cost boolean)
language sql
stable
security definer
set search_path = public
as $$
    select
        coalesce(sum(cost_usd), 0)               as spent_usd,
        coalesce(bool_or(cost_usd is null), false) as has_unknown_cost
    from   ai_usage_logs
    where  organization_id = p_organization_id
      and  created_at >= p_month_start;
$$;

-- Mesma postura de segurança da versão original (20260616_ai_budgets.sql):
-- só service_role, nunca anon/authenticated/public.
revoke execute on function ai_monthly_cost_usd(uuid, timestamptz) from public;
revoke execute on function ai_monthly_cost_usd(uuid, timestamptz) from anon;
revoke execute on function ai_monthly_cost_usd(uuid, timestamptz) from authenticated;
grant execute on function ai_monthly_cost_usd(uuid, timestamptz) to service_role;

-- --------------------------------------------------------------------------
-- 3. O espelho do item 37 parava de inventar 0 pro custo desconhecido do
--    runtime. Redefine a função inteira (mesmo corpo de
--    20260902000001_ai_usage_logs_bridge.sql, só a linha do cost_usd no
--    INSERT muda) — signature idêntica, CREATE OR REPLACE basta aqui.
-- --------------------------------------------------------------------------
create or replace function internal.mirror_llm_call_to_usage_logs()
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
         new.cost_usd, new.latency_ms, true);
    -- ^ item 42: `new.cost_usd` propagado como está (NULL fica NULL) — era
    -- `coalesce(new.cost_usd, 0)`. `llm.py`'s `Usage.cost_usd: float | None`
    -- é `None` de propósito para OpenAI/Anthropic direto (a API não devolve
    -- custo); forçar 0 aqui era o mesmo achatamento que este item mata do
    -- outro lado (cost-tracker.ts).

    return new;
end;
$$;
