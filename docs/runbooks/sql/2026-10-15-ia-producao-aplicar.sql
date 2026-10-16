-- Corrigido em 16/10/2026: 20261016000001 redefinia ai_monthly_cost_usd como
-- numeric e o ensaio parava em 42P13; agora mantém a tabela (spent_usd,
-- has_unknown_cost) das migrations anteriores, que é o que o app lê.
-- E 20261016000005 criava política FOR INSERT com USING (42601); agora só
-- WITH CHECK.
-- Gerado em 15/10/2026 a partir de supabase/migrations/ (sem linhas de
-- comentário). APLICAÇÃO: uma transação por migration + linha no histórico.
-- Um erro desfaz só a migration da vez; as anteriores ficam aplicadas.
-- Rodar o ensaio antes. Rodar uma vez só (o histórico barra repetição).
-- Ordem: 39 migrations de 28/08 a 18/09 que nunca chegaram a produção
-- (o runtime e as 15 do plano IA dependem delas) + 20261016000001..015.
-- Ficaram de fora de propósito (baseline de banco novo ou fora da IA, e que
-- em produção desfariam correções já aplicadas ou já existem por outro nome):
-- 20260812000005, 20260904000001, 20260905093000, 20260909230000,
-- 20260910000000, 20260910010000, 20260910010100, 20260910250000,
-- 20260910340000. Ver docs/runbooks/2026-10-15-m0-deploy-checklist.md §8.

