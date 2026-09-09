-- ============================================================================
-- 20260910220000_popup_index_hygiene.sql
-- Higiene de índices do sistema de popups, do advisor de performance.
--
--   * Dois pares de índices idênticos (mesma tabela, mesmas colunas, mesmo
--     filtro) criados por migrations diferentes: um de cada par sai.
--   * Chaves estrangeiras sem índice de cobertura. Importa de verdade na
--     exclusão de um contato (LGPD): sem elas o Postgres varre
--     consent_records, coupon_codes, incentive_grants e incentive_ledger
--     inteiras para checar as referências.
-- ============================================================================

-- Duplicados: mantém o nome mais recente e descritivo.
drop index if exists public.crm_form_submissions_contact_time_idx;
drop index if exists public.form_events_event_type_idx;

do $$
declare
    r record;
begin
    for r in
        select * from (values
            ('consent_records',     'consent_records_contact_idx',      'contact_id'),
            ('coupon_codes',        'coupon_codes_contact_idx',         'contact_id'),
            ('coupon_pools',        'coupon_pools_store_idx',           'store_id'),
            ('incentive_grants',    'incentive_grants_contact_idx',     'contact_id'),
            ('incentive_grants',    'incentive_grants_pool_idx',        'pool_id'),
            ('incentive_grants',    'incentive_grants_coupon_code_idx', 'coupon_code_id'),
            ('incentive_ledger',    'incentive_ledger_contact_idx',     'contact_id'),
            ('popup_driven_orders', 'popup_driven_orders_grant_idx',    'grant_id'),
            ('visitor_identities',  'visitor_identities_store_idx',     'store_id')
        ) as t(tbl, idx, col)
    loop
        if to_regclass('public.' || r.tbl) is null then
            continue;
        end if;
        if not exists (
            select 1 from information_schema.columns
             where table_schema = 'public' and table_name = r.tbl and column_name = r.col
        ) then
            continue;
        end if;
        execute format(
            'create index if not exists %I on public.%I (%I) where %I is not null',
            r.idx, r.tbl, r.col, r.col
        );
    end loop;
end $$;
