-- =============================================
-- FIX: Garantir 1 usuário = 1 organização
-- Executa DEPOIS dos patches V3
-- =============================================

-- 1. Verificar se existem usuários em múltiplas orgs
DO $$
DECLARE
  v_multi_org_users INT;
BEGIN
  SELECT COUNT(*) INTO v_multi_org_users
  FROM (
    SELECT user_id, COUNT(*) as org_count
    FROM organization_members
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) multi;
  
  IF v_multi_org_users > 0 THEN
    RAISE NOTICE '⚠️ ATENÇÃO: % usuários em múltiplas orgs. Corrija antes de aplicar UNIQUE.', v_multi_org_users;
    RAISE NOTICE 'Execute: SELECT user_id, array_agg(organization_id) FROM organization_members GROUP BY user_id HAVING COUNT(*) > 1;';
  ELSE
    RAISE NOTICE '✅ Nenhum usuário em múltiplas orgs. Seguro aplicar UNIQUE.';
  END IF;
END$$;

-- 2. Adicionar UNIQUE constraint (só funciona se não houver duplicatas)
ALTER TABLE organization_members 
  DROP CONSTRAINT IF EXISTS organization_members_user_unique;

ALTER TABLE organization_members 
  ADD CONSTRAINT organization_members_user_unique UNIQUE (user_id);

-- 3. Atualizar get_user_org_id() para ser mais seguro
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Com UNIQUE(user_id), não precisa mais de LIMIT 1
  -- Se não encontrar, retorna NULL (RLS bloqueia tudo)
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_user_org_id() IS 
  'Retorna organization_id do usuário autenticado. Com UNIQUE(user_id), garante resultado único.';

-- 4. Verificação final
DO $$
DECLARE
  v_has_unique BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'organization_members_user_unique'
  ) INTO v_has_unique;
  
  IF v_has_unique THEN
    RAISE NOTICE '✅ UNIQUE(user_id) aplicado em organization_members';
    RAISE NOTICE '✅ get_user_org_id() atualizado';
    RAISE NOTICE '🔒 Isolamento multi-tenant GARANTIDO';
  ELSE
    RAISE NOTICE '❌ UNIQUE não foi aplicado - verifique duplicatas';
  END IF;
END$$;