set lock_timeout = '10s';
-- ===== 20260828000005_correlate_outbox_status_error
begin;
drop function public.correlate_channel_status(text, text, text);
drop function internal.correlate_outbox_status(text, text, text);
create function internal.correlate_outbox_status(
    p_idempotency_key     text,
    p_status              text,
    p_provider_message_id text default null,
    p_error               text default null
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, internal
as $$
begin
    if p_status not in ('sent', 'failed') then
        raise exception 'unknown correlation status: %', p_status;
    end if;
    update internal.message_outbox
       set status = p_status,
           provider_message_id = coalesce(p_provider_message_id, provider_message_id),
           sent_at = case when p_status = 'sent' then now() else sent_at end,
           locked_by = null,
           locked_until = null,
           last_error = case when p_status = 'failed' then coalesce(p_error, last_error)
                              else last_error
                         end
     where idempotency_key = p_idempotency_key
       and status in ('sending', 'unknown');
    return found;
end
$$;
revoke execute on function internal.correlate_outbox_status(text, text, text, text) from public;
grant execute on function internal.correlate_outbox_status(text, text, text, text) to sender_role;
create function public.correlate_channel_status(
    p_idempotency_key     text,
    p_status              text,
    p_provider_message_id text default null,
    p_error               text default null
)
    returns boolean
    language sql
    security definer
    set search_path = pg_catalog, internal
as $$
    select internal.correlate_outbox_status(
        p_idempotency_key, p_status, p_provider_message_id, p_error
    )
$$;
revoke execute on function public.correlate_channel_status(text, text, text, text) from public;
grant execute on function public.correlate_channel_status(text, text, text, text) to service_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260828000005', 'correlate_outbox_status_error', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260828000006_correlate_outbox_status_from_sent
begin;
drop function public.correlate_channel_status(text, text, text, text);
drop function internal.correlate_outbox_status(text, text, text, text);
create function internal.correlate_outbox_status(
    p_idempotency_key     text,
    p_status              text,
    p_provider_message_id text default null,
    p_error               text default null
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, internal
as $$
begin
    if p_status not in ('sent', 'failed') then
        raise exception 'unknown correlation status: %', p_status;
    end if;
    update internal.message_outbox
       set status = p_status,
           provider_message_id = coalesce(p_provider_message_id, provider_message_id),
           sent_at = case when p_status = 'sent' then now() else sent_at end,
           locked_by = null,
           locked_until = null,
           last_error = case when p_status = 'failed' then coalesce(p_error, last_error)
                              else last_error
                         end
     where idempotency_key = p_idempotency_key
       and (
           (p_status = 'failed' and status in ('sending', 'unknown', 'sent'))
           or
           (p_status = 'sent' and status in ('sending', 'unknown'))
       );
    return found;
end
$$;
revoke execute on function internal.correlate_outbox_status(text, text, text, text) from public;
grant execute on function internal.correlate_outbox_status(text, text, text, text) to sender_role;
create function public.correlate_channel_status(
    p_idempotency_key     text,
    p_status              text,
    p_provider_message_id text default null,
    p_error               text default null
)
    returns boolean
    language sql
    security definer
    set search_path = pg_catalog, internal
as $$
    select internal.correlate_outbox_status(
        p_idempotency_key, p_status, p_provider_message_id, p_error
    )
$$;
revoke execute on function public.correlate_channel_status(text, text, text, text) from public;
grant execute on function public.correlate_channel_status(text, text, text, text) to service_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260828000006', 'correlate_outbox_status_from_sent', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260901000002_legacy_conversation_guard_state
begin;
create or replace function internal.legacy_conversation_guard_state(
    p_organization_id uuid,
    p_conversation_id uuid
)
    returns table (
        ai_agent_id          uuid,
        ai_transferred_at    timestamptz,
        bot_message_count    integer,
        last_bot_message_at  timestamptz,
        has_human_reply      boolean
    )
    language plpgsql
    stable
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_phone text;
    v_cloud uuid;
begin
    select ci.external_id into v_phone
      from public.conversations c
      join public.channel_identities ci
        on ci.organization_id = c.organization_id
       and ci.contact_id = c.contact_id
       and ci.channel = 'whatsapp'
     where c.id = p_conversation_id
       and c.organization_id = p_organization_id
     limit 1;
    if v_phone is null then
        return;
    end if;
    select wcc.id into v_cloud
      from public.whatsapp_cloud_conversations wcc
     where wcc.organization_id = p_organization_id
       and (wcc.wa_id = v_phone or wcc.wa_id = ltrim(v_phone, '+'))
     order by wcc.last_message_at desc nulls last
     limit 1;
    if v_cloud is null then
        return;
    end if;
    return query
    select wcc.ai_agent_id,
           wcc.ai_transferred_at,
           coalesce(bot.total, 0)::integer,
           bot.last_at,
           coalesce(human.exists_, false)
      from public.whatsapp_cloud_conversations wcc
      left join lateral (
          select count(*) as total, max(wcm."timestamp") as last_at
            from public.whatsapp_cloud_messages wcm
           where wcm.organization_id = p_organization_id
             and wcm.conversation_id = wcc.id
             and wcm.sent_by_bot
      ) bot on true
      left join lateral (
          select true as exists_
            from public.whatsapp_cloud_messages wcm
           where wcm.organization_id = p_organization_id
             and wcm.conversation_id = wcc.id
             and wcm.sender = 'human'
           limit 1
      ) human on true
     where wcc.id = v_cloud;
end
$$;
revoke execute on function internal.legacy_conversation_guard_state(uuid, uuid) from public;
grant execute on function internal.legacy_conversation_guard_state(uuid, uuid) to worker_role;
create or replace function internal.mark_ai_handoff(
    p_organization_id uuid,
    p_conversation_id uuid,
    p_reason          text
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_phone text;
    v_cloud uuid;
begin
    select ci.external_id into v_phone
      from public.conversations c
      join public.channel_identities ci
        on ci.organization_id = c.organization_id
       and ci.contact_id = c.contact_id
       and ci.channel = 'whatsapp'
     where c.id = p_conversation_id
       and c.organization_id = p_organization_id
     limit 1;
    if v_phone is null then
        return false;
    end if;
    select wcc.id into v_cloud
      from public.whatsapp_cloud_conversations wcc
     where wcc.organization_id = p_organization_id
       and (wcc.wa_id = v_phone or wcc.wa_id = ltrim(v_phone, '+'))
     order by wcc.last_message_at desc nulls last
     limit 1;
    if v_cloud is null then
        return false;
    end if;
    update public.whatsapp_cloud_conversations
       set ai_enabled = false,
           ai_disabled_at = now(),
           ai_disabled_reason = p_reason,
           ai_transferred_at = now(),
           updated_at = now()
     where id = v_cloud
       and organization_id = p_organization_id;
    return true;
end
$$;
revoke execute on function internal.mark_ai_handoff(uuid, uuid, text) from public;
grant execute on function internal.mark_ai_handoff(uuid, uuid, text) to worker_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260901000002', 'legacy_conversation_guard_state', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260901000003_guard_state_ai_enabled
begin;
drop function if exists internal.legacy_conversation_guard_state(uuid, uuid);
create function internal.legacy_conversation_guard_state(
    p_organization_id uuid,
    p_conversation_id uuid
)
    returns table (
        ai_enabled           boolean,
        ai_agent_id          uuid,
        ai_transferred_at    timestamptz,
        bot_message_count    integer,
        last_bot_message_at  timestamptz,
        has_human_reply      boolean
    )
    language plpgsql
    stable
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_phone text;
    v_cloud uuid;
begin
    select ci.external_id into v_phone
      from public.conversations c
      join public.channel_identities ci
        on ci.organization_id = c.organization_id
       and ci.contact_id = c.contact_id
       and ci.channel = 'whatsapp'
     where c.id = p_conversation_id
       and c.organization_id = p_organization_id
     limit 1;
    if v_phone is null then
        return;
    end if;
    select wcc.id into v_cloud
      from public.whatsapp_cloud_conversations wcc
     where wcc.organization_id = p_organization_id
       and (wcc.wa_id = v_phone or wcc.wa_id = ltrim(v_phone, '+'))
     order by wcc.last_message_at desc nulls last
     limit 1;
    if v_cloud is null then
        return;
    end if;
    return query
    select wcc.ai_enabled is distinct from false,
           wcc.ai_agent_id,
           wcc.ai_transferred_at,
           coalesce(bot.total, 0)::integer,
           bot.last_at,
           coalesce(human.exists_, false)
      from public.whatsapp_cloud_conversations wcc
      left join lateral (
          select count(*) as total, max(wcm."timestamp") as last_at
            from public.whatsapp_cloud_messages wcm
           where wcm.organization_id = p_organization_id
             and wcm.conversation_id = wcc.id
             and wcm.sent_by_bot
      ) bot on true
      left join lateral (
          select true as exists_
            from public.whatsapp_cloud_messages wcm
           where wcm.organization_id = p_organization_id
             and wcm.conversation_id = wcc.id
             and wcm.sender = 'human'
           limit 1
      ) human on true
     where wcc.id = v_cloud;
end
$$;
revoke execute on function internal.legacy_conversation_guard_state(uuid, uuid) from public;
grant execute on function internal.legacy_conversation_guard_state(uuid, uuid) to worker_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260901000003', 'guard_state_ai_enabled', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260901000004_send_guard
begin;
create table internal.whatsapp_send_guard (
    phone_number_id      text primary key,
    consecutive_failures integer     not null default 0,
    open_until           timestamptz,
    error_day            date,
    rate_limit_errors    integer     not null default 0,
    throttled_until      timestamptz,
    updated_at           timestamptz not null default now()
);
comment on table internal.whatsapp_send_guard is
    'Estado do send-guard do runtime, por phone_number_id (número físico da '
    'Meta). Divergente do estado do TS em Redis por desenho — ver o cabeçalho '
    'da migration 20260901000004.';
create function internal.send_guard_check(p_phone_number_id text)
    returns table (reason text, retry_after interval)
    language sql
    stable
    security definer
    set search_path = pg_catalog, internal
as $$
    select case
               when g.open_until > now() then 'circuit_open'
               when g.throttled_until > now() then 'throttled'
           end,
           case
               when g.open_until > now() then g.open_until - now()
               when g.throttled_until > now() then g.throttled_until - now()
           end
      from internal.whatsapp_send_guard g
     where g.phone_number_id = p_phone_number_id
       and (g.open_until > now() or g.throttled_until > now());
$$;
comment on function internal.send_guard_check(text) is
    'Segurar este número agora? Zero linhas = pode enviar. Breaker antes de '
    'throttle, como checkBeforeSend.';
create function internal.send_guard_report(
    p_phone_number_id text,
    p_success         boolean,
    p_rate_limited    boolean default false
)
    returns void
    language plpgsql
    security definer
    set search_path = pg_catalog, internal
as $$
declare
    v_day    date := (now() at time zone 'utc')::date;
    v_errors integer;
begin
    if p_phone_number_id is null then
        return;
    end if;
    insert into internal.whatsapp_send_guard (phone_number_id)
    values (p_phone_number_id)
    on conflict (phone_number_id) do nothing;
    if p_success then
        update internal.whatsapp_send_guard
           set consecutive_failures = 0,
               open_until           = null,
               updated_at           = now()
         where phone_number_id = p_phone_number_id;
        return;
    end if;
    update internal.whatsapp_send_guard
       set consecutive_failures = consecutive_failures + 1,
           open_until = case when consecutive_failures + 1 >= 5
                             then now() + interval '30 seconds'
                             else open_until
                        end,
           error_day = case when p_rate_limited then v_day else error_day end,
           rate_limit_errors = case
               when not p_rate_limited      then rate_limit_errors
               when error_day is distinct from v_day then 1
               else rate_limit_errors + 1
           end,
           updated_at = now()
     where phone_number_id = p_phone_number_id
    returning rate_limit_errors into v_errors;
    if not p_rate_limited then
        return;
    end if;
    update internal.whatsapp_send_guard
       set throttled_until = case
               when v_errors >= 50 then now() + interval '10 minutes'
               when v_errors >= 20 then now() + interval '5 minutes'
               when v_errors >= 10 then now() + interval '1 minute'
               else throttled_until
           end
     where phone_number_id = p_phone_number_id;
end
$$;
comment on function internal.send_guard_report(text, boolean, boolean) is
    'Alimenta breaker e throttle deste número. Uma chamada por chamada ao '
    'Graph, não por linha de outbox.';
revoke execute on function internal.send_guard_check(text) from public;
revoke execute on function internal.send_guard_report(text, boolean, boolean) from public;
grant execute on function internal.send_guard_check(text) to sender_role;
grant execute on function internal.send_guard_report(text, boolean, boolean) to sender_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260901000004', 'send_guard', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260901000005_send_guard_half_open
begin;
alter table internal.whatsapp_send_guard
    add column half_open_successes integer not null default 0;
comment on column internal.whatsapp_send_guard.half_open_successes is
    'Sucessos seguidos desde que a janela do breaker venceu. Fecha em 3, como '
    'o successThreshold do TS. Zerado por qualquer falha e ao fechar.';
create or replace function internal.send_guard_report(
    p_phone_number_id text,
    p_success         boolean,
    p_rate_limited    boolean default false
)
    returns void
    language plpgsql
    security definer
    set search_path = pg_catalog, internal
as $$
declare
    v_day    date := (now() at time zone 'utc')::date;
    v_errors integer;
begin
    if p_phone_number_id is null then
        return;
    end if;
    insert into internal.whatsapp_send_guard (phone_number_id)
    values (p_phone_number_id)
    on conflict (phone_number_id) do nothing;
    if p_success then
        update internal.whatsapp_send_guard
           set half_open_successes = case
                   when consecutive_failures < 5      then 0
                   when open_until > now()            then half_open_successes
                   when half_open_successes + 1 >= 3  then 0
                   else half_open_successes + 1
               end,
               consecutive_failures = case
                   when consecutive_failures < 5      then 0
                   when open_until > now()            then consecutive_failures
                   when half_open_successes + 1 >= 3  then 0
                   else consecutive_failures
               end,
               open_until = case
                   when consecutive_failures < 5      then null
                   when open_until > now()            then open_until
                   when half_open_successes + 1 >= 3  then null
                   else open_until
               end,
               updated_at = now()
         where phone_number_id = p_phone_number_id;
        return;
    end if;
    update internal.whatsapp_send_guard
       set consecutive_failures = consecutive_failures + 1,
           half_open_successes = 0,
           open_until = case when consecutive_failures + 1 >= 5
                             then now() + interval '30 seconds'
                             else open_until
                        end,
           error_day = case when p_rate_limited then v_day else error_day end,
           rate_limit_errors = case
               when not p_rate_limited      then rate_limit_errors
               when error_day is distinct from v_day then 1
               else rate_limit_errors + 1
           end,
           updated_at = now()
     where phone_number_id = p_phone_number_id
    returning rate_limit_errors into v_errors;
    if not p_rate_limited then
        return;
    end if;
    update internal.whatsapp_send_guard
       set throttled_until = case
               when v_errors >= 50 then now() + interval '10 minutes'
               when v_errors >= 20 then now() + interval '5 minutes'
               when v_errors >= 10 then now() + interval '1 minute'
               else throttled_until
           end
     where phone_number_id = p_phone_number_id;
end
$$;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260901000005', 'send_guard_half_open', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260901000006_send_guard_throttle_rearm
begin;
create or replace function internal.send_guard_report(
    p_phone_number_id text,
    p_success         boolean,
    p_rate_limited    boolean default false
)
    returns void
    language plpgsql
    security definer
    set search_path = pg_catalog, internal
as $$
declare
    v_day    date := (now() at time zone 'utc')::date;
    v_errors integer;
begin
    if p_phone_number_id is null then
        return;
    end if;
    insert into internal.whatsapp_send_guard (phone_number_id)
    values (p_phone_number_id)
    on conflict (phone_number_id) do nothing;
    if p_success then
        update internal.whatsapp_send_guard
           set half_open_successes = case
                   when consecutive_failures < 5      then 0
                   when open_until > now()            then half_open_successes
                   when half_open_successes + 1 >= 3  then 0
                   else half_open_successes + 1
               end,
               consecutive_failures = case
                   when consecutive_failures < 5      then 0
                   when open_until > now()            then consecutive_failures
                   when half_open_successes + 1 >= 3  then 0
                   else consecutive_failures
               end,
               open_until = case
                   when consecutive_failures < 5      then null
                   when open_until > now()            then open_until
                   when half_open_successes + 1 >= 3  then null
                   else open_until
               end,
               updated_at = now()
         where phone_number_id = p_phone_number_id;
        return;
    end if;
    update internal.whatsapp_send_guard
       set consecutive_failures = consecutive_failures + 1,
           half_open_successes = 0,
           open_until = case when consecutive_failures + 1 >= 5
                             then now() + interval '30 seconds'
                             else open_until
                        end,
           error_day = case when p_rate_limited then v_day else error_day end,
           rate_limit_errors = case
               when not p_rate_limited      then rate_limit_errors
               when error_day is distinct from v_day then 1
               else rate_limit_errors + 1
           end,
           updated_at = now()
     where phone_number_id = p_phone_number_id
    returning rate_limit_errors into v_errors;
    update internal.whatsapp_send_guard
       set throttled_until = case
               when v_errors >= 50 then now() + interval '10 minutes'
               when v_errors >= 20 then now() + interval '5 minutes'
               when v_errors >= 10 then now() + interval '1 minute'
               else throttled_until
           end
     where phone_number_id = p_phone_number_id;
end
$$;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260901000006', 'send_guard_throttle_rearm', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260901000007_send_guard_error_day_rolls
begin;
create or replace function internal.send_guard_report(
    p_phone_number_id text,
    p_success         boolean,
    p_rate_limited    boolean default false
)
    returns void
    language plpgsql
    security definer
    set search_path = pg_catalog, internal
as $$
declare
    v_day    date := (now() at time zone 'utc')::date;
    v_errors integer;
begin
    if p_phone_number_id is null then
        return;
    end if;
    insert into internal.whatsapp_send_guard (phone_number_id)
    values (p_phone_number_id)
    on conflict (phone_number_id) do nothing;
    if p_success then
        update internal.whatsapp_send_guard
           set half_open_successes = case
                   when consecutive_failures < 5      then 0
                   when open_until > now()            then half_open_successes
                   when half_open_successes + 1 >= 3  then 0
                   else half_open_successes + 1
               end,
               consecutive_failures = case
                   when consecutive_failures < 5      then 0
                   when open_until > now()            then consecutive_failures
                   when half_open_successes + 1 >= 3  then 0
                   else consecutive_failures
               end,
               open_until = case
                   when consecutive_failures < 5      then null
                   when open_until > now()            then open_until
                   when half_open_successes + 1 >= 3  then null
                   else open_until
               end,
               updated_at = now()
         where phone_number_id = p_phone_number_id;
        return;
    end if;
    update internal.whatsapp_send_guard
       set consecutive_failures = consecutive_failures + 1,
           half_open_successes = 0,
           open_until = case when consecutive_failures + 1 >= 5
                             then now() + interval '30 seconds'
                             else open_until
                        end,
           error_day = v_day,
           rate_limit_errors = case
               when error_day is distinct from v_day
                   then case when p_rate_limited then 1 else 0 end
               when p_rate_limited then rate_limit_errors + 1
               else rate_limit_errors
           end,
           updated_at = now()
     where phone_number_id = p_phone_number_id
    returning rate_limit_errors into v_errors;
    update internal.whatsapp_send_guard
       set throttled_until = case
               when v_errors >= 50 then now() + interval '10 minutes'
               when v_errors >= 20 then now() + interval '5 minutes'
               when v_errors >= 10 then now() + interval '1 minute'
               else throttled_until
           end
     where phone_number_id = p_phone_number_id;
end
$$;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260901000007', 'send_guard_error_day_rolls', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260901000008_send_guard_closed_keeps_successes
begin;
create or replace function internal.send_guard_report(
    p_phone_number_id text,
    p_success         boolean,
    p_rate_limited    boolean default false
)
    returns void
    language plpgsql
    security definer
    set search_path = pg_catalog, internal
as $$
declare
    v_day    date := (now() at time zone 'utc')::date;
    v_errors integer;
begin
    if p_phone_number_id is null then
        return;
    end if;
    insert into internal.whatsapp_send_guard (phone_number_id)
    values (p_phone_number_id)
    on conflict (phone_number_id) do nothing;
    if p_success then
        update internal.whatsapp_send_guard
           set half_open_successes = case
                   when consecutive_failures < 5      then half_open_successes
                   when open_until > now()            then half_open_successes
                   when half_open_successes + 1 >= 3  then 0
                   else half_open_successes + 1
               end,
               consecutive_failures = case
                   when consecutive_failures < 5      then 0
                   when open_until > now()            then consecutive_failures
                   when half_open_successes + 1 >= 3  then 0
                   else consecutive_failures
               end,
               open_until = case
                   when consecutive_failures < 5      then null
                   when open_until > now()            then open_until
                   when half_open_successes + 1 >= 3  then null
                   else open_until
               end,
               updated_at = now()
         where phone_number_id = p_phone_number_id;
        return;
    end if;
    update internal.whatsapp_send_guard
       set consecutive_failures = consecutive_failures + 1,
           half_open_successes = case when consecutive_failures < 5
                                      then half_open_successes
                                      else 0
                                 end,
           open_until = case when consecutive_failures + 1 >= 5
                             then now() + interval '30 seconds'
                             else open_until
                        end,
           error_day = v_day,
           rate_limit_errors = case
               when error_day is distinct from v_day
                   then case when p_rate_limited then 1 else 0 end
               when p_rate_limited then rate_limit_errors + 1
               else rate_limit_errors
           end,
           updated_at = now()
     where phone_number_id = p_phone_number_id
    returning rate_limit_errors into v_errors;
    update internal.whatsapp_send_guard
       set throttled_until = case
               when v_errors >= 50 then now() + interval '10 minutes'
               when v_errors >= 20 then now() + interval '5 minutes'
               when v_errors >= 10 then now() + interval '1 minute'
               else throttled_until
           end
     where phone_number_id = p_phone_number_id;
end
$$;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260901000008', 'send_guard_closed_keeps_successes', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260901000009_whatsapp_template_shape
begin;
create function internal.whatsapp_template_shape(
    p_organization_id uuid,
    p_name text,
    p_language text
)
    returns table (
        components jsonb,
        header_type text,
        body_text text,
        buttons jsonb
    )
    language plpgsql
    stable
    security definer
    set search_path = pg_catalog, public
as $$
begin
    if p_organization_id is distinct from public.current_app_organization_id() then
        raise exception 'whatsapp_template_shape: org % não é a org da sessão',
            p_organization_id;
    end if;
    return query
        select t.components, t.header_type, t.body_text, t.buttons
          from public.whatsapp_templates t
         where t.organization_id = p_organization_id
           and t.name = p_name
           and t.language = p_language
         order by t.synced_at desc nulls last, t.created_at desc
         limit 1;
end
$$;
comment on function internal.whatsapp_template_shape(uuid, text, text) is
    'A forma do template aprovado de UMA org (nome+idioma) — recusa qualquer '
    'org que não seja a da sessão antes de ler. Colunas cruas, nos dois '
    'formatos possíveis: quem concilia é o Python (channels/template_components).';
revoke execute on function internal.whatsapp_template_shape(uuid, text, text) from public;
grant execute on function internal.whatsapp_template_shape(uuid, text, text) to sender_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260901000009', 'whatsapp_template_shape', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260902000001_ai_usage_logs_bridge
begin;
alter table internal.llm_calls
    add column agent_id uuid references public.ai_agents (id) on delete set null;
do $guard$
begin
    if to_regclass('public.ai_usage_logs') is null then
        raise notice 'ai_usage_logs ausente — pulando grant de insert para worker_role (item 37, guardado pelo item 49)';
        return;
    end if;
    grant insert on public.ai_usage_logs to worker_role;
end
$guard$;
create function internal.mirror_llm_call_to_usage_logs()
    returns trigger
    language plpgsql
as $$
declare
    v_feature text;
begin
    if new.organization_id is null then
        return new;
    end if;
    case new.purpose
        when 'agent_reply'      then v_feature := 'runtime_agent_reply';
        when 'judge_pre'        then v_feature := 'runtime_judge_pre';
        when 'judge_async'      then v_feature := 'runtime_judge_async';
        when 'prompt_generator' then v_feature := 'runtime_prompt_generator';
        when 'copy_variation'   then v_feature := 'runtime_copy_variation';
        when 'embedding'        then v_feature := 'runtime_embedding';
        else
            raise exception
                'internal.llm_calls.purpose sem mapa para ai_usage_logs.feature: %', new.purpose;
    end case;
    insert into public.ai_usage_logs
        (organization_id, provider, model, feature, agent_id, conversation_id,
         prompt_tokens, completion_tokens, cost_usd, duration_ms, success)
    values
        (new.organization_id, new.provider, new.model, v_feature, new.agent_id,
         new.conversation_id, coalesce(new.input_tokens, 0), coalesce(new.output_tokens, 0),
         coalesce(new.cost_usd, 0), new.latency_ms, true);
    return new;
end;
$$;
create trigger llm_calls_mirror_to_usage_logs
    after insert on internal.llm_calls
    for each row
    execute function internal.mirror_llm_call_to_usage_logs();
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260902000001', 'ai_usage_logs_bridge', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260902000002_claim_outbox_last_inbound_wamid
begin;
alter type internal.claimed_send add attribute last_inbound_wamid text;
comment on type internal.claimed_send is
    'Tudo que um envio precisa, numa linha só. channel_external_id: whatsapp → phone_number_id da conta Cloud (a da outbox, ou a conta ativa única da org). last_inbound_wamid: provider_message_id do último inbound da conversa (item 38) — null quando não há conversa/inbound; o sender não manda read/typing nesse caso (ruling D).';
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
        select id
          from internal.message_outbox
         where status = 'pending'
           and next_attempt_at <= now()
         order by next_attempt_at
         for update skip locked
         limit p_limit
    ),
    marked as (
        update internal.message_outbox o
           set status = 'sending',
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
               coalesce(
                   (select w.phone_number_id
                      from public.whatsapp_business_accounts w
                     where w.id = m.channel_account_id),
                   (select w.phone_number_id
                      from public.whatsapp_business_accounts w
                     where w.organization_id = m.organization_id
                       and w.status = 'active'
                     order by w.created_at
                     limit 1)
               )
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
             order by msg.seq desc
             limit 1)
      from marked m
      join public.contacts ct on ct.id = m.contact_id
$$;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260902000002', 'claim_outbox_last_inbound_wamid', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260902000003_ai_usage_logs_cost_usd_unknown
begin;
DO $guard$
BEGIN
    IF to_regclass('public.ai_usage_logs') IS NULL THEN
        RAISE NOTICE 'ai_usage_logs ausente — pulando migration de cost_usd desconhecido (item 42)';
        RETURN;
    END IF;
    ALTER TABLE public.ai_usage_logs
        ALTER COLUMN cost_usd DROP DEFAULT;
    COMMENT ON COLUMN public.ai_usage_logs.cost_usd IS
        'Custo USD da chamada, reportado pelo provedor (OpenRouter) ou estimado por tabela (direto). '
        'NULL = modelo fora da tabela de precos (desconhecido) -- nunca gasto zero inventado (item 42). '
        'Linhas gravadas antes de 2026-09-02 usavam 0 pros dois casos (gasto real zero E modelo sem '
        'preco) -- ambiguas; uma soma sobre um periodo que cruza essa data e um piso, nao um total.';
    DROP FUNCTION IF EXISTS ai_monthly_cost_usd(uuid, timestamptz);
    CREATE FUNCTION ai_monthly_cost_usd(
        p_organization_id uuid,
        p_month_start     timestamptz
    )
    RETURNS TABLE (spent_usd numeric, has_unknown_cost boolean)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $body$
        SELECT
            COALESCE(SUM(cost_usd), 0)                AS spent_usd,
            COALESCE(BOOL_OR(cost_usd IS NULL), false) AS has_unknown_cost
        FROM   ai_usage_logs
        WHERE  organization_id = p_organization_id
          AND  created_at >= p_month_start;
    $body$;
    REVOKE EXECUTE ON FUNCTION ai_monthly_cost_usd(uuid, timestamptz) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION ai_monthly_cost_usd(uuid, timestamptz) FROM anon;
    REVOKE EXECUTE ON FUNCTION ai_monthly_cost_usd(uuid, timestamptz) FROM authenticated;
    GRANT EXECUTE ON FUNCTION ai_monthly_cost_usd(uuid, timestamptz) TO service_role;
    CREATE OR REPLACE FUNCTION internal.mirror_llm_call_to_usage_logs()
        RETURNS TRIGGER
        LANGUAGE plpgsql
    AS $body$
    DECLARE
        v_feature text;
    BEGIN
        IF new.organization_id IS NULL THEN
            RETURN new;
        END IF;
        CASE new.purpose
            WHEN 'agent_reply'      THEN v_feature := 'runtime_agent_reply';
            WHEN 'judge_pre'        THEN v_feature := 'runtime_judge_pre';
            WHEN 'judge_async'      THEN v_feature := 'runtime_judge_async';
            WHEN 'prompt_generator' THEN v_feature := 'runtime_prompt_generator';
            WHEN 'copy_variation'   THEN v_feature := 'runtime_copy_variation';
            WHEN 'embedding'        THEN v_feature := 'runtime_embedding';
            ELSE
                RAISE EXCEPTION
                    'internal.llm_calls.purpose sem mapa para ai_usage_logs.feature: %', new.purpose;
        END CASE;
        INSERT INTO public.ai_usage_logs
            (organization_id, provider, model, feature, agent_id, conversation_id,
             prompt_tokens, completion_tokens, cost_usd, duration_ms, success)
        VALUES
            (new.organization_id, new.provider, new.model, v_feature, new.agent_id,
             new.conversation_id, COALESCE(new.input_tokens, 0), COALESCE(new.output_tokens, 0),
             new.cost_usd, new.latency_ms, true);
        RETURN new;
    END;
    $body$;
END
$guard$;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260902000003', 'ai_usage_logs_cost_usd_unknown', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260902000004_search_agent_knowledge_org_scoped
begin;
DO $guard$
BEGIN
    IF to_regclass('public.ai_agent_chunks') IS NULL THEN
        RAISE NOTICE 'ai_agent_chunks ausente — pulando promocao de search_agent_knowledge (item 43)';
        RETURN;
    END IF;
    DROP FUNCTION IF EXISTS public.search_agent_knowledge(uuid, vector, float, int);
    CREATE OR REPLACE FUNCTION public.search_agent_knowledge(
        p_agent_id UUID,
        p_organization_id UUID,
        p_query_embedding vector(1536),
        p_match_threshold FLOAT DEFAULT 0.7,
        p_match_count INT DEFAULT 5
    )
    RETURNS TABLE (
        chunk_id UUID,
        source_id UUID,
        content TEXT,
        metadata JSONB,
        similarity FLOAT
    )
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    BEGIN
        RETURN QUERY
        SELECT
            c.id AS chunk_id,
            c.source_id,
            c.content,
            c.metadata,
            (1 - (c.embedding <=> p_query_embedding))::FLOAT AS similarity
        FROM public.ai_agent_chunks c
        WHERE c.agent_id = p_agent_id
          AND c.organization_id = p_organization_id
          AND c.embedding IS NOT NULL
          AND (1 - (c.embedding <=> p_query_embedding)) >= p_match_threshold
        ORDER BY c.embedding <=> p_query_embedding
        LIMIT p_match_count;
    END;
    $body$;
    REVOKE EXECUTE ON FUNCTION public.search_agent_knowledge(uuid, uuid, vector, float, int) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.search_agent_knowledge(uuid, uuid, vector, float, int) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.search_agent_knowledge(uuid, uuid, vector, float, int) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.search_agent_knowledge(uuid, uuid, vector, float, int) TO service_role;
END
$guard$;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260902000004', 'search_agent_knowledge_org_scoped', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260903000001_incentive_grants_expiry_sweep_idx
begin;
create index if not exists incentive_grants_expiry_sweep_idx
    on public.incentive_grants (validity_until)
    where status = 'issued';
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260903000001', 'incentive_grants_expiry_sweep_idx', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260903000002_get_active_agent_for_conversation_versioned
begin;
DO $guard$
BEGIN
    IF to_regclass('public.ai_agents') IS NULL THEN
        RAISE NOTICE 'ai_agents ausente — pulando promocao de get_active_agent_for_conversation (item 49)';
        RETURN;
    END IF;
    DROP FUNCTION IF EXISTS public.get_active_agent_for_conversation(uuid, uuid, uuid);
    CREATE FUNCTION public.get_active_agent_for_conversation(
        p_organization_id   uuid,
        p_channel_id        uuid DEFAULT NULL,
        p_pipeline_stage_id uuid DEFAULT NULL
    )
    RETURNS TABLE (
        agent_id   uuid,
        agent_name text
    )
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $body$
        SELECT a.id, a.name
        FROM   public.ai_agents a
        WHERE  a.organization_id = p_organization_id
          AND  a.is_active = true
          AND (
                (a.settings->'channels'->>'all_channels')::boolean = true
             OR p_channel_id IS NULL
             OR p_channel_id::text = ANY (
                    SELECT jsonb_array_elements_text(a.settings->'channels'->'channel_ids')
                )
          )
          AND (
                (a.settings->'pipelines'->>'all_pipelines')::boolean = true
             OR p_pipeline_stage_id IS NULL
             OR p_pipeline_stage_id::text = ANY (
                    SELECT jsonb_array_elements_text(a.settings->'pipelines'->'stage_ids')
                )
          )
        ORDER BY a.created_at ASC
        LIMIT 1;
    $body$;
    REVOKE EXECUTE ON FUNCTION public.get_active_agent_for_conversation(uuid, uuid, uuid) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.get_active_agent_for_conversation(uuid, uuid, uuid) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.get_active_agent_for_conversation(uuid, uuid, uuid) FROM authenticated;
    GRANT  EXECUTE ON FUNCTION public.get_active_agent_for_conversation(uuid, uuid, uuid) TO service_role;
END
$guard$;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260903000002', 'get_active_agent_for_conversation_versioned', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260903000003_shopify_orders_org_email_lower_idx
begin;
create index if not exists shopify_orders_org_email_lower_idx
    on public.shopify_orders (organization_id, lower(email))
    where email is not null;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260903000003', 'shopify_orders_org_email_lower_idx', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260903000004_whatsapp_cloud_conversations_org_wa_id_idx
begin;
create index if not exists whatsapp_cloud_conversations_org_wa_id_idx
    on public.whatsapp_cloud_conversations (organization_id, wa_id);
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260903000004', 'whatsapp_cloud_conversations_org_wa_id_idx', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260905185030_filter_search_agent_knowledge_embedding_space
begin;
DO $guard$
BEGIN
    IF to_regclass('public.ai_agent_chunks') IS NULL THEN
        RAISE NOTICE 'ai_agent_chunks absent - skipping search_agent_knowledge embedding filter';
        RETURN;
    END IF;
    CREATE OR REPLACE FUNCTION public.search_agent_knowledge(
        p_agent_id UUID,
        p_organization_id UUID,
        p_query_embedding vector(1536),
        p_match_threshold FLOAT DEFAULT 0.7,
        p_match_count INT DEFAULT 5
    )
    RETURNS TABLE (
        chunk_id UUID,
        source_id UUID,
        content TEXT,
        metadata JSONB,
        similarity FLOAT
    )
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    BEGIN
        RETURN QUERY
        SELECT
            c.id AS chunk_id,
            c.source_id,
            c.content,
            c.metadata,
            (1 - (c.embedding <=> p_query_embedding))::FLOAT AS similarity
        FROM public.ai_agent_chunks c
        WHERE c.agent_id = p_agent_id
          AND c.organization_id = p_organization_id
          AND c.embedding IS NOT NULL
          AND c.embedding_model = 'openai:text-embedding-3-small'
          AND (1 - (c.embedding <=> p_query_embedding)) >= p_match_threshold
        ORDER BY c.embedding <=> p_query_embedding
        LIMIT p_match_count;
    END;
    $body$;
    REVOKE EXECUTE ON FUNCTION public.search_agent_knowledge(uuid, uuid, vector, float, int) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.search_agent_knowledge(uuid, uuid, vector, float, int) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.search_agent_knowledge(uuid, uuid, vector, float, int) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.search_agent_knowledge(uuid, uuid, vector, float, int) TO service_role;
END
$guard$;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260905185030', 'filter_search_agent_knowledge_embedding_space', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260905194328_require_runtime_for_inbound_turn
begin;
drop function internal.conclude_turn(
    uuid, uuid, integer, integer, integer, jsonb, text, text, uuid[], jsonb
);
create function internal.conclude_turn(
    p_conversation_id  uuid,
    p_token            uuid,
    p_expected_version integer,
    p_generation       integer,
    p_target_seq       integer,
    p_content          jsonb,
    p_idempotency_key  text,
    p_kind             text default 'reply',
    p_moment_ids       uuid[] default '{}'::uuid[],
    p_otel             jsonb default null,
    p_require_runtime  boolean default false
)
    returns internal.turn_outcome
    language plpgsql
    set search_path = pg_catalog, public, internal
as $$
declare
    v_organization_id uuid;
    v_contact_id      uuid;
    v_channel         text;
    v_seq             integer;
    v_outbox_id       uuid;
begin
    update public.conversations
       set last_processed_seq = p_target_seq,
           processing_token = null,
           processing_until = null,
           version = version + 1
     where id = p_conversation_id
       and processing_token = p_token
       and version = p_expected_version
       and processing_generation = p_generation
       and next_inbound_seq = p_target_seq
       and (
           not p_require_runtime
           or exists (
               select 1
                 from public.ai_runtime_rollout r
                where r.organization_id = public.conversations.organization_id
                  and r.mode = 'runtime'
           )
       )
    returning organization_id, contact_id, coalesce(last_channel, 'whatsapp')
      into v_organization_id, v_contact_id, v_channel;
    if not found then
        return row(false, null, null)::internal.turn_outcome;
    end if;
    if p_content is null or jsonb_typeof(p_content) = 'null' then
        return row(true, null, null)::internal.turn_outcome;
    end if;
    insert into internal.message_outbox
        (organization_id, conversation_id, contact_id, channel,
         kind, payload, idempotency_key, moment_ids, otel)
    values
        (v_organization_id, p_conversation_id, v_contact_id, v_channel,
         p_kind, p_content, p_idempotency_key, coalesce(p_moment_ids, '{}'::uuid[]),
         p_otel)
    returning id into v_outbox_id;
    v_seq := internal.next_message_seq(p_conversation_id, 'outbound');
    insert into public.messages
        (organization_id, conversation_id, direction, seq, channel,
         author_type, content, outbox_id)
    values
        (v_organization_id, p_conversation_id, 'outbound', v_seq, v_channel,
         'agent', p_content, v_outbox_id);
    return row(true, v_seq, v_outbox_id)::internal.turn_outcome;
end
$$;
revoke execute on function
    internal.conclude_turn(uuid, uuid, integer, integer, integer, jsonb, text, text, uuid[], jsonb, boolean)
    from public;
grant execute on function
    internal.conclude_turn(uuid, uuid, integer, integer, integer, jsonb, text, text, uuid[], jsonb, boolean)
    to worker_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260905194328', 'require_runtime_for_inbound_turn', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260905230148_claim_outbox_wamid_channel
begin;
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
        select id
          from internal.message_outbox
         where status = 'pending'
           and next_attempt_at <= now()
         order by next_attempt_at
         for update skip locked
         limit p_limit
    ),
    marked as (
        update internal.message_outbox o
           set status = 'sending',
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
               coalesce(
                   (select w.phone_number_id
                      from public.whatsapp_business_accounts w
                     where w.id = m.channel_account_id),
                   (select w.phone_number_id
                      from public.whatsapp_business_accounts w
                     where w.organization_id = m.organization_id
                       and w.status = 'active'
                     order by w.created_at
                     limit 1)
               )
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
             order by msg.seq desc
             limit 1)
      from marked m
      join public.contacts ct on ct.id = m.contact_id
$$;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260905230148', 'claim_outbox_wamid_channel', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260910020000_legacy_pending_cutover
begin;
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
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260910020000', 'legacy_pending_cutover', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260910020400_mission_touch_identity
begin;
create table internal.mission_touch_emissions (
    touch_id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    run_id uuid not null,
    node_ref text not null check (btrim(node_ref) <> ''),
    conversation_id uuid references public.conversations(id) on delete cascade,
    msg_id bigint,
    unique (organization_id, run_id, node_ref)
);
revoke all on internal.mission_touch_emissions from public, anon, authenticated;
drop function public.emit_ai_mission_job(uuid, uuid, text, text, jsonb, jsonb, text, jsonb);
create function public.emit_ai_mission_job(
    p_organization_id    uuid,
    p_contact_id         uuid,
    p_event_family       text,
    p_node_ref           text default null,
    p_delta              jsonb default '{}'::jsonb,
    p_concession_request jsonb default null,
    p_preferred_channel  text default 'whatsapp',
    p_otel               jsonb default null,
    p_run_id             uuid default null
)
returns table (status text, conversation_id uuid, msg_id bigint)
language plpgsql
security definer
set search_path = pg_catalog, public, internal, pgmq
as $$
#variable_conflict use_column
declare
    v_mission_id      uuid;
    v_touch_id        uuid;
    v_conversation_id uuid;
    v_msg_id          bigint;
begin
    if p_run_id is null or nullif(btrim(p_node_ref), '') is null then
        return query select 'missing_run_identity'::text, null::uuid, null::bigint;
        return;
    end if;
    if not exists (
        select 1
          from public.automation_runs r
         where r.id = p_run_id
           and r.organization_id = p_organization_id
    ) then
        return query select 'run_not_found'::text, null::uuid, null::bigint;
        return;
    end if;
    if p_preferred_channel not in ('whatsapp', 'email', 'instagram') then
        raise exception 'canal desconhecido: %', p_preferred_channel;
    end if;
    if not exists (
        select 1 from public.ai_runtime_rollout r
         where r.organization_id = p_organization_id and r.mode = 'runtime'
    ) then
        return query select 'not_rolled_out'::text, null::uuid, null::bigint;
        return;
    end if;
    if not exists (
        select 1 from public.contacts c
         where c.id = p_contact_id and c.organization_id = p_organization_id
    ) then
        return query select 'contact_not_found'::text, null::uuid, null::bigint;
        return;
    end if;
    select m.id into v_mission_id
      from public.ai_missions m
     where m.organization_id = p_organization_id
       and m.event_type = p_event_family
       and m.status = 'active'
     limit 1;
    if v_mission_id is null then
        insert into public.alerts (organization_id, type, severity, title, metadata)
        values (
            p_organization_id,
            'no_active_mission',
            'warning',
            'Nó de fluxo pediu toque sem missão ativa',
            jsonb_build_object('event_family', p_event_family, 'node_ref', p_node_ref)
        );
        return query select 'no_active_mission'::text, null::uuid, null::bigint;
        return;
    end if;
    insert into internal.mission_touch_emissions (organization_id, run_id, node_ref)
    values (p_organization_id, p_run_id, p_node_ref)
    on conflict (organization_id, run_id, node_ref)
    do update set node_ref = excluded.node_ref
    returning touch_id, conversation_id, msg_id
         into v_touch_id, v_conversation_id, v_msg_id;
    if v_msg_id is not null then
        return query select 'queued'::text, v_conversation_id, v_msg_id;
        return;
    end if;
    insert into public.conversations (organization_id, contact_id, last_channel)
    values (p_organization_id, p_contact_id, p_preferred_channel)
    on conflict (organization_id, contact_id) do nothing
    returning id into v_conversation_id;
    if v_conversation_id is null then
        select c.id into v_conversation_id
          from public.conversations c
         where c.organization_id = p_organization_id
           and c.contact_id = p_contact_id;
    end if;
    select pgmq.send(
        'q_domain_events',
        jsonb_build_object(
            'kind', 'mission_touch',
            'touch_id', v_touch_id,
            'organization_id', p_organization_id,
            'contact_id', p_contact_id,
            'conversation_id', v_conversation_id,
            'event_family', p_event_family,
            'mission_version_id', v_mission_id,
            'node_ref', p_node_ref,
            'delta', coalesce(p_delta, '{}'::jsonb),
            'concession_request', p_concession_request,
            'preferred_channel', p_preferred_channel,
            'otel', p_otel
        )
    ) into v_msg_id;
    update internal.mission_touch_emissions
       set conversation_id = v_conversation_id,
           msg_id = v_msg_id
     where touch_id = v_touch_id;
    return query select 'queued'::text, v_conversation_id, v_msg_id;
end
$$;
comment on function public.emit_ai_mission_job(
    uuid, uuid, text, text, jsonb, jsonb, text, jsonb, uuid
) is 'Emits one idempotent mission touch per organization, automation run and node.';
revoke all on function public.emit_ai_mission_job(
    uuid, uuid, text, text, jsonb, jsonb, text, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.emit_ai_mission_job(
    uuid, uuid, text, text, jsonb, jsonb, text, jsonb, uuid
) to service_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260910020400', 'mission_touch_identity', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260910020500_bounded_dead_letter_replay
begin;
create or replace function internal.reprocess_dead_letters(
    p_dead_letter_queue text,
    p_origin_queue      text,
    p_limit             integer default 50
)
    returns integer
    language plpgsql
    security definer
    set search_path = pg_catalog, internal
as $$
declare
    v_message record;
    v_payload jsonb;
    v_count   integer := 0;
begin
    if p_origin_queue is null
       or p_origin_queue not in ('q_inbound', 'q_domain_events', 'q_scheduled', 'q_evals')
       or p_dead_letter_queue is null
       or p_dead_letter_queue <> p_origin_queue || '_dlq' then
        raise exception 'invalid dead-letter queue pair: % -> %',
            p_dead_letter_queue, p_origin_queue;
    end if;
    if p_limit is null or p_limit < 1 or p_limit > 50 then
        raise exception 'dead-letter replay limit must be between 1 and 50';
    end if;
    for v_message in
        select msg_id, message
          from pgmq.read(p_dead_letter_queue, 60, p_limit)
    loop
        v_payload := v_message.message;
        if jsonb_typeof(v_payload) is distinct from 'object' then
            continue;
        end if;
        if v_payload ->> 'failure_kind' is distinct from 'transient' then
            continue;
        end if;
        if jsonb_typeof(v_payload -> 'replay_count') is distinct from 'number' then
            continue;
        end if;
        if v_payload ->> 'replay_count' is distinct from '0' then
            continue;
        end if;
        if v_payload ->> 'kind' = 'mission_touch'
           and nullif(btrim(v_payload ->> 'touch_id'), '') is null then
            continue;
        end if;
        perform pgmq.send(
            p_origin_queue,
            jsonb_set(
                (v_payload - 'error_class') - 'last_error',
                '{replay_count}',
                '1'::jsonb,
                true
            )
        );
        perform pgmq.archive(p_dead_letter_queue, v_message.msg_id);
        v_count := v_count + 1;
    end loop;
    return v_count;
end
$$;
revoke execute on function internal.reprocess_dead_letters(text, text, integer)
    from public, anon, authenticated, service_role, sender_role;
grant execute on function internal.reprocess_dead_letters(text, text, integer)
    to worker_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260910020500', 'bounded_dead_letter_replay', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260910020700_opt_out_normalized_lookup
begin;
create index if not exists idx_opt_out_normalized_lookup
    on public.whatsapp_opt_status (
        organization_id,
        ltrim(phone, '+'),
        status
    );
create or replace function internal.sender_preflight(
    p_organization_id uuid,
    p_to_phone        text,
    p_kind            text,
    p_channel         text default 'whatsapp',
    p_moment_ids      uuid[] default '{}'::uuid[]
)
    returns table (verdict text, template_name text, template_language text)
    language plpgsql
    stable
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_opted_out    boolean;
    v_last_inbound timestamptz;
    v_window_open  boolean;
    v_name         text;
    v_lang         text;
    v_alive        integer;
    v_readiness    jsonb;
begin
    select exists (
        select 1 from public.whatsapp_opt_status o
         where o.organization_id = p_organization_id
           and o.status = 'opted_out'
           and ltrim(o.phone, '+') = ltrim(p_to_phone, '+')
    ) into v_opted_out;
    if v_opted_out then
        return query select 'opt_out'::text, null::text, null::text;
        return;
    end if;
    if coalesce(array_length(p_moment_ids, 1), 0) > 0 then
        select count(*) into v_alive
          from public.commercial_moments m
         where m.id = any (p_moment_ids)
           and m.organization_id = p_organization_id
           and m.status = 'approved'
           and m.killed_at is null
           and now() between m.starts_at and m.ends_at;
        if v_alive < array_length(p_moment_ids, 1) then
            return query select 'moment_gone'::text, null::text, null::text;
            return;
        end if;
    end if;
    select c.last_inbound_at into v_last_inbound
      from public.conversations c
      join public.contacts ct on ct.id = c.contact_id
     where c.organization_id = p_organization_id
       and (ct.whatsapp = p_to_phone or ct.phone = p_to_phone
            or ltrim(ct.whatsapp, '+') = ltrim(p_to_phone, '+')
            or ltrim(coalesce(ct.phone, ''), '+') = ltrim(p_to_phone, '+'))
     order by c.last_inbound_at desc nulls last
     limit 1;
    v_window_open := v_last_inbound is not null
                     and v_last_inbound > now() - interval '24 hours';
    if v_window_open then
        return query select 'ok'::text, null::text, null::text;
        return;
    end if;
    if p_kind = 'reply' then
        return query select 'window_closed'::text, null::text, null::text;
        return;
    end if;
    if coalesce(array_length(p_moment_ids, 1), 0) > 0 then
        select m.template_readiness -> p_channel into v_readiness
          from public.commercial_moments m
         where m.id = p_moment_ids[1];
        if v_readiness is null
           or coalesce(v_readiness ->> 'status', '') <> 'approved'
           or coalesce(v_readiness ->> 'template_name', '') = '' then
            return query select 'moment_not_ready'::text, null::text, null::text;
            return;
        end if;
        return query select 'template'::text,
                            v_readiness ->> 'template_name',
                            coalesce(v_readiness ->> 'language', 'pt_BR');
        return;
    end if;
    select t.template_name, t.language into v_name, v_lang
      from public.channel_template_policies t
     where t.organization_id = p_organization_id
       and t.channel = p_channel
       and t.status = 'approved'
     order by t.event_type nulls last
     limit 1;
    if v_name is null then
        return query select 'no_template'::text, null::text, null::text;
        return;
    end if;
    return query select 'template'::text, v_name, v_lang;
end
$$;
revoke execute on function internal.sender_preflight(uuid, text, text, text, uuid[])
    from public;
grant execute on function internal.sender_preflight(uuid, text, text, text, uuid[])
    to sender_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260910020700', 'opt_out_normalized_lookup', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260910020800_restrict_legacy_agent_rpc_grants
begin;
DO $guard$
DECLARE
    target record;
BEGIN
    FOR target IN
        SELECT p.oid::regprocedure AS signature,
               p.proname,
               pg_get_function_identity_arguments(p.oid) AS arguments
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN (
               'search_agent_knowledge',
               'get_active_agent_for_conversation',
               'increment_action_trigger',
               'update_agent_stats'
           )
    LOOP
        EXECUTE format(
            'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC',
            target.signature
        );
        IF to_regrole('anon') IS NOT NULL THEN
            EXECUTE format(
                'REVOKE EXECUTE ON FUNCTION %s FROM anon',
                target.signature
            );
        END IF;
        IF to_regrole('authenticated') IS NOT NULL THEN
            EXECUTE format(
                'REVOKE EXECUTE ON FUNCTION %s FROM authenticated',
                target.signature
            );
        END IF;
        IF target.proname = 'increment_action_trigger'
           OR (
               target.proname = 'search_agent_knowledge'
               AND target.arguments NOT LIKE '%p_organization_id%'
           )
        THEN
            IF to_regrole('service_role') IS NOT NULL THEN
                EXECUTE format(
                    'REVOKE EXECUTE ON FUNCTION %s FROM service_role',
                    target.signature
                );
            END IF;
        END IF;
    END LOOP;
END
$guard$;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260910020800', 'restrict_legacy_agent_rpc_grants', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260910040001_ai_usage_billable_budget
begin;
DO $guard$
BEGIN
    IF to_regclass('public.ai_usage_logs') IS NULL THEN
        RAISE NOTICE 'ai_usage_logs ausente — pulando filtro billable do budget';
        RETURN;
    END IF;
    CREATE OR REPLACE FUNCTION public.ai_monthly_cost_usd(
        p_organization_id uuid,
        p_month_start     timestamptz
    )
    RETURNS TABLE (spent_usd numeric, has_unknown_cost boolean)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $body$
        SELECT
            COALESCE(SUM(cost_usd), 0)                  AS spent_usd,
            COALESCE(BOOL_OR(cost_usd IS NULL), false) AS has_unknown_cost
        FROM public.ai_usage_logs
        WHERE organization_id = p_organization_id
          AND created_at >= p_month_start
          AND (metadata ->> 'billable') IS DISTINCT FROM 'false';
    $body$;
    REVOKE EXECUTE ON FUNCTION public.ai_monthly_cost_usd(uuid, timestamptz) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.ai_monthly_cost_usd(uuid, timestamptz) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.ai_monthly_cost_usd(uuid, timestamptz) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.ai_monthly_cost_usd(uuid, timestamptz) TO service_role;
END
$guard$;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260910040001', 'ai_usage_billable_budget', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260915010000_account_scoped_conversation_bridge
begin;
alter table public.messages add column channel_account_id uuid;
create function internal.resolve_whatsapp_account(
    p_organization_id uuid, p_waba_id uuid default null
) returns uuid
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
    v_ids uuid[];
begin
    if p_waba_id is not null then
        if not exists (
            select 1 from public.whatsapp_business_accounts w
             where w.id = p_waba_id and w.organization_id = p_organization_id
        ) then
            raise exception 'invalid WhatsApp account for organization' using errcode = '22023';
        end if;
        return p_waba_id;
    end if;
    select array_agg(w.id) into v_ids
      from public.whatsapp_business_accounts w
     where w.organization_id = p_organization_id and w.status = 'active';
    if coalesce(cardinality(v_ids), 0) <> 1 then
        raise exception 'exactly one active WhatsApp account required' using errcode = '22023';
    end if;
    return v_ids[1];
end
$$;
revoke all on function internal.resolve_whatsapp_account(uuid, uuid) from public, anon, authenticated;
grant execute on function internal.resolve_whatsapp_account(uuid, uuid) to worker_role, sender_role, service_role;
drop function public.ingest_inbound_message(uuid, text, text, text, jsonb, text, integer);
create or replace function public.ingest_inbound_message(
    p_organization_id uuid,
    p_channel text,
    p_external_id text,
    p_contact_name text,
    p_content jsonb,
    p_provider_message_id text,
    p_debounce_seconds integer default 8,
    p_waba_id uuid default null
)
    returns table(conversation_id uuid, contact_id uuid, seq integer, deduplicated boolean)
    language plpgsql
    security definer
    set search_path to 'pg_catalog', 'public', 'internal'
as $function$
#variable_conflict use_column
declare
    v_waba_id         uuid;
    v_contact_id      uuid;
    v_conversation_id uuid;
    v_is_new          boolean := false;
    v_status          text;
    v_seq             integer;
    v_old             record;
    v_copy_seq        integer;
begin
    if p_channel not in ('whatsapp', 'email', 'instagram') then
        raise exception 'canal desconhecido: %', p_channel;
    end if;
    if p_channel = 'whatsapp' then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, p_waba_id);
    end if;
    if p_provider_message_id is not null then
        select m.conversation_id, m.seq
          into v_conversation_id, v_seq
          from public.messages m
         where m.provider_message_id = p_provider_message_id
           and m.organization_id = p_organization_id
           and m.channel = p_channel
           and (p_channel <> 'whatsapp' or m.channel_account_id = v_waba_id);
        if found then
            select c.contact_id into v_contact_id
              from public.conversations c where c.id = v_conversation_id;
            return query select v_conversation_id, v_contact_id, v_seq, true;
            return;
        end if;
    end if;
    select ci.contact_id into v_contact_id
      from public.channel_identities ci
     where ci.organization_id = p_organization_id
       and ci.channel = p_channel
       and ci.external_id = p_external_id;
    if v_contact_id is null then
        select c.id into v_contact_id
          from public.contacts c
         where c.organization_id = p_organization_id
           and (c.whatsapp = p_external_id or c.phone = p_external_id)
         order by c.created_at
         limit 1;
        if v_contact_id is null then
            insert into public.contacts (organization_id, phone, whatsapp, first_name, source)
            values (p_organization_id, p_external_id, p_external_id,
                    nullif(p_contact_name, ''), 'whatsapp')
            returning id into v_contact_id;
        end if;
        insert into public.channel_identities (organization_id, contact_id, channel, external_id)
        values (p_organization_id, v_contact_id, p_channel, p_external_id)
        on conflict (organization_id, channel, external_id) do nothing;
    end if;
    insert into public.conversations (organization_id, contact_id, last_channel, last_inbound_at)
    values (p_organization_id, v_contact_id, p_channel, now())
    on conflict (organization_id, contact_id) do nothing
    returning id into v_conversation_id;
    if v_conversation_id is not null then
        v_is_new := true;
    else
        select c.id, c.status into v_conversation_id, v_status
          from public.conversations c
         where c.organization_id = p_organization_id and c.contact_id = v_contact_id;
        update public.conversations
           set last_channel = p_channel,
               last_inbound_at = now(),
               status = case when status = 'closed' then 'open' else status end
         where id = v_conversation_id;
    end if;
    if v_is_new and p_channel = 'whatsapp' then
        for v_old in
            select wcm.message_id, wcm.direction, wcm.text_body, wcm.content,
                   wcm.sent_by_bot, wcm."timestamp", wcc.waba_id
              from public.whatsapp_cloud_messages wcm
              join public.whatsapp_cloud_conversations wcc on wcc.id = wcm.conversation_id
             where wcc.organization_id = p_organization_id
               and wcc.wa_id = p_external_id
               and wcm.message_id is distinct from p_provider_message_id
             order by wcm."timestamp" desc
             limit 20
        loop
            v_copy_seq := internal.next_message_seq(
                v_conversation_id,
                case v_old.direction when 'inbound' then 'inbound' else 'outbound' end
            );
            insert into public.messages
                (organization_id, conversation_id, direction, seq, channel, author_type,
                 content, provider_message_id, created_at, channel_account_id)
            values
                (p_organization_id, v_conversation_id, v_old.direction, v_copy_seq, 'whatsapp',
                 case when v_old.direction = 'inbound' then 'contact'
                      when v_old.sent_by_bot then 'agent' else 'human' end,
                 case when nullif(v_old.text_body, '') is not null
                      then jsonb_build_object('text', v_old.text_body)
                      else v_old.content end,
                 v_old.message_id, v_old."timestamp", v_old.waba_id)
            on conflict do nothing;
        end loop;
    end if;
    v_seq := internal.next_message_seq(v_conversation_id, 'inbound');
    insert into public.messages
        (organization_id, conversation_id, direction, seq, channel, author_type,
         content, provider_message_id, channel_account_id)
    values
        (p_organization_id, v_conversation_id, 'inbound', v_seq, p_channel, 'contact',
         p_content, p_provider_message_id, v_waba_id);
    update public.conversations
       set pending_response_at = now() + make_interval(secs => p_debounce_seconds)
     where id = v_conversation_id
       and status = 'open';
    return query select v_conversation_id, v_contact_id, v_seq, false;
end
$function$;
revoke all on function public.ingest_inbound_message(uuid, text, text, text, jsonb, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.ingest_inbound_message(uuid, text, text, text, jsonb, text, integer, uuid) to service_role;
drop function internal.mirror_outbound_to_inbox(uuid, text, text, text);
create function internal.mirror_outbound_to_inbox(
    p_organization_id uuid,
    p_to_phone        text,
    p_wamid           text,
    p_text            text,
    p_waba_id uuid default null
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_waba_id uuid;
    v_conversation record;
begin
    if p_waba_id is not null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, p_waba_id);
    end if;
    if v_waba_id is null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, null);
    end if;
    select wcc.id, wcc.waba_id into v_conversation
      from public.whatsapp_cloud_conversations wcc
     where wcc.organization_id = p_organization_id
       and wcc.waba_id = v_waba_id
       and (wcc.wa_id = p_to_phone or wcc.wa_id = ltrim(p_to_phone, '+'))
     limit 1;
    if v_conversation.id is null then
        return false;
    end if;
    insert into public.whatsapp_cloud_messages
        (organization_id, waba_id, conversation_id, message_id, direction,
         to_number, message_type, text_body, status, sent_by_bot, sender)
    values
        (p_organization_id, v_conversation.waba_id, v_conversation.id, p_wamid,
         'outbound', p_to_phone, 'text', p_text, 'sent', true, 'ai')
    on conflict (message_id) do nothing;
    update public.whatsapp_cloud_conversations
       set last_message_at = now(),
           last_message_preview = left(coalesce(p_text, ''), 120),
           last_message_direction = 'outbound',
           updated_at = now()
     where id = v_conversation.id;
    return true;
end
$$;
revoke all on function internal.mirror_outbound_to_inbox(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function internal.mirror_outbound_to_inbox(uuid, text, text, text, uuid) to sender_role;
drop function internal.emit_ai_run_step(uuid, uuid, text, text, uuid, jsonb, uuid, text);
create or replace function internal.emit_ai_run_step(
    p_organization_id uuid,
    p_run_id          uuid,
    p_step            text,
    p_detail          text  default null,
    p_agent_id        uuid  default null,
    p_metadata        jsonb default null,
    p_conversation_id uuid  default null,
    p_phone           text  default null,
    p_waba_id uuid default null
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_waba_id uuid;
    v_phone text := p_phone;
    v_cloud uuid;
begin
    if p_waba_id is not null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, p_waba_id);
    end if;
    if v_phone is null and p_conversation_id is not null then
        select ci.external_id into v_phone
          from public.conversations c
          join public.channel_identities ci
            on ci.organization_id = c.organization_id
           and ci.contact_id = c.contact_id
           and ci.channel = 'whatsapp'
         where c.id = p_conversation_id
           and c.organization_id = p_organization_id
         limit 1;
    end if;
    if v_phone is null then
        return false;
    end if;
    if v_waba_id is null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, null);
    end if;
    select wcc.id into v_cloud
      from public.whatsapp_cloud_conversations wcc
     where wcc.organization_id = p_organization_id
       and wcc.waba_id = v_waba_id
       and (wcc.wa_id = v_phone or wcc.wa_id = ltrim(v_phone, '+'))
     limit 1;
    if v_cloud is null then
        return false;
    end if;
    insert into public.whatsapp_ai_run_steps
        (organization_id, conversation_id, run_id, agent_id, step, detail, metadata)
    values
        (p_organization_id, v_cloud, p_run_id, p_agent_id, p_step, p_detail, p_metadata);
    return true;
end
$$;
revoke all on function internal.emit_ai_run_step(uuid, uuid, text, text, uuid, jsonb, uuid, text, uuid) from public, anon, authenticated;
grant execute on function internal.emit_ai_run_step(uuid, uuid, text, text, uuid, jsonb, uuid, text, uuid) to worker_role, sender_role;
drop function internal.legacy_conversation_guard_state(uuid, uuid);
create function internal.legacy_conversation_guard_state(
    p_organization_id uuid,
    p_conversation_id uuid,
    p_waba_id uuid default null
)
    returns table (
        ai_enabled           boolean,
        ai_agent_id          uuid,
        ai_transferred_at    timestamptz,
        bot_message_count    integer,
        last_bot_message_at  timestamptz,
        has_human_reply      boolean
    )
    language plpgsql
    stable
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_waba_id uuid;
    v_phone text;
    v_cloud uuid;
begin
    if p_waba_id is not null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, p_waba_id);
    end if;
    select ci.external_id into v_phone
      from public.conversations c
      join public.channel_identities ci
        on ci.organization_id = c.organization_id
       and ci.contact_id = c.contact_id
       and ci.channel = 'whatsapp'
     where c.id = p_conversation_id
       and c.organization_id = p_organization_id
     limit 1;
    if v_phone is null then
        return;
    end if;
    if v_waba_id is null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, null);
    end if;
    select wcc.id into v_cloud
      from public.whatsapp_cloud_conversations wcc
     where wcc.organization_id = p_organization_id
       and wcc.waba_id = v_waba_id
       and (wcc.wa_id = v_phone or wcc.wa_id = ltrim(v_phone, '+'))
     limit 1;
    if v_cloud is null then
        return;
    end if;
    return query
    select wcc.ai_enabled is distinct from false,
           wcc.ai_agent_id,
           wcc.ai_transferred_at,
           coalesce(bot.total, 0)::integer,
           bot.last_at,
           coalesce(human.exists_, false)
      from public.whatsapp_cloud_conversations wcc
      left join lateral (
          select count(*) as total, max(wcm."timestamp") as last_at
            from public.whatsapp_cloud_messages wcm
           where wcm.organization_id = p_organization_id
             and wcm.conversation_id = wcc.id
             and wcm.sent_by_bot
      ) bot on true
      left join lateral (
          select true as exists_
            from public.whatsapp_cloud_messages wcm
           where wcm.organization_id = p_organization_id
             and wcm.conversation_id = wcc.id
             and wcm.sender = 'human'
           limit 1
      ) human on true
     where wcc.id = v_cloud;
