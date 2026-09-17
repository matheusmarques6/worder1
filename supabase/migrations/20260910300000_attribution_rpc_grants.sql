-- =============================================
-- Atribuição de receita: quem chama não escolhe a organização.
--
-- Três funções da atribuição são SECURITY DEFINER (rodam com os poderes
-- do dono, por cima do RLS) e recebem a organização como PARÂMETRO:
--
--   attribute_order(p_organization_id, p_order_id, …)        -- escreve
--   attribution_candidates(p_organization_id, …)             -- lê
--   backfill_order_attribution(p_organization_id, p_since, …) -- reescreve em lote
--
-- Elas estavam liberadas para o papel `authenticated`, e o Supabase expõe
-- toda função em /rest/v1/rpc/<nome>. Ou seja: um lojista logado podia
-- chamar attribute_order com o id de OUTRA organização e reescrever a
-- atribuição de receita dela — ou passar backfill e reescrever meses de
-- histórico alheio. Nenhuma delas confere se quem chama pertence àquela
-- organização, porque foram escritas para serem chamadas pelo servidor.
--
-- E é só assim que o código as chama: attributeOrder() usa o cliente de
-- serviço; as outras duas não têm nenhum chamador no aplicativo (só são
-- usadas de dentro de attribute_order, e chamada interna não passa por
-- grant — o usuário efetivo ali é o dono da função).
--
-- Portanto: nada perde funcionalidade ao trancá-las no service_role.
--
-- Nota sobre o que NÃO mexi: as funções auxiliares de organização
-- (get_user_organization_id, user_belongs_to_org e companhia) continuam
-- executáveis por anon e authenticated de propósito. Dezenas de policies
-- de RLS as chamam, inclusive em tabelas cujas policies valem para
-- PUBLIC; revogar quebraria a consulta em vez de devolver vazio. E elas
-- não expõem dado de ninguém: devolvem a organização de quem chama, que
-- para anon é nula.
-- =============================================

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in ('attribute_order', 'attribution_candidates', 'backfill_order_attribution')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.assinatura);
    execute format('grant execute on function %s to service_role', f.assinatura);
    raise notice 'trancada: %', f.assinatura;
  end loop;
end $$;
