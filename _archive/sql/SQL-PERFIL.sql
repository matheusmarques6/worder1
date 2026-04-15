-- =====================================================
-- CONFIGURAÇÃO COMPLETA: PERFIL DE USUÁRIO
-- Execute cada seção separadamente no SQL Editor
-- =====================================================


-- =====================================================
-- 1. BUCKET DE AVATARS NO STORAGE
-- =====================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 
  'avatars', 
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;


-- =====================================================
-- 2. POLÍTICAS DE STORAGE PARA AVATARS
-- =====================================================

-- Permitir upload
CREATE POLICY "Users can upload avatars" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars');

-- Permitir atualização
CREATE POLICY "Users can update avatars" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'avatars');

-- Permitir deleção
CREATE POLICY "Users can delete avatars" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'avatars');

-- Permitir visualização pública
CREATE POLICY "Public avatar access" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'avatars');


-- =====================================================
-- 3. RLS NA TABELA PROFILES
-- =====================================================

-- Habilitar RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver seu próprio perfil
CREATE POLICY "Users can view own profile" ON profiles
FOR SELECT USING (auth.uid() = id);

-- Usuários podem atualizar seu próprio perfil
CREATE POLICY "Users can update own profile" ON profiles
FOR UPDATE USING (auth.uid() = id);

-- Usuários podem inserir seu próprio perfil
CREATE POLICY "Users can insert own profile" ON profiles
FOR INSERT WITH CHECK (auth.uid() = id);
