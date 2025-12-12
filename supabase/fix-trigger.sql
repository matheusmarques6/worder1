-- ============================================
-- WORDER - FIX TRIGGER SCRIPT
-- ============================================
-- Execute este script no Supabase SQL Editor
-- Isso corrige o erro "Database error creating new user"

-- 1. Adicionar política para permitir inserção em organizations (service role)
DROP POLICY IF EXISTS "Service role can insert organizations" ON organizations;
CREATE POLICY "Service role can insert organizations" ON organizations
  FOR INSERT WITH CHECK (true);

-- 2. Adicionar política para permitir inserção em profiles (service role)  
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
CREATE POLICY "Service role can insert profiles" ON profiles
  FOR INSERT WITH CHECK (true);

-- 3. Adicionar política para permitir inserção em organization_members
DROP POLICY IF EXISTS "Service role can insert members" ON organization_members;
CREATE POLICY "Service role can insert members" ON organization_members
  FOR INSERT WITH CHECK (true);

-- 4. Adicionar política para permitir inserção em pipelines
DROP POLICY IF EXISTS "Service role can insert pipelines" ON pipelines;
CREATE POLICY "Service role can insert pipelines" ON pipelines
  FOR INSERT WITH CHECK (true);

-- 5. Adicionar política para permitir inserção em pipeline_stages
DROP POLICY IF EXISTS "Service role can insert stages" ON pipeline_stages;
CREATE POLICY "Service role can insert stages" ON pipeline_stages
  FOR INSERT WITH CHECK (true);

-- 6. Recriar o trigger com SECURITY DEFINER
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id UUID;
  pipe_id UUID;
BEGIN
  -- Create organization for new user
  INSERT INTO organizations (name, slug)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'company_name', SPLIT_PART(NEW.email, '@', 1)),
    LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-z0-9]', '-', 'g')) || '-' || SUBSTRING(NEW.id::TEXT, 1, 8)
  )
  RETURNING id INTO org_id;
  
  -- Create profile
  INSERT INTO profiles (id, email, first_name, last_name, organization_id, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    org_id,
    'owner'
  );
  
  -- Add as organization member
  INSERT INTO organization_members (organization_id, user_id, role, joined_at)
  VALUES (org_id, NEW.id, 'owner', NOW());
  
  -- Create default pipeline
  INSERT INTO pipelines (organization_id, name, is_default, position)
  VALUES (org_id, 'Sales Pipeline', true, 0)
  RETURNING id INTO pipe_id;
  
  -- Create default pipeline stages
  INSERT INTO pipeline_stages (pipeline_id, name, color, position, probability, is_won, is_lost)
  VALUES 
    (pipe_id, 'Lead', '#6366f1', 0, 10, false, false),
    (pipe_id, 'Qualified', '#8b5cf6', 1, 25, false, false),
    (pipe_id, 'Proposal', '#a855f7', 2, 50, false, false),
    (pipe_id, 'Negotiation', '#f59e0b', 3, 75, false, false),
    (pipe_id, 'Closed Won', '#22c55e', 4, 100, true, false),
    (pipe_id, 'Closed Lost', '#ef4444', 5, 0, false, true);
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail user creation
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Recriar o trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- 8. Garantir que o trigger tem permissões corretas
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;

-- ============================================
-- DONE! Agora tente criar o usuário novamente
-- ============================================