end
$$;
revoke all on function internal.legacy_conversation_guard_state(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function internal.legacy_conversation_guard_state(uuid, uuid, uuid) to worker_role;
drop function internal.mark_ai_handoff(uuid, uuid, text);
create or replace function internal.mark_ai_handoff(
    p_organization_id uuid,
    p_conversation_id uuid,
    p_reason          text,
    p_waba_id uuid default null
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_waba_id uuid;
    v_phone text;
    v_cloud uuid;
begin
    if p_waba_id is not null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, p_waba_id);
    end if;
    select ci.external_id into v_phone
      from public.conversations c
      join public.channel_identities ci
        on ci.organization_id = c.organization_id
       and ci.contact_id = c.contact_id
       and ci.channel = 'whatsapp'
     where c.id = p_conversation_id
       and c.organization_id = p_organization_id
     limit 1;
    if v_phone is null then
        return false;
    end if;
    if v_waba_id is null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, null);
    end if;
    select wcc.id into v_cloud
      from public.whatsapp_cloud_conversations wcc
     where wcc.organization_id = p_organization_id
       and wcc.waba_id = v_waba_id
       and (wcc.wa_id = v_phone or wcc.wa_id = ltrim(v_phone, '+'))
     limit 1;
    if v_cloud is null then
        return false;
    end if;
    update public.whatsapp_cloud_conversations
       set ai_enabled = false,
           ai_disabled_at = now(),
           ai_disabled_reason = p_reason,
           ai_transferred_at = now(),
           updated_at = now()
     where id = v_cloud
       and organization_id = p_organization_id;
    return true;
