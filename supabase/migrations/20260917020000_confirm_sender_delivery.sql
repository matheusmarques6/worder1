-- W2-T2b / M2=A: encerra uma entrega que o provedor já confirmou, sem
-- reenviar. Token original E organização da sessão: o token sozinho não
-- autoriza atravessar tenant.
create function internal.confirm_sender_delivery(
  p_outbox_id uuid, p_claim_token uuid, p_provider_message_id text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, internal
as $$
begin
  if nullif(btrim(p_provider_message_id), '') is null then
    return false;
  end if;
  update internal.message_outbox
     set status = 'sent',
         provider_message_id = p_provider_message_id,
         sent_at = coalesce(sent_at, now()),
         locked_by = null,
         locked_until = null,
         last_error = null
   where id = p_outbox_id
     and locked_by = p_claim_token::text
     and organization_id = public.current_app_organization_id()
     and status in ('unknown', 'manual_review');
  return found;
end
$$;

revoke all on function internal.confirm_sender_delivery(uuid,uuid,text) from public;
grant execute on function internal.confirm_sender_delivery(uuid,uuid,text) to sender_role;
