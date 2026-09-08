-- =============================================================
-- As funções que a chave pública podia chamar.
--
-- Terceira camada do mesmo buraco. A RLS fechou as tabelas; o
-- `security_invoker` fechou as visões; sobrou o `/rpc/`. Uma função
-- `security definer` roda com os direitos de quem a criou — o
-- `postgres`, que ignora RLS — e o PostgREST expõe cada uma como um
-- endpoint. Havia 89 delas com EXECUTE para o papel anônimo, quer
-- dizer: chamáveis por qualquer um que tenha a chave pública, que
-- viaja no pacote do browser.
--
-- A maioria recebe a organização como argumento e age sobre ela. Entre
-- as piores:
--
--   list_auth_sessions(p_user_id)      sessões de qualquer usuário
--   list_mfa_factors(p_user_id)        fatores de MFA de qualquer um
--   revoke_auth_session(id, user_id)   derruba a sessão de qualquer um
--   get_contacts_total_spent(org)      faturamento de qualquer empresa
--   backfill_attribution_for_org(org)  dispara trabalho pesado alheio
--   attribute_order(...)               escreve atribuição alheia
--   create_notification(org, user,...) escreve notificação alheia
--
-- Nenhuma dessas precisa do grant: as 67 funções que o código chama são
-- todas chamadas do servidor, com a chave de serviço — que tem
-- `rolbypassrls` e o papel `service_role`, mantido aqui.
--
-- As sete exceções são as funções que aparecem dentro das próprias
-- expressões de política. O Postgres exige EXECUTE do papel que está
-- consultando para avaliar a política; revogá-las derrubaria toda a
-- cerca que a migração anterior levantou. Elas não vazam nada: só
-- devolvem a organização de quem pergunta, e nulo para o anônimo.
--
-- Funções de gatilho não são afetadas: o Postgres não checa EXECUTE
-- para disparar um gatilho.
--
-- As sete guardas continuam com grant explícito para `anon` e
-- `authenticated`, e por isso sobrevivem à revogação do `public`.
-- =============================================================

do $$
declare
  f record;
  -- As que a RLS avalia. Sem EXECUTE aqui, nenhuma política funciona.
  guardas text[] := array[
    'current_app_organization_id',
    'current_org_id',
    'get_user_org_id',
    'get_user_organization_id',
    'is_org_admin',
    'user_belongs_to_org',
    'user_org_ids'
  ];
begin
  for f in
    select p.oid::regprocedure as assinatura, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and not (p.proname = any (guardas))
     order by p.proname
  loop
    -- O `public` é o que importa: o padrão do Postgres é dar EXECUTE a
    -- ele, e `anon` é membro. Revogar só de `anon` deixa a porta aberta
    -- pelo caminho de trás — foi o que aconteceu na primeira tentativa,
    -- e a ACL denunciou, com o `=X/postgres` na frente.
    execute format('revoke execute on function %s from public', f.assinatura);
    execute format('revoke execute on function %s from anon, authenticated', f.assinatura);
    -- Explícito, para o dia em que alguém mexer nos grants padrão.
    execute format('grant execute on function %s to service_role', f.assinatura);
  end loop;

  -- As guardas: o `public` também sai, mas o grant nominal fica. Assim
  -- a política continua avaliável por quem está logado sem depender do
  -- padrão do Postgres.
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (guardas)
  loop
    execute format('revoke execute on function %s from public', f.assinatura);
    execute format(
      'grant execute on function %s to anon, authenticated, service_role',
      f.assinatura
    );
  end loop;
end $$;
