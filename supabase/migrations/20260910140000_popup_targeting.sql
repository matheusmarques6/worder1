-- ============================================================================
-- 20260910140000_popup_targeting.sql
-- Popups, Fase 2: targeting por origem do tráfego e contexto de página.
--
--   * crm_form_submissions.traffic_type — como o runtime classificou a sessão
--     (direct, organic, paid, social, email, messaging, referral).
--   * crm_form_submissions.page_kind — o tipo de página da Shopify onde a
--     inscrição aconteceu (index, product, collection, cart, ...).
--
-- Os dois são vocabulário fechado, validado no servidor antes de gravar.
-- Impressões e fechamentos carregam o mesmo par em form_events.properties
-- (traffic, page), sem coluna nova. Segmentos e listas não precisam de
-- schema: o gate consulta as tabelas de membros que já existem.
--
-- Guarda por to_regclass: crm_form_submissions só existe via
-- migrations-archive; no Postgres limpo do CI esta migration é no-op.
-- ============================================================================

do $$
begin
    if to_regclass('public.crm_form_submissions') is null then
        raise notice 'crm_form_submissions ausente — pulando traffic_type/page_kind';
        return;
    end if;
    alter table public.crm_form_submissions add column if not exists traffic_type text;
    alter table public.crm_form_submissions add column if not exists page_kind    text;
    alter table public.crm_form_submissions drop constraint if exists crm_form_submissions_traffic_type_check;
    alter table public.crm_form_submissions add constraint crm_form_submissions_traffic_type_check
        check (traffic_type is null or traffic_type in ('direct','organic','paid','social','email','messaging','referral'));
end $$;
