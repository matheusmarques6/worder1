-- =============================================
-- Duas policies "org_via_pai" comparavam o pai com ele mesmo.
--
-- O padrão correto desta família é: a linha filha só é visível se o PAI
-- dela for visível — e o pai tem RLS por organização, então o filtro de
-- organização vem de graça (a subconsulta de uma policy também passa pelo
-- RLS da tabela referenciada).
--
--   EXISTS (SELECT 1 FROM pai p WHERE p.id = filha.coluna_do_pai)
--
-- Nestas duas, o lado direito ficou apontando para o próprio pai:
--
--   whatsapp_campaign_recipients:
--     EXISTS (SELECT 1 FROM whatsapp_campaigns p WHERE p.id::text = p.campaign_id::text)
--   google_ads_search_terms:
--     EXISTS (SELECT 1 FROM google_ads_campaigns p WHERE p.id::text = p.campaign_id)
--
-- A linha filha nunca entra na conta. O resultado é uma condição global:
-- ou nenhuma linha passa (e a tela fica vazia sem explicação), ou —
-- se UMA campanha qualquer tiver campaign_id igual ao próprio id — TODAS
-- as linhas de TODAS as organizações passam a ser legíveis e graváveis
-- por qualquer usuário autenticado. Nas duas tabelas `campaign_id` é o
-- identificador externo (Meta, Google), que um dia pode muito bem ser
-- gravado com o uuid.
--
-- As duas tabelas estão vazias em produção hoje, então isto é conserto
-- antes do estrago, não depois.
--
-- As outras treze policies desta família estão corretas (conferidas uma
-- por uma); só estas duas tinham o erro.
-- =============================================

-- ── whatsapp_campaign_recipients ──
do $$
begin
  if to_regclass('public.whatsapp_campaign_recipients') is not null
     and to_regclass('public.whatsapp_campaigns') is not null then
    drop policy if exists org_via_pai on public.whatsapp_campaign_recipients;
    create policy org_via_pai on public.whatsapp_campaign_recipients
      for all to authenticated
      using (exists (
        select 1 from public.whatsapp_campaigns p
        where p.id = public.whatsapp_campaign_recipients.campaign_id
      ))
      with check (exists (
        select 1 from public.whatsapp_campaigns p
        where p.id = public.whatsapp_campaign_recipients.campaign_id
      ));
  end if;
end $$;

-- ── google_ads_search_terms ──
do $$
begin
  if to_regclass('public.google_ads_search_terms') is not null
     and to_regclass('public.google_ads_campaigns') is not null then
    drop policy if exists org_via_pai on public.google_ads_search_terms;
    create policy org_via_pai on public.google_ads_search_terms
      for all to authenticated
      using (exists (
        select 1 from public.google_ads_campaigns p
        where p.id = public.google_ads_search_terms.campaign_id
      ))
      with check (exists (
        select 1 from public.google_ads_campaigns p
        where p.id = public.google_ads_search_terms.campaign_id
      ));
  end if;
end $$;
