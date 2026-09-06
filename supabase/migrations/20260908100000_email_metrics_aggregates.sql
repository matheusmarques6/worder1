-- Métricas somadas no banco, não no servidor.
--
-- A lista de fluxos puxava CADA envio e contava em JavaScript. O
-- PostgREST devolve no máximo mil linhas: com 1488 envios, a soma parava
-- em mil e o corte caía no maior fluxo. A tela mostrava 803 para uma
-- série de boas-vindas que tinha 1103, e os oito fluxos somavam exatos
-- 1000 — a assinatura do teto. Nada avisava; o número só estava errado.
--
-- Agregado aqui, volta uma linha por fluxo e não há teto que alcance.

create or replace function public.automation_email_stats(
  org uuid,
  p_store_id uuid default null,
  p_since timestamptz default null
)
returns table (
  automation_id uuid,
  sent integer,
  opened integer,
  clicked integer,
  revenue numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    count(e.id) filter (where e.sent_at is not null)::int,
    count(e.id) filter (where e.opened_at is not null)::int,
    count(e.id) filter (where e.clicked_at is not null)::int,
    coalesce(sum(e.conversion_value) filter (where e.conversion_value > 0), 0)
  from public.automations a
  left join public.email_sends e
    on (e.automation_id = a.id or e.flow_id = a.id)
   and e.organization_id = a.organization_id
   and (p_since is null or e.created_at >= p_since)
  where a.organization_id = org
    -- A loja do FLUXO é o recorte. Um envio herda a loja do fluxo que o
    -- produziu; filtrar pela loja do envio deixaria de fora as linhas
    -- antigas que ficaram sem store_id.
    and (p_store_id is null or a.store_id = p_store_id)
  group by a.id
$$;

comment on function public.automation_email_stats(uuid, uuid, timestamptz) is
  'Enviados/abertos/clicados/receita por fluxo, somados no banco para não esbarrar no teto de linhas do PostgREST.';

create or replace function public.campaign_email_stats(
  org uuid,
  p_store_id uuid default null
)
returns table (
  campaign_id uuid,
  sent integer,
  opened integer,
  clicked integer,
  revenue numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    count(e.id) filter (where e.sent_at is not null)::int,
    count(e.id) filter (where e.opened_at is not null)::int,
    count(e.id) filter (where e.clicked_at is not null)::int,
    coalesce(sum(e.conversion_value) filter (where e.conversion_value > 0), 0)
  from public.email_campaigns c
  left join public.email_sends e
    on e.campaign_id = c.id
   and e.organization_id = c.organization_id
  where c.organization_id = org
    and (p_store_id is null or c.store_id = p_store_id)
  group by c.id
$$;

comment on function public.campaign_email_stats(uuid, uuid) is
  'Enviados/abertos/clicados/receita por campanha, somados no banco.';

revoke all on function public.automation_email_stats(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.campaign_email_stats(uuid, uuid) from public, anon, authenticated;
grant execute on function public.automation_email_stats(uuid, uuid, timestamptz) to service_role;
grant execute on function public.campaign_email_stats(uuid, uuid) to service_role;
