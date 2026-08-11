-- =====================================================
-- Migration: Criar tabela ai_message_logs
-- Objetivo: Idempotência para processamento de mensagens via fila
-- =====================================================

-- Tabela para registrar mensagens processadas pela IA
-- Evita reprocessamento duplicado quando QStash faz retry
CREATE TABLE IF NOT EXISTS ai_message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificador único da mensagem (do WhatsApp)
  message_id TEXT NOT NULL,
  
  -- Referências
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  
  -- Resultado do processamento
  processed BOOLEAN NOT NULL DEFAULT false,
  replied BOOLEAN NOT NULL DEFAULT false,
  transferred BOOLEAN NOT NULL DEFAULT false,
  
  -- Erro se houver
  error TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraint única para idempotência
  CONSTRAINT ai_message_logs_message_id_unique UNIQUE (message_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ai_message_logs_conversation 
  ON ai_message_logs(conversation_id);

CREATE INDEX IF NOT EXISTS idx_ai_message_logs_organization 
  ON ai_message_logs(organization_id);

CREATE INDEX IF NOT EXISTS idx_ai_message_logs_created 
  ON ai_message_logs(created_at DESC);

-- RLS
ALTER TABLE ai_message_logs ENABLE ROW LEVEL SECURITY;

-- Policy: usuários veem logs da própria organização
CREATE POLICY "Users can view own org message logs"
  ON ai_message_logs
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: apenas service role pode inserir/atualizar
CREATE POLICY "Service role can manage message logs"
  ON ai_message_logs
  FOR ALL
  USING (auth.role() = 'service_role');

-- Comentários
COMMENT ON TABLE ai_message_logs IS 'Log de mensagens processadas pela IA para garantir idempotência';
COMMENT ON COLUMN ai_message_logs.message_id IS 'ID único da mensagem do WhatsApp (key.id)';
COMMENT ON COLUMN ai_message_logs.processed IS 'Se a mensagem foi processada (passou pelos gates)';
COMMENT ON COLUMN ai_message_logs.replied IS 'Se o agente respondeu à mensagem';
COMMENT ON COLUMN ai_message_logs.transferred IS 'Se houve transferência para humano';
