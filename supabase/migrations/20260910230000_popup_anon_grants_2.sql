-- ============================================================================
-- 20260910230000_popup_anon_grants_2.sql
-- Fecha o que sobrou da higiene anterior: crm_forms, crm_form_submissions,
-- order_attribution e whatsapp_opt_status ainda tinham grant para o papel
-- anon. Na prática o RLS já devolvia zero linhas (as políticas dependem de
-- auth.uid()), e nenhum código do navegador consulta essas tabelas — tudo
-- passa pelas rotas do servidor. Tirar o grant remove a chance de uma
-- política permissiva futura abrir a porta sem querer.
-- ============================================================================
do $$
declare
    t text;
begin
    foreach t in array array[
        'crm_forms', 'crm_form_submissions', 'order_attribution', 'whatsapp_opt_status'
    ] loop
        if to_regclass('public.' || t) is not null then
            execute format('revoke all on table public.%I from anon', t);
        end if;
    end loop;
end $$;