end
$$;
revoke all on function internal.mark_ai_handoff(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function internal.mark_ai_handoff(uuid, uuid, text, uuid) to worker_role;
drop function internal.conclude_turn(uuid, uuid, integer, integer, integer, jsonb, text, text, uuid[], jsonb, boolean);
create function internal.conclude_turn(
    p_conversation_id  uuid,
    p_token            uuid,
    p_expected_version integer,
    p_generation       integer,
    p_target_seq       integer,
    p_content          jsonb,
    p_idempotency_key  text,
    p_kind             text default 'reply',
    p_moment_ids       uuid[] default '{}'::uuid[],
    p_otel             jsonb default null,
    p_require_runtime  boolean default false,
    p_channel_account_id uuid default null
)
    returns internal.turn_outcome
    language plpgsql
    set search_path = pg_catalog, public, internal
as $$
declare
    v_account_id      uuid;
    v_organization_id uuid;
    v_contact_id      uuid;
    v_channel         text;
    v_seq             integer;
    v_outbox_id       uuid;
begin
    select organization_id, coalesce(last_channel, 'whatsapp')
      into v_organization_id, v_channel
      from public.conversations where id = p_conversation_id;
    if not found then
        return row(false, null, null)::internal.turn_outcome;
    end if;
    if v_channel = 'whatsapp' then
        v_account_id := internal.resolve_whatsapp_account(v_organization_id, p_channel_account_id);
    end if;
    update public.conversations
       set last_processed_seq = p_target_seq,
           processing_token = null,
           processing_until = null,
           version = version + 1
     where id = p_conversation_id
       and processing_token = p_token
       and version = p_expected_version
       and processing_generation = p_generation
       and next_inbound_seq = p_target_seq
       and (
           not p_require_runtime
           or exists (
               select 1
                 from public.ai_runtime_rollout r
                where r.organization_id = public.conversations.organization_id
                  and r.mode = 'runtime'
           )
       )
    returning organization_id, contact_id, coalesce(last_channel, 'whatsapp')
      into v_organization_id, v_contact_id, v_channel;
    if not found then
        return row(false, null, null)::internal.turn_outcome;
    end if;
    if p_content is null or jsonb_typeof(p_content) = 'null' then
        return row(true, null, null)::internal.turn_outcome;
    end if;
    insert into internal.message_outbox
        (organization_id, conversation_id, contact_id, channel,
         kind, payload, idempotency_key, moment_ids, otel, channel_account_id)
    values
        (v_organization_id, p_conversation_id, v_contact_id, v_channel,
         p_kind, p_content, p_idempotency_key, coalesce(p_moment_ids, '{}'::uuid[]),
         p_otel, v_account_id)
    returning id into v_outbox_id;
    v_seq := internal.next_message_seq(p_conversation_id, 'outbound');
    insert into public.messages
        (organization_id, conversation_id, direction, seq, channel,
         author_type, content, outbox_id, channel_account_id)
    values
        (v_organization_id, p_conversation_id, 'outbound', v_seq, v_channel,
         'agent', p_content, v_outbox_id, v_account_id);
    return row(true, v_seq, v_outbox_id)::internal.turn_outcome;
end
$$;
revoke all on function internal.conclude_turn(uuid, uuid, integer, integer, integer, jsonb, text, text, uuid[], jsonb, boolean, uuid) from public, anon, authenticated;
grant execute on function internal.conclude_turn(uuid, uuid, integer, integer, integer, jsonb, text, text, uuid[], jsonb, boolean, uuid) to worker_role;
create or replace function internal.coalesce_due_conversations(
    p_queue text default 'q_inbound',
    p_limit integer default 100,
    p_otel  jsonb default null
)
    returns setof internal.coalesced_job
    language plpgsql
    security definer
    set search_path = pg_catalog, public, internal
as $$
declare
    v_jobs internal.coalesced_job[];
    v_job  internal.coalesced_job;
begin
    with due_runtime as (
        select c.id
          from public.conversations c
          join public.ai_runtime_rollout r
            on r.organization_id = c.organization_id
           and r.mode = 'runtime'
         where c.pending_response_at is not null
           and c.pending_response_at <= now()
         order by c.pending_response_at
         for update of c skip locked
         limit p_limit
    ),
    bumped as (
        update public.conversations c
           set processing_generation = c.processing_generation + 1,
               pending_response_at = null
          from due_runtime
         where c.id = due_runtime.id
        returning c.id, c.processing_generation, c.next_inbound_seq, c.organization_id
    ),
    due_legacy as (
        select c.id
          from public.conversations c
          left join public.ai_runtime_rollout r on r.organization_id = c.organization_id
         where c.pending_response_at is not null
           and c.pending_response_at <= now()
           and coalesce(r.mode, 'legacy') = 'legacy'
         order by c.pending_response_at
         for update of c skip locked
         limit p_limit
    ),
    legacy_cleared as (
        update public.conversations c
           set pending_response_at = null
          from due_legacy
         where c.id = due_legacy.id
        returning c.id
    )
    select array_agg(
               row(id, processing_generation, next_inbound_seq, organization_id, p_otel)
                   ::internal.coalesced_job
           )
      into v_jobs
      from bumped;
    foreach v_job in array coalesce(v_jobs, array[]::internal.coalesced_job[])
    loop
        perform pgmq.send(
            p_queue,
            jsonb_build_object(
                'conversation_id', v_job.conversation_id,
                'generation', v_job.generation,
                'target_seq', v_job.target_seq,
                'organization_id', v_job.organization_id,
                'otel', v_job.otel
            ) || jsonb_strip_nulls(jsonb_build_object(
                'channel_account_id', (
                    select m.channel_account_id from public.messages m
                     where m.conversation_id = v_job.conversation_id
                       and m.organization_id = v_job.organization_id
                       and m.direction = 'inbound' and m.seq <= v_job.target_seq
                     order by m.seq desc limit 1
                )
            ))
        );
        return next v_job;
    end loop;
end
$$;
alter type internal.claimed_send add attribute channel_account_id uuid;
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
        select id
          from internal.message_outbox
         where status = 'pending'
           and next_attempt_at <= now()
         order by next_attempt_at
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
drop function public.emit_ai_mission_job(uuid, uuid, text, text, jsonb, jsonb, text, jsonb, uuid);
create function public.emit_ai_mission_job(
    p_organization_id    uuid,
    p_contact_id         uuid,
    p_event_family       text,
    p_node_ref           text default null,
    p_delta              jsonb default '{}'::jsonb,
    p_concession_request jsonb default null,
    p_preferred_channel  text default 'whatsapp',
    p_otel               jsonb default null,
    p_run_id             uuid default null,
    p_waba_id            uuid default null
)
returns table (status text, conversation_id uuid, msg_id bigint)
language plpgsql
security definer
set search_path = pg_catalog, public, internal, pgmq
as $$
#variable_conflict use_column
declare
    v_waba_id         uuid;
    v_mission_id      uuid;
    v_touch_id        uuid;
    v_conversation_id uuid;
    v_msg_id          bigint;
begin
    if p_run_id is null or nullif(btrim(p_node_ref), '') is null then
        return query select 'missing_run_identity'::text, null::uuid, null::bigint;
        return;
    end if;
    if not exists (
        select 1
          from public.automation_runs r
         where r.id = p_run_id
           and r.organization_id = p_organization_id
    ) then
        return query select 'run_not_found'::text, null::uuid, null::bigint;
        return;
    end if;
    if p_preferred_channel not in ('whatsapp', 'email', 'instagram') then
        raise exception 'canal desconhecido: %', p_preferred_channel;
    end if;
    if not exists (
        select 1 from public.ai_runtime_rollout r
         where r.organization_id = p_organization_id and r.mode = 'runtime'
    ) then
        return query select 'not_rolled_out'::text, null::uuid, null::bigint;
        return;
    end if;
    if not exists (
        select 1 from public.contacts c
         where c.id = p_contact_id and c.organization_id = p_organization_id
    ) then
        return query select 'contact_not_found'::text, null::uuid, null::bigint;
        return;
    end if;
    if p_preferred_channel = 'whatsapp' then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, p_waba_id);
    end if;
    select m.id into v_mission_id
      from public.ai_missions m
     where m.organization_id = p_organization_id
       and m.event_type = p_event_family
       and m.status = 'active'
     limit 1;
    if v_mission_id is null then
        insert into public.alerts (organization_id, type, severity, title, metadata)
        values (
            p_organization_id,
            'no_active_mission',
            'warning',
            'Nó de fluxo pediu toque sem missão ativa',
            jsonb_build_object('event_family', p_event_family, 'node_ref', p_node_ref)
        );
        return query select 'no_active_mission'::text, null::uuid, null::bigint;
        return;
    end if;
    insert into internal.mission_touch_emissions (organization_id, run_id, node_ref)
    values (p_organization_id, p_run_id, p_node_ref)
    on conflict (organization_id, run_id, node_ref)
    do update set node_ref = excluded.node_ref
    returning touch_id, conversation_id, msg_id
         into v_touch_id, v_conversation_id, v_msg_id;
    if v_msg_id is not null then
        return query select 'queued'::text, v_conversation_id, v_msg_id;
        return;
    end if;
    insert into public.conversations (organization_id, contact_id, last_channel)
    values (p_organization_id, p_contact_id, p_preferred_channel)
    on conflict (organization_id, contact_id) do nothing
    returning id into v_conversation_id;
    if v_conversation_id is null then
        select c.id into v_conversation_id
          from public.conversations c
         where c.organization_id = p_organization_id
           and c.contact_id = p_contact_id;
    end if;
    select pgmq.send(
        'q_domain_events',
        jsonb_build_object(
            'kind', 'mission_touch',
            'touch_id', v_touch_id,
            'organization_id', p_organization_id,
            'contact_id', p_contact_id,
            'conversation_id', v_conversation_id,
            'event_family', p_event_family,
            'mission_version_id', v_mission_id,
            'node_ref', p_node_ref,
            'delta', coalesce(p_delta, '{}'::jsonb),
            'concession_request', p_concession_request,
            'preferred_channel', p_preferred_channel,
            'otel', p_otel
        ) || jsonb_strip_nulls(jsonb_build_object('channel_account_id', v_waba_id))
    ) into v_msg_id;
    update internal.mission_touch_emissions
       set conversation_id = v_conversation_id,
           msg_id = v_msg_id
     where touch_id = v_touch_id;
    return query select 'queued'::text, v_conversation_id, v_msg_id;
