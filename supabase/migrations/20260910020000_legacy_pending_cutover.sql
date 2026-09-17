-- Keep the legacy debounce claim single-owner and stop it when an org moves
-- to the event runtime. Missing rollout rows remain legacy by contract.

create or replace function public.claim_legacy_ai_pending(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
    with claimed as (
        update public.whatsapp_cloud_conversations c
           set ai_pending = false
         where c.id = p_conversation_id
           and c.ai_pending is true
           and not exists (
               select 1
                 from public.ai_runtime_rollout r
                where r.organization_id = c.organization_id
                  and r.mode = 'runtime'
           )
        returning 1
    )
    select exists(select 1 from claimed)
$$;

create or replace function public.release_legacy_ai_pending(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
    update public.whatsapp_cloud_conversations c
       set ai_pending = true
     where c.id = p_conversation_id
       and not exists (
           select 1
             from public.ai_runtime_rollout r
            where r.organization_id = c.organization_id
              and r.mode = 'runtime'
       )
$$;

revoke all on function public.claim_legacy_ai_pending(uuid) from public, anon, authenticated;
revoke all on function public.release_legacy_ai_pending(uuid) from public, anon, authenticated;
grant execute on function public.claim_legacy_ai_pending(uuid) to service_role;
grant execute on function public.release_legacy_ai_pending(uuid) to service_role;

create or replace function internal.clear_legacy_pending_on_runtime_cutover()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
    if new.mode = 'runtime' then
        update public.whatsapp_cloud_conversations
           set ai_pending = false,
               ai_debounce_until = null
         where organization_id = new.organization_id
           and (ai_pending is true or ai_debounce_until is not null);
    end if;
    return new;
end
$$;

revoke all on function internal.clear_legacy_pending_on_runtime_cutover() from public;

create trigger ai_runtime_rollout_clear_legacy_pending
after insert or update of mode on public.ai_runtime_rollout
for each row execute function internal.clear_legacy_pending_on_runtime_cutover();

-- Close the inverse race too: if an application write starts after the
-- rollout flip, it cannot recreate legacy pending state.
create or replace function internal.enforce_legacy_pending_rollout()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
    if (new.ai_pending is true or new.ai_debounce_until is not null)
       and exists (
           select 1
             from public.ai_runtime_rollout r
            where r.organization_id = new.organization_id
              and r.mode = 'runtime'
       ) then
        new.ai_pending := false;
        new.ai_debounce_until := null;
    end if;
    return new;
end
$$;

revoke all on function internal.enforce_legacy_pending_rollout() from public;

create trigger whatsapp_cloud_conversations_enforce_legacy_pending
before insert or update of organization_id, ai_pending, ai_debounce_until
on public.whatsapp_cloud_conversations
for each row execute function internal.enforce_legacy_pending_rollout();

-- Compensate orgs that were already in runtime before this trigger existed.
update public.whatsapp_cloud_conversations c
   set ai_pending = false,
       ai_debounce_until = null
 where (c.ai_pending is true or c.ai_debounce_until is not null)
   and exists (
       select 1
         from public.ai_runtime_rollout r
        where r.organization_id = c.organization_id
          and r.mode = 'runtime'
   );
