-- W3-GD-07: ativação manual precisa de identidade única. Duas linhas ativas
-- na mesma organização fazem o guard (`internal.legacy_conversation_guard_state`
-- via `load_active_version`, produção ligada a `ai_agents.is_active`) escolher
-- arbitrariamente qual agente vale. Se o banco de destino já tiver duplicatas,
-- a migration PARA: escolher o sobrevivente é decisão humana, não efeito
-- colateral de deploy — a mesma regra do cupom em 20260917030000.
do $$
begin
  if exists (
    select 1 from public.ai_agents where is_active
     group by organization_id having count(*) > 1
  ) then
    raise exception 'multiple active agents require an explicit owner decision';
  end if;
end $$;

-- Ausência de agente ativo continua permitida (`where is_active` é parcial):
-- só a SEGUNDA ativação na mesma organização é recusada.
create unique index if not exists ai_agents_single_active_per_org
on public.ai_agents (organization_id) where is_active;
