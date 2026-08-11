-- ============================================================================
-- 10.8 (Adendo §B) — a view active_commercial_moments.
--
-- "Ativo" é COMPUTADO pelo relógio, nunca gravado (§3.3.4): approved, dentro
-- da janela, kill switch intacto. Campanhas e o editor de Fluxos leem ESTA
-- view para o banner "momento X ativo até Y" — a mesma verdade do resolver.
-- Leitura via service_role (rota autenticada escopa a org); Data API fora.
-- ============================================================================

create view public.active_commercial_moments as
select m.id,
       m.organization_id,
       m.name,
       m.starts_at,
       m.ends_at,
       m.public_claim,
       m.offer
  from public.commercial_moments m
 where m.status = 'approved'
   and m.killed_at is null
   and now() between m.starts_at and m.ends_at;

revoke all on public.active_commercial_moments from public, anon, authenticated;
grant select on public.active_commercial_moments to service_role;
