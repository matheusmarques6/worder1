-- =============================================
-- HABILITAR REALTIME PARA CRM
-- Execute no Supabase SQL Editor
-- =============================================

-- Habilitar realtime para a tabela deals
ALTER PUBLICATION supabase_realtime ADD TABLE deals;

-- Habilitar realtime para a tabela contacts
ALTER PUBLICATION supabase_realtime ADD TABLE contacts;

-- Verificar se está habilitado
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- NOTA: Se der erro dizendo que já está adicionado, ignore.
-- O importante é que as tabelas apareçam na query de verificação.
