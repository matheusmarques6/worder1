# CLAUDE-B-V3.md — Flows + Content + Settings + Forms + Tracking + Páginas Faltantes

## PROMPT:
```
NÃO faça perguntas. NÃO pare. Leia CLAUDE-B-V3.md e WORDER-ARCHITECTURE.md na raiz e execute TUDO. São 12 fases.
```

## CONTEXTO
Worder tem muitas telas mas faltam funcionalidades e páginas. OUTRO Claude (A) trabalha em paralelo na branch v3/redesign-functional fazendo: redesign de todas páginas + email funcional + segments + recovery + contatos + inbox coluna 3.
Você cuida de: flows com email, content hub, settings completos, forms, tracking server-side, integrações, e TODAS as páginas que faltam.
Design system: WORDER-ARCHITECTURE.md (bg-white, border-gray-200, brand-500 laranja, DM Sans).

## SETUP
```bash
git checkout main && git pull
git checkout -b v3/flows-settings-content
```

## FASE 1 — MAPEAR
```bash
find src/app -name "page.tsx" | sort
find src -path "*automat*" -o -path "*flow*" | grep -E "\.tsx?$" | sort
find src -path "*settings*" -name "page.tsx" | sort
find src -path "*form*" -name "page.tsx" | sort
grep -rn "action.*type\|node.*type\|processNode" src/ --include="*.ts" | head -20
```

## FASE 2 — FLOW BUILDER COM EMAIL
### 2.1 Engine
Encontrar engine de automação. Adicionar action type 'send_email':
```typescript
case 'send_email': {
  try {
    const { sendCampaignEmail } = await import('@/lib/email/send-campaign-email')
    await sendCampaignEmail({ supabaseAdmin: supabase, contact, template: { html: nodeConfig.html || '', subject: nodeConfig.subject }, org: { id: orgId, name: orgName }, flowId: flow.id })
  } catch (err) { console.error('Email flow failed:', err) }
  break
}
```
Se send-campaign-email não existe: criar stub que console.log.

