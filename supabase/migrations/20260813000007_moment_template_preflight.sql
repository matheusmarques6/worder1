-- ============================================================================
-- 20260813000007_moment_template_preflight.sql
-- O preflight de MOMENTO (§3.3.4): template_readiness é "verificado na
-- ativação E no preflight de cada envio; falha → alerta + supressão do
-- outbound do momento naquele canal". A outbox já carregava moment_ids —
-- agora o claim os entrega e o preflight os julga:
--
--   * QUALQUER momento do toque fora do ar (janela venceu, kill switch,
--     despublicado) → 'moment_gone': um toque vendendo promo morta não sai
--     nem com janela aberta;
--   * janela fechada: o template vem da readiness DO MOMENTO líder (primeiro
--     do array — quem emitiu escreve o líder primeiro), nunca do default da
--     org; sem readiness aprovada para o canal → 'moment_not_ready';
--   * janela aberta com momentos vivos → 'ok' (texto livre é permitido pela
--     plataforma dentro da janela; readiness só é exigida quando o envio
--     PRECISA de template).
--
-- Assinatura nova (parâmetro a mais) = overload no Postgres: a antiga cai.
-- ============================================================================

alter type internal.claimed_send add attribute moment_ids uuid[];

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
           m.moment_ids
      from marked m
      join public.contacts ct on ct.id = m.contact_id
$$;

drop function internal.sender_preflight(uuid, text, text, text);

create function internal.sender_preflight(
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
    -- 1. Opt-out (whatsapp_opt_status; telefone com e sem '+').
    select exists (
        select 1 from public.whatsapp_opt_status o
         where o.organization_id = p_organization_id
           and o.status = 'opted_out'
           and (o.phone = p_to_phone
                or o.phone = ltrim(p_to_phone, '+')
                or ltrim(o.phone, '+') = ltrim(p_to_phone, '+'))
    ) into v_opted_out;
    if v_opted_out then
        return query select 'opt_out'::text, null::text, null::text;
        return;
    end if;

    -- 2. Toque de momento: TODOS os momentos do toque precisam estar vivos
    -- AGORA (ativo é computado — §3.3.4); um só morto suprime o envio.
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

    -- 3. Janela de 24h, pela conversa canônica do contato. Contato que nunca
    -- mandou inbound (toque de funil frio) = janela fechada.
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

    -- 5. Toque de momento fora da janela: o template é DO MOMENTO líder
    -- (readiness por canal), nunca o default da org.
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

    -- 6. Toque de funil comum: template default aprovado da org no canal.
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

revoke execute on function internal.sender_preflight(uuid, text, text, text, uuid[]) from public;
grant execute on function internal.sender_preflight(uuid, text, text, text, uuid[]) to sender_role;
