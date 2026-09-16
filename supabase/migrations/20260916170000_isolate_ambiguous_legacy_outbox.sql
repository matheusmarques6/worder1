-- Legacy writers omitted account identity. Leave ambiguous rows untouched so
-- they cannot abort claims for other tenants; never guess which WABA to use.
-- CREATE OR REPLACE preserves the existing owner and EXECUTE ACL.
create or replace function internal.claim_outbox_batch(
    p_claim_token uuid,
    p_limit       integer default 50,
    p_lease       interval default interval '60 seconds'
)
    returns setof internal.claimed_send
    language sql
    security definer
    set search_path = pg_catalog, public, internal
as $$
    with claimed as (
        select o.id
          from internal.message_outbox o
         where o.status = 'pending'
           and o.next_attempt_at <= now()
           and (o.channel <> 'whatsapp' or o.channel_account_id is not null or (
               select count(*) from public.whatsapp_business_accounts w
                where w.organization_id = o.organization_id and w.status = 'active'
           ) = 1)
         order by o.next_attempt_at
         for update skip locked
         limit p_limit
    ),
    marked as (
        update internal.message_outbox o
           set channel_account_id = case when o.channel = 'whatsapp'
                   then internal.resolve_whatsapp_account(o.organization_id, o.channel_account_id)
                   else o.channel_account_id end,
               status = 'sending',
               locked_by = p_claim_token::text,
               locked_until = now() + p_lease,
               request_started_at = now(),
               attempt_count = o.attempt_count + 1
          from claimed
         where o.id = claimed.id
        returning o.*
    )
    select m.id,
           m.organization_id,
           m.channel,
           case when m.channel = 'whatsapp' then
               (select w.phone_number_id
                  from public.whatsapp_business_accounts w
                 where w.id = m.channel_account_id and w.organization_id = m.organization_id)
           end,
           coalesce(ct.whatsapp, ct.phone),
           m.payload,
           m.idempotency_key,
           m.attempt_count,
           m.kind,
           m.moment_ids,
           m.otel,
           (select msg.provider_message_id
              from public.messages msg
             where msg.conversation_id = m.conversation_id
               and msg.direction = 'inbound'
               and msg.channel = m.channel
               and msg.organization_id = m.organization_id
               and (m.channel <> 'whatsapp' or msg.channel_account_id = m.channel_account_id)
             order by msg.seq desc
             limit 1),
           m.channel_account_id
      from marked m
      join public.contacts ct on ct.id = m.contact_id and ct.organization_id = m.organization_id
$$;
