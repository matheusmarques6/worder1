BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'profiles'
       AND policyname = 'profile_self_write_guard'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
        FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'profiles'
         AND policyname = 'profile_self_write_guard'
         AND cmd = 'UPDATE'
         AND roles = ARRAY['authenticated']::name[]
         AND permissive = 'RESTRICTIVE'
         AND btrim(regexp_replace(qual, '[[:space:]]+', ' ', 'g'))
               = '(id = auth.uid())'
         AND btrim(regexp_replace(with_check, '[[:space:]]+', ' ', 'g'))
               = '(id = auth.uid())'
    ) THEN
      RAISE EXCEPTION 'profile_self_write_guard policy conflict';
    END IF;
  ELSE
    CREATE POLICY profile_self_write_guard ON public.profiles
      AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (id = auth.uid())
      WITH CHECK (id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'profiles'
       AND policyname = 'profile_self_write_guard'
       AND cmd = 'UPDATE'
       AND roles = ARRAY['authenticated']::name[]
       AND permissive = 'RESTRICTIVE'
       AND btrim(regexp_replace(qual, '[[:space:]]+', ' ', 'g'))
             = '(id = auth.uid())'
       AND btrim(regexp_replace(with_check, '[[:space:]]+', ' ', 'g'))
             = '(id = auth.uid())'
  ) THEN
    RAISE EXCEPTION 'profile_self_write_guard policy postcondition failed';
  END IF;
END
$$;

COMMIT;
