-- open_count e click_count existem em email_sends desde sempre e nunca
-- foram escritos: ficaram em zero em 1404 envios. A primeira abertura
-- grava opened_at, mas a segunda, a terceira e a décima não deixavam
-- rastro nenhum — e é justamente a repetição que distingue um leitor
-- interessado de um filtro de segurança que abriu uma vez.
--
-- Incremento no banco porque o PostgREST não sabe somar: ler e gravar
-- da aplicação perde contagem quando duas aberturas chegam juntas.
create or replace function public.bump_email_send_open(p_send_id uuid, p_mpp boolean default false)
returns void
language sql
security definer
set search_path = public
as $$
  update public.email_sends
     set open_count = coalesce(open_count, 0) + 1,
         opened_at  = case when p_mpp then opened_at else coalesce(opened_at, now()) end,
         mpp_opened_at = case when p_mpp then coalesce(mpp_opened_at, now()) else mpp_opened_at end
   where id = p_send_id;
$$;

create or replace function public.bump_email_send_click(p_send_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.email_sends
     set click_count = coalesce(click_count, 0) + 1,
         clicked_at  = coalesce(clicked_at, now())
   where id = p_send_id;
$$;

comment on function public.bump_email_send_open(uuid, boolean) is
  'Registra uma abertura: soma no contador e marca a primeira vez na coluna certa (humana ou MPP).';
comment on function public.bump_email_send_click(uuid) is
  'Registra um clique: soma no contador e marca a primeira vez.';

revoke all on function public.bump_email_send_open(uuid, boolean) from public, anon, authenticated;
revoke all on function public.bump_email_send_click(uuid) from public, anon, authenticated;
grant execute on function public.bump_email_send_open(uuid, boolean) to service_role;
grant execute on function public.bump_email_send_click(uuid) to service_role;
