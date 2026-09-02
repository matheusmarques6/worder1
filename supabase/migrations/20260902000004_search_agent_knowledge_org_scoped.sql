-- ============================================================================
-- 20260902000004_search_agent_knowledge_org_scoped.sql
-- Auditoria 2026-08-28, item 43 — promove search_agent_knowledge pro stream
-- versionado, escopada por organização (ruling A + B do item).
--
-- Achado (item 43): RAGService.search() (src/lib/ai/rag.ts) chama a RPC
-- search_agent_knowledge; se ela falhar — `.rpc()` do supabase-js RESOLVE com
-- {data, error} em vez de rejeitar, o `try/catch` da linha 68 nunca dispara —
-- a execução cai, por ausência de `return`/`throw`, num fallback (searchDirect)
-- que varre TODOS os chunks do agente sem `.limit()` e calcula cosseno em JS.
-- `supabase/config.toml:17` fixa `max_rows = 1000` (default do PostgREST):
-- acima de 1000 chunks por agente, o fallback devolve vizinhos ERRADOS,
-- apresentados como certos — nenhum dos quatro chamadores (engine.ts,
-- ai-chatbot-service.ts, search_knowledge.ts, api/ai/test/route.ts) distingue
-- resultado da RPC de resultado do fallback truncado; array não-vazio é
-- sempre tratado como válido.
--
-- Impedimento que mudou a ordem do trabalho: search_agent_knowledge NUNCA
-- esteve em supabase/migrations/ (o item 49 já registra isso, de forma
-- independente) — só existe em quatro arquivos de sql/, fora do que o CI
-- aplica. Apagar o fallback ANTES de promover a RPC trocaria "resultado
-- errado em silêncio" por "busca quebrada em qualquer base montada só do
-- stream" (CI, branch nova, restore via replay de migrations) — pior, não
-- melhor. Esta migration promove a RPC; o fallback sai num commit separado,
-- DEPOIS desta, só depois que a RPC já existe no stream.
--
-- Ruling B — por que NENHUMA das quatro definições de sql/ foi copiada como
-- está: todas filtram só por `c.agent_id = p_agent_id`, e `ai_agent_chunks`
-- tem `organization_id not null` (20260812000001_agents_baseline_prereqs.sql
-- :731) que nenhuma delas usa. Pior: `sql/ai-agents-functions.sql:9-38,233`
-- dá `GRANT ... TO authenticated` numa função SEM `SECURITY DEFINER` — e a
-- RLS de `ai_agent_chunks` só é ligada em
-- `supabase/migrations-archive/001_enable_rls.sql`, FORA do stream versionado
-- (a tabela nasce sem RLS neste stream). Numa base montada só do stream, essa
-- variante daria a QUALQUER usuário autenticado leitura dos chunks de
-- qualquer organização, bastando adivinhar (ou enumerar) um agent_id — o
-- mesmo padrão de buraco de tenancy que os itens 03, 04, 22 e 24 já fecharam
-- nesta auditoria. Registrado como achado de segurança novo, item 70 do
-- checklist (docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md) — o que existe em
-- sql/ pode ter sido aplicado em produção fora deste repositório, e isso não
-- é consertado por esta migration nem por qualquer outra ação daqui.
--
-- Base escolhida: sql/ai-agents-rpc-functions.sql:197-227 — SECURITY DEFINER,
-- GRANT só para service_role. É a mais conservadora das quatro quanto a quem
-- pode chamar, e bate com quem de fato chama: RAGService (rag.ts:19-32) só é
-- construído server-side, com a service role key (ou anon key só como
-- fallback de configuração, nunca em código que roda no navegador). As outras
-- três (sql/ai-agents-functions.sql, sql/ai-agents-stored-procedures.sql,
-- sql/ai-agents-complete-migration.sql) OU dão GRANT para authenticated OU
-- nem declaram SECURITY DEFINER. A variante de
-- sql/ai-agents-stored-procedures.sql:11-40 também muda comportamento (JOIN
-- em ai_agent_sources filtrando `status = 'ready'`, que as outras três não
-- fazem) — não replicada aqui para não misturar uma mudança de comportamento
-- nova com a correção de tenancy que este item exige; fica junto do resto no
-- item 70.
--
-- O que muda sobre a base escolhida, além do escopo por organização:
-- 1) `p_organization_id UUID` acrescentado como parâmetro OBRIGATÓRIO (sem
--    DEFAULT) — filtra `c.organization_id = p_organization_id` ALÉM de
--    `c.agent_id = p_agent_id`. `RAGService` passa a receber
--    `organizationId` no construtor (via `createRAGServiceForOrg`, o ÚNICO
--    ponto de construção usado em produção — `grep` confirma) e envia como
--    parâmetro da RPC: não é dado que o cliente HTTP escolhe, é o mesmo
--    `organizationId` que o servidor já resolveu antes de instanciar o
--    serviço.
-- 2) Comparador do threshold trocado de `>` (base escolhida) para `>=`, para
--    bater com o fallback que sai no próximo commit (`searchDirect`,
--    rag.ts:131, usa `similarity >= threshold`) — preserva o comportamento de
--    fronteira que já existia, não é uma decisão nova deste item.
-- 3) `search_path` fixado (`SET search_path = public`) — SECURITY DEFINER sem
--    isso é sequestrável por um `search_path` malicioso na sessão de quem
--    chama; a base escolhida não tinha essa linha, `ai_monthly_cost_usd`
--    (item 42, 20260902000003) já usa o mesmo padrão.
-- 4) `DROP FUNCTION IF EXISTS` da assinatura antiga (sem p_organization_id)
--    antes do CREATE — evita que a versão sem escopo de organização
--    sobreviva como overload paralelo numa base onde alguém aplicou um dos
--    quatro arquivos de sql/ manualmente. Idempotente onde a assinatura
--    antiga nunca existiu (CI, branch nova).
--
-- Ruling E — guardada com to_regclass, como o item 0a e o item 42 ensinaram:
-- base sem `ai_agent_chunks` vira no-op com aviso, e TODA a DDL (drop, create,
-- revoke, grant) fica dentro do bloco guardado — o defeito do item 0a era
-- justamente uma instrução deixada fora do bloco.
--
-- Ruling F — o item 49 registra 4 RPCs fora do stream versionado; só
-- `search_agent_knowledge` sai daqui. O corpo do item 49 foi atualizado para
-- refletir que essa uma já foi promovida, e encolher em vez de duplicar.
--
-- Ruling G — NÃO HÁ POSTGRES NESTA MÁQUINA: esta migration não foi aplicada
-- nem testada. Lida por inspeção apenas, no mesmo molde da migration do item
-- 42 (20260902000003), que teve o mesmo impedimento.
-- ============================================================================

