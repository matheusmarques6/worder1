-- =====================================================
-- SQL ADICIONAL - Suporte a Anexos nas Notas
-- Execute APÓS as correções anteriores
-- =====================================================

-- Adicionar coluna de anexos na tabela de notas
ALTER TABLE whatsapp_contact_notes 
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- Comentário para documentação
COMMENT ON COLUMN whatsapp_contact_notes.attachments IS 
'Array de anexos: [{type: "image"|"document", url: string, name: string, size?: number}]';

-- Atualizar schema cache
NOTIFY pgrst, 'reload schema';

-- Verificar
SELECT 'Coluna attachments adicionada!' as resultado;
