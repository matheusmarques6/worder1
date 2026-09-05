-- Convites de equipe: quando o usuário é criado a partir de um convite
-- (metadados invited_org_id / invited_role), ele entra na organização que o
-- convidou em vez de ganhar uma organização nova.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  org_id UUID;
  pipe_id UUID;
  inv_org UUID;
  inv_role user_role;
  inv_name TEXT;
BEGIN
  -- ---------- Convidado para uma organização existente ----------
  BEGIN
    inv_org := NULLIF(NEW.raw_user_meta_data->>'invited_org_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN inv_org := NULL; END;

  IF inv_org IS NOT NULL AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = inv_org) THEN
    BEGIN
      inv_role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'invited_role', ''), 'member')::user_role;
    EXCEPTION WHEN OTHERS THEN inv_role := 'member'; END;
    IF inv_role = 'owner' THEN inv_role := 'admin'; END IF;
    inv_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')), '');

    INSERT INTO profiles (id, email, first_name, last_name, full_name, organization_id, role)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'first_name', SPLIT_PART(COALESCE(inv_name, ''), ' ', 1), 'User'),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      inv_name,
      inv_org,
      inv_role
    )
    ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role;

    UPDATE organization_members
       SET user_id = NEW.id, status = 'active', joined_at = NOW(), role = inv_role,
           name = COALESCE(name, inv_name)
     WHERE organization_id = inv_org AND LOWER(email) = LOWER(NEW.email);
    IF NOT FOUND THEN
      INSERT INTO organization_members (organization_id, user_id, role, email, status, joined_at, name)
      VALUES (inv_org, NEW.id, inv_role, NEW.email, 'active', NOW(), inv_name);
    END IF;
    RETURN NEW;
  END IF;

  -- ---------- Cadastro normal: organização própria ----------
  INSERT INTO organizations (name, slug)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'company_name', SPLIT_PART(NEW.email, '@', 1)),
    LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-z0-9]', '-', 'g')) || '-' || SUBSTRING(NEW.id::TEXT, 1, 8)
  )
  RETURNING id INTO org_id;

  INSERT INTO profiles (id, email, first_name, last_name, organization_id, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    org_id,
    'owner'
  );

  INSERT INTO organization_members (organization_id, user_id, role, joined_at, email, status)
  VALUES (org_id, NEW.id, 'owner', NOW(), NEW.email, 'active');

  INSERT INTO pipelines (organization_id, name, is_default, position)
  VALUES (org_id, 'Sales Pipeline', true, 0)
  RETURNING id INTO pipe_id;

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
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$function$;
