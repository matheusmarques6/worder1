-- =============================================================
-- Ligar a RLS nas tabelas que têm organização.
--
-- O código já supunha que ela estava ligada. Espalhados pelas rotas há
-- 93 comentários dizendo "RLS filtra automaticamente" — e a RLS estava
-- desligada em 290 das 310 tabelas. Havia 687 políticas escritas em 232
-- tabelas, todas inertes: ninguém rodou o ENABLE.
--
-- Isso importa porque `getAuthClient()` devolve um cliente com a chave
-- pública mais o token do usuário. Sem RLS, esse cliente lê o banco
-- inteiro, e a chave pública viaja no pacote do browser. Quem tivesse a
-- chave lia dados de qualquer organização direto do navegador — e as
-- 280 rotas que confiam na RLS não filtravam nada.
--
-- A chave de serviço tem `rolbypassrls`, então nada do que roda no
-- servidor com ela muda de comportamento: crons, webhooks e as rotas que
-- usam `supabaseAdmin` continuam vendo tudo, como devem.
--
-- Três cuidados antes do ENABLE:
--
-- 1. As políticas escancaradas. A RLS soma as permissivas com OU, então
--    uma única `using (true)` anula as vizinhas certas — `email_sends`
--    tinha exatamente isso. As abertas que não são de service_role caem.
--
-- 2. As linhas órfãs. `automation_runs` tinha 335 execuções sem
--    organização (de 885); todas recuperáveis pelo fluxo, todas de uma
--    organização só. Sem o preenchimento elas sumiriam da tela.
--
-- 3. O `worder.email` em `email_domains` fica com organização nula de
--    propósito: é o domínio compartilhado da plataforma. Ele só é lido
--    pela chave de serviço, então a política estrita não o esconde de
--    quem precisa.
-- =============================================================

-- 1. Execuções sem organização: vêm do fluxo que as gerou.
update public.automation_runs r
   set organization_id = a.organization_id
  from public.automations a
 where a.id = r.automation_id
   and r.organization_id is null
   and a.organization_id is not null;

-- 2. As políticas que liberavam tudo, e a cerca uniforme por organização.
do $$
declare
  t record;
  p record;
  pred text;
begin
  for t in
    select c.relname, col.data_type
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join information_schema.columns col
        on col.table_schema = 'public'
       and col.table_name = c.relname
       and col.column_name = 'organization_id'
     where n.nspname = 'public'
       and c.relkind = 'r'
     order by c.relname
  loop
    -- `oauth_states` guarda a organização como texto; comparar com uuid
    -- aborta na criação da política. Compara-se do lado do texto, que
    -- nunca falha em tempo de execução por linha malformada.
    pred := case when t.data_type = 'uuid'
      then 'organization_id = public.get_user_organization_id()'
      else 'organization_id = public.get_user_organization_id()::text'
    end;
    -- Uma permissiva `true` para papel de usuário anula todo o resto.
    -- As de service_role ficam: esse papel já ignora RLS, e a política
    -- não amplia nada.
    for p in
      select policyname
        from pg_policies
       where schemaname = 'public'
         and tablename = t.relname
         and (qual = 'true' or (qual is null and with_check = 'true'))
         and roles::text <> '{service_role}'
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t.relname);
    end loop;

    -- A cerca. `to authenticated` deixa o papel anônimo sem política
    -- nenhuma nestas tabelas, que é o ponto: o browser anônimo passa a
    -- não ler nada, mesmo mantendo o GRANT de select.
    execute format('drop policy if exists org_isolation_rls on public.%I', t.relname);
    execute format(
      'create policy org_isolation_rls on public.%I'
      || ' as permissive for all to authenticated'
      || ' using (%s) with check (%s)',
      t.relname, pred, pred
    );

    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

-- 3. O próprio perfil, sempre visível para o dono.
--
-- `profiles` é o pé de toda a cerca: `get_user_organization_id()` lê
-- daqui. A função é security definer e o dono ignora RLS, então não há
-- recursão — mas quem ainda não tem organização precisa enxergar a
-- própria linha para conseguir uma.
create policy proprio_perfil on public.profiles
  as permissive for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 4. A função da cerca sem search_path era um risco de sequestro de
--    resolução de nomes; passa a fixar o esquema, como as irmãs.
create or replace function public.get_user_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (current_setting('request.jwt.claims', true)::json->>'organization_id')::uuid,
    (select organization_id from public.profiles where id = auth.uid())
  );
$$;
