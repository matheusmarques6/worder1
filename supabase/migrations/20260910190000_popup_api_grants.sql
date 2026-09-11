-- ============================================================================
-- 20260910190000_popup_api_grants.sql
-- Higiene de grants: as tabelas do sistema de popups só são lidas pelo
-- painel (authenticated, sob RLS por organização) e escritas pelas rotas
-- do servidor (service_role). O papel anon não tem nada a fazer nelas —
-- o RLS já negava, mas o grant de tabela não precisa existir.
-- ============================================================================
do $$
declare
    t text;
begin
    foreach t in array array[
        'consent_records', 'coupon_pools', 'coupon_codes', 'popup_experiments', 'popup_driven_orders',
        'incentive_grants', 'incentive_ledger', 'visitor_identities', 'form_events'
    ] loop
        if to_regclass('public.' || t) is not null then
            execute format('revoke all on table public.%I from anon', t);
        end if;
    end loop;
end $$;
