-- =============================================================================
-- WORDER AI — SCHEMA V1 (migration consolidada)
-- =============================================================================
-- Idempotente. Pode ser re-aplicada com segurança.
-- A seção 18 (migração de dados legados) está comentada — descomentar apenas
-- após validar a estrutura nova em dev.
-- =============================================================================

-- ============= 1. EXTENSÕES =============
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============= 2. TABELA ai_agents (CANÔNICA) =============
CREATE TABLE IF NOT EXISTS ai_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    store_id UUID,
    name TEXT NOT NULL,
    description TEXT,
    role TEXT NOT NULL DEFAULT 'sales' CHECK (role IN (
        'pre_sales', 'recovery', 'sales', 'post_sales', 'support', 'custom'
    )),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'simulating', 'published', 'paused', 'archived'
    )),
    current_version_id UUID,
    total_versions INTEGER NOT NULL DEFAULT 0,
    persona JSONB NOT NULL DEFAULT jsonb_build_object(
        'tone', 'friendly',
        'response_length', 'medium',
        'language', 'pt-BR',
        'reply_delay_seconds', 3,
        'split_messages', false
    ),
    identity JSONB NOT NULL DEFAULT jsonb_build_object(
        'context', '', 'personality', '', 'style', ''
    ),
    behavior JSONB NOT NULL DEFAULT jsonb_build_object(
        'persistence', '', 'primary_goal', '',
        'secondary_goals', '[]'::jsonb,
        'limitations', '', 'communication_rules', ''
    ),
    store_variables JSONB NOT NULL DEFAULT '{}'::jsonb,
    settings JSONB NOT NULL DEFAULT jsonb_build_object(
        'channels', jsonb_build_object('all_channels', true, 'channel_ids', '[]'::jsonb),
        'pipelines', jsonb_build_object('all_pipelines', true),
        'schedule', jsonb_build_object(
            'always_active', true,
            'timezone', 'America/Sao_Paulo',
            'hours', jsonb_build_object('start', '08:00', 'end', '18:00'),
            'days', '["mon","tue","wed","thu","fri"]'::jsonb
        ),
        'behavior', jsonb_build_object(
            'activate_on', 'new_message',
            'stop_on_human_reply', true,
            'cooldown_after_transfer', 300,
            'max_messages_per_conversation', 0
        )
    ),
    escalation_rules JSONB NOT NULL DEFAULT jsonb_build_object(
        'transfer_keywords', '[]'::jsonb,
        'max_attempts_before_escalate', 3,
        'escalate_on_low_confidence', true,
        'escalate_on_negative_sentiment', true,
        'escalate_to_user_id', null
    ),
    llm_config JSONB NOT NULL DEFAULT jsonb_build_object(
        'provider', 'openrouter',
        'model', 'anthropic/claude-sonnet-4.6',
        'fallback_model', 'anthropic/claude-haiku-4.5',
        'classifier_model', 'anthropic/claude-haiku-4.5',
        'temperature', 0.7,
        'max_tokens', 1000,
        'pipeline_mode', 'monolithic'
    ),
    safety JSONB NOT NULL DEFAULT jsonb_build_object(
        'anti_fraud_enabled', true,
        'never_request_card_data', true,
        'validate_pix_recipient', true,
        'official_contact_response', 'Nosso WhatsApp oficial é apenas o que você está usando agora.'
    ),
    metrics_cache JSONB NOT NULL DEFAULT jsonb_build_object(
        'last_30d_total_conversations', 0,
        'last_30d_resolved', 0,
        'last_30d_escalated', 0,
        'last_30d_revenue_attributed', 0,
        'last_30d_total_cost_usd', 0,
        'avg_response_time_ms', 0
    ),
    total_messages INTEGER NOT NULL DEFAULT 0,
    total_conversations INTEGER NOT NULL DEFAULT 0,
    total_tokens_used INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_user_id UUID,
    last_published_at TIMESTAMPTZ
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ai_agents_org_name_unique'
    ) THEN
        BEGIN
            ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_org_name_unique UNIQUE (organization_id, name);
        EXCEPTION WHEN duplicate_table THEN
            NULL;
        END;
    END IF;
