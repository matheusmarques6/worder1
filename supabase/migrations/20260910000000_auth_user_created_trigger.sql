-- The invited branch omits profiles.full_name: it is GENERATED ALWAYS from
-- first_name and last_name in the active prerequisite schema.
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
  inv_member UUID;
  inv_role user_role;
  inv_name TEXT;
BEGIN
  -- ---------- Convidado para uma organização existente ----------
  BEGIN
    inv_org := NULLIF(NEW.raw_user_meta_data->>'invited_org_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN inv_org := NULL; END;

  -- Metadata is only a selector; a locked, authorized invitation is the proof.
  SELECT m.id, m.role INTO inv_member, inv_role
    FROM organization_members m
    JOIN profiles inviter ON inviter.id = m.invited_by
   WHERE m.organization_id = inv_org AND LOWER(m.email) = LOWER(NEW.email)
     AND m.status = 'invited' AND m.user_id IS NULL
     AND inviter.organization_id = m.organization_id AND inviter.role IN ('owner', 'admin')
   ORDER BY m.id LIMIT 1
   FOR UPDATE OF m;

  IF inv_member IS NOT NULL THEN
    IF inv_role = 'owner' THEN RAISE EXCEPTION 'owner invitation is not allowed'; END IF;
    inv_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')), '');

    INSERT INTO profiles (id, email, first_name, last_name, organization_id, role)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'first_name', SPLIT_PART(COALESCE(inv_name, ''), ' ', 1), 'User'),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      inv_org,
      inv_role
    );

    UPDATE organization_members
       SET user_id = NEW.id, status = 'active', joined_at = NOW(), role = inv_role,
           name = COALESCE(name, inv_name)
     WHERE id = inv_member AND user_id IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invitation was already consumed';
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
END;
$function$;

DO $$
DECLARE
  handle_new_user_oid oid;
BEGIN
  SELECT p.oid
    INTO handle_new_user_oid
    FROM pg_proc p
    JOIN pg_namespace pn ON pn.oid = p.pronamespace
   WHERE pn.nspname = 'public' AND p.proname = 'handle_new_user'
     AND p.oid = 'public.handle_new_user()'::regprocedure;

  IF EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace pn ON pn.oid = p.pronamespace
     WHERE n.nspname = 'auth' AND c.relname = 'users'
       AND t.tgname = 'on_auth_user_created'
       AND NOT (
         NOT t.tgisinternal
         AND t.tgenabled = 'O'
         AND t.tgtype = 5
         AND t.tgnargs = 0
         AND t.tgqual IS NULL
         AND t.tgconstraint = 0
         AND t.tgoldtable IS NULL
         AND t.tgnewtable IS NULL
         AND p.oid = handle_new_user_oid
         AND pn.nspname = 'public'
       )
  ) THEN
    RAISE EXCEPTION 'auth trigger conflict: on_auth_user_created definition';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace pn ON pn.oid = p.pronamespace
     WHERE n.nspname = 'auth' AND c.relname = 'users'
       AND NOT t.tgisinternal
       AND t.tgenabled <> 'D'
       AND t.tgname <> 'on_auth_user_created'
       AND p.oid = handle_new_user_oid
       AND pn.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'auth trigger conflict: enabled handle_new_user invocation';
  END IF;
END
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
