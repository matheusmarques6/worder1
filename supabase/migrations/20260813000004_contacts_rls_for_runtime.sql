-- ============================================================================
-- 20260813000004_contacts_rls_for_runtime.sql
-- O runtime ganhou SELECT direto em `contacts` (worker nas migrations 0002,
-- sender na 0003) — mas contacts é legada e vivia com RLS DESLIGADA: o grant
-- valia para TODAS as orgs, e a suíte de confinamento reprova exatamente isso.
--
-- Liga a RLS e escopa os papéis do runtime por current_app_organization_id().
-- Fatia consciente da remediação geral (que segue adiada): esta tabela JÁ tem
-- as policies do app (contacts_select/insert/update/delete, criadas na era
-- legada) — ligar a RLS aqui só passa a aplicá-las. service_role tem BYPASSRLS
-- (o app server não muda); authenticated cai nas policies que o próprio app
-- declarou; anon perde o que nunca deveria ter tido.
--
-- No CI (banco limpo) as policies legadas não existem — mas nenhum teste lê
-- contacts como authenticated; os papéis do runtime têm as policies daqui.
-- ============================================================================

alter table public.contacts enable row level security;

create policy contacts_worker_read on public.contacts
    for select to worker_role
    using (organization_id = public.current_app_organization_id());

create policy contacts_sender_read on public.contacts
    for select to sender_role
    using (organization_id = public.current_app_organization_id());

-- ----------------------------------------------------------------------------
-- whatsapp_opt_status: o get_customer_context lê o opt do contato como worker
-- (o preflight do sender lê como SECURITY DEFINER e não passa por aqui).
-- Mesma situação da contacts: legada, policies do app existem no vivo
-- (org_isolation), RLS desligada — o grant sem escopo vazaria o opt de
-- todas as orgs.
-- ----------------------------------------------------------------------------
grant select on public.whatsapp_opt_status to worker_role;

alter table public.whatsapp_opt_status enable row level security;

create policy opt_status_worker_read on public.whatsapp_opt_status
    for select to worker_role
    using (organization_id = public.current_app_organization_id());
