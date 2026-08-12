-- Antes do pg_restore: roles e extensões que o dump referencia.
-- Roles primeiro — policies e ACLs restauradas apontam para eles.
do $$ begin
  create role worker_role nologin nobypassrls;
exception when duplicate_object then null; end $$;
do $$ begin
  create role sender_role nologin nobypassrls;
exception when duplicate_object then null; end $$;
grant worker_role, sender_role to postgres;

-- Extensões (tipos/defaults usados pelas tabelas dumpadas). Na nuvem vivem
-- no schema extensions; if not exists tolera o que a imagem já criou.
create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto  with schema extensions;
create extension if not exists vector    with schema extensions;
create extension if not exists pgmq;
