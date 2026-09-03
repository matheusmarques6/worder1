-- ============================================================================
-- 20260903000002_get_active_agent_for_conversation_versioned.sql
-- Auditoria 2026-08-28, item 49 — promove get_active_agent_for_conversation
-- pro stream versionado (ruling A do item).
--
-- Achado: a RPC tem DOIS chamadores de produção viva —
-- `src/lib/ai/cloud-runner.ts:428` (motor legado do canal Cloud, que decide se
-- o agente responde) e `src/lib/ai/conversation-ai-status.ts:157` (o badge
-- "Bot Ativo/Off" do cabeçalho do chat) — mais três de rota de debug
-- (`api/ai/test/route.ts:515`, `api/ai/test/webhook/route.ts:349`,
-- `whatsapp-integration.ts:68`). E ela NUNCA esteve em `supabase/migrations/`:
-- só existe em três arquivos de `sql/`, fora do que o CI aplica
-- (`runtime.yml:99` sobe `supabase start`, que aplica `supabase/migrations/`
-- e mais nada). Em qualquer base montada só do stream — CI, branch nova,
-- restore por replay — a função não existe, `.rpc()` RESOLVE com `{error}`
-- (não rejeita), e o badge do lojista passa a dizer "nenhum agente ativo"
-- quando a verdade é "a RPC não existe". Ver o conserto do lado TS no mesmo
-- item (ruling D).
--
-- PROMOVER NÃO É COPIAR — a lição do item 43. Nenhuma das três variantes foi
-- copiada como está:
--
--   A  sql/ai-agents-rpc-functions.sql:12-52
--      RETURNS TABLE(agent_id, agent_name, priority) com `1 as priority`.
--      SECURITY DEFINER, mas SEM `SET search_path` — sequestrável por um
--      `search_path` malicioso na sessão de quem chama (o mesmo defeito que
--      `20260902000004:70-73`, do item 43, corrigiu). GRANT service_role.
--   B  sql/ai-agents-functions.sql:100-139
--      RETURNS TABLE(agent_id, agent_name, provider, model). SEM
--      `SECURITY DEFINER` e com `GRANT ... TO authenticated` (`:236`).
--   C  sql/ai-agents-stored-procedures.sql:47-85
--      RETURNS TABLE(agent_id, agent_name, priority) com `0 AS priority`.
--      SEM `SECURITY DEFINER` e com `GRANT ... TO authenticated` (`:323`).
--
-- Por que B e C são um buraco de tenancy: `public.ai_agents` NASCE SEM RLS no
-- stream (`20260812000001_agents_baseline_prereqs.sql:653-672` cria a tabela;
-- não há `enable row level security` nem `create policy` sobre ela em
-- migration nenhuma — a RLS das tabelas de agente só é ligada em
-- `supabase/migrations-archive/001_enable_rls.sql`, fora do stream). Uma
-- função sem `SECURITY DEFINER` roda com os privilégios de quem chama; com
-- `GRANT` a `authenticated` e sem RLS por baixo, qualquer usuário autenticado
-- chamaria a função passando o `p_organization_id` que quisesse e receberia o
-- agente ativo de QUALQUER organização — enumeração cross-tenant da
-- configuração de agente. Mesmo formato registrado no item 70, e o que existe
-- em `sql/` continua lá: se alguém aplicou aquele arquivo à mão em produção, o
-- buraco está aberto lá e ESTA migration não o fecha — ela fecha o stream.
-- Nenhuma das três, além disso, faz `REVOKE ... FROM PUBLIC`: no Postgres
-- `CREATE FUNCTION` já concede EXECUTE a PUBLIC por padrão, então o
-- `GRANT ... TO service_role` da variante A não restringia nada, só somava.
--
-- O escopo por organização, esse, as três JÁ tinham (`a.organization_id =
-- p_organization_id`) — este item NÃO é o item 43 nesse ponto. O predicado de
-- seleção é idêntico palavra por palavra nas três e foi preservado como está:
-- org + `is_active`, casamento de canal contra `settings->'channels'`
-- (`all_channels` ou `channel_ids`) e de pipeline contra `settings->'pipelines'`,
-- `ORDER BY a.created_at ASC LIMIT 1`. Nenhuma mudança de comportamento de
-- seleção entra aqui.
--
-- O RETURNS encolhe para a INTERSEÇÃO do que os cinco chamadores consomem:
-- (agent_id, agent_name). Nenhum dos cinco lê `priority`, `provider` ou
-- `model` — os três "vivos" vão buscar o agente completo em `ai_agents` logo
-- depois (`cloud-runner.ts:449-453`, `conversation-ai-status.ts:165-169`,
-- `whatsapp-integration.ts:83-87`), e é de lá que `provider`/`model` saem,
-- nunca da RPC. `priority` era literal constante (1 em A, 0 em C) e ninguém a
-- lia. Encolher é seguro E indetectável por compilador: `supabaseAdmin` é
-- `SupabaseClient` SEM genérico `Database` (`src/lib/supabase-admin.ts:66`),
-- não há `createClient<Database>` em `src/` nem `Functions` declarado em
-- `src/lib/supabase.ts`, logo `.rpc()` devolve `any`. `npx tsc --noEmit` não
-- reclamaria se o shape estivesse ERRADO — a prova de que está certo é a
-- leitura dos cinco consumos, não o compilador.
--
-- A ASSINATURA É CONTRATO DE POSTGREST, não estilo. Os cinco chamadores
-- passam os três parâmetros POR NOME (`p_organization_id`, `p_channel_id`,
-- `p_pipeline_stage_id` — `cloud-runner.ts:430-432`,
-- `conversation-ai-status.ts:158-160`, `test/route.ts:517-519`,
-- `test/webhook/route.ts:351-353`, `whatsapp-integration.ts:70-72`), e
-- PostgREST resolve por nome. Renomear qualquer um quebraria as cinco chamadas
-- SEM erro de compilação. Nomes, ordem e os `DEFAULT null` preservados
-- exatamente como estavam.
--
-- Quem pode chamar: só `service_role`. Os cinco chamadores são server-side com
-- service role, conferido por import e não por pasta — quatro usam
-- `supabaseAdmin` e o quinto (`whatsapp-integration.ts:68`) usa `getSupabase()`,
-- wrapper de uma linha de `getSupabaseAdmin`. `src/lib/supabase-admin.ts:40,49`
-- monta o cliente com `SUPABASE_SERVICE_ROLE_KEY` e `:18-24` LANÇA se o módulo
-- for importado no browser — o próprio módulo garante que nenhum destes cinco
-- roda com `anon`. Zero Edge Function, zero componente de cliente, zero Python
-- (o runtime resolve o agente com SQL inline em
-- `runtime/src/agents_runtime/repository/agent.py:117-134`). Portanto o GRANT
-- mais restritivo possível não quebra rota nenhuma.
--
-- DROP antes do CREATE, e um só cobre as três: o RETURNS muda (some `priority`,
-- somem `provider`/`model`) e Postgres não deixa trocar tipo de retorno com
-- `CREATE OR REPLACE`. As três variantes têm a MESMA lista de tipos de
-- argumento (uuid, uuid, uuid) e `DROP` casa por tipo, ignorando `DEFAULT` —
-- um `DROP FUNCTION IF EXISTS ...(uuid, uuid, uuid)` derruba qualquer uma das
-- três que tenha sido aplicada à mão. Idempotente onde nenhuma existia.
--
-- Guardada com `to_regclass('public.ai_agents')` e TODA a DDL dentro do bloco
-- (drop, create, revoke, grant) — molde de `20260902000004` (item 43), cujo
-- ensinamento do item 0a era justamente que uma instrução deixada fora do
-- bloco derruba a montagem do schema.
--
-- O que NÃO entra neste item, e por quê (fica escrito pra ninguém achar que
-- ficou esquecido):
--   * `check_agent_cooldown` e `count_agent_messages_in_conversation` — lixo,
--     não promoção. Chamador único (`whatsapp-integration.ts:95,108`), no
--     arquivo de 250 linhas que o item 58 apaga, atrás de uma rota de debug
--     que responde 404 sem `DEBUG_ENDPOINT_SECRET`. O próprio repositório já
--     as declarou legadas por escrito
--     (`migrations-archive/whatsapp-cloud-ai-enable.sql:7-14`), substituídas
--     por helpers TS (`cloud-runner.ts:500-556`) e Python (`guards.py:191,307`).
--     E escopá-las por organização é insanável hoje: as variantes que leem
--     `whatsapp_messages` batem numa tabela SEM coluna `organization_id`, e as
--     que leem `ai_usage_logs` batem numa tabela que o stream não cria.
--     Versionar agora seria versionar para o item 58 apagar.
--   * `update_agent_stats` e `increment_agent_conversations` — território do
--     item 67 (contadores sem escritor no runtime). Promovê-las versionaria
--     capacidade que o motor novo não usa: nenhum arquivo em `runtime/` chama
--     qualquer uma das duas, então para org migrada os contadores continuam
--     congelados com ou sem migration.
--   * `ai_monthly_cost_usd` — JÁ promovida, pelo item 42
--     (`20260902000003:102-125`). A frase do item 49 que a listava como
--     pendente estava obsoleta e foi corrigida no checklist.
--
-- SEM POSTGRES NESTA MÁQUINA (ruling F, mesmo impedimento dos itens 42, 43,
-- 45 e 46): esta migration NÃO foi aplicada nem testada. Lida por inspeção
-- apenas. E, como o ruling E deste mesmo item apurou, a família `20260902*`
-- inteira também nunca foi aplicada por CI — o último run foi anterior a ela.
-- ============================================================================

