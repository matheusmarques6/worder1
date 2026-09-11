-- =============================================
-- Políticas de RLS que anulavam o isolamento por organização
--
-- Políticas de RLS se somam (OR). Cada uma das tabelas abaixo já tinha a
-- política certa (org_via_pai / org_isolation_rls) e, ao lado dela, uma
-- política com `using true` e `with check true` para PUBLIC — ou seja,
-- para anon e authenticated. Enquanto essa política existisse, a política
-- certa não valia nada: qualquer usuário logado lia e escrevia linha de
-- qualquer organização.
--
-- As políticas de service_role com `true` (a maioria das encontradas na
-- varredura) NÃO entram aqui: service_role já ignora RLS, e elas só
-- documentam a intenção. As de catálogo (`catalogo_leitura`, leitura de
-- ai_models, integrations, exchange_rates…) também ficam: são tabelas
-- globais, sem dono.
-- =============================================

do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('automation_executions', 'Allow all'),
      ('automation_pending_steps', 'dash'),
      ('email_clicks', 'email_clicks org access'),
      ('organizations', 'Service role can insert organizations'),
      ('segment_members', 'segment_members_select'),
      ('segment_members', 'segment_members_insert'),
      ('segment_members', 'segment_members_delete'),
      ('tracking_lookups', 'public_lookups')
    ) as policies(table_name, policy_name)
  loop
    if to_regclass(format('public.%I', p.table_name)) is not null then
      execute format('drop policy if exists %I on public.%I', p.policy_name, p.table_name);
    end if;
  end loop;
end $$;
