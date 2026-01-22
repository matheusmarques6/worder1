-- =====================================================
-- SQL: CRIAR TABELA contact_comments
-- Execute este SQL no Supabase se a tabela não existir
-- =====================================================

-- Verificar se a tabela já existe
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contact_comments') THEN
    
    CREATE TABLE contact_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      contact_id UUID NOT NULL,
      conversation_id UUID,
      deal_id UUID,
      task_id UUID,
      
      content TEXT NOT NULL,
      comment_type TEXT DEFAULT 'note', -- note, call_log, meeting_note, important, follow_up
      
      is_pinned BOOLEAN DEFAULT false,
      pinned_at TIMESTAMPTZ,
      pinned_by UUID,
      
      mentions UUID[] DEFAULT '{}',
      
      created_by UUID,
      created_by_name TEXT,
      
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    -- Índices
    CREATE INDEX idx_contact_comments_org ON contact_comments(organization_id);
    CREATE INDEX idx_contact_comments_contact ON contact_comments(contact_id);
    CREATE INDEX idx_contact_comments_conversation ON contact_comments(conversation_id);
    CREATE INDEX idx_contact_comments_created ON contact_comments(created_at DESC);

    -- RLS
    ALTER TABLE contact_comments ENABLE ROW LEVEL SECURITY;

    -- Policy: Usuários podem ver comments da sua organização
    CREATE POLICY "Users can view own org comments" ON contact_comments
      FOR SELECT USING (
        organization_id IN (
          SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
      );

    -- Policy: Usuários podem inserir comments na sua organização
    CREATE POLICY "Users can insert own org comments" ON contact_comments
      FOR INSERT WITH CHECK (
        organization_id IN (
          SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
      );

    -- Policy: Usuários podem atualizar comments da sua organização
    CREATE POLICY "Users can update own org comments" ON contact_comments
      FOR UPDATE USING (
        organization_id IN (
          SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
      );

    -- Policy: Usuários podem deletar comments da sua organização
    CREATE POLICY "Users can delete own org comments" ON contact_comments
      FOR DELETE USING (
        organization_id IN (
          SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
      );

    -- Trigger para updated_at
    CREATE OR REPLACE FUNCTION update_contact_comments_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_contact_comments_updated_at
      BEFORE UPDATE ON contact_comments
      FOR EACH ROW
      EXECUTE FUNCTION update_contact_comments_updated_at();

    RAISE NOTICE 'Tabela contact_comments criada com sucesso!';
  ELSE
    RAISE NOTICE 'Tabela contact_comments já existe.';
  END IF;
END $$;

-- Habilitar Realtime (opcional)
ALTER PUBLICATION supabase_realtime ADD TABLE contact_comments;
