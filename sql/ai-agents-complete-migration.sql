-- =====================================================
-- MIGRAÇÃO COMPLETA: Sistema de Agentes de IA (Estilo Kommo)
-- Execute este SQL no Supabase SQL Editor
-- 
-- IMPORTANTE: Execute na ordem (ou tudo de uma vez)
-- =====================================================

-- =====================================================
-- PASSO 1: HABILITAR EXTENSÃO PGVECTOR
-- =====================================================
-- Necessário para embeddings e busca semântica (RAG)
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- PASSO 2: EXPANDIR TABELA DE AGENTES EXISTENTE
-- =====================================================

-- Verificar se tabela ai_agents existe, se não criar
CREATE TABLE IF NOT EXISTS ai_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT,
    provider TEXT DEFAULT 'openai',
    model TEXT DEFAULT 'gpt-4o-mini',
    temperature DECIMAL DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 500,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Adicionar colunas de Persona (se não existirem)
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS persona JSONB DEFAULT '{
    "role_description": "",
    "tone": "friendly",
    "response_length": "medium",
    "language": "pt-BR",
    "reply_delay": 3,
    "guidelines": []
}'::jsonb;

-- Adicionar colunas de Configurações
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{
    "channels": {"all_channels": true, "channel_ids": []},
    "pipelines": {"all_pipelines": true, "pipeline_ids": [], "stage_ids": []},
    "schedule": {"always_active": true, "timezone": "America/Sao_Paulo", "hours": {"start": "08:00", "end": "18:00"}, "days": ["mon","tue","wed","thu","fri"]},
    "behavior": {"activate_on": "new_message", "stop_on_human_reply": true, "cooldown_after_transfer": 300, "max_messages_per_conversation": 0}
}'::jsonb;

-- Adicionar métricas
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS total_messages INTEGER DEFAULT 0;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS total_conversations INTEGER DEFAULT 0;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS total_tokens_used INTEGER DEFAULT 0;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS avg_response_time_ms INTEGER DEFAULT 0;

-- Índices
CREATE INDEX IF NOT EXISTS idx_ai_agents_org ON ai_agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_active ON ai_agents(organization_id, is_active);