end
$$;
revoke all on function public.emit_ai_mission_job(uuid, uuid, text, text, jsonb, jsonb, text, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.emit_ai_mission_job(uuid, uuid, text, text, jsonb, jsonb, text, jsonb, uuid, uuid) to service_role;
create function internal.whatsapp_business_account_for_number(
    p_organization_id uuid, p_phone_number_id text
) returns table (id uuid, phone_number_id text, access_token text, access_token_encrypted text)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
    if p_organization_id is distinct from public.current_app_organization_id() then
        raise exception 'WhatsApp account organization is not the session organization';
    end if;
    return query select w.id, w.phone_number_id, w.access_token, w.access_token_encrypted
      from public.whatsapp_business_accounts w
     where w.organization_id = p_organization_id
       and w.phone_number_id = p_phone_number_id and w.status = 'active';
end
$$;
revoke all on function internal.whatsapp_business_account_for_number(uuid, text) from public, anon, authenticated, worker_role;
grant execute on function internal.whatsapp_business_account_for_number(uuid, text) to sender_role;
create or replace function internal.active_whatsapp_business_account(p_organization_id uuid)
returns table (id uuid, phone_number_id text, access_token text, access_token_encrypted text)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
    if p_organization_id is distinct from public.current_app_organization_id() then
        raise exception 'WhatsApp account organization is not the session organization';
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
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260915010000', 'account_scoped_conversation_bridge', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260915020000_accepted_agent_traces
begin;
alter table public.agent_traces
  add column if not exists trace_source text not null default 'legacy_generated',
  add column if not exists outbox_id uuid,
  add column if not exists channel_account_id uuid,
  add column if not exists generation integer,
  add column if not exists target_seq integer,
  add column if not exists selected_attempt integer;
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.agent_traces'::regclass
       and conname = 'agent_traces_trace_source_check'
  ) then
    alter table public.agent_traces
      add constraint agent_traces_trace_source_check
      check (trace_source in ('legacy_generated', 'runtime_accepted')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.agent_traces'::regclass
       and conname = 'agent_traces_selected_attempt_check'
  ) then
    alter table public.agent_traces
      add constraint agent_traces_selected_attempt_check
      check (selected_attempt is null or selected_attempt >= 0) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.agent_traces'::regclass
       and conname = 'agent_traces_runtime_accepted_complete'
  ) then
    alter table public.agent_traces
      add constraint agent_traces_runtime_accepted_complete
      check (
        trace_source <> 'runtime_accepted'
        or (
          organization_id is not null
          and conversation_id is not null
          and agent_id is not null
          and outbox_id is not null
          and channel_account_id is not null
          and generation is not null
          and target_seq is not null
          and output is not null
        )
      ) not valid;
  end if;
end
$$;
do $$
begin
  if not exists (
    select 1 from public.agent_traces
     where trace_source not in ('legacy_generated', 'runtime_accepted')
  ) then
    alter table public.agent_traces validate constraint agent_traces_trace_source_check;
  end if;
  if not exists (
    select 1 from public.agent_traces where selected_attempt < 0
  ) then
    alter table public.agent_traces validate constraint agent_traces_selected_attempt_check;
  end if;
  if not exists (
    select 1 from public.agent_traces
     where trace_source = 'runtime_accepted'
       and (
         organization_id is null or conversation_id is null or agent_id is null
         or outbox_id is null or channel_account_id is null or generation is null
         or target_seq is null or output is null
       )
  ) then
    alter table public.agent_traces validate constraint agent_traces_runtime_accepted_complete;
  end if;
end
$$;
create unique index if not exists agent_traces_outbox_uniq
  on public.agent_traces (outbox_id) where outbox_id is not null;
create index if not exists agent_traces_org_agent_source_created_idx
  on public.agent_traces (organization_id, agent_id, trace_source, created_at desc);
create table if not exists public.agent_trace_annotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agent_id uuid not null,
  trace_id uuid not null unique references public.agent_traces(id) on delete cascade,
  rating text not null check (rating in ('good', 'bad', 'fix')),
  correction_text text,
  annotated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_trace_annotations_agent
  on public.agent_trace_annotations (agent_id, created_at desc);
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.agent_trace_annotations'::regclass
       and conname = 'agent_trace_annotations_fix_requires_correction'
  ) then
    alter table public.agent_trace_annotations
      add constraint agent_trace_annotations_fix_requires_correction
      check (
        rating <> 'fix'
        or (correction_text is not null and correction_text ~ '[^[:space:]]')
      )
      not valid;
  end if;
  if not exists (
    select 1 from public.agent_trace_annotations
     where rating = 'fix'
       and (correction_text is null or correction_text !~ '[^[:space:]]')
  ) then
    alter table public.agent_trace_annotations
      validate constraint agent_trace_annotations_fix_requires_correction;
  end if;
end
$$;
alter table public.agent_traces enable row level security;
alter table public.agent_trace_annotations enable row level security;
do $$
declare
  policy record;
begin
  for policy in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('agent_traces', 'agent_trace_annotations')
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy.policyname, policy.schemaname, policy.tablename
    );
  end loop;
end
$$;
create policy agent_traces_org_select on public.agent_traces
  for select to authenticated
  using (public.user_belongs_to_org(organization_id));
create policy agent_trace_annotations_org_select on public.agent_trace_annotations
  for select to authenticated
  using (public.user_belongs_to_org(organization_id));
revoke all privileges on table public.agent_traces
  from public, anon, authenticated, service_role, worker_role, sender_role;
revoke all privileges on table public.agent_trace_annotations
  from public, anon, authenticated, service_role, worker_role, sender_role;
grant select on table public.agent_traces, public.agent_trace_annotations
  to authenticated;
grant select, insert on table public.agent_traces to service_role;
grant select, insert, update, delete on table public.agent_trace_annotations
  to service_role;
create or replace function internal.record_accepted_trace(
  p_organization_id uuid,
  p_outbox_id uuid,
  p_conversation_id uuid,
  p_agent_id uuid,
  p_channel_account_id uuid,
  p_generation integer,
  p_target_seq integer,
  p_selected_attempt integer,
  p_provider text,
  p_model text,
  p_input text,
  p_output text,
  p_tool_calls jsonb,
  p_tokens integer,
  p_latency_ms integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  v_id uuid;
  v_existing public.agent_traces%rowtype;
begin
  if p_organization_id is null
     or p_organization_id is distinct from public.current_app_organization_id()
  then
    raise exception 'accepted trace organization is not the session organization'
      using errcode = '42501';
  end if;
  if p_outbox_id is null or p_conversation_id is null or p_agent_id is null
     or p_channel_account_id is null or p_generation is null
     or p_target_seq is null or p_output is null
  then
    raise exception 'accepted trace context is incomplete' using errcode = '22023';
  end if;
  if p_selected_attempt is not null and p_selected_attempt < 0 then
    raise exception 'accepted trace selected attempt is negative' using errcode = '22023';
  end if;
  select * into v_existing
    from public.agent_traces where outbox_id = p_outbox_id;
  if not found then
    if not exists (
      select 1 from public.conversations c
       where c.id = p_conversation_id
         and c.organization_id = p_organization_id
         and c.processing_generation = p_generation
         and c.last_processed_seq = p_target_seq
    ) then
      raise exception 'accepted trace conversation does not match' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.ai_agents a
       where a.id = p_agent_id and a.organization_id = p_organization_id
    ) then
      raise exception 'accepted trace agent does not match' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.whatsapp_business_accounts a
       where a.id = p_channel_account_id and a.organization_id = p_organization_id
    ) then
      raise exception 'accepted trace channel account does not match' using errcode = '22023';
    end if;
    if not exists (
      select 1 from internal.message_outbox o
       where o.id = p_outbox_id
         and o.organization_id = p_organization_id
         and o.conversation_id = p_conversation_id
         and o.channel_account_id = p_channel_account_id
         and o.payload ->> 'text' is not distinct from p_output
    ) then
      raise exception 'accepted trace outbox or output does not match' using errcode = '22023';
    end if;
    insert into public.agent_traces (
      organization_id, conversation_id, agent_id, provider, model, input, output,
      tool_calls, tokens, latency_ms, trace_source, outbox_id, channel_account_id,
      generation, target_seq, selected_attempt
    )
    values (
      p_organization_id, p_conversation_id, p_agent_id, p_provider, p_model,
      p_input, p_output, p_tool_calls, p_tokens, p_latency_ms, 'runtime_accepted',
      p_outbox_id, p_channel_account_id, p_generation, p_target_seq,
      p_selected_attempt
    )
    on conflict (outbox_id) where outbox_id is not null do nothing
    returning id into v_id;
    if v_id is not null then
      return v_id;
    end if;
    select * into strict v_existing
      from public.agent_traces where outbox_id = p_outbox_id;
  end if;
  if not (
    v_existing.trace_source is not distinct from 'runtime_accepted'
    and v_existing.organization_id is not distinct from p_organization_id
    and v_existing.conversation_id is not distinct from p_conversation_id
    and v_existing.agent_id is not distinct from p_agent_id
    and v_existing.channel_account_id is not distinct from p_channel_account_id
    and v_existing.generation is not distinct from p_generation
    and v_existing.target_seq is not distinct from p_target_seq
    and v_existing.selected_attempt is not distinct from p_selected_attempt
    and v_existing.provider is not distinct from p_provider
    and v_existing.model is not distinct from p_model
    and v_existing.input is not distinct from p_input
    and v_existing.output is not distinct from p_output
    and v_existing.tool_calls is not distinct from p_tool_calls
    and v_existing.tokens is not distinct from p_tokens
    and v_existing.latency_ms is not distinct from p_latency_ms
  ) then
    raise exception 'accepted trace retry diverged' using errcode = 'P0001';
  end if;
  return v_existing.id;
end
$$;
revoke all on function internal.record_accepted_trace(
  uuid, uuid, uuid, uuid, uuid, integer, integer, integer,
  text, text, text, text, jsonb, integer, integer
) from public, anon, authenticated, service_role, worker_role, sender_role;
grant execute on function internal.record_accepted_trace(
  uuid, uuid, uuid, uuid, uuid, integer, integer, integer,
  text, text, text, text, jsonb, integer, integer
) to worker_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260915020000', 'accepted_agent_traces', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260915030000_accepted_trace_channel_compat
begin;
alter table public.agent_traces
  drop constraint agent_traces_runtime_accepted_complete;
alter table public.agent_traces
  add constraint agent_traces_runtime_accepted_complete
  check (
    trace_source <> 'runtime_accepted'
    or (
      organization_id is not null
      and conversation_id is not null
      and agent_id is not null
      and outbox_id is not null
      and generation is not null
      and target_seq is not null
      and output is not null
    )
  );
create or replace function internal.record_accepted_trace(
  p_organization_id uuid,
  p_outbox_id uuid,
  p_conversation_id uuid,
  p_agent_id uuid,
  p_channel_account_id uuid,
  p_generation integer,
  p_target_seq integer,
  p_selected_attempt integer,
  p_provider text,
  p_model text,
  p_input text,
  p_output text,
  p_tool_calls jsonb,
  p_tokens integer,
  p_latency_ms integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  v_id uuid;
  v_existing public.agent_traces%rowtype;
  v_outbox internal.message_outbox%rowtype;
begin
  if p_organization_id is null
     or p_organization_id is distinct from public.current_app_organization_id()
  then
    raise exception 'accepted trace organization is not the session organization'
      using errcode = '42501';
  end if;
  if p_outbox_id is null or p_conversation_id is null or p_agent_id is null
     or p_generation is null or p_target_seq is null or p_output is null
  then
    raise exception 'accepted trace context is incomplete' using errcode = '22023';
  end if;
  if p_selected_attempt is not null and p_selected_attempt < 0 then
    raise exception 'accepted trace selected attempt is negative' using errcode = '22023';
  end if;
  select * into v_existing
    from public.agent_traces where outbox_id = p_outbox_id;
  if not found then
    select * into v_outbox from internal.message_outbox o
     where o.id = p_outbox_id
       and o.organization_id = p_organization_id
       and o.conversation_id = p_conversation_id;
    if not found then
      raise exception 'accepted trace outbox or output does not match' using errcode = '22023';
    end if;
    if v_outbox.channel = 'whatsapp' then
      if p_channel_account_id is null or not exists (
        select 1 from public.whatsapp_business_accounts a
         where a.id = p_channel_account_id and a.organization_id = p_organization_id
      ) then
        raise exception 'accepted trace channel account does not match' using errcode = '22023';
      end if;
    elsif p_channel_account_id is not null then
      raise exception 'accepted trace channel account does not match' using errcode = '22023';
    end if;
    if not (
      v_outbox.channel_account_id is not distinct from p_channel_account_id
      and v_outbox.payload ->> 'text' is not distinct from p_output
    ) then
      raise exception 'accepted trace outbox or output does not match' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.conversations c
       where c.id = p_conversation_id
         and c.organization_id = p_organization_id
         and c.processing_generation = p_generation
         and c.last_processed_seq = p_target_seq
    ) then
      raise exception 'accepted trace conversation does not match' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.ai_agents a
       where a.id = p_agent_id and a.organization_id = p_organization_id
    ) then
      raise exception 'accepted trace agent does not match' using errcode = '22023';
    end if;
    insert into public.agent_traces (
      organization_id, conversation_id, agent_id, provider, model, input, output,
      tool_calls, tokens, latency_ms, trace_source, outbox_id, channel_account_id,
      generation, target_seq, selected_attempt
    )
    values (
      p_organization_id, p_conversation_id, p_agent_id, p_provider, p_model,
      p_input, p_output, p_tool_calls, p_tokens, p_latency_ms, 'runtime_accepted',
      p_outbox_id, p_channel_account_id, p_generation, p_target_seq,
      p_selected_attempt
    )
    on conflict (outbox_id) where outbox_id is not null do nothing
    returning id into v_id;
    if v_id is not null then
      return v_id;
    end if;
    select * into strict v_existing
      from public.agent_traces where outbox_id = p_outbox_id;
  end if;
  if not (
    v_existing.trace_source is not distinct from 'runtime_accepted'
    and v_existing.organization_id is not distinct from p_organization_id
    and v_existing.conversation_id is not distinct from p_conversation_id
    and v_existing.agent_id is not distinct from p_agent_id
    and v_existing.channel_account_id is not distinct from p_channel_account_id
    and v_existing.generation is not distinct from p_generation
    and v_existing.target_seq is not distinct from p_target_seq
    and v_existing.selected_attempt is not distinct from p_selected_attempt
    and v_existing.provider is not distinct from p_provider
    and v_existing.model is not distinct from p_model
    and v_existing.input is not distinct from p_input
    and v_existing.output is not distinct from p_output
    and v_existing.tool_calls is not distinct from p_tool_calls
    and v_existing.tokens is not distinct from p_tokens
    and v_existing.latency_ms is not distinct from p_latency_ms
  ) then
    raise exception 'accepted trace retry diverged' using errcode = 'P0001';
  end if;
  return v_existing.id;
