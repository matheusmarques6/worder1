-- =============================================
-- Políticas de RLS que anulavam o isolamento por organização
--
-- Políticas de RLS se somam (OR). Cada uma das tabelas abaixo já tinha a
-- política certa (org_via_pai / org_isolation_rls) e, ao lado dela, uma
-- política com `using true` e `with check true` para PUBLIC — ou seja,
-- para anon e authenticated. Enquanto essa política existisse, a política
-- certa não valia nada: qualquer usuário logado lia e escrevia linha de
-- qualquer organização.
--
-- As políticas de service_role com `true` (a maioria das encontradas na
-- varredura) NÃO entram aqui: service_role já ignora RLS, e elas só
-- documentam a intenção. As de catálogo (`catalogo_leitura`, leitura de
-- ai_models, integrations, exchange_rates…) também ficam: são tabelas
-- globais, sem dono.
-- =============================================

-- Execuções de automação: leitura e ESCRITA liberadas para qualquer um.
drop policy if exists "Allow all" on public.automation_executions;

-- Passos agendados (o que a automação vai fazer, e para quem).
drop policy if exists "dash" on public.automation_pending_steps;

-- Cliques de e-mail: quem clicou, em qual link. Sobra org_via_pai.
drop policy if exists "email_clicks org access" on public.email_clicks;

-- INSERT de organização liberado para PUBLIC. A organização de verdade
-- nasce no gatilho handle_new_user() (SECURITY DEFINER) e nas rotas com
-- service_role — nenhum caminho do app insere organização com o token do
-- usuário, então ninguém perde nada e o caminho de criar organização
-- arbitrária fecha.
drop policy if exists "Service role can insert organizations" on public.organizations;

-- Quem está em qual segmento: lista de contatos de outra organização, e
-- a possibilidade de plantar contato em segmento alheio. A tela de
-- segmentos usa o cliente autenticado; org_via_pai (via customer_segments)
-- cobre select, insert e delete dela.
drop policy if exists segment_members_select on public.segment_members;
drop policy if exists segment_members_insert on public.segment_members;
drop policy if exists segment_members_delete on public.segment_members;

-- Consultas de rastreio: INSERT público numa tabela com e-mail do
-- cliente e IP. Nenhum código do app escreve nela — sobra só
-- service_role, que ignora RLS.
drop policy if exists public_lookups on public.tracking_lookups;