END $$;

-- Adiciona colunas faltantes caso a tabela já existisse com schema antigo
ALTER TABLE ai_agents
    ADD COLUMN IF NOT EXISTS store_id UUID,
    ADD COLUMN IF NOT EXISTS role TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS current_version_id UUID,
    ADD COLUMN IF NOT EXISTS total_versions INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS persona JSONB,
    ADD COLUMN IF NOT EXISTS identity JSONB,
    ADD COLUMN IF NOT EXISTS behavior JSONB,
    ADD COLUMN IF NOT EXISTS store_variables JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS settings JSONB,
    ADD COLUMN IF NOT EXISTS escalation_rules JSONB,
    ADD COLUMN IF NOT EXISTS llm_config JSONB,
    ADD COLUMN IF NOT EXISTS safety JSONB,
    ADD COLUMN IF NOT EXISTS metrics_cache JSONB,
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID,
    ADD COLUMN IF NOT EXISTS last_published_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ai_agents_role_check'
    ) THEN
        BEGIN
            ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_role_check
                CHECK (role IN ('pre_sales', 'recovery', 'sales', 'post_sales', 'support', 'custom'));
        EXCEPTION WHEN others THEN
            NULL;
        END;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ai_agents_status_check'
    ) THEN
        BEGIN
            ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_status_check
                CHECK (status IN ('draft', 'simulating', 'published', 'paused', 'archived'));
        EXCEPTION WHEN others THEN
            NULL;
        END;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_agents_org ON ai_agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_org_status ON ai_agents(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_agents_role ON ai_agents(organization_id, role);

-- ============= 3. ai_agent_versions =============
CREATE TABLE IF NOT EXISTS ai_agent_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    version_number INTEGER NOT NULL,
    snapshot JSONB NOT NULL,
    deploy_notes TEXT,
    created_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metrics_post_publish JSONB DEFAULT '{}'::jsonb,
    UNIQUE (agent_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_ai_agent_versions_agent ON ai_agent_versions(agent_id, version_number DESC);

ALTER TABLE ai_agents
    DROP CONSTRAINT IF EXISTS ai_agents_current_version_fk;
ALTER TABLE ai_agents
    ADD CONSTRAINT ai_agents_current_version_fk
        FOREIGN KEY (current_version_id) REFERENCES ai_agent_versions(id) ON DELETE SET NULL;

-- ============= 4. ai_agent_sources + ai_agent_chunks =============
CREATE TABLE IF NOT EXISTS ai_agent_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    layer TEXT NOT NULL DEFAULT 'operational' CHECK (layer IN (
        'institutional', 'operational', 'catalog', 'faq', 'execution'
    )),
    source_type TEXT NOT NULL CHECK (source_type IN (
        'url', 'file', 'text', 'products', 'faq', 'integration'
    )),
    name TEXT NOT NULL,
    url TEXT,
    pages_crawled INTEGER DEFAULT 0,
    file_url TEXT,
    file_size_bytes INTEGER,
    original_filename TEXT,
    mime_type TEXT,
    text_content TEXT,
    integration_id UUID,
    integration_type TEXT,
    products_count INTEGER DEFAULT 0,
    last_product_sync_at TIMESTAMPTZ,
    faq_items JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'ready', 'error'
    )),
    error_message TEXT,
    chunks_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_indexed_at TIMESTAMPTZ
);