end
$$;
revoke all on function internal.record_accepted_trace(
  uuid, uuid, uuid, uuid, uuid, integer, integer, integer,
  text, text, text, text, jsonb, integer, integer
) from public, anon, authenticated, service_role, worker_role, sender_role;
grant execute on function internal.record_accepted_trace(
  uuid, uuid, uuid, uuid, uuid, integer, integer, integer,
  text, text, text, text, jsonb, integer, integer
) to worker_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260915030000', 'accepted_trace_channel_compat', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260916010000_eligible_eval_queries
begin;
create or replace function public.list_eligible_eval_cases(
  p_organization_id uuid,
  p_agent_id uuid,
  p_limit integer default 20
)
returns table (
  id uuid,
  title text,
  input text,
  expected text,
  source text,
  source_id uuid,
  tags text[],
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  return query
  select c.id, c.title, c.input, c.expected, c.source, c.source_id,
         c.tags, c.created_at
    from public.ai_eval_cases c
    left join public.agent_traces t
      on c.source = 'annotation'
     and t.id = c.source_id
     and t.organization_id = p_organization_id
     and t.agent_id = p_agent_id
   where c.organization_id = p_organization_id
     and c.agent_id = p_agent_id
     and (
       c.source = 'scenario'
       or (
         c.source = 'annotation'
         and t.trace_source = 'runtime_accepted'
       )
     )
   order by c.created_at desc, c.id desc
   limit greatest(0, least(coalesce(p_limit, 20), 20));
end
$$;
create or replace function public.list_eligible_low_eval_results(
  p_organization_id uuid,
  p_agent_id uuid,
  p_limit integer default 20
)
returns table (
  case_id uuid,
  score integer,
  judged_output text
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  return query
  select r.case_id, r.score, r.judged_output
    from public.ai_eval_results r
    join public.ai_eval_cases c
      on c.id = r.case_id
     and c.organization_id = p_organization_id
     and c.agent_id = p_agent_id
    left join public.agent_traces t
      on c.source = 'annotation'
     and t.id = c.source_id
     and t.organization_id = p_organization_id
     and t.agent_id = p_agent_id
   where r.organization_id = p_organization_id
     and r.agent_id = p_agent_id
     and r.score < 60
     and (
       c.source = 'scenario'
       or (
         c.source = 'annotation'
         and t.trace_source = 'runtime_accepted'
       )
     )
   order by r.score asc, r.created_at desc, r.id desc
   limit greatest(0, least(coalesce(p_limit, 20), 20));
end
$$;
revoke all on function public.list_eligible_eval_cases(uuid, uuid, integer)
  from public, anon, authenticated, service_role, worker_role, sender_role;
revoke all on function public.list_eligible_low_eval_results(uuid, uuid, integer)
  from public, anon, authenticated, service_role, worker_role, sender_role;
grant execute on function public.list_eligible_eval_cases(uuid, uuid, integer)
  to service_role;
grant execute on function public.list_eligible_low_eval_results(uuid, uuid, integer)
  to service_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260916010000', 'eligible_eval_queries', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260916152957_restore_whatsapp_account_diagnostic
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
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260916152957', 'restore_whatsapp_account_diagnostic', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260916170000_isolate_ambiguous_legacy_outbox
begin;
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
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260916170000', 'isolate_ambiguous_legacy_outbox', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260917010000_human_outbound_transcript
begin;
create or replace function internal.record_human_outbound_transcript()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, internal, public
as $$
declare
  v_org uuid;
  v_waba uuid;
  v_wa_id text;
  v_phone text;
  v_contact uuid;
  v_conversation uuid;
  v_seq integer;
begin
  if new.direction <> 'outbound'
     or new.sender is distinct from 'human'
     or coalesce(new.sent_by_bot, false) then
    return new;
  end if;
  select wcc.organization_id, wcc.waba_id, wcc.wa_id, wcc.contact_phone
    into v_org, v_waba, v_wa_id, v_phone
    from public.whatsapp_cloud_conversations wcc
   where wcc.id = new.conversation_id;
  if v_org is null then
    return new;
  end if;
  select ci.contact_id into v_contact
    from public.channel_identities ci
   where ci.organization_id = v_org
     and ci.channel = 'whatsapp'
     and ci.external_id in (v_wa_id, v_phone);
  if v_contact is null then
    select c.id into v_contact
      from public.contacts c
     where c.organization_id = v_org
       and (c.whatsapp in (v_wa_id, v_phone) or c.phone in (v_wa_id, v_phone))
     order by c.created_at
     limit 1;
  end if;
  if v_contact is null then
    return new;
  end if;
  select c.id into v_conversation
    from public.conversations c
   where c.organization_id = v_org and c.contact_id = v_contact;
  if v_conversation is null then
    return new;
  end if;
  v_seq := internal.next_message_seq(v_conversation, 'outbound');
  insert into public.messages
    (organization_id, conversation_id, direction, seq, channel,
     author_type, content, provider_message_id, created_at, channel_account_id)
  values
    (v_org, v_conversation, 'outbound', v_seq, 'whatsapp', 'human',
     case when nullif(new.text_body, '') is not null
          then jsonb_build_object('text', new.text_body)
          else new.content end,
     new.message_id, coalesce(new."timestamp", now()), v_waba)
  on conflict do nothing;
  return new;
end
$$;
drop trigger if exists record_human_outbound_transcript
  on public.whatsapp_cloud_messages;
create trigger record_human_outbound_transcript
after insert on public.whatsapp_cloud_messages
for each row execute function internal.record_human_outbound_transcript();
revoke all on function internal.record_human_outbound_transcript() from public;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260917010000', 'human_outbound_transcript', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260917020000_confirm_sender_delivery
begin;
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
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260917020000', 'confirm_sender_delivery', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260917030000_unique_coupon_codes
begin;
do $$
begin
  if exists (
    select 1 from public.incentive_grants
     where coupon_code is not null and source <> 'popup'
     group by organization_id, upper(coupon_code)
    having count(*) > 1
  ) then
    raise exception 'coupon duplicates require approved ledger reconciliation';
  end if;
end $$;
create unique index if not exists incentive_grants_org_coupon_unique
on public.incentive_grants (organization_id, upper(coupon_code))
where coupon_code is not null and source <> 'popup';
alter table public.alerts drop constraint alerts_type_check;
alter table public.alerts add constraint alerts_type_check check (
    type in ('critical_violation', 'no_active_mission', 'no_org_llm_key',
             'window_closed_no_template', 'moment_template_not_ready',
             'judge_blocked', 'send_failed', 'mission_touch_failed', 'handoff',
             'coupon_code_conflict')
);
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260917030000', 'unique_coupon_codes', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260917040000_guard_state_contract
begin;
drop function internal.legacy_conversation_guard_state(uuid, uuid, uuid);
create function internal.legacy_conversation_guard_state(
    p_organization_id uuid,
    p_conversation_id uuid,
    p_waba_id uuid default null,
    p_count_bot boolean default true,
    p_check_human boolean default true
)
    returns table (
        ai_enabled           boolean,
        ai_agent_id          uuid,
        ai_transferred_at    timestamptz,
        bot_message_count    integer,
        last_bot_message_at  timestamptz,
        has_human_reply      boolean
    )
    language plpgsql
    stable
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_waba_id uuid;
    v_phone text;
    v_cloud uuid;
begin
    if p_waba_id is not null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, p_waba_id);
    end if;
    select ci.external_id into v_phone
      from public.conversations c
      join public.channel_identities ci
        on ci.organization_id = c.organization_id
       and ci.contact_id = c.contact_id
       and ci.channel = 'whatsapp'
     where c.id = p_conversation_id
       and c.organization_id = p_organization_id
     limit 1;
    if v_phone is null then
        return;
    end if;
    if v_waba_id is null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, null);
    end if;
    select wcc.id into v_cloud
      from public.whatsapp_cloud_conversations wcc
     where wcc.organization_id = p_organization_id
       and wcc.waba_id = v_waba_id
       and (wcc.wa_id = v_phone or wcc.wa_id = ltrim(v_phone, '+'))
     limit 1;
    if v_cloud is null then
        return;
    end if;
    return query
    select wcc.ai_enabled is distinct from false,
           wcc.ai_agent_id,
           wcc.ai_transferred_at,
           coalesce(bot.total, 0)::integer,
           last_bot.last_at,
           coalesce(human.exists_, false)
      from public.whatsapp_cloud_conversations wcc
      left join lateral (
          select count(*) as total
            from public.whatsapp_cloud_messages wcm
           where wcm.organization_id = p_organization_id
             and wcm.conversation_id = wcc.id
             and wcm.sent_by_bot
             and p_count_bot
      ) bot on true
      left join lateral (
          select wcm."timestamp" as last_at
            from public.whatsapp_cloud_messages wcm
           where wcm.organization_id = p_organization_id
             and wcm.conversation_id = wcc.id
             and wcm.sent_by_bot
             and wcm."timestamp" is not null
           order by wcm."timestamp" desc
           limit 1
      ) last_bot on true
      left join lateral (
          select true as exists_
            from public.whatsapp_cloud_messages wcm
           where wcm.organization_id = p_organization_id
             and wcm.conversation_id = wcc.id
             and wcm.sender = 'human'
             and p_check_human
           limit 1
      ) human on true
     where wcc.id = v_cloud;
end
$$;
revoke all on function internal.legacy_conversation_guard_state(uuid, uuid, uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function internal.legacy_conversation_guard_state(uuid, uuid, uuid, boolean, boolean) to worker_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260917040000', 'guard_state_contract', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260917050000_single_active_agent
begin;
do $$
begin
  if exists (
    select 1 from public.ai_agents where is_active
     group by organization_id having count(*) > 1
  ) then
    raise exception 'multiple active agents require an explicit owner decision';
  end if;
end $$;
create unique index if not exists ai_agents_single_active_per_org
on public.ai_agents (organization_id) where is_active;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260917050000', 'single_active_agent', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20260918010000_activate_ai_mission_row_order
begin;
create or replace function public.activate_ai_mission(
    p_organization_id uuid,
    p_mission_id      uuid
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_family text;
begin
    select m.event_type into v_family
      from public.ai_missions m
     where m.id = p_mission_id
       and m.organization_id = p_organization_id;
    if v_family is null then
        return false;
    end if;
    update public.ai_missions
       set status = 'archived'
     where organization_id = p_organization_id
       and event_type = v_family
       and status = 'active'
       and id <> p_mission_id;
    update public.ai_missions
       set status = 'active',
           activated_at = now()
     where id = p_mission_id;
    return true;
end
$$;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20260918010000', 'activate_ai_mission_row_order', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20261016000001_ai_budgets
begin;
create table if not exists public.ai_budgets (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  monthly_limit_usd   numeric(10,4) not null default 50,
  alert_threshold_pct int default 80 check (alert_threshold_pct between 0 and 100),
  soft_block          boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint ai_budgets_org_unique unique (organization_id)
);
create index if not exists ai_budgets_org_idx on public.ai_budgets (organization_id);
alter table public.ai_budgets enable row level security;
drop policy if exists "ai_budgets service write" on public.ai_budgets;
drop policy if exists "ai_budgets org read" on public.ai_budgets;
create policy "ai_budgets org read" on public.ai_budgets
  for select using (organization_id = public.get_user_organization_id());
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'worker_role') then
    grant select on public.ai_budgets to worker_role;
  end if;
end $$;
create index if not exists ai_usage_logs_org_created_idx
  on public.ai_usage_logs (organization_id, created_at desc);
create or replace function public.ai_monthly_cost_usd(
  p_organization_id uuid,
  p_month_start     timestamptz
)
returns table (spent_usd numeric, has_unknown_cost boolean)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(cost_usd), 0)                  as spent_usd,
         coalesce(bool_or(cost_usd is null), false) as has_unknown_cost
    from public.ai_usage_logs
   where organization_id = p_organization_id
     and created_at >= p_month_start
     and (metadata ->> 'billable') is distinct from 'false';
$$;
revoke execute on function public.ai_monthly_cost_usd(uuid, timestamptz) from public;
revoke execute on function public.ai_monthly_cost_usd(uuid, timestamptz) from anon;
revoke execute on function public.ai_monthly_cost_usd(uuid, timestamptz) from authenticated;
grant execute on function public.ai_monthly_cost_usd(uuid, timestamptz) to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'worker_role') then
    grant execute on function public.ai_monthly_cost_usd(uuid, timestamptz) to worker_role;
  end if;
