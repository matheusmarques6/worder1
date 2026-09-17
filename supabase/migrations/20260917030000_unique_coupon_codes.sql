-- W2-T4: dois grants RUNTIME-issued (source in mission/moment) não podem
-- compartilhar código na mesma organização. Grants de popup ficam de fora
-- de propósito: issue_popup_incentive entrega o MESMO coupon_code estático
-- a todo visitante de um bloco (source='popup', ver
-- 20260910130000_popup_steps_v2.sql:122-130) — isso não é uma colisão, é o
-- desenho do produto. Sem o `source <> 'popup'` aqui, qualquer org que já
-- tenha um código estático de popup faz este preflight explodir, e o
-- índice abaixo derruba a segunda submissão do mesmo popup com 23505.
-- Se o banco de destino já tiver duplicatas fora do popup, a migration
-- PARA: reconciliar linha financeira é decisão humana, não efeito
-- colateral de deploy.
do $$
begin
  if exists (
    select 1 from public.incentive_grants
     where coupon_code is not null and source <> 'popup'
     group by organization_id, upper(coupon_code)
    having count(*) > 1
  ) then
    raise exception 'coupon duplicates require approved ledger reconciliation';
  end if;
end $$;

create unique index if not exists incentive_grants_org_coupon_unique
on public.incentive_grants (organization_id, upper(coupon_code))
where coupon_code is not null and source <> 'popup';

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
