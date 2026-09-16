-- Restore the legacy diagnostic without changing account selection or privileges.
-- CREATE OR REPLACE retains the existing owner and EXECUTE grants.
begin;

create or replace function internal.active_whatsapp_business_account(p_organization_id uuid)
returns table (id uuid, phone_number_id text, access_token text, access_token_encrypted text)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
    if p_organization_id is distinct from public.current_app_organization_id() then
        raise exception 'active_whatsapp_business_account: org % is not the session organization',
            p_organization_id;
    end if;
    if (select count(*) from public.whatsapp_business_accounts w
         where w.organization_id = p_organization_id and w.status = 'active') > 1 then
        raise exception 'exactly one active WhatsApp account required' using errcode = '22023';
    end if;
    return query select w.id, w.phone_number_id, w.access_token, w.access_token_encrypted
      from public.whatsapp_business_accounts w
     where w.organization_id = p_organization_id and w.status = 'active';
end
$$;

commit;