end $$;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20261016000001', 'ai_budgets', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20261016000002_ai_eval_tables_in_chain
begin;
create table if not exists public.ai_test_scenarios (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  agent_id          uuid not null references public.ai_agents(id) on delete cascade,
  title             text not null,
  persona           text,
  user_turns        jsonb not null default '[]'::jsonb,
  expected_behavior text,
  tags              text[] not null default '{}'::text[],
  is_active         boolean not null default true,
  created_by        uuid,
  created_at        timestamptz not null default now()
);
create index if not exists idx_test_scenarios_agent on public.ai_test_scenarios (agent_id);
create table if not exists public.ai_scenario_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agent_id        uuid not null references public.ai_agents(id) on delete cascade,
  scenario_id     uuid not null references public.ai_test_scenarios(id) on delete cascade,
  version_id      uuid references public.ai_agent_versions(id) on delete set null,
  transcript      jsonb not null default '[]'::jsonb,
  score           integer,
  status          text,
  note            text,
  judge_model     text,
  tokens          integer,
  created_by      uuid,
  created_at      timestamptz not null default now()
);
create index if not exists idx_scenario_runs_scenario on public.ai_scenario_runs (scenario_id);
create index if not exists idx_scenario_runs_agent on public.ai_scenario_runs (agent_id);
create table if not exists public.ai_eval_criteria (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agent_id        uuid not null references public.ai_agents(id) on delete cascade,
  label           text not null,
  description     text,
  position        integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists idx_eval_criteria_agent on public.ai_eval_criteria (agent_id);
create table if not exists public.ai_eval_cases (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agent_id        uuid not null references public.ai_agents(id) on delete cascade,
  title           text not null,
  input           text,
  expected        text,
  source          text,
  source_id       uuid,
  tags            text[] not null default '{}'::text[],
  created_at      timestamptz not null default now()
);
create index if not exists idx_eval_cases_agent on public.ai_eval_cases (agent_id);
create table if not exists public.ai_eval_results (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  agent_id         uuid not null references public.ai_agents(id) on delete cascade,
  case_id          uuid references public.ai_eval_cases(id) on delete cascade,
  version_id       uuid references public.ai_agent_versions(id) on delete set null,
  verdict          text,
  score            integer,
  criteria_results jsonb,
  judge_model      text,
  judged_output    text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_eval_results_agent on public.ai_eval_results (agent_id);
create table if not exists public.ai_prompt_proposals (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null,
  agent_id           uuid not null references public.ai_agents(id) on delete cascade,
  title              text not null,
  reason             text,
  impact             text,
  proposed_prompt    text not null,
  status             text not null default 'pending',
  source_trace_ids   uuid[] not null default '{}'::uuid[],
  applied_version_id uuid,
  created_at         timestamptz not null default now()
);
create index if not exists idx_prompt_proposals_agent on public.ai_prompt_proposals (agent_id);
create table if not exists public.ai_agent_integrations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  agent_id         uuid not null references public.ai_agents(id) on delete cascade,
  integration_id   uuid,
  integration_type text not null,
  sync_products    boolean default true,
  sync_orders      boolean default true,
  allow_price_info boolean default true,
  allow_stock_info boolean default true,
  source_id        uuid,
  last_sync_at     timestamptz,
  products_synced  integer default 0,
  sync_status      text default 'pending',
  sync_error       text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
create index if not exists idx_agent_integrations_agent on public.ai_agent_integrations (agent_id);
do $$
declare t text;
begin
  foreach t in array array[
    'ai_test_scenarios','ai_scenario_runs','ai_eval_criteria','ai_eval_cases',
    'ai_eval_results','ai_prompt_proposals','ai_agent_integrations'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_org_isolation', t);
    execute format(
      'create policy %I on public.%I for all using (organization_id = public.get_user_organization_id()) with check (organization_id = public.get_user_organization_id())',
      t || '_org_isolation', t
    );
  end loop;
end $$;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20261016000002', 'ai_eval_tables_in_chain', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20261016000003_llm_calls_purpose_stt
begin;
alter table internal.llm_calls drop constraint if exists llm_calls_purpose_check;
alter table internal.llm_calls add constraint llm_calls_purpose_check
  check (purpose in (
    'agent_reply', 'judge_pre', 'judge_async', 'prompt_generator',
    'copy_variation', 'embedding',
    'stt', 'copilot', 'playground', 'topic', 'gap_suggestion', 'eval'
  ));
create or replace function internal.mirror_llm_call_to_usage_logs()
    returns trigger
    language plpgsql
as $body$
declare
    v_feature text;
begin
    if new.organization_id is null then
        return new;
    end if;
    case new.purpose
        when 'agent_reply'      then v_feature := 'runtime_agent_reply';
        when 'judge_pre'        then v_feature := 'runtime_judge_pre';
        when 'judge_async'      then v_feature := 'runtime_judge_async';
        when 'prompt_generator' then v_feature := 'runtime_prompt_generator';
        when 'copy_variation'   then v_feature := 'runtime_copy_variation';
        when 'embedding'        then v_feature := 'runtime_embedding';
        when 'stt'              then v_feature := 'transcription';
        when 'copilot'          then v_feature := 'copilot';
        when 'playground'       then v_feature := 'runtime_playground';
        when 'topic'            then v_feature := 'runtime_topic';
        when 'gap_suggestion'   then v_feature := 'gap_suggestion';
        when 'eval'             then v_feature := 'runtime_eval';
        else
            raise exception
                'internal.llm_calls.purpose sem mapa para ai_usage_logs.feature: %', new.purpose;
    end case;
    insert into public.ai_usage_logs
        (organization_id, provider, model, feature, agent_id, conversation_id,
         prompt_tokens, completion_tokens, cost_usd, duration_ms, success)
    values
        (new.organization_id, new.provider, new.model, v_feature, new.agent_id,
         new.conversation_id, coalesce(new.input_tokens, 0), coalesce(new.output_tokens, 0),
         new.cost_usd, new.latency_ms, true);
    return new;
end;
$body$;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20261016000003', 'llm_calls_purpose_stt', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20261016000004_monthly_budget_gate
begin;
alter table public.ai_agents add column if not exists monthly_cap_usd numeric(10,4);
create or replace function internal.monthly_ai_spend(
  p_organization_id uuid,
  p_agent_id        uuid
)
returns table (
  org_spent_usd    numeric,
  org_limit_usd    numeric,
  agent_spent_usd  numeric,
  agent_cap_usd    numeric,
  has_unknown_cost boolean
)
language sql
stable
security definer
set search_path = public, internal
as $$
  with month as (
    select date_trunc('month', now() at time zone 'utc') at time zone 'utc' as start_at
  ),
  org as (
    select coalesce(sum(u.cost_usd), 0)                 as spent,
           coalesce(bool_or(u.cost_usd is null), false) as unknown
      from public.ai_usage_logs u, month m
     where u.organization_id = p_organization_id
       and u.created_at >= m.start_at
       and coalesce((u.metadata ->> 'billable')::boolean, true)
  ),
  agent as (
    select coalesce(sum(l.cost_usd), 0) as spent
      from internal.llm_calls l, month m
     where l.organization_id = p_organization_id
       and p_agent_id is not null
       and l.agent_id = p_agent_id
       and l.created_at >= m.start_at
  )
  select org.spent,
         coalesce((select b.monthly_limit_usd from public.ai_budgets b
                    where b.organization_id = p_organization_id), 50),
         agent.spent,
         (select a.monthly_cap_usd from public.ai_agents a where a.id = p_agent_id),
         org.unknown
    from org, agent;
$$;
revoke execute on function internal.monthly_ai_spend(uuid, uuid) from public;
grant execute on function internal.monthly_ai_spend(uuid, uuid) to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'worker_role') then
    grant execute on function internal.monthly_ai_spend(uuid, uuid) to worker_role;
  end if;
end $$;
alter table public.alerts drop constraint if exists alerts_type_check;
alter table public.alerts add constraint alerts_type_check check (
    type in ('critical_violation', 'no_active_mission', 'no_org_llm_key',
             'window_closed_no_template', 'moment_template_not_ready',
             'judge_blocked', 'send_failed', 'mission_touch_failed', 'handoff',
             'coupon_code_conflict', 'budget_exceeded')
);
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20261016000004', 'monthly_budget_gate', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20261016000005_runtime_tool_grants
begin;
create or replace function pg_temp.ensure_policy(
  p_name text, p_table text, p_cmd text, p_using text, p_check text
) returns void language plpgsql as $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = p_table and policyname = p_name
  ) then
    execute format(
      'create policy %I on public.%I for %s to worker_role%s%s',
      p_name, p_table, p_cmd,
      case when p_using is null or lower(p_cmd) = 'insert' then '' else ' using (' || p_using || ')' end,
      case when p_check is null then '' else ' with check (' || p_check || ')' end
    );
  end if;
end $$;
grant select (id, store_id, organization_id, title, handle, status, price, compare_at_price,
              sku, inventory_quantity, variants, image_url, available)
  on public.shopify_products to worker_role;
alter table public.shopify_products enable row level security;
select pg_temp.ensure_policy('shopify_products_worker_read', 'shopify_products', 'select',
  'organization_id = public.current_app_organization_id()', null);
grant select (phone) on public.shopify_orders to worker_role;
grant insert (organization_id, phone, first_name, email, tags, custom_fields, source, created_at, updated_at)
  on public.contacts to worker_role;
grant update (first_name, email, tags, custom_fields, updated_at)
  on public.contacts to worker_role;
select pg_temp.ensure_policy('contacts_worker_insert', 'contacts', 'insert',
  'true', 'organization_id = public.current_app_organization_id()');
select pg_temp.ensure_policy('contacts_worker_update', 'contacts', 'update',
  'organization_id = public.current_app_organization_id()',
  'organization_id = public.current_app_organization_id()');
grant select (id, organization_id, contact_id, type, title, description, metadata, created_at)
  on public.contact_activities to worker_role;
grant insert (organization_id, contact_id, type, title, description, metadata, conversation_id,
              created_by_name, created_by_type, source)
  on public.contact_activities to worker_role;
alter table public.contact_activities enable row level security;
select pg_temp.ensure_policy('contact_activities_worker_read', 'contact_activities', 'select',
  'organization_id = public.current_app_organization_id()', null);
select pg_temp.ensure_policy('contact_activities_worker_insert', 'contact_activities', 'insert',
  'true', 'organization_id = public.current_app_organization_id()');
grant select (id, organization_id, contact_id, product_id, variant_id)
  on public.whatsapp_product_interests to worker_role;
grant insert (organization_id, contact_id, phone, product_id, product_title, store_id)
  on public.whatsapp_product_interests to worker_role;
alter table public.whatsapp_product_interests enable row level security;
select pg_temp.ensure_policy('wpi_worker_read', 'whatsapp_product_interests', 'select',
  'organization_id = public.current_app_organization_id()', null);
select pg_temp.ensure_policy('wpi_worker_insert', 'whatsapp_product_interests', 'insert',
  'true', 'organization_id = public.current_app_organization_id()');
drop function pg_temp.ensure_policy(text, text, text, text, text);
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20261016000005', 'runtime_tool_grants', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20261016000006_canonical_conversation_for_mirror
begin;
create or replace function internal.canonical_conversation_for_mirror(
  p_organization_id uuid,
  p_mirror_conversation_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public, internal
as $$
  select c.id
    from public.whatsapp_cloud_conversations wcc
    join public.channel_identities ci
      on ci.organization_id = wcc.organization_id
     and ci.channel = 'whatsapp'
     and (ci.external_id = wcc.wa_id
          or ltrim(ci.external_id, '+') = ltrim(coalesce(wcc.wa_id, wcc.contact_phone), '+'))
    join public.conversations c
      on c.organization_id = wcc.organization_id
     and c.contact_id = ci.contact_id
   where wcc.id = p_mirror_conversation_id
     and wcc.organization_id = p_organization_id
   order by c.last_inbound_at desc nulls last, c.created_at desc
   limit 1;
$$;
revoke execute on function internal.canonical_conversation_for_mirror(uuid, uuid) from public;
grant execute on function internal.canonical_conversation_for_mirror(uuid, uuid) to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'worker_role') then
    grant execute on function internal.canonical_conversation_for_mirror(uuid, uuid) to worker_role;
  end if;
end $$;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20261016000006', 'canonical_conversation_for_mirror', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20261016000007_runtime_cutover
begin;
insert into public.ai_runtime_rollout (organization_id, mode, migrated_at, notes)
select distinct a.organization_id, 'runtime', now(), 'cutover 2026-10-16'
  from public.ai_agents a
 where not exists (
        select 1 from public.ai_runtime_rollout r
         where r.organization_id = a.organization_id
       );
create or replace function public.ai_agents_default_runtime_rollout()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
as $$
begin
    insert into public.ai_runtime_rollout (organization_id, mode, migrated_at, notes)
    values (new.organization_id, 'runtime', now(), 'primeiro agente da org')
    on conflict (organization_id) do nothing;
    return new;
end;
$$;
revoke execute on function public.ai_agents_default_runtime_rollout() from public;
drop trigger if exists ai_agents_default_runtime_rollout on public.ai_agents;
create trigger ai_agents_default_runtime_rollout
    after insert on public.ai_agents
    for each row execute function public.ai_agents_default_runtime_rollout();
comment on table public.ai_runtime_rollout is
    'Mecanismo de resposta por org: runtime (Python) ou legacy (QStash + cloud-runner). '
    'Desde 2026-10-16 toda org com agente nasce em runtime (trigger em ai_agents); '
    'legacy e opt-out explicito por org, congelado, remocao no M7.';
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20261016000007', 'runtime_cutover', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20261016000008_multi_agent_model
begin;
alter table public.ai_agents
    add column if not exists role   text,
    add column if not exists status text
        check (status in ('draft', 'active', 'paused'));
update public.ai_agents
   set status = case when coalesce(is_active, false) then 'active' else 'paused' end
 where status is null;
alter table public.ai_agents alter column status set not null;
alter table public.ai_agents alter column status set default 'draft';
alter table public.ai_agents alter column is_active set default false;
create or replace function public.ai_agents_sync_status_is_active()
    returns trigger
    language plpgsql
as $$
begin
    if tg_op = 'INSERT' then
        if new.status is null or new.status = 'draft' then
            new.status := case when coalesce(new.is_active, false) then 'active' else 'draft' end;
        end if;
        new.is_active := (new.status = 'active');
        return new;
    end if;
    if new.status is distinct from old.status then
        new.is_active := (new.status = 'active');
    elsif new.is_active is distinct from old.is_active then
        new.status := case when coalesce(new.is_active, false) then 'active' else 'paused' end;
    end if;
    return new;
end;
$$;
drop trigger if exists ai_agents_sync_status_is_active on public.ai_agents;
create trigger ai_agents_sync_status_is_active
    before insert or update of status, is_active on public.ai_agents
    for each row execute function public.ai_agents_sync_status_is_active();
comment on column public.ai_agents.status is
    'draft | active | paused. Fonte da verdade desde 2026-10-16; is_active e espelho por trigger ate o M7.';
comment on column public.ai_agents.role is
    'Funcao do agente como o lojista a descreve (ex.: "Vendas no WhatsApp", "Pos-compra").';
drop index if exists public.ai_agents_single_active_per_org;
create table if not exists public.ai_agent_entries (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete cascade,
    agent_id        uuid not null references public.ai_agents (id) on delete cascade,
    kind            text not null check (kind in ('whatsapp_account', 'flow_touch')),
    ref_id          uuid not null,
    active          boolean not null default true,
    created_at      timestamptz not null default now()
);
create unique index if not exists ai_agent_entries_one_active_per_ref
    on public.ai_agent_entries (organization_id, kind, ref_id) where active;
create index if not exists ai_agent_entries_agent
    on public.ai_agent_entries (agent_id);
comment on table public.ai_agent_entries is
    'Onde um agente atua: whatsapp_account (ref_id = whatsapp_business_accounts.id) ou flow_touch (ref_id = no de fluxo). Uma entrada ativa por (org, kind, ref).';
alter table public.ai_agent_entries enable row level security;
create policy ai_agent_entries_member_all on public.ai_agent_entries
    for all to authenticated
    using (public.user_belongs_to_org(organization_id))
    with check (public.user_belongs_to_org(organization_id));
create policy ai_agent_entries_worker_read on public.ai_agent_entries
    for select to worker_role
    using (organization_id = public.current_app_organization_id());
grant select, insert, update, delete on public.ai_agent_entries to authenticated;
grant select                         on public.ai_agent_entries to worker_role;
grant select, insert, update, delete on public.ai_agent_entries to service_role;
insert into public.ai_agent_entries (organization_id, agent_id, kind, ref_id)
select w.organization_id, a.id, 'whatsapp_account', w.id
  from public.whatsapp_business_accounts w
  join public.ai_agents a
    on a.organization_id = w.organization_id and a.status = 'active'
 where not exists (
        select 1 from public.ai_agent_entries e
         where e.organization_id = w.organization_id
           and e.kind = 'whatsapp_account' and e.ref_id = w.id and e.active
       )
   and (select count(*) from public.ai_agents x
         where x.organization_id = w.organization_id and x.status = 'active') = 1;
alter table public.ai_missions
    add column if not exists agent_id uuid references public.ai_agents (id) on delete set null;
create index if not exists ai_missions_agent
    on public.ai_missions (agent_id) where agent_id is not null;
update public.ai_missions m
   set agent_id = pick.id
  from (
        select distinct on (organization_id) organization_id, id
          from public.ai_agents
         order by organization_id, (status = 'active') desc, created_at
       ) pick
 where m.agent_id is null
   and pick.organization_id = m.organization_id;
comment on column public.ai_missions.agent_id is
    'Agente dono da missao. NULL so em org sem agente; o resolver passa a filtrar por agente no passo 14.';
alter table public.conversations
    add column if not exists agent_id uuid references public.ai_agents (id) on delete set null;
create index if not exists conversations_agent
    on public.conversations (organization_id, agent_id, created_at desc)
    where agent_id is not null;
comment on column public.conversations.agent_id is
    'Agente que atende a conversa; gravado pelo runtime em conclude_turn (passo 14). Transferir para outro agente = trocar esta coluna.';
drop view if exists public.ai_runtime_activity;
create view public.ai_runtime_activity as
select c.id                       as conversation_id,
       c.organization_id,
       c.contact_id,
       c.last_channel,
       c.last_inbound_at,
       c.created_at,
       c.agent_id,
       ag.name                    as agent_name,
       c.owner_mission_version_id as mission_version_id,
       m.event_type               as mission_event_type,
       m.objective                as mission_objective,
       calls.llm_calls,
       calls.cost_usd,
       tools.tool_calls,
       judge.verdict              as last_judge_verdict,
       judge.score                as last_judge_score
  from public.conversations c
  left join public.ai_agents ag on ag.id = c.agent_id
  left join public.ai_missions m on m.id = c.owner_mission_version_id
  left join lateral (
      select count(*)::integer as llm_calls, sum(l.cost_usd) as cost_usd
        from internal.llm_calls l
       where l.conversation_id = c.id
  ) calls on true
  left join lateral (
      select count(*)::integer as tool_calls
        from internal.tool_calls t
       where t.conversation_id = c.id
  ) tools on true
  left join lateral (
      select j.verdict, j.score
        from internal.judge_scores j
       where j.conversation_id = c.id
       order by j.created_at desc
       limit 1
  ) judge on true;
alter view public.ai_runtime_activity set (security_invoker = off);
comment on view public.ai_runtime_activity is
    'Trilha unica (9.4): uma linha por conversa do runtime com agente, missao dona, custo somado e o ultimo veredito do Judge. Leitura so via service_role.';
revoke all on public.ai_runtime_activity from public, anon, authenticated;
grant select on public.ai_runtime_activity to service_role;
create or replace function public.seed_default_missions(p_organization_id uuid, p_agent_id uuid)
    returns integer
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_inserted integer := 0;
    v_row record;
begin
    if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
        raise exception 'org % não existe', p_organization_id;
    end if;
    if p_agent_id is not null and not exists (
        select 1 from public.ai_agents a
         where a.id = p_agent_id and a.organization_id = p_organization_id
    ) then
        raise exception 'agente % não pertence à org %', p_agent_id, p_organization_id;
    end if;
    for v_row in
        select * from (values
            ('whatsapp.received',
             'Um contato mandou mensagem espontânea no WhatsApp da loja.',
             'classificar a intenção e ajudar — vender, suportar ou encaminhar, no viés da loja',
             'a pessoa teve a dúvida resolvida ou avançou para compra',
             'a pessoa desistiu sem resposta ou pediu humano e não foi transferida',
             '{"kind": "none"}'::jsonb, false, 5),
            ('cart.abandoned',
             'O contato deixou itens no carrinho e saiu sem finalizar.',
             'recuperar a compra sem parecer cobrança',
             'checkout finalizado a partir do link do carrinho',
             'pediu para não receber mais este tipo de mensagem',
             '{"kind": "none"}'::jsonb, true, 3),
            ('checkout.abandoned',
             'O contato chegou ao checkout e não concluiu o pagamento.',
             'recuperar a compra sem parecer cobrança',
             'pagamento concluído',
             'pediu para não receber mais este tipo de mensagem',
             '{"kind": "none"}'::jsonb, true, 3),
            ('order.fulfilled',
             'O pedido do contato foi enviado.',
             'responder status com dado real; resolver sem vender',
             'a pessoa ficou tranquila quanto à entrega',
             'a conversa virou reclamação sem resposta',
             '{"kind": "none"}'::jsonb, false, 2),
            ('payment.pix.abandoned',
             'O contato gerou um Pix e não pagou.',
             'reenviar o código e destravar o pagamento',
             'pagamento confirmado',
             'a pessoa pediu cancelamento',
             '{"kind": "none"}'::jsonb, false, 2),
            ('payment.boleto.abandoned',
             'O contato gerou um boleto e não pagou.',
             'reenviar o código e destravar o pagamento',
             'pagamento confirmado',
             'a pessoa pediu cancelamento',
             '{"kind": "none"}'::jsonb, false, 2)
        ) as seeds(event_type, situation, objective, success_criteria,
                   failure_criteria, concession, promote_moment, max_turns)
    loop
        if not exists (
            select 1 from public.ai_missions m
             where m.organization_id = p_organization_id
               and m.event_type = v_row.event_type
               and m.agent_id is not distinct from p_agent_id
        ) then
            insert into public.ai_missions
                (organization_id, agent_id, event_type, status, origin, situation, objective,
                 success_criteria, failure_criteria, concession, promote_moment,
                 max_turns, change_summary)
            values
                (p_organization_id, p_agent_id, v_row.event_type, 'draft', 'worder_default',
                 v_row.situation, v_row.objective, v_row.success_criteria,
                 v_row.failure_criteria, v_row.concession, v_row.promote_moment,
                 v_row.max_turns,
                 'seed v0 (PENDENTE-2: copy de dev, revisar antes de ativar)');
            v_inserted := v_inserted + 1;
        end if;
    end loop;
    return v_inserted;
end
$$;
create or replace function public.seed_default_missions(p_organization_id uuid)
    returns integer
    language sql
    security definer
    set search_path = pg_catalog, public
as $$
    select public.seed_default_missions(
        p_organization_id,
        (select id from public.ai_agents a
          where a.organization_id = p_organization_id
          order by (a.status = 'active') desc, a.created_at
          limit 1)
    );
$$;
revoke execute on function public.seed_default_missions(uuid, uuid) from public;
grant  execute on function public.seed_default_missions(uuid, uuid) to service_role;
revoke execute on function public.seed_default_missions(uuid) from public;
grant  execute on function public.seed_default_missions(uuid) to service_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20261016000008', 'multi_agent_model', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20261016000009_alert_no_agent_for_entry
begin;
alter table public.alerts drop constraint if exists alerts_type_check;
alter table public.alerts add constraint alerts_type_check check (
    type in ('critical_violation', 'no_active_mission', 'no_org_llm_key',
             'window_closed_no_template', 'moment_template_not_ready',
             'judge_blocked', 'send_failed', 'mission_touch_failed', 'handoff',
             'coupon_code_conflict', 'budget_exceeded', 'no_agent_for_entry')
);
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20261016000009', 'alert_no_agent_for_entry', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20261016000010_knowledge_model
begin;
do $$
begin
    if to_regclass('public.ai_sources') is null
       and to_regclass('public.ai_agent_sources') is not null
       and (select relkind from pg_class where oid = 'public.ai_agent_sources'::regclass) = 'r'
    then
        alter table public.ai_agent_sources rename to ai_sources;
    end if;
end $$;
alter table public.ai_sources alter column agent_id drop not null;
alter table public.ai_sources
    add column if not exists folder        text    not null default 'geral',
    add column if not exists tags          text[]  not null default '{}'::text[],
    add column if not exists body_markdown text,
    add column if not exists kind          text,
    add column if not exists read_only     boolean not null default false,
    add column if not exists updated_by    uuid,
    add column if not exists links         text[]  not null default '{}'::text[];
update public.ai_sources
   set kind = case
                when source_type in ('text', 'note') then 'note'
                when source_type in ('faq') then 'faq'
                when source_type in ('url', 'website', 'site_page') then 'url'
                when source_type in ('shopify', 'products', 'integration', 'catalog') then 'catalog'
                else 'document'
              end,
       read_only = (source_type in ('shopify', 'products', 'integration', 'catalog')),
       body_markdown = coalesce(body_markdown, case when source_type in ('text', 'note', 'faq') then text_content end)
 where kind is null;
alter table public.ai_sources alter column kind set default 'note';
alter table public.ai_sources alter column kind set not null;
alter table public.ai_sources drop constraint if exists ai_sources_kind_check;
alter table public.ai_sources add constraint ai_sources_kind_check
    check (kind in ('note', 'document', 'url', 'faq', 'catalog', 'site_page'));
create index if not exists ai_sources_org_folder on public.ai_sources (organization_id, folder);
comment on table public.ai_sources is
    'Conhecimento da loja (era ai_agent_sources). Uma fonte e lida por N agentes via ai_source_agents; agent_id fica por um release como atalho das rotas antigas.';
create or replace view public.ai_agent_sources
    with (security_invoker = on)
    as select * from public.ai_sources;
grant select, insert, update, delete on public.ai_agent_sources to service_role;
grant select, insert, update, delete on public.ai_agent_sources to authenticated;
grant select                         on public.ai_agent_sources to worker_role;
create table if not exists public.ai_source_agents (
    source_id       uuid not null references public.ai_sources (id) on delete cascade,
    agent_id        uuid not null references public.ai_agents (id) on delete cascade,
    organization_id uuid not null references public.organizations (id) on delete cascade,
    created_at      timestamptz not null default now(),
    primary key (source_id, agent_id)
);
create index if not exists ai_source_agents_agent on public.ai_source_agents (agent_id);
alter table public.ai_source_agents enable row level security;
create policy ai_source_agents_member_all on public.ai_source_agents
    for all to authenticated
    using (public.user_belongs_to_org(organization_id))
    with check (public.user_belongs_to_org(organization_id));
create policy ai_source_agents_worker_read on public.ai_source_agents
    for select to worker_role
    using (organization_id = public.current_app_organization_id());
grant select, insert, update, delete on public.ai_source_agents to authenticated;
grant select, insert, update, delete on public.ai_source_agents to service_role;
grant select                         on public.ai_source_agents to worker_role;
insert into public.ai_source_agents (source_id, agent_id, organization_id)
select s.id, s.agent_id, s.organization_id
  from public.ai_sources s
 where s.agent_id is not null
on conflict do nothing;
create or replace function public.ai_sources_link_agent()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
as $$
begin
    if new.agent_id is not null then
        insert into public.ai_source_agents (source_id, agent_id, organization_id)
        values (new.id, new.agent_id, new.organization_id)
        on conflict do nothing;
    end if;
    return new;
end;
$$;
revoke execute on function public.ai_sources_link_agent() from public;
drop trigger if exists ai_sources_link_agent on public.ai_sources;
create trigger ai_sources_link_agent
    after insert or update of agent_id on public.ai_sources
    for each row execute function public.ai_sources_link_agent();
alter table public.ai_agent_chunks alter column agent_id drop not null;
alter table public.ai_agent_chunks
    add column if not exists chunk_kind text not null default 'text',
    add column if not exists position   integer;
alter table public.ai_agent_chunks drop constraint if exists ai_agent_chunks_chunk_kind_check;
alter table public.ai_agent_chunks add constraint ai_agent_chunks_chunk_kind_check
    check (chunk_kind in ('text', 'regra', 'resposta', 'atencao'));
create index if not exists ai_agent_chunks_source_kind
    on public.ai_agent_chunks (source_id, chunk_kind);
create or replace function public.search_agent_knowledge(
    p_agent_id        uuid,
    p_organization_id uuid,
    p_query_embedding vector(1536),
    p_match_threshold float default 0.7,
    p_match_count     int   default 5
)
returns table (
    chunk_id   uuid,
    source_id  uuid,
    content    text,
    metadata   jsonb,
    similarity float
)
language plpgsql
security definer
set search_path = public
as $body$
begin
    return query
    select c.id as chunk_id,
           c.source_id,
           c.content,
           c.metadata || jsonb_build_object('chunk_kind', c.chunk_kind) as metadata,
           (1 - (c.embedding <=> p_query_embedding))::float as similarity
      from public.ai_agent_chunks c
     where c.organization_id = p_organization_id
       and c.embedding is not null
       and c.embedding_model = 'openai:text-embedding-3-small'
       and (1 - (c.embedding <=> p_query_embedding)) >= p_match_threshold
       and (
            c.agent_id = p_agent_id
            or exists (
                select 1 from public.ai_source_agents sa
                 where sa.source_id = c.source_id and sa.agent_id = p_agent_id
            )
       )
     order by (1 - (c.embedding <=> p_query_embedding))
              * (case when c.chunk_kind = 'resposta' then 1.3 else 1.0 end) desc
     limit p_match_count;
end;
$body$;
revoke execute on function public.search_agent_knowledge(uuid, uuid, vector, float, int) from public;
revoke execute on function public.search_agent_knowledge(uuid, uuid, vector, float, int) from anon;
revoke execute on function public.search_agent_knowledge(uuid, uuid, vector, float, int) from authenticated;
grant  execute on function public.search_agent_knowledge(uuid, uuid, vector, float, int) to service_role;
create table if not exists public.ai_knowledge_gaps (
    id                uuid primary key default gen_random_uuid(),
    organization_id   uuid not null references public.organizations (id) on delete cascade,
    cluster_key       text,
    question          text not null,
    examples          jsonb not null default '[]'::jsonb,
    count             integer not null default 1,
    agent_ids         uuid[] not null default '{}'::uuid[],
    outcome           text not null default 'no_source'
                        check (outcome in ('transferred', 'answered_without_source', 'blocked', 'no_source')),
    conversation_id   uuid,
    suggested_answer  text,
    suggested_kind    text check (suggested_kind in ('note', 'faq', 'limit')),
    linked_source_id  uuid references public.ai_sources (id) on delete set null,
    status            text not null default 'open'
                        check (status in ('open', 'ignored_until', 'resolved')),
    ignored_until     timestamptz,
    safe              boolean not null default true,
    first_seen        timestamptz not null default now(),
    last_seen         timestamptz not null default now(),
    resolved_at       timestamptz
);
create index if not exists ai_knowledge_gaps_org_status
    on public.ai_knowledge_gaps (organization_id, status, last_seen desc);
create index if not exists ai_knowledge_gaps_cluster
    on public.ai_knowledge_gaps (organization_id, cluster_key) where cluster_key is not null;
alter table public.ai_knowledge_gaps enable row level security;
create policy ai_knowledge_gaps_member_all on public.ai_knowledge_gaps
    for all to authenticated
    using (public.user_belongs_to_org(organization_id))
    with check (public.user_belongs_to_org(organization_id));
create policy ai_knowledge_gaps_worker_scoped on public.ai_knowledge_gaps
    for all to worker_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());