DO $guard$
BEGIN
    IF to_regclass('public.ai_agents') IS NULL THEN
        RAISE NOTICE 'ai_agents ausente — pulando promocao de get_active_agent_for_conversation (item 49)';
        RETURN;
    END IF;

    -- Cobre as três variantes de sql/ de uma vez: mesma lista de tipos, e o
    -- DROP é obrigatório porque o RETURNS encolhe.
    DROP FUNCTION IF EXISTS public.get_active_agent_for_conversation(uuid, uuid, uuid);

    CREATE FUNCTION public.get_active_agent_for_conversation(
        p_organization_id   uuid,
        p_channel_id        uuid DEFAULT NULL,
        p_pipeline_stage_id uuid DEFAULT NULL
    )
    RETURNS TABLE (
        agent_id   uuid,
        agent_name text
    )
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $body$
        SELECT a.id, a.name
        FROM   public.ai_agents a
        WHERE  a.organization_id = p_organization_id
          AND  a.is_active = true
          -- Canal: agente "todos os canais", ou chamada sem canal, ou canal
          -- listado em settings->'channels'->'channel_ids'.
          AND (
                (a.settings->'channels'->>'all_channels')::boolean = true
             OR p_channel_id IS NULL
             OR p_channel_id::text = ANY (
                    SELECT jsonb_array_elements_text(a.settings->'channels'->'channel_ids')
                )
          )
          -- Pipeline/etapa: mesma regra, contra settings->'pipelines'.
          AND (
                (a.settings->'pipelines'->>'all_pipelines')::boolean = true
             OR p_pipeline_stage_id IS NULL
             OR p_pipeline_stage_id::text = ANY (
                    SELECT jsonb_array_elements_text(a.settings->'pipelines'->'stage_ids')
                )
          )
        ORDER BY a.created_at ASC
        LIMIT 1;
    $body$;

    -- CREATE FUNCTION concede EXECUTE a PUBLIC por padrão: sem estes REVOKE o
    -- GRANT abaixo não restringiria nada (o defeito da variante A de sql/).
    REVOKE EXECUTE ON FUNCTION public.get_active_agent_for_conversation(uuid, uuid, uuid) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.get_active_agent_for_conversation(uuid, uuid, uuid) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.get_active_agent_for_conversation(uuid, uuid, uuid) FROM authenticated;
    GRANT  EXECUTE ON FUNCTION public.get_active_agent_for_conversation(uuid, uuid, uuid) TO service_role;
END
$guard$;
