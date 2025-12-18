-- =====================================================
-- ADICIONAR PHONEBOOK ÀS CAMPANHAS
-- =====================================================
-- Execute no Supabase SQL Editor
-- =====================================================

-- Adicionar coluna audience_phonebook_id na tabela de campanhas
ALTER TABLE whatsapp_campaigns 
ADD COLUMN IF NOT EXISTS audience_phonebook_id UUID REFERENCES phonebooks(id);

-- Criar índice para busca por phonebook
CREATE INDEX IF NOT EXISTS idx_campaigns_phonebook ON whatsapp_campaigns(audience_phonebook_id);

-- =====================================================
-- TABELAS DE PHONEBOOKS (se não existirem)
-- =====================================================

-- Tabela de Phonebooks (listas de contatos)
CREATE TABLE IF NOT EXISTS phonebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  contact_count INTEGER DEFAULT 0,
  
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Contatos do Phonebook
CREATE TABLE IF NOT EXISTS phonebook_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  phonebook_id UUID NOT NULL REFERENCES phonebooks(id) ON DELETE CASCADE,
  
  name VARCHAR(255),
  mobile VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  
  custom_fields JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_phonebooks_org ON phonebooks(organization_id);
CREATE INDEX IF NOT EXISTS idx_phonebook_contacts_pb ON phonebook_contacts(phonebook_id);
CREATE INDEX IF NOT EXISTS idx_phonebook_contacts_org ON phonebook_contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_phonebook_contacts_mobile ON phonebook_contacts(mobile);

-- RLS
ALTER TABLE phonebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE phonebook_contacts ENABLE ROW LEVEL SECURITY;

-- Policies (permitir tudo para service role)
DROP POLICY IF EXISTS "phonebooks_access" ON phonebooks;
CREATE POLICY "phonebooks_access" ON phonebooks FOR ALL USING (true);

DROP POLICY IF EXISTS "phonebook_contacts_access" ON phonebook_contacts;
CREATE POLICY "phonebook_contacts_access" ON phonebook_contacts FOR ALL USING (true);

-- =====================================================
-- TRIGGER: Atualizar contact_count automaticamente
-- =====================================================
CREATE OR REPLACE FUNCTION update_phonebook_contact_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE phonebooks 
    SET contact_count = contact_count + 1, updated_at = NOW()
    WHERE id = NEW.phonebook_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE phonebooks 
    SET contact_count = GREATEST(contact_count - 1, 0), updated_at = NOW()
    WHERE id = OLD.phonebook_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_phonebook_contact_count ON phonebook_contacts;
CREATE TRIGGER trigger_phonebook_contact_count
  AFTER INSERT OR DELETE ON phonebook_contacts
  FOR EACH ROW EXECUTE FUNCTION update_phonebook_contact_count();

-- =====================================================
-- RECALCULAR CONTAGENS EXISTENTES
-- =====================================================
UPDATE phonebooks p
SET contact_count = (
  SELECT COUNT(*) FROM phonebook_contacts pc WHERE pc.phonebook_id = p.id
);

-- =====================================================
-- DONE!
-- =====================================================
SELECT 'Migração concluída com sucesso!' as status;
