-- W2-T4: dois grants não podem compartilhar código na mesma organização.
-- Se o banco de destino já tiver duplicatas, a migration PARA: reconciliar
-- linha financeira é decisão humana, não efeito colateral de deploy.
do $$
begin
  if exists (
    select 1 from public.incentive_grants
     where coupon_code is not null
     group by organization_id, upper(coupon_code)
    having count(*) > 1
  ) then
    raise exception 'coupon duplicates require approved ledger reconciliation';
  end if;
end $$;

create unique index if not exists incentive_grants_org_coupon_unique
on public.incentive_grants (organization_id, upper(coupon_code))
where coupon_code is not null;

-- O conflito de cupom (repository/incentives.py::record_coupon_code) abre um
-- alerta para o humano reconciliar — o tipo precisa existir na CHECK antes
-- que esse alerta possa nascer.
alter table public.alerts drop constraint alerts_type_check;
alter table public.alerts add constraint alerts_type_check check (
    type in ('critical_violation', 'no_active_mission', 'no_org_llm_key',
             'window_closed_no_template', 'moment_template_not_ready',
             'judge_blocked', 'send_failed', 'mission_touch_failed', 'handoff',
             'coupon_code_conflict')
);
