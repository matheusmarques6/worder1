-- ============================================================================
-- 20260910130000_popup_steps_v2.sql
-- Popups, Fase 2: etapas com ramificação e recompensa progressiva.
--
--   * crm_form_submissions.step_path — as etapas que a pessoa percorreu, na
--     ordem. É o que permite saber onde o quiz perde gente e qual caminho
--     converte; e é o que define o tier da recompensa.
--   * crm_form_submissions.reward_tier — o tier que valeu na emissão.
--   * coupon_pools.tier_key — um pool por tier ('base' e um por tier
--     progressivo). Cada tier é um desconto diferente na Shopify, então são
--     estoques diferentes.
--   * incentive_grants.tier_key — o tier registrado no grant.
--   * issue_popup_incentive ganha p_tier_key. A idempotência continua por
--     pessoa por popup: quem já levou o tier de 10% não leva o de 15%
--     voltando ao popup — um benefício por pessoa, como antes.
-- ============================================================================

do $$
begin
    if to_regclass('public.crm_form_submissions') is null then
        raise notice 'crm_form_submissions ausente — pulando step_path';
        return;
    end if;
    alter table public.crm_form_submissions add column if not exists step_path   jsonb;
    alter table public.crm_form_submissions add column if not exists reward_tier text;
end $$;

alter table public.coupon_pools add column if not exists tier_key text not null default 'base';
drop index if exists public.coupon_pools_form_idx;
create unique index if not exists coupon_pools_form_tier_idx
    on public.coupon_pools (organization_id, form_id, tier_key)
    where form_id is not null;

alter table public.incentive_grants add column if not exists tier_key text;

drop function if exists public.issue_popup_incentive(uuid, uuid, uuid, uuid, uuid, text, numeric, integer, uuid, text);

create function public.issue_popup_incentive(
    p_organization_id uuid,
    p_store_id        uuid,
    p_contact_id      uuid,
    p_form_id         uuid,
    p_submission_id   uuid,
    p_kind            text,
    p_value           numeric,
    p_validity_days   integer,
    p_pool_id         uuid,
    p_static_code     text,
    p_tier_key        text default 'base'
)
    returns table (grant_id uuid, coupon_code text, validity_until timestamptz, outcome text)
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_key       text;
    v_grant     public.incentive_grants%rowtype;
    v_code      record;
    v_valid     timestamptz;
    v_days      integer := greatest(1, least(coalesce(p_validity_days, 7), 365));
    v_kind      text := case when p_kind in ('percent', 'fixed', 'free_shipping') then p_kind else 'percent' end;
    v_tier      text := coalesce(nullif(trim(p_tier_key), ''), 'base');
begin
    if p_organization_id is null or p_contact_id is null or p_form_id is null then
        return;
    end if;

    v_key := format('popup:%s:%s:%s', p_organization_id, p_contact_id, p_form_id);
    v_valid := now() + make_interval(days => v_days);

    insert into public.incentive_grants
        (organization_id, store_id, contact_id, object_kind, object_ref, source,
         form_id, submission_id, kind, value, validity_until, max_uses, status, idempotency_key, pool_id, tier_key)
    values
        (p_organization_id, p_store_id, p_contact_id, 'form', p_form_id::text, 'popup',
         p_form_id, p_submission_id, v_kind, coalesce(p_value, 0), v_valid, 1, 'issued', v_key, p_pool_id, v_tier)
    on conflict (idempotency_key) do nothing
    returning * into v_grant;

    if v_grant.id is null then
        select * into v_grant from public.incentive_grants where idempotency_key = v_key;
        if v_grant.coupon_code is not null and v_grant.status = 'issued' and v_grant.validity_until > now() then
            insert into public.incentive_ledger (organization_id, contact_id, entry_kind, grant_id, reason)
            values (p_organization_id, p_contact_id, 'reused', v_grant.id, 'reenvio do popup: mesmo cupom');
            return query select v_grant.id, v_grant.coupon_code, v_grant.validity_until, 'reused'::text;
            return;
        end if;
        if v_grant.coupon_code is not null then
            insert into public.incentive_ledger (organization_id, contact_id, entry_kind, grant_id, reason)
            values (p_organization_id, p_contact_id, 'denied', v_grant.id,
                    format('cupom deste popup já %s', case when v_grant.status = 'consumed' then 'usado' else 'vencido' end));
            return query select v_grant.id, null::text, v_grant.validity_until, 'already_used'::text;
            return;
        end if;
        -- Sem código da última vez: o tier pode ter mudado no caminho novo.
        update public.incentive_grants
           set kind = v_kind, value = coalesce(p_value, 0), tier_key = v_tier, pool_id = p_pool_id
         where id = v_grant.id;
    end if;

    if p_pool_id is not null then
        select * into v_code
          from public.reserve_coupon_code(p_organization_id, p_pool_id, v_days, p_contact_id, v_grant.id, p_submission_id);
        if v_code.code is not null then
            update public.incentive_grants
               set coupon_code = v_code.code,
                   coupon_code_id = v_code.code_id,
                   pool_id = p_pool_id,
                   submission_id = coalesce(submission_id, p_submission_id),
                   status = 'issued',
                   validity_until = least(v_valid, v_code.expires_at)
             where id = v_grant.id
            returning * into v_grant;
            insert into public.incentive_ledger (organization_id, contact_id, entry_kind, grant_id, reason)
            values (p_organization_id, p_contact_id, 'issued', v_grant.id, format('cupom único do pool do popup (tier %s)', v_tier));
            return query select v_grant.id, v_grant.coupon_code, v_grant.validity_until, 'issued_pool'::text;
            return;
        end if;
    end if;

    if coalesce(trim(p_static_code), '') <> '' then
        update public.incentive_grants
           set coupon_code = upper(trim(p_static_code)),
               submission_id = coalesce(submission_id, p_submission_id),
               status = 'issued',
               validity_until = v_valid
         where id = v_grant.id
        returning * into v_grant;
        insert into public.incentive_ledger (organization_id, contact_id, entry_kind, grant_id, reason)
        values (p_organization_id, p_contact_id, 'issued', v_grant.id,
                case when p_pool_id is not null then format('pool vazio: código estático do bloco (tier %s)', v_tier)
                     else format('código estático do bloco (tier %s)', v_tier) end);
        return query select v_grant.id, v_grant.coupon_code, v_grant.validity_until, 'issued_static'::text;
        return;
    end if;

    insert into public.incentive_ledger (organization_id, contact_id, entry_kind, grant_id, reason)
    values (p_organization_id, p_contact_id, 'denied', v_grant.id, 'pool vazio e sem código estático');
    return query select v_grant.id, null::text, v_grant.validity_until, 'pool_empty'::text;
end
$$;

revoke execute on function public.issue_popup_incentive(uuid, uuid, uuid, uuid, uuid, text, numeric, integer, uuid, text, text) from public, anon, authenticated;
grant execute on function public.issue_popup_incentive(uuid, uuid, uuid, uuid, uuid, text, numeric, integer, uuid, text, text) to service_role;