DO $guard$
BEGIN
    IF to_regclass('public.ai_agent_chunks') IS NULL THEN
        RAISE NOTICE 'ai_agent_chunks ausente — pulando promocao de search_agent_knowledge (item 43)';
        RETURN;
    END IF;

    -- Assinatura antiga (sem p_organization_id) pode existir numa base onde
    -- um dos quatro arquivos de sql/ foi aplicado manualmente fora do stream.
    -- Derruba antes de criar a versão escopada, pra não sobrar como overload
    -- paralelo chamável sem o filtro de organização.
    DROP FUNCTION IF EXISTS public.search_agent_knowledge(uuid, vector, float, int);

    CREATE OR REPLACE FUNCTION public.search_agent_knowledge(
        p_agent_id UUID,
        p_organization_id UUID,
        p_query_embedding vector(1536),
        p_match_threshold FLOAT DEFAULT 0.7,
        p_match_count INT DEFAULT 5
    )
    RETURNS TABLE (
        chunk_id UUID,
        source_id UUID,
        content TEXT,
        metadata JSONB,
        similarity FLOAT
    )
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    BEGIN
        RETURN QUERY
        SELECT
            c.id AS chunk_id,
            c.source_id,
            c.content,
            c.metadata,
            (1 - (c.embedding <=> p_query_embedding))::FLOAT AS similarity
        FROM public.ai_agent_chunks c
        WHERE c.agent_id = p_agent_id
          AND c.organization_id = p_organization_id
          AND c.embedding IS NOT NULL
          AND (1 - (c.embedding <=> p_query_embedding)) >= p_match_threshold
        ORDER BY c.embedding <=> p_query_embedding
        LIMIT p_match_count;
    END;
    $body$;

    REVOKE EXECUTE ON FUNCTION public.search_agent_knowledge(uuid, uuid, vector, float, int) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.search_agent_knowledge(uuid, uuid, vector, float, int) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.search_agent_knowledge(uuid, uuid, vector, float, int) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.search_agent_knowledge(uuid, uuid, vector, float, int) TO service_role;
END
$guard$;