-- Adiciona colunas que podem não existir caso a tabela já tenha sido criada
ALTER TABLE ai_agent_sources
    ADD COLUMN IF NOT EXISTS layer TEXT NOT NULL DEFAULT 'operational',
    ADD COLUMN IF NOT EXISTS faq_items JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS last_indexed_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ai_agent_sources_layer_check'
    ) THEN
        BEGIN
            ALTER TABLE ai_agent_sources ADD CONSTRAINT ai_agent_sources_layer_check
                CHECK (layer IN ('institutional', 'operational', 'catalog', 'faq', 'execution'));
        EXCEPTION WHEN others THEN
            NULL;
        END;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_agent_sources_agent ON ai_agent_sources(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_sources_layer ON ai_agent_sources(agent_id, layer);

CREATE TABLE IF NOT EXISTS ai_agent_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES ai_agent_sources(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1024),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    token_count INTEGER NOT NULL DEFAULT 0,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    content_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_ai_agent_chunks_agent ON ai_agent_chunks(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_chunks_embedding
    ON ai_agent_chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ============= 5. ai_agent_tools =============
CREATE TABLE IF NOT EXISTS ai_agent_tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    tool_type TEXT NOT NULL CHECK (tool_type IN (
        'shopify_get_product', 'shopify_get_order', 'shopify_get_customer',
        'nuvemshop_get_product', 'nuvemshop_get_order',
        'tracking_lookup', 'save_contact_info', 'transfer_to_human',
        'add_tag', 'send_coupon', 'create_pix_link', 'create_boleto',
        'schedule_followup', 'add_to_segment', 'create_deal',
        'webhook_call', 'mcp_call', 'custom_function'
    )),
    name TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    usage_stats JSONB NOT NULL DEFAULT jsonb_build_object(
        'total_calls', 0, 'total_failures', 0,
        'avg_latency_ms', 0, 'last_used_at', null
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agent_id, tool_type)
);
CREATE INDEX IF NOT EXISTS idx_ai_agent_tools_agent ON ai_agent_tools(agent_id);

-- ============= 6. ai_agent_skills (F6) =============
CREATE TABLE IF NOT EXISTS ai_agent_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    trigger_phrases TEXT[] NOT NULL DEFAULT '{}',
    instructions TEXT NOT NULL,
    tools_used UUID[] NOT NULL DEFAULT '{}',
    enabled BOOLEAN NOT NULL DEFAULT true,
    total_invocations INTEGER NOT NULL DEFAULT 0,
    total_successes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_agent_skills_agent ON ai_agent_skills(agent_id);

-- ============= 7. ai_conversation_memory =============
CREATE TABLE IF NOT EXISTS ai_conversation_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    window_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary TEXT DEFAULT '',
    summary_token_count INTEGER NOT NULL DEFAULT 0,
    facts JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_intent TEXT,
    last_sentiment TEXT,
    funnel_stage TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (conversation_id, agent_id)
);
CREATE INDEX IF NOT EXISTS idx_ai_conv_memory_conv ON ai_conversation_memory(conversation_id);

-- ============= 8. ai_executions (TRACING) =============
CREATE TABLE IF NOT EXISTS ai_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    agent_version_id UUID REFERENCES ai_agent_versions(id) ON DELETE SET NULL,
    conversation_id UUID NOT NULL,
    message_id UUID,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    duration_ms INTEGER,
    input JSONB NOT NULL,
    llm_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
    tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
    final_output TEXT,
    final_messages_sent INTEGER NOT NULL DEFAULT 0,
    outcome TEXT CHECK (outcome IN (
        'success', 'converted', 'responded_positive', 'responded_negative',
        'no_response', 'escalated', 'error'
    )),
    outcome_assessed_at TIMESTAMPTZ,
    revenue_attributed_brl NUMERIC(12,2),
    tokens_total_in INTEGER NOT NULL DEFAULT 0,
    tokens_total_out INTEGER NOT NULL DEFAULT 0,
    cost_total_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
    eval_score INTEGER,
    eval_feedback JSONB,
    experiment_id UUID,
    experiment_variant TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_executions_agent ON ai_executions(agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_executions_conv ON ai_executions(conversation_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_executions_outcome ON ai_executions(outcome) WHERE outcome IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_executions_started ON ai_executions(started_at DESC);

-- ============= 9. ai_simulations (F4-F5) =============
CREATE TABLE IF NOT EXISTS ai_simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    agent_version_id UUID REFERENCES ai_agent_versions(id) ON DELETE SET NULL,
    organization_id UUID NOT NULL,
    scenario_name TEXT NOT NULL,
    persona_description TEXT NOT NULL,
    vertical TEXT,
    script_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    eval_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'running', 'success', 'failure', 'error'
    )),
    ran_at TIMESTAMPTZ,
    duration_ms INTEGER,
    transcript JSONB,
    eval_score INTEGER,
    eval_feedback JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_simulations_agent ON ai_simulations(agent_id, ran_at DESC);

