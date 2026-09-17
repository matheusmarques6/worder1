-- The opt-out comparison is algebraically the same with or without a leading
-- plus. Keeping one expression lets Postgres use the measured functional
-- index instead of scanning every opt-out in a large organization.
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
    -- 1. Opt-out: the stored phone and input may independently carry '+'.
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

    -- 2. Toque de momento: TODOS os momentos do toque precisam estar vivos.
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

    -- 3. Janela de 24h, pela conversa canônica do contato.
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

    -- 4. Janela fechada: resposta livre não sai.
    if p_kind = 'reply' then
        return query select 'window_closed'::text, null::text, null::text;
        return;
    end if;

    -- 5. Toque de momento fora da janela: template do momento líder.
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

    -- 6. Toque de funil comum: template default aprovado da organização.
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
