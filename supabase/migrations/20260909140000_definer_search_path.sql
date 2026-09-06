-- =============================================================
-- Prender o caminho de resolução de nomes nas funções `definer`.
--
-- Uma função `security definer` sem `search_path` fixo resolve os nomes
-- que usa pelo caminho de quem a chamou. Como ela roda com os direitos
-- do dono — o `postgres`, que ignora RLS —, quem conseguir pôr um
-- objeto num esquema que venha antes no caminho faz a função executar
-- outra coisa, com privilégio total. É o caminho clássico de escalada.
--
-- Eram 68 nesse estado. Depois da revogação do EXECUTE elas já não são
-- chamáveis pela chave pública, mas o `search_path` fixo é a trava que
-- não depende de quem pode chamar — e as seis guardas da RLS, que
-- continuam abertas por necessidade, estavam entre elas.
--
-- `public, extensions, pg_temp`: `public` é onde vivem as tabelas,
-- `extensions` cobre quem usa operador de extensão sem qualificar, e
-- `pg_temp` vai por último, que é o ponto — no fim, ele não sequestra
-- nome nenhum. Referência qualificada (`auth.uid()`) não depende do
-- caminho e segue funcionando.
--
-- As 237 funções `invoker` ficam de fora: elas rodam com os direitos de
-- quem chamou, então não há privilégio a escalar.
-- =============================================================

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) c
          where c like 'search_path=%'
       )
  loop
    execute format(
      'alter function %s set search_path = public, extensions, pg_temp',
      f.assinatura
    );
  end loop;
end $$;
