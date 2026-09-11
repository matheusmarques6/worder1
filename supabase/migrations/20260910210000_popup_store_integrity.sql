-- ============================================================================
-- 20260910210000_popup_store_integrity.sql
-- Duas amarrações de loja que faltavam depois da revisão final:
--
--   * consume_incentive_grant: no desempate por loja, um grant sem loja
--     (store_id null) vinha ANTES do grant da própria loja, porque a
--     comparação dá NULL e NULL ordena primeiro em DESC. O código estático
--     usado na loja A podia consumir o grant global em vez do da loja.
--   * crm_forms.store_id e coupon_pools.store_id passam a exigir loja da
--     mesma organização, por gatilho. As rotas já validavam; o banco
--     passa a garantir mesmo para escritas diretas (PostgREST/scripts).
-- ============================================================================

create or replace function public.consume_incentive_grant(
    p_organization_id uuid,
    p_coupon_code     text,
    p_order_ref       text,
    p_contact_id      uuid default null,
    p_store_id        uuid default null
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

    -- Código único: um grant só casa. Código estático: vários casam, e o
    -- da pessoa que comprou vem primeiro; depois o da loja do pedido;
    -- depois o mais antigo. O grant de outra loja nunca casa.
    select g.id, g.contact_id, g.uses, g.max_uses, g.status, g.coupon_code_id
      into v_grant
      from public.incentive_grants g
     where g.organization_id = p_organization_id
       and upper(g.coupon_code) = upper(trim(p_coupon_code))
       and g.status in ('issued', 'consumed')
       and (g.store_id is null or p_store_id is null or g.store_id = p_store_id)
     order by (p_contact_id is not null and g.contact_id = p_contact_id) desc,
              coalesce(g.store_id = p_store_id, false) desc,
              g.created_at
     limit 1;

    if v_grant.id is null then
        return query select 'not_found'::text, null::uuid;
        return;
    end if;

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

    if v_grant.coupon_code_id is not null then
        update public.coupon_codes
           set status = 'consumed', consumed_at = now()
         where id = v_grant.coupon_code_id and status <> 'consumed';
    end if;

    return query select 'consumed'::text, v_grant.id;
end
$$;

revoke execute on function public.consume_incentive_grant(uuid, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_incentive_grant(uuid, text, text, uuid, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- Loja e organização precisam combinar
-- ----------------------------------------------------------------------------
create schema if not exists internal;

create or replace function internal.popup_store_same_org()
    returns trigger
    language plpgsql
    set search_path = pg_catalog, public
as $$
declare
    v_store_org uuid;
begin
    if new.store_id is null then
        return new;
    end if;
    select organization_id into v_store_org from public.shopify_stores where id = new.store_id;
    if v_store_org is null or v_store_org <> new.organization_id then
        raise exception 'a loja precisa ser da mesma organização';
    end if;
    return new;
end
$$;

do $$
begin
    if to_regclass('public.shopify_stores') is null then
        raise notice 'shopify_stores ausente — pulando gatilhos de loja';
        return;
    end if;

    if to_regclass('public.crm_forms') is not null then
        -- Popup apontando para loja de outra org volta a ser global em vez
        -- de sumir: o histórico de inscrições dele continua valendo.
        update public.crm_forms f set store_id = null
         where f.store_id is not null
           and not exists (
             select 1 from public.shopify_stores s
              where s.id = f.store_id and s.organization_id = f.organization_id
           );
        drop trigger if exists crm_forms_store_same_org on public.crm_forms;
        create trigger crm_forms_store_same_org
            before insert or update of store_id, organization_id on public.crm_forms
            for each row execute function internal.popup_store_same_org();
    end if;

    if to_regclass('public.coupon_pools') is not null then
        update public.coupon_pools p set status = 'error', last_error = 'loja de outra organização'
         where p.store_id is not null
           and not exists (
             select 1 from public.shopify_stores s
              where s.id = p.store_id and s.organization_id = p.organization_id
           );
        drop trigger if exists coupon_pools_store_same_org on public.coupon_pools;
        create trigger coupon_pools_store_same_org
            before insert or update of store_id, organization_id on public.coupon_pools
            for each row execute function internal.popup_store_same_org();
    end if;
end $$;
