-- Deploy the owned-key readers before this migration. Existing objects and keys
-- are preserved; legacy project public URLs are resolved and signed by the app.
insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp-media', 'whatsapp-media', false, 52428800)
on conflict (id) do update set public = false;

-- Boolean-only privileged lookup: callers receive no conversation table grant.
-- Explicit live membership/session/MFA and exact org/conversation checks below
-- remain mandatory; search_path is fixed and no caller SQL is executed.
create or replace function internal.can_access_whatsapp_media(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_name ~ '^[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+/[a-zA-Z0-9][a-zA-Z0-9_.-]*$'
    and position('..' in p_name) = 0
    and internal.has_active_org_access(split_part(p_name, '/', 1))
    and (
      split_part(p_name, '/', 2) = 'template-headers'
      or exists (
        select 1 from public.whatsapp_cloud_conversations c
        where c.organization_id::text = split_part(p_name, '/', 1)
          and c.id::text = split_part(p_name, '/', 2)
      )
    );
$$;
revoke all on function internal.can_access_whatsapp_media(text) from public, anon;
grant execute on function internal.can_access_whatsapp_media(text) to authenticated, service_role;

-- Restrictive fences defeat any pre-existing broad permissive policy without
-- modifying those policies or access to any other bucket. Service role bypasses
-- RLS, so server callers must independently verify key ownership.
drop policy if exists whatsapp_media_no_anon on storage.objects;
create policy whatsapp_media_no_anon on storage.objects as restrictive
for all to anon
using (bucket_id <> 'whatsapp-media')
with check (bucket_id <> 'whatsapp-media');

drop policy if exists whatsapp_media_active_owner on storage.objects;
create policy whatsapp_media_active_owner on storage.objects as restrictive
for all to authenticated
using (bucket_id <> 'whatsapp-media' or internal.can_access_whatsapp_media(name))
with check (bucket_id <> 'whatsapp-media' or internal.can_access_whatsapp_media(name));

-- ALL supplies SELECT + INSERT + UPDATE required for upsert, plus DELETE.
drop policy if exists whatsapp_media_member_access on storage.objects;
create policy whatsapp_media_member_access on storage.objects
for all to authenticated
using (bucket_id = 'whatsapp-media' and internal.can_access_whatsapp_media(name))
with check (bucket_id = 'whatsapp-media' and internal.can_access_whatsapp_media(name));

-- Rollback: keep bucket private; roll readers back only to a release that signs
-- owned keys. Re-enabling public access is not a safe security rollback.