### 2.2 Flow Builder Visual
Encontrar builder (provavelmente usa @xyflow/react). MELHORAR visual:
- Canvas: bg-[#FAFBFC] com dots pattern
- Nodes: bg-white border border-gray-200 rounded-xl shadow-sm p-4 min-w-[200px]
  Cada tipo com borda e ícone colorido:
  Trigger: border-l-4 border-purple-500, ícone Zap purple
  Email: border-l-4 border-blue-500, ícone Mail blue
  WhatsApp: border-l-4 border-green-500, ícone MessageCircle green
  Delay: border-l-4 border-gray-400, ícone Clock gray
  Condition: border-l-4 border-amber-500, ícone GitBranch amber (2 outputs YES/NO)
- Sidebar componentes: bg-white border-r border-gray-200 w-64 p-4
  Seções: "Triggers", "Ações", "Lógica" com items arrastáveis
- Panel config: bg-white border-l border-gray-200 w-80 p-4, slide-in ao clicar node
- MiniMap, Background, Controls do @xyflow

Se builder visual NÃO existe: criar com @xyflow/react com esses nodes.

### 2.3 Galeria de Templates
Modal ou página /automations/templates com grid de 8+ cards:
Welcome Series, Carrinho Abandonado, Pós-Compra, Win-back, Boleto/PIX, Review Request, VIP, Browse Abandonment.
Cada card: ícone, nome, descrição, badge canal (Email/WhatsApp/Multi), botão "Usar" → cria flow com nodes pré-posicionados.

### 2.4 Lista automações
Corrigir: nome da automação DEVE aparecer (vi na print que não aparece). Status badge. Tipo trigger. Métricas se disponíveis.

## FASE 3 — CONTENT HUB
Criar /content como hub:
### /content (landing)
Grid de cards: Templates Email (→/email/templates), Templates WhatsApp (→/whatsapp/templates), Mídia, Cupons, Produtos. Cada card com ícone, count, link.

### /content/media
Grid de media_files da org. Upload: drag zone + file input. Preview thumbnail. Botões: copiar URL, deletar. INSERT/DELETE media_files REAL.

### /content/coupons
Tabela coupons REAL. Dialog "Criar Cupom": code, tipo (% ou R$), valor, min_purchase, max_uses, validade. INSERT/UPDATE/DELETE REAL.

### /content/products
SELECT products da org (se tabela existe). Tabela com thumbnail, nome, preço, status. Se não tem dados: mostrar "Conecte Shopify para importar produtos".

## FASE 4 — SETTINGS COMPLETOS
Settings atual tem submenu com: Geral, Conta, Equipe, Faturamento, Rastreamento, Atribuição, UTM, API, Segurança + coluna direita com: Conta, Loja, Integrações, E-mail, WhatsApp(?), Dados, API Keys, Segurança.

Verificar CADA sub-página. Se funciona: melhorar visual. Se não: criar.

### /settings (geral)
WhatsApp status "Online" + config agente IA. Já funciona. Verificar visual.

### /settings/account
Form: nome, email, avatar upload. Save REAL (UPDATE profiles).

### /settings/team (ou equipe)
Tabela organization_members REAL. Convidar: dialog email + role select.

### /settings/billing
Card plano + uso mensal + data renovação. Dados org REAIS.

### /settings/email
Seção domínios: tabela sending_domains REAL, botão adicionar, DNS records, botão verificar.
Seção sender: sender_name, sender_email, reply_to inputs. Save REAL.
Seção servidores: tabela sending_servers REAL, dialog adicionar (tipo, config), toggle padrão.

### /settings/integrations
Cards de integração: Shopify (conectado/desconectado), Facebook, Google, TikTok. Botão conectar/desconectar. Status badge.

### /settings/tracking
Toggles: open tracking, click tracking, anônimo. Inputs: FB Pixel, GA ID.
Código tracker.js para copiar: `<script src="${APP_URL}/worder-tracker.js" data-org="ORG_ID"></script>`
Save em org.tracking_settings REAL.

### /settings/attribution
Janela atribuição por canal: Email (select 1-7d), WhatsApp (1-3d). Save REAL.

### /settings/utm
UTM padrão: source, medium. Toggle auto-add. Preview. Save REAL.

### /settings/api
Tabela API keys (organization_api_keys). Criar/copiar/deletar REAL.

### /settings/security
2FA toggle (placeholder). Audit log: SELECT audit_logs ORDER BY created_at DESC LIMIT 20 REAL.

Design de TODAS settings: bg-white cards border-gray-200 rounded-lg p-6. Labels text-sm text-gray-700. Inputs como design system.

## FASE 5 — FORMS FUNCIONAL
### Lista /forms
Tabela forms REAL. Tipo badge (Popup/Embedded), status, submissions count. Botão "Criar Formulário".

### Editor /forms/[id]/editor
Layout 3 painéis estilo Klaviyo K06:
- Esquerda: config (campos, design, comportamento trigger, sucesso)
- Centro: preview (mockup device)
- Direita: destino (lista/segmento), ações pós-submit

### Embed code
Botão → modal com 2 opções:
- Popup: `<script src="${APP_URL}/embed/[formId].js"></script>`
- Embedded: `<div data-worder-form="[formId]"></div><script src="${APP_URL}/embed/form-loader.js"></script>`

### API /api/forms/submit
POST público (sem auth). Body: { form_id, email, name?, phone? }
→ upsert contact REAL (by email)
→ add to list se configurado
→ INSERT form_submissions
→ retornar { success: true }

## FASE 6 — TRACKING SERVER-SIDE (inspirado AdTracked)
### /api/track
POST CORS-enabled. Recebe: org_id, visitor_id, session_id, event_name, page_url, referrer, user_agent, utm_*, fbclid, gclid, custom_data.
INSERT tracking_events REAL. Se email no payload: upsert contact.

### public/worder-tracker.js
Script ~80 linhas para instalar na loja:
```javascript
(function() {
  var orgId = document.currentScript.getAttribute('data-org');
  var baseUrl = document.currentScript.src.replace('/worder-tracker.js', '');
  var visitorId = localStorage.getItem('_wdr_vid') || crypto.randomUUID();
  localStorage.setItem('_wdr_vid', visitorId);
  var sessionId = sessionStorage.getItem('_wdr_sid') || crypto.randomUUID();
  sessionStorage.setItem('_wdr_sid', sessionId);

  function getUTMs() {
    var p = new URLSearchParams(location.search);
    return { utm_source: p.get('utm_source'), utm_medium: p.get('utm_medium'), utm_campaign: p.get('utm_campaign'), fbclid: p.get('fbclid'), gclid: p.get('gclid') };
  }

  function track(event, data) {
    fetch(baseUrl + '/api/track', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId, visitor_id: visitorId, session_id: sessionId, event_name: event, page_url: location.href, referrer: document.referrer, user_agent: navigator.userAgent, ...getUTMs(), custom_data: data || {} })
    }).catch(function() {});
  }

  track('page_view');
  window.worderTrack = track;
})();
```

### public/worder-shopify-pixel.js
Script ~60 linhas para Shopify Web Pixels:
Captura: page_viewed, product_viewed, collection_viewed, checkout_started, checkout_completed.
Mapeia para /api/track.

## FASE 7 — INTEGRAÇÕES
### /integrations
Grid de cards de integração estilo Klaviyo K31:
- Shopify: ícone, status badge (Conectado verde ou Desconectado cinza), botão, última sync
- Facebook Ads: ícone, status, botão conectar
- Google Ads: idem
- TikTok Ads: idem
- WhatsApp: status da conexão
- Resend: status

Cada card: bg-white border border-gray-200 rounded-lg p-5, ícone 40x40, nome, descrição, status badge, botão.

### Facebook/Google/TikTok Ads pages
Se /facebook-ads, /google-ads, /tiktok-ads existem na sidebar: garantir que cada um tem página com card de integração + "Conecte para ver métricas" + botão OAuth (ou placeholder).

## FASE 8 — PRODUCT ALERTS
### Lógica
Quando webhook Shopify products/update chega: verificar se inventory_quantity mudou de 0 para >0 → buscar product_alerts WHERE product_id AND alert_type='back_in_stock' AND status='active' → para cada: enviar email/whatsapp → UPDATE status='triggered'

### API
POST /api/alerts/subscribe: { product_id, product_title, email, alert_type }
→ upsert contact → INSERT product_alerts

### Widget para loja
Script que mostra botão "Avise-me quando disponível" na página de produto out-of-stock da Shopify.

## FASE 9 — AJUDA
Criar /help:
- Grid de cards: Documentação, Guia Rápido, Contato Suporte, Status do Sistema
- FAQ com accordion (5-10 perguntas comuns)
- Link para WhatsApp suporte

## FASE 10 — LINKS QUEBRADOS
```bash
# Sidebar links
grep -rn "href\|push(" $(find src -name "*.tsx" | xargs grep -l -i "sidebar\|navigation" 2>/dev/null | head -3) | grep -oP "['\"](/[^'\"]+)['\"]" | sort -u

# Pages existentes
find src/app -name "page.tsx" | sed 's|src/app||;s|/page.tsx||;s|(dashboard)/||;s|(auth)/||' | sort -u
```
Para CADA link sem página: criar page.tsx com conteúdo relevante. ZERO 404.

## FASE 11 — VISUAL CONSISTENCY CHECK
```bash
# Cards KPI com bg colorido (ERRADO)
grep -rn "bg-brand-\|bg-orange-[1-4]\|bg-emerald-[1-4]\|bg-green-[1-4]" src/app --include="*.tsx" | grep -v "text-\|border-\|badge\|hover:" | head -20

# Backgrounds escuros fora da sidebar
grep -rn "bg-dark\|bg-gray-900\|bg-gray-800" src/app --include="*.tsx" | grep -vi "sidebar\|tooltip\|modal" | head -10
```
Corrigir TUDO encontrado.

## FASE 12 — BUILD + PUSH
```bash
pnpm build
git add -A && git commit -m "v3: flows + content + settings + forms + tracking + integrations"
git push origin v3/flows-settings-content
```
NÃO PARE.