-- ============= 10. ai_experiments =============
CREATE TABLE IF NOT EXISTS ai_experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    variants JSONB NOT NULL DEFAULT '[]'::jsonb,
    traffic_split_method TEXT NOT NULL DEFAULT 'hash_conversation',
    status TEXT NOT NULL DEFAULT 'draft',
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    winning_variant TEXT,
    significance_p_value NUMERIC(5,4),
    metrics_by_variant JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============= 11. ai_knowledge_gaps =============
CREATE TABLE IF NOT EXISTS ai_knowledge_gaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sample_conversation_id UUID,
    topic TEXT NOT NULL,
    sample_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    frequency INTEGER NOT NULL DEFAULT 1,
    confidence_avg NUMERIC(3,2),
    suggested_action TEXT,
    suggested_source_type TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
        'open', 'addressed', 'ignored', 'merged'
    )),
    addressed_by_user_id UUID,
    addressed_at TIMESTAMPTZ,
    addressed_source_id UUID REFERENCES ai_agent_sources(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============= 12. ai_costs_daily =============
CREATE TABLE IF NOT EXISTS ai_costs_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    agent_id UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_executions INTEGER NOT NULL DEFAULT 0,
    total_tokens_in INTEGER NOT NULL DEFAULT 0,
    total_tokens_out INTEGER NOT NULL DEFAULT 0,
    total_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
    cost_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, agent_id, date)
);
CREATE INDEX IF NOT EXISTS idx_ai_costs_daily_org ON ai_costs_daily(organization_id, date DESC);

-- ============= 13. Estender whatsapp_conversations =============
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'whatsapp_conversations'
    ) THEN
        EXECUTE 'ALTER TABLE whatsapp_conversations
            ADD COLUMN IF NOT EXISTS ai_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS ai_paused BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS ai_paused_reason TEXT,
            ADD COLUMN IF NOT EXISTS ai_paused_until TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS ai_paused_by_user_id UUID,
            ADD COLUMN IF NOT EXISTS outcome_reason TEXT,
            ADD COLUMN IF NOT EXISTS outcome_classified_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS funnel_stage TEXT';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_whatsapp_conv_ai_agent ON whatsapp_conversations(ai_agent_id) WHERE ai_agent_id IS NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_whatsapp_conv_ai_paused ON whatsapp_conversations(ai_paused, ai_paused_until) WHERE ai_paused = true';
    END IF;
END $$;

-- ============= 14. Estender messages =============
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
        EXECUTE 'ALTER TABLE messages
            ADD COLUMN IF NOT EXISTS sender_type TEXT,
            ADD COLUMN IF NOT EXISTS ai_metadata JSONB DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS ai_execution_id UUID,
            ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2),
            ADD COLUMN IF NOT EXISTS intent_detected TEXT,
            ADD COLUMN IF NOT EXISTS sentiment TEXT';

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'messages_sender_type_check'
        ) THEN
            BEGIN
                EXECUTE 'ALTER TABLE messages ADD CONSTRAINT messages_sender_type_check
                    CHECK (sender_type IS NULL OR sender_type IN (''contact'', ''ai_agent'', ''human_agent'', ''system''))';
            EXCEPTION WHEN others THEN
                NULL;
            END;
        END IF;

        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_messages_sender_type ON messages(sender_type) WHERE sender_type IS NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_messages_ai_execution ON messages(ai_execution_id) WHERE ai_execution_id IS NOT NULL';
    END IF;
