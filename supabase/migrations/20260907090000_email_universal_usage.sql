-- ═══════════════════════════════════════════════════════════════════
-- Onde cada conteúdo universal (saved_blocks) está sendo usado.
--
-- Um e-mail guarda o vínculo em dois lugares do design_json:
--   sections[]._savedSectionId                     → seção universal
--   sections[].columns[].blocks[]._savedBlockId    → bloco universal
--
-- Sem esta visão, "quantos e-mails usam este rodapé?" só dava para
-- responder varrendo o JSON inteiro de cada template no servidor. A
-- pergunta aparece em toda tela da biblioteca e antes de cada edição
-- ou exclusão, então tem de ser barata.
--
-- jsonb_path_query em modo lax não reclama de template sem sections
-- nem de design_json nulo — simplesmente não devolve linha.
-- ═══════════════════════════════════════════════════════════════════

create or replace view public.email_universal_usage as
select
  t.organization_id,
  t.id                       as template_id,
  t.name                     as template_name,
  t.updated_at               as template_updated_at,
  (ids.saved_id)::uuid       as saved_block_id,
  ids.kind
from public.email_templates t
cross join lateral (
  -- `coalesce` com a coluna antiga `design`: alguns e-mails só têm ela,
  -- e sem isto um rodapé compartilhado ali ficaria fora da contagem e,
  -- pior, fora da propagação — mudaria em todo lugar menos naquele.
  select (x #>> '{}') as saved_id, 'section'::text as kind
    from jsonb_path_query(coalesce(t.design_json, t.design), '$.sections[*]._savedSectionId') x
  union all
  select (x #>> '{}'), 'block'::text
    from jsonb_path_query(coalesce(t.design_json, t.design), '$.sections[*].columns[*].blocks[*]._savedBlockId') x
) ids
where ids.saved_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

comment on view public.email_universal_usage is
  'Um par (universal, e-mail) por vínculo. Alimenta a contagem "usado em N e-mails" e a lista de onde a alteração vai chegar.';

-- A visão nasce com SELECT para anon e authenticated, como toda tabela
-- nova do schema public. Quem a lê é só o servidor, com a chave de
-- serviço e filtrando por organização — o acesso direto do navegador
-- não tem uso e só amplia a superfície.
revoke all on public.email_universal_usage from anon, authenticated;

-- security_invoker: se um dia alguém conceder acesso de novo, a visão
-- passa a valer as regras de quem consulta, e não as do dono.
alter view public.email_universal_usage set (security_invoker = on);

-- Contagem de e-mails por universal, agregada no banco.
--
-- Lendo a visão linha a linha, a contagem passa pelo teto de mil linhas
-- do PostgREST e passa a mentir em silêncio conforme a biblioteca cresce
-- — ninguém percebe o dia em que virar 1001.
create or replace function public.saved_block_usage_counts(org uuid)
returns table (saved_block_id uuid, email_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select u.saved_block_id, count(distinct u.template_id)::int
  from public.email_universal_usage u
  where u.organization_id = org
  group by u.saved_block_id
$$;

comment on function public.saved_block_usage_counts(uuid) is
  'Quantos e-mails distintos usam cada conteúdo universal da organização.';

revoke all on function public.saved_block_usage_counts(uuid) from public, anon, authenticated;
grant execute on function public.saved_block_usage_counts(uuid) to service_role;
