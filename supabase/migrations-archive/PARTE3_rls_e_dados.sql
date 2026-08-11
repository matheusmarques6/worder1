-- ============================================
-- PARTE 3: RLS E DADOS INICIAIS
-- Execute esta parte após a PARTE 2
-- ============================================

-- ============================================
-- 8. ENABLE RLS ON NEW TABLES
-- ============================================

ALTER TABLE google_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_ad_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_search_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_product_metrics ENABLE ROW LEVEL SECURITY;

ALTER TABLE meta_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_adsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_metrics ENABLE ROW LEVEL SECURITY;

ALTER TABLE tiktok_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_ads_adgroups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_ads_metrics ENABLE ROW LEVEL SECURITY;

ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 9. RLS POLICIES SIMPLIFICADAS
-- ============================================

-- Help content é público para leitura
CREATE POLICY "public_read_help_categories" ON help_categories
  FOR SELECT TO public USING (is_active = true);

CREATE POLICY "public_read_help_articles" ON help_articles
  FOR SELECT TO public USING (status = 'published');

CREATE POLICY "public_read_faqs" ON faq_items
  FOR SELECT TO public USING (is_active = true);

-- Políticas para tabelas de organização (usando service_role para bypass)
-- Quando você usa a API do Supabase com service_role key, o RLS é ignorado

-- ============================================
-- 10. INSERT DEFAULT HELP DATA
-- ============================================

-- Categorias de ajuda
INSERT INTO help_categories (name, slug, description, icon, color, position) VALUES
('Primeiros Passos', 'getting-started', 'Aprenda o básico sobre a plataforma', 'Rocket', '#10b981', 1),
('CRM & Contatos', 'crm-contacts', 'Gerencie seus contatos e pipeline', 'Users', '#3b82f6', 2),
('WhatsApp', 'whatsapp', 'Configuração e uso do WhatsApp Business', 'MessageCircle', '#25D366', 3),
('Email Marketing', 'email-marketing', 'Campanhas e automações de email', 'Mail', '#8b5cf6', 4),
('Automações', 'automations', 'Crie fluxos automáticos', 'Zap', '#f59e0b', 5),
('Integrações', 'integrations', 'Conecte sua loja e outras ferramentas', 'Plug', '#06b6d4', 6),
('Analytics', 'analytics', 'Relatórios e métricas', 'BarChart3', '#ec4899', 7),
('Configurações', 'settings', 'Configurações da conta e organização', 'Settings', '#6b7280', 8)
ON CONFLICT (slug) DO NOTHING;

-- FAQs iniciais
INSERT INTO faq_items (category_id, question, answer, position, is_featured)
SELECT
  c.id,
  q.question,
  q.answer,
  q.position,
  q.is_featured
FROM help_categories c
CROSS JOIN (
  VALUES
    ('getting-started', 'Como faço para começar a usar a plataforma?', 'Para começar, primeiro conecte sua loja Shopify ou outra integração de e-commerce. Em seguida, configure seu WhatsApp Business e comece a criar suas automações de marketing.', 1, true),
    ('getting-started', 'Quanto tempo leva para configurar tudo?', 'A configuração básica pode ser feita em menos de 15 minutos. Conectar sua loja e WhatsApp são os primeiros passos essenciais.', 2, false),
    ('getting-started', 'Preciso de conhecimento técnico?', 'Não! Nossa plataforma foi desenvolvida para ser intuitiva. Oferecemos templates prontos e guias passo a passo.', 3, false),
    ('whatsapp', 'Como configurar o WhatsApp Business?', 'Vá em Configurações > Integrações > WhatsApp. Você pode usar a API oficial do Meta ou APIs alternativas como Evolution API.', 1, true),
    ('whatsapp', 'Posso enviar mensagens em massa?', 'Sim, mas é importante seguir as políticas do WhatsApp. Para mensagens fora da janela de 24h, use templates aprovados.', 2, false),
    ('whatsapp', 'Qual a diferença entre API oficial e não-oficial?', 'A API oficial requer aprovação da Meta e usa templates. APIs não-oficiais permitem mais flexibilidade mas podem ter riscos de bloqueio.', 3, false),
    ('automations', 'O que é uma automação?', 'Uma automação é um fluxo de ações que acontece automaticamente baseado em gatilhos, como abandono de carrinho ou novo pedido.', 1, true),
    ('automations', 'Quantas automações posso criar?', 'Depende do seu plano. O plano Starter permite até 5 automações ativas. Planos superiores têm automações ilimitadas.', 2, false),
    ('crm-contacts', 'Como importar meus contatos?', 'Você pode importar contatos via CSV, sincronizar automaticamente da Shopify ou adicionar manualmente. Vá em Contatos > Importar.', 1, true),
    ('crm-contacts', 'O que são tags e como usá-las?', 'Tags são etiquetas para organizar seus contatos. Use-as para segmentar clientes por comportamento, preferências ou status.', 2, false)
) AS q(cat_slug, question, answer, position, is_featured)
WHERE c.slug = q.cat_slug
ON CONFLICT DO NOTHING;
