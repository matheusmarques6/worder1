-- =============================================================
-- A RLS nas tabelas que não têm coluna de organização.
--
-- A migração anterior cercou as 269 tabelas com `organization_id`. Ficou
-- de fora um resto que guarda dado de inquilino sem essa coluna: ou a
-- cerca é a loja (o CRM inteiro — deals, pipelines, events), ou é a
-- linha-pai (as etapas do pipeline, os membros do segmento, os cliques
-- de um envio).
--
-- Com a RLS desligada e o GRANT de select para `anon`, cinco dessas
-- ainda tinham conteúdo aberto para a chave pública, e uma delas pesa:
-- `shopify_webhook_audit`, com 286.569 payloads crus da Shopify —
-- pedidos e clientes, como chegaram.
--
-- Três tratamentos, conforme quem lê a tabela:
--
--   loja   — o CRM. `store_id` diz de quem é a linha.
--   pai    — a cerca vem da linha acima, que já está cercada. A
--            comparação vai em texto porque nem toda filha guarda a
--            chave no mesmo tipo do pai: `whatsapp_campaign_recipients`
--            usa varchar para um pai uuid.
--   sistema— fila, log e auditoria que só a chave de serviço toca:
--            liga a RLS e não cria política nenhuma. Ninguém além do
--            service_role (que ignora RLS) enxerga.
--
-- E uma quarta, pequena: catálogo. Modelos prontos, moedas, categorias
-- de ajuda — leitura para quem está logado, escrita só pelo serviço.
-- =============================================================

-- 1. O CRM: a cerca é a loja.
do $$
declare t text;
begin
  foreach t in array array['deals', 'deal_activities', 'events', 'pipeline_stage_transitions', 'pipelines']
  loop
    execute format('drop policy if exists org_via_loja on public.%I', t);
    execute format($f$
      create policy org_via_loja on public.%I
        as permissive for all to authenticated
        using (store_id in (
          select s.id from public.shopify_stores s
           where s.organization_id = public.get_user_organization_id()
        ))
        with check (store_id in (
          select s.id from public.shopify_stores s
           where s.organization_id = public.get_user_organization_id()
        ))
    $f$, t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- 2. Filhas: a cerca é a linha-pai, que já está cercada. O `exists`
--    roda sob a RLS do próprio usuário, então basta a linha do pai
--    aparecer para ele.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('pipeline_stages',            'pipeline_id',    'pipelines'),
      ('segment_members',            'segment_id',     'customer_segments'),
      ('segment_member_cache',       'segment_id',     'customer_segments'),
      ('segment_reeval_queue',       'segment_id',     'customer_segments'),
      ('contact_list_members',       'list_id',        'contact_lists'),
      ('email_clicks',               'email_send_id',  'email_sends'),
      ('automation_executions',      'automation_id',  'automations'),
      ('automation_versions',        'automation_id',  'automations'),
      ('automation_run_steps',       'run_id',         'automation_runs'),
      ('automation_pending_steps',   'run_id',         'automation_runs'),
      ('whatsapp_campaign_recipients','campaign_id',   'whatsapp_campaigns'),
      ('crm_form_fields',            'form_id',        'crm_forms'),
      ('crm_form_events',            'form_id',        'crm_forms'),
      ('google_ads_keywords',        'ad_group_id',    'google_ads_ad_groups'),
      ('google_ads_search_terms',    'campaign_id',    'google_ads_campaigns')
    ) as v(filha, chave, pai)
  loop
    -- Só cria se a tabela-pai existir de fato neste banco.
    if to_regclass('public.' || r.pai) is null then continue; end if;

    execute format('drop policy if exists org_via_pai on public.%I', r.filha);
    execute format($f$
      create policy org_via_pai on public.%I
        as permissive for all to authenticated
        using (exists (select 1 from public.%I p where p.id::text = %I::text))
        with check (exists (select 1 from public.%I p where p.id::text = %I::text))
    $f$, r.filha, r.pai, r.chave, r.pai, r.chave);
    execute format('alter table public.%I enable row level security', r.filha);
  end loop;
end $$;

-- 3. A organização: quem é dela, ou membro dela.
alter table public.organizations enable row level security;
drop policy if exists minha_organizacao on public.organizations;
create policy minha_organizacao on public.organizations
  as permissive for select to authenticated
  using (
    id = public.get_user_organization_id()
    or exists (
      select 1 from public.organization_members m
       where m.organization_id = organizations.id
         and m.user_id = auth.uid()
    )
  );

-- 4. O próprio histórico de acesso.
alter table public.auth_login_events enable row level security;
drop policy if exists meus_acessos on public.auth_login_events;
create policy meus_acessos on public.auth_login_events
  as permissive for select to authenticated
  using (user_id = auth.uid());

-- 5. Catálogo: leitura para quem está logado, escrita só pelo serviço.
do $$
declare t text;
begin
  foreach t in array array['ai_models', 'automation_templates', 'exchange_rates',
                           'faq_items', 'help_categories', 'integration_categories',
                           'integrations']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists catalogo_leitura on public.%I', t);
    execute format($f$
      create policy catalogo_leitura on public.%I
        as permissive for select to authenticated using (true)
    $f$, t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- 6. Sistema: fila, log, auditoria. RLS ligada e nenhuma política — só
--    a chave de serviço passa, que é quem já escreve e lê estas.
do $$
declare t text;
begin
  foreach t in array array['shopify_webhook_audit', 'webhook_events', 'webhook_logs',
                           'scheduled_executions', 'comment_mentions', 'flow_webhook_logs',
                           'automation_webhooks', 'agent_permissions', 'ai_agent_configs',
                           'knowledge_documents', 'omnisend_reports_cache',
                           'tracking_codes', 'tracking_orders', 'tracking_stores',
                           'tracking_lookups', 'whatsapp_agent_sessions',
                           'whatsapp_number_agents', 'whatsapp_queue_jobs',
                           'whatsapp_rate_limits', 'whatsapp_webhook_events',
                           'google_ads_ad_groups', 'google_ads_product_metrics',
                           'meta_ads_ads', 'meta_ads_adsets', 'tiktok_ads_adgroups']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    -- As permissivas antigas sairiam do caminho de qualquer forma, mas
    -- ficariam registradas mentindo sobre o acesso.
    execute format('drop policy if exists %I on public.%I', 'Webhook events access', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
