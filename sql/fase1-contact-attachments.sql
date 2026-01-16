-- =============================================
-- FASE 1: ANEXOS DO CONTATO
-- Execute este SQL no Supabase Dashboard > SQL Editor
-- =============================================

-- Tabela de anexos
CREATE TABLE IF NOT EXISTS contact_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  
  -- Dados do arquivo
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,
  
  -- Metadata
  description TEXT,
  category VARCHAR(50) DEFAULT 'document', -- document, contract, invoice, proposal, image, other
  
  -- Quem fez upload
  uploaded_by UUID,
  uploaded_by_name VARCHAR(255),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_attachments_contact ON contact_attachments(contact_id);
CREATE INDEX IF NOT EXISTS idx_attachments_org ON contact_attachments(organization_id);
CREATE INDEX IF NOT EXISTS idx_attachments_category ON contact_attachments(organization_id, category);

-- Habilitar RLS
ALTER TABLE contact_attachments ENABLE ROW LEVEL SECURITY;

-- Policies de segurança
DROP POLICY IF EXISTS "attachments_select" ON contact_attachments;
CREATE POLICY "attachments_select" ON contact_attachments 
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "attachments_insert" ON contact_attachments;
CREATE POLICY "attachments_insert" ON contact_attachments 
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "attachments_delete" ON contact_attachments;
CREATE POLICY "attachments_delete" ON contact_attachments 
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- =============================================
-- IMPORTANTE: Criar bucket no Supabase Storage
-- Nome: contact-files
-- Public: true
-- Allowed MIME types: image/*, application/pdf, application/msword, 
--   application/vnd.openxmlformats-officedocument.wordprocessingml.document,
--   application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
-- =============================================

-- Comentário: Após executar este SQL, vá em Storage > New Bucket
-- e crie o bucket "contact-files" com as configurações acima