-- =====================================================
-- PASSO 3: FONTES DE CONHECIMENTO (Knowledge Base)
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_agent_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    
    -- Tipo: url, file, text, products
    source_type TEXT NOT NULL CHECK (source_type IN ('url', 'file', 'text', 'products')),
    name TEXT NOT NULL,
    
    -- Para URLs
    url TEXT,
    pages_crawled INTEGER DEFAULT 0,
    
    -- Para Arquivos
    file_url TEXT,
    file_size_bytes INTEGER,
    original_filename TEXT,
    mime_type TEXT,
    
    -- Para Texto
    text_content TEXT,
    
    -- Para Produtos (integração e-commerce)
    integration_id UUID,
    integration_type TEXT, -- shopify, woocommerce, nuvemshop
    products_count INTEGER DEFAULT 0,
    last_product_sync_at TIMESTAMPTZ,
    
    -- Status de processamento
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'error')),
    error_message TEXT,
    chunks_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ai_agent_sources_agent ON ai_agent_sources(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_sources_org ON ai_agent_sources(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_sources_status ON ai_agent_sources(status);

-- =====================================================
-- PASSO 4: CHUNKS VETORIZADOS (Para RAG)
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_agent_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    source_id UUID NOT NULL REFERENCES ai_agent_sources(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    
    -- Conteúdo
    content TEXT NOT NULL,
    content_tokens INTEGER,
    
    -- Metadados (página, seção, produto_id, etc)
    metadata JSONB DEFAULT '{}',
    
    -- Embedding (1536 dimensões para OpenAI text-embedding-ada-002)
    -- Se usar outro modelo, ajuste o tamanho
    embedding vector(1536),
    
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para busca vetorial (IVFFlat é mais rápido para datasets menores)
CREATE INDEX IF NOT EXISTS idx_ai_agent_chunks_embedding 
ON ai_agent_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Índices normais
CREATE INDEX IF NOT EXISTS idx_ai_agent_chunks_source ON ai_agent_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_chunks_agent ON ai_agent_chunks(agent_id);

-- =====================================================
-- PASSO 5: AÇÕES (When/Do Rules)
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_agent_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    
    -- Identificação
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0, -- Menor = executa primeiro
    
    -- Condições (WHEN)
    -- Formato: {"match_type": "all|any", "items": [...]}
    conditions JSONB NOT NULL DEFAULT '{"match_type": "all", "items": []}',
    
    -- Ações (DO)
    -- Formato: [{"type": "transfer|exact_message|use_source|ask_for|dont_mention|bring_up", ...}]
    actions JSONB NOT NULL DEFAULT '[]',
    
    -- Métricas
    times_triggered INTEGER DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ai_agent_actions_agent ON ai_agent_actions(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_actions_active ON ai_agent_actions(agent_id, is_active);

-- Trigger para limitar a 20 ações por agente
CREATE OR REPLACE FUNCTION check_agent_actions_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM ai_agent_actions WHERE agent_id = NEW.agent_id) >= 20 THEN
        RAISE EXCEPTION 'Limite de 20 ações por agente atingido';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_actions_limit ON ai_agent_actions;
CREATE TRIGGER enforce_actions_limit
    BEFORE INSERT ON ai_agent_actions
    FOR EACH ROW EXECUTE FUNCTION check_agent_actions_limit();

-- =====================================================
-- PASSO 6: INTEGRAÇÕES DO AGENTE (E-commerce)
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_agent_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    
    -- Referência à integração existente (tabela integrations/shopify_stores)
    integration_id UUID,
    integration_type TEXT NOT NULL CHECK (integration_type IN ('shopify', 'woocommerce', 'nuvemshop')),
    
    -- Configurações
    sync_products BOOLEAN DEFAULT true,
    sync_orders BOOLEAN DEFAULT true,
    allow_price_info BOOLEAN DEFAULT true,
    allow_stock_info BOOLEAN DEFAULT true,
    
    -- Fonte de produtos sincronizados (referência criada após sync)
    source_id UUID REFERENCES ai_agent_sources(id) ON DELETE SET NULL,
    
    -- Status
    last_sync_at TIMESTAMPTZ,
    products_synced INTEGER DEFAULT 0,
    sync_status TEXT DEFAULT 'pending',
    sync_error TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Um agente só pode ter uma integração de cada tipo
    UNIQUE(agent_id, integration_type)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ai_agent_integrations_agent ON ai_agent_integrations(agent_id);

-- =====================================================
-- PASSO 7: LOG DE USO DO AGENTE
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_agent_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    conversation_id UUID,
    
    -- Detalhes da chamada
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    
    -- Tokens
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    
    -- Custo estimado (em centavos USD)
    estimated_cost_cents DECIMAL(10,4) DEFAULT 0,
    
    -- Performance
    response_time_ms INTEGER,
    
    -- RAG info
    chunks_used INTEGER DEFAULT 0,
    sources_used TEXT[], -- IDs das fontes consultadas
    
    -- Ações disparadas
    actions_triggered TEXT[], -- IDs das ações disparadas
    
    -- Resultado
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ai_agent_usage_logs_agent ON ai_agent_usage_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_usage_logs_created ON ai_agent_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_usage_logs_org_date ON ai_agent_usage_logs(organization_id, created_at DESC);

-- =====================================================
-- PASSO 8: VINCULAR CONVERSAS AO AGENTE
-- =====================================================

-- Adicionar colunas na tabela de conversas (se existir)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'whatsapp_conversations') THEN
        ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS ai_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL;
        ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT true;
        ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS ai_disabled_at TIMESTAMPTZ;
        ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS ai_disabled_reason TEXT;
        
        CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_ai_agent ON whatsapp_conversations(ai_agent_id);
    END IF;
END $$;

-- =====================================================
-- PASSO 9: ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_usage_logs ENABLE ROW LEVEL SECURITY;

-- Função helper (se não existir)
CREATE OR REPLACE FUNCTION user_belongs_to_org(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND organization_id = org_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policies para ai_agents
DROP POLICY IF EXISTS "Users can view own org agents" ON ai_agents;
CREATE POLICY "Users can view own org agents" ON ai_agents
    FOR SELECT USING (user_belongs_to_org(organization_id));

DROP POLICY IF EXISTS "Users can insert own org agents" ON ai_agents;
CREATE POLICY "Users can insert own org agents" ON ai_agents
    FOR INSERT WITH CHECK (user_belongs_to_org(organization_id));

DROP POLICY IF EXISTS "Users can update own org agents" ON ai_agents;
CREATE POLICY "Users can update own org agents" ON ai_agents
    FOR UPDATE USING (user_belongs_to_org(organization_id));

DROP POLICY IF EXISTS "Users can delete own org agents" ON ai_agents;
CREATE POLICY "Users can delete own org agents" ON ai_agents
    FOR DELETE USING (user_belongs_to_org(organization_id));

-- Policies para ai_agent_sources
DROP POLICY IF EXISTS "Users can manage own org sources" ON ai_agent_sources;
CREATE POLICY "Users can manage own org sources" ON ai_agent_sources
    FOR ALL USING (user_belongs_to_org(organization_id));

-- Policies para ai_agent_chunks
DROP POLICY IF EXISTS "Users can manage own org chunks" ON ai_agent_chunks;
CREATE POLICY "Users can manage own org chunks" ON ai_agent_chunks
    FOR ALL USING (user_belongs_to_org(organization_id));

-- Policies para ai_agent_actions
DROP POLICY IF EXISTS "Users can manage own org actions" ON ai_agent_actions;
CREATE POLICY "Users can manage own org actions" ON ai_agent_actions
    FOR ALL USING (user_belongs_to_org(organization_id));

-- Policies para ai_agent_integrations
DROP POLICY IF EXISTS "Users can manage own org integrations" ON ai_agent_integrations;
CREATE POLICY "Users can manage own org integrations" ON ai_agent_integrations
    FOR ALL USING (user_belongs_to_org(organization_id));

-- Policies para ai_agent_usage_logs
DROP POLICY IF EXISTS "Users can view own org usage logs" ON ai_agent_usage_logs;
CREATE POLICY "Users can view own org usage logs" ON ai_agent_usage_logs
    FOR SELECT USING (user_belongs_to_org(organization_id));

-- =====================================================
-- PASSO 10: FUNÇÕES ÚTEIS
-- =====================================================

-- Função para busca semântica (RAG)
CREATE OR REPLACE FUNCTION search_agent_knowledge(
    p_agent_id UUID,
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
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as chunk_id,
        c.source_id,
        c.content,
        c.metadata,
        1 - (c.embedding <=> p_query_embedding) as similarity
    FROM ai_agent_chunks c
    WHERE c.agent_id = p_agent_id
    AND 1 - (c.embedding <=> p_query_embedding) > p_match_threshold
    ORDER BY c.embedding <=> p_query_embedding
    LIMIT p_match_count;
END;
$$;

-- Função para atualizar métricas do agente
CREATE OR REPLACE FUNCTION update_agent_metrics()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE ai_agents SET
        total_messages = total_messages + 1,
        total_tokens_used = total_tokens_used + NEW.total_tokens,
        updated_at = now()
    WHERE id = NEW.agent_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_agent_metrics_trigger ON ai_agent_usage_logs;
CREATE TRIGGER update_agent_metrics_trigger
    AFTER INSERT ON ai_agent_usage_logs
    FOR EACH ROW EXECUTE FUNCTION update_agent_metrics();

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers de updated_at
DROP TRIGGER IF EXISTS ai_agents_updated_at ON ai_agents;
CREATE TRIGGER ai_agents_updated_at
    BEFORE UPDATE ON ai_agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS ai_agent_sources_updated_at ON ai_agent_sources;
CREATE TRIGGER ai_agent_sources_updated_at
    BEFORE UPDATE ON ai_agent_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS ai_agent_actions_updated_at ON ai_agent_actions;
CREATE TRIGGER ai_agent_actions_updated_at
    BEFORE UPDATE ON ai_agent_actions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS ai_agent_integrations_updated_at ON ai_agent_integrations;
CREATE TRIGGER ai_agent_integrations_updated_at
    BEFORE UPDATE ON ai_agent_integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- PASSO 11: DADOS INICIAIS (Opcional)
-- =====================================================

-- Você pode descomentar isso para criar um agente de exemplo
/*
INSERT INTO ai_agents (
    organization_id,
    name,
    description,
    system_prompt,
    provider,
    model,
    temperature,
    max_tokens,
    is_active,
    persona
) VALUES (
    'SEU_ORGANIZATION_ID_AQUI',
    'Assistente de Vendas',
    'Agente de IA para atendimento ao cliente',
    'Você é um assistente de vendas prestativo e educado. Ajude os clientes com informações sobre produtos, preços e pedidos.',
    'openai',
    'gpt-4o-mini',
    0.3,
    500,
    true,
    '{
        "role_description": "Assistente de suporte ao cliente",
        "tone": "friendly",
        "response_length": "medium",
        "language": "pt-BR",
        "reply_delay": 3,
        "guidelines": [
            "Sempre cumprimente o cliente na primeira interação",
            "Seja conciso e objetivo nas respostas",
            "Ofereça ajuda adicional ao final de cada resposta"
        ]
    }'::jsonb
);
*/

-- =====================================================
-- FINALIZADO!
-- =====================================================
-- 
-- Tabelas criadas:
-- ✅ ai_agents (expandida com persona e settings)
-- ✅ ai_agent_sources (fontes de conhecimento)
-- ✅ ai_agent_chunks (chunks vetorizados para RAG)
-- ✅ ai_agent_actions (regras When/Do)
-- ✅ ai_agent_integrations (integrações e-commerce)
-- ✅ ai_agent_usage_logs (logs de uso)
--
-- Próximos passos:
-- 1. Criar APIs no Next.js
-- 2. Criar interface das 5 abas
-- 3. Implementar processamento de documentos
-- 4. Implementar motor de IA
-- =====================================================
