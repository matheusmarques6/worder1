-- Tabela de atividades do contato
CREATE TABLE IF NOT EXISTS contact_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_contact_activities_contact_id ON contact_activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_activities_organization_id ON contact_activities(organization_id);
CREATE INDEX IF NOT EXISTS idx_contact_activities_created_at ON contact_activities(created_at DESC);

-- Habilitar RLS (mas permitir tudo por enquanto)
ALTER TABLE contact_activities ENABLE ROW LEVEL SECURITY;

-- Política simples que permite tudo (você pode ajustar depois)
CREATE POLICY "Allow all operations on contact_activities"
  ON contact_activities
  FOR ALL
  USING (true)
  WITH CHECK (true);
