-- Auditoria do Motor de IA, item 70.
--
-- Scripts históricos fora do stream criavam overloads sem escopo e grants
-- de escrita públicos. Não removemos funções ou dados de uma base existente:
-- apenas retiramos capacidade pública. As versões canônicas de busca e de
-- resolução do agente e a métrica ainda consumida continuam executáveis por
-- service_role.

DO $guard$
DECLARE
    target record;
BEGIN
    FOR target IN
        SELECT p.oid::regprocedure AS signature,
               p.proname,
               pg_get_function_identity_arguments(p.oid) AS arguments
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN (
               'search_agent_knowledge',
               'get_active_agent_for_conversation',
               'increment_action_trigger',
               'update_agent_stats'
           )
    LOOP
        EXECUTE format(
            'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC',
            target.signature
        );
        IF to_regrole('anon') IS NOT NULL THEN
            EXECUTE format(
                'REVOKE EXECUTE ON FUNCTION %s FROM anon',
                target.signature
            );
        END IF;
        IF to_regrole('authenticated') IS NOT NULL THEN
            EXECUTE format(
                'REVOKE EXECUTE ON FUNCTION %s FROM authenticated',
                target.signature
            );
        END IF;

        -- Sem chamador de produção: nem service_role conserva capacidade.
        -- A busca sem organization_id também não é a interface canônica.
        -- update_agent_stats é chamada por src/lib/ai/engine.ts e preserva o
        -- grant de service_role enquanto o item 67 não promover substituta.
        IF target.proname = 'increment_action_trigger'
           OR (
               target.proname = 'search_agent_knowledge'
               AND target.arguments NOT LIKE '%p_organization_id%'
           )
        THEN
            IF to_regrole('service_role') IS NOT NULL THEN
                EXECUTE format(
                    'REVOKE EXECUTE ON FUNCTION %s FROM service_role',
                    target.signature
                );
            END IF;
        END IF;
    END LOOP;
END
$guard$;