END $$;

-- ============= 15. RLS POLICIES =============
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversation_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_knowledge_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_costs_daily ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'ai_agents', 'ai_agent_versions', 'ai_agent_sources', 'ai_agent_chunks',
        'ai_agent_tools', 'ai_agent_skills', 'ai_conversation_memory',
        'ai_executions', 'ai_simulations', 'ai_experiments',
        'ai_knowledge_gaps', 'ai_costs_daily'
    ])
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I_org_isolation ON %I', t, t);
        EXECUTE format('CREATE POLICY %I_org_isolation ON %I
            USING (organization_id = (SELECT auth.user_organization_id()))
            WITH CHECK (organization_id = (SELECT auth.user_organization_id()))', t, t);
    END LOOP;
END $$;

-- ============= 16. TRIGGERS updated_at =============
CREATE OR REPLACE FUNCTION ai_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'ai_agents', 'ai_agent_sources', 'ai_agent_tools', 'ai_agent_skills',
        'ai_conversation_memory', 'ai_experiments', 'ai_costs_daily'
    ])
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
        EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I
            FOR EACH ROW EXECUTE FUNCTION ai_set_updated_at()', t, t);
    END LOOP;
END $$;

-- ============= 17. RPC FUNCTIONS =============
CREATE OR REPLACE FUNCTION search_agent_chunks(
    p_agent_id UUID,
    p_query_embedding vector(1024),
    p_layers TEXT[] DEFAULT NULL,
    p_match_count INT DEFAULT 20,
    p_match_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
    chunk_id UUID, source_id UUID, layer TEXT,
    content TEXT, metadata JSONB, similarity FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT c.id, c.source_id, s.layer, c.content, c.metadata,
        1 - (c.embedding <=> p_query_embedding) AS similarity
    FROM ai_agent_chunks c
    INNER JOIN ai_agent_sources s ON s.id = c.source_id
    WHERE c.agent_id = p_agent_id
        AND s.status = 'ready'
        AND (p_layers IS NULL OR s.layer = ANY(p_layers))
        AND 1 - (c.embedding <=> p_query_embedding) > p_match_threshold
    ORDER BY c.embedding <=> p_query_embedding
    LIMIT p_match_count;
END;
$$;

-- ============= 18. MIGRAÇÃO DE DADOS LEGADOS (DESCOMENTAR APÓS VALIDAR) =============
/*
INSERT INTO ai_agents (
    id, organization_id, store_id, name, role, status,
    identity, llm_config, total_messages, total_conversations, created_at, updated_at
)
SELECT
    legacy.id, legacy.organization_id, legacy.store_id, legacy.name,
    CASE legacy.agent_type
        WHEN 'sales' THEN 'sales'
        WHEN 'support' THEN 'support'
        WHEN 'recovery' THEN 'recovery'
        ELSE 'sales'
    END,
    CASE WHEN legacy.is_active THEN 'published' ELSE 'paused' END,
    jsonb_build_object('context', legacy.system_prompt, 'personality', '', 'style', ''),
    jsonb_build_object(
        'provider', 'openrouter',
        'model', legacy.model,
        'temperature', legacy.temperature,
        'max_tokens', legacy.max_tokens
    ),
    legacy.total_messages, legacy.total_conversations,
    legacy.created_at, legacy.updated_at
FROM whatsapp_ai_agents legacy
WHERE NOT EXISTS (SELECT 1 FROM ai_agents a WHERE a.id = legacy.id);

-- Após validar:
-- DROP TABLE IF EXISTS whatsapp_ai_agents CASCADE;
-- DROP TABLE IF EXISTS whatsapp_ai_configs CASCADE;
-- DROP TABLE IF EXISTS whatsapp_ai_interactions CASCADE;
-- DROP TABLE IF EXISTS whatsapp_ai_analytics CASCADE;
*/

-- =============================================================================
-- FIM DA MIGRATION
-- =============================================================================