grant select, insert, update, delete on public.ai_knowledge_gaps to authenticated;
grant select, insert, update, delete on public.ai_knowledge_gaps to service_role;
grant select, insert, update         on public.ai_knowledge_gaps to worker_role;
comment on table public.ai_knowledge_gaps is
    'Perguntas que o agente nao conseguiu responder com as fontes (emitidas pelo runtime, passo 20); agrupadas e sugeridas pela rotina diaria (passo 23).';
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20261016000010', 'knowledge_model', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20261016000011_agent_versions_summary
begin;
alter table public.ai_agent_versions
    add column if not exists change_summary jsonb,
    add column if not exists restored_from  uuid references public.ai_agent_versions (id) on delete set null,
    add column if not exists eval_score     numeric(5,2),
    add column if not exists eval_grave     integer;
comment on column public.ai_agent_versions.change_summary is
    'Resumo por area do que mudou em relacao a versao anterior: {"lines": ["Ferramentas: ligou X", ...]}.';
comment on column public.ai_agent_versions.restored_from is
    'Versao de origem quando esta foi criada por "restaurar".';
comment on column public.ai_agent_versions.eval_score is
    'Nota (0-100) da avaliacao automatica desta versao (passo 26).';
comment on column public.ai_agent_versions.eval_grave is
    'Quantos casos graves a avaliacao automatica encontrou.';
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20261016000011', 'agent_versions_summary', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20261016000012_eval_writes_by_worker
begin;
grant update (eval_score, eval_grave) on public.ai_agent_versions to worker_role;
drop policy if exists ai_agent_versions_worker_eval_update on public.ai_agent_versions;
create policy ai_agent_versions_worker_eval_update on public.ai_agent_versions
    as permissive for update to worker_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20261016000012', 'eval_writes_by_worker', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20261016000013_ai_outcomes_and_events
begin;
create table if not exists public.ai_conversation_outcomes (
    conversation_id        uuid primary key references public.conversations (id) on delete cascade,
    organization_id        uuid not null references public.organizations (id) on delete cascade,
    agent_id               uuid references public.ai_agents (id) on delete set null,
    entry_id               uuid,
    contact_id             uuid,
    started_at             timestamptz not null default now(),
    first_inbound_at       timestamptz,
    first_response_ms      integer,
    messages_sent          integer not null default 0,
    resolved_without_human boolean,
    transferred            boolean not null default false,
    handoff_reason         text,
    order_id               text,
    revenue                numeric(12, 2),
    topic                  text,
    incentives_offered     integer not null default 0,
    incentives_used        integer not null default 0,
    discount_total         numeric(12, 2) not null default 0,
    blocked_count          integer not null default 0,
    gap                    boolean not null default false,
    cost_usd               numeric(12, 6) not null default 0,
    cost_unknown           boolean not null default false,
    tokens                 integer not null default 0,
    closed_at              timestamptz,
    updated_at             timestamptz not null default now()
);
create index if not exists ai_conversation_outcomes_org_started
    on public.ai_conversation_outcomes (organization_id, started_at desc);
create index if not exists ai_conversation_outcomes_agent
    on public.ai_conversation_outcomes (organization_id, agent_id, started_at desc);
create table if not exists public.ai_activity_events (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete cascade,
    agent_id        uuid references public.ai_agents (id) on delete set null,
    conversation_id uuid references public.conversations (id) on delete set null,
    contact_id      uuid,
    kind            text not null check (kind in ('sale', 'solved', 'handoff', 'incentive', 'blocked', 'gap')),
    text            text,
    amount          numeric(12, 2),
    metadata        jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now()
);
create index if not exists ai_activity_events_org_created
    on public.ai_activity_events (organization_id, created_at desc);
create index if not exists ai_activity_events_org_kind
    on public.ai_activity_events (organization_id, kind, created_at desc);
create unique index if not exists ai_activity_events_sale_once
    on public.ai_activity_events (organization_id, (metadata->>'order_id'))
    where kind = 'sale';
alter table public.ai_conversation_outcomes enable row level security;
alter table public.ai_activity_events enable row level security;
create policy ai_conversation_outcomes_member_read on public.ai_conversation_outcomes
    for select to authenticated using (public.user_belongs_to_org(organization_id));
create policy ai_conversation_outcomes_worker_scoped on public.ai_conversation_outcomes
    for all to worker_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());
create policy ai_activity_events_member_read on public.ai_activity_events
    for select to authenticated using (public.user_belongs_to_org(organization_id));
create policy ai_activity_events_worker_insert on public.ai_activity_events
    for insert to worker_role
    with check (organization_id = public.current_app_organization_id());
create policy ai_activity_events_worker_read on public.ai_activity_events
    for select to worker_role
    using (organization_id = public.current_app_organization_id());
grant select                 on public.ai_conversation_outcomes to authenticated;
grant select, insert, update on public.ai_conversation_outcomes to worker_role;
grant all                    on public.ai_conversation_outcomes to service_role;
grant select                 on public.ai_activity_events to authenticated;
grant select, insert         on public.ai_activity_events to worker_role;
grant all                    on public.ai_activity_events to service_role;
create or replace function public.attribute_ai_conversation(
    p_organization_id uuid,
    p_contact_id      uuid,
    p_order_id        text,
    p_value           numeric,
    p_window_days     integer default 7
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_conversation uuid;
    v_agent        uuid;
begin
    if p_order_id is null or p_contact_id is null then
        return null;
    end if;
    select conversation_id into v_conversation
      from public.ai_conversation_outcomes
     where organization_id = p_organization_id and order_id = p_order_id
     limit 1;
    if found then
        return v_conversation;
    end if;
    select c.id, c.agent_id into v_conversation, v_agent
      from public.conversations c
     where c.organization_id = p_organization_id
       and c.contact_id = p_contact_id
       and c.agent_id is not null
       and coalesce(c.last_inbound_at, c.created_at) >= now() - make_interval(days => greatest(p_window_days, 1))
     order by coalesce(c.last_inbound_at, c.created_at) desc
     limit 1;
    if v_conversation is null then
        return null;
    end if;
    insert into public.ai_conversation_outcomes
        (conversation_id, organization_id, agent_id, contact_id, order_id, revenue)
    values (v_conversation, p_organization_id, v_agent, p_contact_id, p_order_id, p_value)
    on conflict (conversation_id) do update
       set order_id = excluded.order_id,
           revenue = excluded.revenue,
           updated_at = now()
     where public.ai_conversation_outcomes.order_id is null;
    insert into public.ai_activity_events
        (organization_id, agent_id, conversation_id, contact_id, kind, text, amount, metadata)
    values (p_organization_id, v_agent, v_conversation, p_contact_id, 'sale',
            'Pedido pago após conversa com o agente', p_value,
            jsonb_build_object('order_id', p_order_id))
    on conflict do nothing;
    return v_conversation;
end;
$$;
revoke execute on function public.attribute_ai_conversation(uuid, uuid, text, numeric, integer) from public, anon, authenticated;
grant execute on function public.attribute_ai_conversation(uuid, uuid, text, numeric, integer) to service_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20261016000013', 'ai_outcomes_and_events', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20261016000014_close_idle_ai_conversations
begin;
create or replace function public.close_idle_ai_conversations(
    p_idle_hours integer default 24,
    p_limit      integer default 500
)
returns table (
    conversation_id uuid,
    organization_id uuid,
    agent_id        uuid,
    transferred     boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    with due as (
        select o.conversation_id
          from public.ai_conversation_outcomes o
          join public.conversations c on c.id = o.conversation_id
         where o.closed_at is null
           and greatest(coalesce(c.last_inbound_at, o.started_at), o.updated_at)
               < now() - make_interval(hours => greatest(p_idle_hours, 1))
         order by o.updated_at
         limit p_limit
         for update of o skip locked
    ),
    closed as (
        update public.ai_conversation_outcomes o
           set closed_at = now(),
               resolved_without_human = coalesce(o.resolved_without_human, not o.transferred),
               updated_at = now()
          from due
         where o.conversation_id = due.conversation_id
        returning o.conversation_id, o.organization_id, o.agent_id, o.transferred, o.contact_id
    ),
    solved as (
        insert into public.ai_activity_events
            (organization_id, agent_id, conversation_id, contact_id, kind, text)
        select closed.organization_id, closed.agent_id, closed.conversation_id, closed.contact_id,
               'solved', 'Conversa resolvida pelo agente, sem a equipe'
          from closed
         where not closed.transferred
        returning 1
    )
    select closed.conversation_id, closed.organization_id, closed.agent_id, closed.transferred
      from closed;
end;
$$;
revoke execute on function public.close_idle_ai_conversations(integer, integer) from public, anon, authenticated;
grant execute on function public.close_idle_ai_conversations(integer, integer) to service_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20261016000014', 'close_idle_ai_conversations', 'manual-plano-ia-2026-10-15');
commit;
-- ===== 20261016000015_ai_queue_health
begin;
create or replace function public.ai_queue_health()
returns table (queue_name text, queue_length bigint, oldest_msg_age_sec integer)
language sql
security definer
set search_path = public, pgmq
as $$
    select m.queue_name::text, m.queue_length, m.oldest_msg_age_sec
      from pgmq.metrics_all() m
     where m.queue_name like 'q\_%'
     order by m.queue_name;
$$;
revoke execute on function public.ai_queue_health() from public, anon, authenticated;
grant execute on function public.ai_queue_health() to service_role;
insert into supabase_migrations.schema_migrations (version, name, created_by) values ('20261016000015', 'ai_queue_health', 'manual-plano-ia-2026-10-15');
commit;
select 'APLICADO: 54 migrations' as resultado;
