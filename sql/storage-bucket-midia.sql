-- =============================================
-- CRIAR BUCKET PARA MÍDIA DO WHATSAPP
-- Execute no Supabase SQL Editor
-- =============================================

-- 1. Criar bucket para mídia do WhatsApp
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  true,  -- Público para URLs acessíveis
  52428800,  -- 50MB limite
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/opus', 'video/mp4', 'video/3gpp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- 2. Política para permitir upload via service_role (backend)
DROP POLICY IF EXISTS "Allow service role uploads" ON storage.objects;
CREATE POLICY "Allow service role uploads" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'whatsapp-media');

-- 3. Política para leitura pública
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
CREATE POLICY "Public read access" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'whatsapp-media');

-- 4. Política para delete via service_role
DROP POLICY IF EXISTS "Allow service role deletes" ON storage.objects;
CREATE POLICY "Allow service role deletes" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'whatsapp-media');

-- Verificar se bucket foi criado
SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'whatsapp-media';
