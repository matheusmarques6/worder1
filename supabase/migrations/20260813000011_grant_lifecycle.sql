-- ============================================================================
-- 20260813000011_grant_lifecycle.sql
-- Etapa 9.2 (Adendo §B): o grant ganha fim de vida — consumo e expiração.
--
--   * CONSUMO: o webhook de pedido pago ecoa o cupom; a RPC pública correlaciona
--     coupon_code → uses++ → 'consumed' quando esgota, com entrada no ledger.
--     Webhook reentregue é o caso NORMAL: o dedup é um UNIQUE parcial
--     (grant_id, order_ref) — a segunda chamada do mesmo pedido recebe
--     'already', nunca consome duas vezes (o padrão da casa: corrida morre
--     no banco).
--   * EXPIRAÇÃO: sweep no padrão do outbox — roda no housekeeping do sender,
--     marca 'expired' e deixa a entrada no ledger. Validade vencida nunca
--     depende de intervenção humana.
--
-- O ledger ganha `order_ref` (de qual pedido veio o consumo) — coluna nova,
-- história continua append-only (o trigger de UPDATE segue valendo).
-- ============================================================================

alter table public.incentive_ledger add column order_ref text;

create unique index incentive_ledger_consumed_once_per_order
    on public.incentive_ledger (grant_id, order_ref)
    where entry_kind = 'consumed';

-- ----------------------------------------------------------------------------
-- Consumo — a porta do webhook de pedido (app server)
-- ----------------------------------------------------------------------------
create function public.consume_incentive_grant(
    p_organization_id uuid,
    p_coupon_code     text,
    p_order_ref       text
)
    returns table (status text, grant_id uuid)
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_grant record;
begin
    if coalesce(trim(p_coupon_code), '') = '' or coalesce(trim(p_order_ref), '') = '' then
        return query select 'not_found'::text, null::uuid;
        return;
    end if;

    select g.id, g.contact_id, g.uses, g.max_uses, g.status
      into v_grant
      from public.incentive_grants g
     where g.organization_id = p_organization_id
       and upper(g.coupon_code) = upper(trim(p_coupon_code))
     order by g.created_at
     limit 1;

    if v_grant.id is null then
        -- Cupom que não nasceu de grant (criado à mão na loja): não é nosso.
        return query select 'not_found'::text, null::uuid;
        return;
    end if;

    -- O dedup ANTES de qualquer mutação: reentrega do mesmo pedido é no-op.
    begin
        insert into public.incentive_ledger
            (organization_id, contact_id, entry_kind, grant_id, order_ref, reason)
        values
            (p_organization_id, v_grant.contact_id, 'consumed', v_grant.id,
             trim(p_order_ref),
             format('cupom %s usado no pedido %s', upper(trim(p_coupon_code)), trim(p_order_ref)));
    exception when unique_violation then
        return query select 'already'::text, v_grant.id;
        return;
    end;

    update public.incentive_grants g
       set uses = g.uses + 1,
           status = case when g.uses + 1 >= g.max_uses then 'consumed' else g.status end
     where g.id = v_grant.id;

    return query select 'consumed'::text, v_grant.id;
end
$$;

revoke execute on function public.consume_incentive_grant(uuid, text, text) from public;
grant execute on function public.consume_incentive_grant(uuid, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- Expiração — o sweep (housekeeping do sender, como o de outbox)
-- ----------------------------------------------------------------------------
create function internal.expire_incentive_grants()
    returns integer
    language sql
    security definer
    set search_path = pg_catalog, public
as $$
    with dead as (
        update public.incentive_grants g
           set status = 'expired'
         where g.status = 'issued'
           and g.validity_until <= now()
        returning g.id, g.organization_id, g.contact_id
    ),
    trail as (
        insert into public.incentive_ledger
            (organization_id, contact_id, entry_kind, grant_id, reason)
        select d.organization_id, d.contact_id, 'expired', d.id,
               'validade venceu sem uso'
          from dead d
        returning 1
    )
    select count(*)::integer from trail
$$;

revoke execute on function internal.expire_incentive_grants() from public;
grant execute on function internal.expire_incentive_grants() to sender_role;
