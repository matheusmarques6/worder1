-- ============================================================================
-- 20260910240000_popup_lgpd_retention.sql
-- LGPD para os dados de popup.
--
--   * lgpd_retention_policies aceita dois recursos novos:
--       popup_events      → form_events (impressões, fechamentos, hold-out).
--                            É a tabela que mais cresce: uma linha por
--                            exibição, em toda página da loja.
--       popup_submissions → crm_form_submissions. Aqui a retenção
--                            ANONIMIZA por padrão em vez de apagar: o
--                            número de inscrições e a receita atribuída
--                            continuam de pé, só o conteúdo pessoal sai.
--   * Índices para o cron de retenção varrer por org + data sem sequential
--     scan quando as tabelas crescerem.
-- ============================================================================

do $$
begin
    if to_regclass('public.lgpd_retention_policies') is null then
        raise notice 'lgpd_retention_policies ausente — pulando';
        return;
    end if;
    alter table public.lgpd_retention_policies
        drop constraint if exists lgpd_retention_policies_resource_check;
    alter table public.lgpd_retention_policies
        add constraint lgpd_retention_policies_resource_check
        check (resource in ('contact_events', 'email_sends', 'contacts_inactive', 'popup_events', 'popup_submissions'));
end $$;

do $$
begin
    if to_regclass('public.form_events') is not null then
        create index if not exists form_events_org_time_idx
            on public.form_events (organization_id, occurred_at);
    end if;
    if to_regclass('public.crm_form_submissions') is not null then
        create index if not exists crm_form_submissions_org_created_idx
            on public.crm_form_submissions (organization_id, created_at);
    end if;
end $$;
