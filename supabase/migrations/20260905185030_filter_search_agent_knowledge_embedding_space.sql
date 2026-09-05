-- RAGService generates direct-OpenAI 3-small queries. Equal dimensions do not
-- make legacy ada-002 vectors comparable; retain them but exclude this reader.
DO $guard$
BEGIN
    IF to_regclass('public.ai_agent_chunks') IS NULL THEN
        RAISE NOTICE 'ai_agent_chunks absent - skipping search_agent_knowledge embedding filter';
        RETURN;
    END IF;

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
          AND c.embedding_model = 'openai:text-embedding-3-small'
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
