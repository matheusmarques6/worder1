-- =============================================================
-- As visões que passavam por cima da RLS.
--
-- Ligar a RLS nas 310 tabelas fechou a leitura direta, mas uma visão
-- sem `security_invoker` roda com os direitos de quem a criou — o dono
-- é o `postgres`, que tem `rolbypassrls`. Ou seja: a visão lê as
-- tabelas protegidas com privilégio total e entrega o resultado a quem
-- perguntou, RLS ou não.
--
-- Oito visões tinham `SELECT` para o papel anônimo e o modo definidor,
-- entre elas `whatsapp_inbox_messages`, `v_unified_contacts` e
-- `automation_metrics`. O mecanismo foi conferido na mão em
-- `automation_metrics`, com o papel anônimo — que é o da chave pública
-- que viaja no pacote do browser: no modo definidor lia as 32 linhas
-- da tabela por trás, mesmo com a RLS ligada; no modo invocador, zero.
--
-- Números pequenos hoje porque a base tem um inquilino só; o buraco é
-- do tamanho da tabela por trás.
--
-- `security_invoker = on` faz a visão rodar com os direitos de quem
-- consulta, então a RLS das tabelas de baixo volta a valer. A chave de
-- serviço continua vendo tudo, porque ignora RLS de qualquer jeito —
-- as rotas que leem estas visões pelo servidor não mudam. A única lida
-- pelo cliente de sessão é `v_integration_status`, e passar a mostrar
-- só as integrações da própria organização é o comportamento certo.
--
-- `email_universal_usage` já nasceu assim; serve de referência.
-- =============================================================

do $$
declare v record;
begin
  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'v'
       and coalesce(
             (select option_value from pg_options_to_table(c.reloptions)
               where option_name = 'security_invoker'), 'off') <> 'on'
     order by c.relname
  loop
    execute format('alter view public.%I set (security_invoker = on)', v.relname);
  end loop;
end $$;
