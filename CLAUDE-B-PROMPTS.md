# CLAUDE-B-PROMPTS.md — Flows Email + Content + Analytics + Settings + Inbox + Forms

## PROMPT PARA COLAR NO CLAUDE CODE:
```
NÃO faça perguntas. NÃO peça confirmação. NÃO pare para perguntar nada. Tome todas as decisões sozinho. Se encontrar ambiguidade, escolha a opção mais razoável. Se encontrar erro, corrija e continue. Só pare quando o git push final for feito com sucesso.

Leia o arquivo CLAUDE-B-PROMPTS.md na raiz do repositório e execute ABSOLUTAMENTE TUDO que está descrito, na ordem, sem pular nenhuma tarefa. São 10 fases. Execute todas.
```

---

## CONTEXTO GERAL

### O que é o Worder
Plataforma SaaS de marketing para e-commerce brasileiro. Online em worder1.vercel.app. 732 commits. Multi-tenant via organization_id.

### Stack
Next.js 14, React 18, TypeScript 5, Tailwind CSS, Radix UI, Framer Motion, Lucide, Zustand, Supabase, Upstash Redis, @xyflow/react, DnD Kit, Recharts, Vitest.

### O que JÁ funciona
Auth, Dashboard, Inbox/WhatsApp (conversas reais), CRM (Kanban, deals), Automações engine, Shopify sync, AI Agents, Analytics (WhatsApp, Shopify, Vendas), Settings (parcial), Forms (parcial).

### O que OUTRO Claude (A) está fazendo em paralelo
Redesign global (dark→branco/laranja), email marketing engine (Resend, Unlayer, tracking), segment builder, recovery page, onboarding. Ele trabalha na branch claude-a/redesign-email-segments.

### Seu escopo (NÃO conflitar com Claude A)
Você cuida de: flow builder com email, content hub, analytics completo, settings faltantes, inbox/chat melhorado, forms melhorado, WhatsApp visual, CRM visual, automações visual. Branch separada.

### Design (MESMO que Claude A aplica)
Klaviyo/Omnisend/Brevo style: sidebar escura, conteúdo branco, cards bg-white border-gray-200, botões brand-500 (laranja #F97316), fonte DM Sans, tabelas clean, badges padronizados.

### Repos de referência
- github.com/nobruf/shadcn-next-workflows — React Flow + custom nodes
- github.com/matheusmarques6/worder-email — Acelle: Automation2.php (flow engine), AutoTrigger.php (event→flow)
- Documento Worder-UIUX-Frontend-Guide-Completo1.docx no repo (refs K27, K28, R05, R06)

---

## SETUP INICIAL

```bash
git checkout main && git pull origin main
git checkout -b claude-b/flows-analytics-settings
```

---

## FASE 1 — MAPEAR O CÓDIGO (OBRIGATÓRIO)

```bash
echo "=== PÁGINAS ==="
find src/app -name "page.tsx" | sort

echo "=== AUTOMAÇÕES/FLOWS ==="
find src -path "*automat*" -o -path "*flow*" | grep -E "\.tsx?$" | sort

echo "=== ENGINE DE AUTOMAÇÃO ==="
grep -rn "processNode\|executeAction\|runAutomation\|triggerFlow\|action.*type\|node.*type" src/ --include="*.ts" | head -30

echo "=== ANALYTICS ==="
find src -path "*analytics*" -name "*.tsx" -o -name "*.ts" | sort

echo "=== SETTINGS ==="
find src/app -path "*settings*" -name "page.tsx" | sort

echo "=== INBOX ==="
find src -path "*inbox*" -o -path "*chat*" -o -path "*conversation*" | grep "\.tsx" | sort | head -20

echo "=== FORMS ==="
find src -path "*form*" | grep "\.tsx" | sort | head -15

echo "=== SIDEBAR ==="
cat $(find src -name "*.tsx" | xargs grep -l "sidebar\|Sidebar" 2>/dev/null | head -1) | head -100

echo "=== SUPABASE PATTERN ==="
cat $(find src/app/api -name "route.ts" | head -1) | head -40

echo "=== TABELAS USADAS ==="
grep -rn "\.from(" src/ --include="*.ts" --include="*.tsx" | sed "s/.*\.from('//" | sed "s/').*//" | sort -u
```

GUARDAR os padrões. TODO código deve seguir os mesmos padrões.

---

## FASE 2 — FLOW BUILDER COM EMAIL (ref K27, K28, R06)

### 2.1 Entender engine existente
```bash
find src -path "*automat*" -name "*.ts" | sort
grep -rn "send_email\|send_whatsapp\|type.*email\|action_type" src/ --include="*.ts" | head -20
```

### 2.2 Adicionar email como tipo de ação
Encontrar onde os tipos de ação são processados (switch/case). Adicionar:
```typescript
case 'send_email': {
  // Tentar importar sendCampaignEmail do Claude A
  // Se não existir, criar versão stub:
  try {
    const { sendCampaignEmail } = await import('@/lib/email/send-campaign-email')
    await sendCampaignEmail({ supabaseAdmin, contact, template: { html: nodeConfig.html, subject: nodeConfig.subject }, org, flowId: flow.id })
  } catch (err) {
    console.error('Email send failed in flow:', err)
    // Se lib não existe ainda (Claude A não terminou), criar stub
  }
  break
}
```

### 2.3 Melhorar visual do flow builder (ref K27)
Encontrar o flow builder visual. MELHORAR:
- Canvas: bg-gray-50 (NÃO dark)
- Nodes: bg-white border border-gray-200 rounded-lg shadow-sm p-4. Cada tipo com cor de borda:
  - Trigger: borda purple-500, ícone Zap
  - Email: borda blue-500, ícone Mail
  - WhatsApp: borda green-500, ícone MessageCircle
  - SMS: borda cyan-500, ícone Smartphone
  - Delay: borda gray-400, ícone Clock
  - Condition: borda amber-500, ícone GitBranch (2 handles YES/NO)
  - Webhook: borda indigo-500, ícone Globe
- Sidebar componentes: bg-white border-r border-gray-200, items arrastáveis em grupos
- Panel de config: bg-white border-l border-gray-200, slide-in ao clicar em node
- MiniMap, Controls, Background dots
- Se o builder usa React Flow (@xyflow): adicionar nó customizado EmailNode

Se flow builder NÃO existe visualmente (só engine): criar básico com @xyflow/react

### 2.4 Templates de flow multicanal
Encontrar onde templates de automação são definidos. Adicionar 8 que usam EMAIL:
1. Welcome Series: trigger(lista) → email → delay(2d) → email → delay(3d) → email
2. Carrinho Abandonado: trigger(checkout) → delay(1h) → condition(comprou?) → NO: email → delay(24h) → whatsapp
3. Pós-Compra: trigger(order) → email confirmação → delay(7d) → email review
4. Win-back: trigger(inativo 60d) → email → delay(7d) → email cupom → whatsapp
5. Boleto/PIX: trigger(order pending) → delay(24h) → email lembrete → delay(48h) → whatsapp
6. Review Request: trigger(order fulfilled) → delay(7d) → email "como foi?" → delay(5d) → condition → whatsapp
7. VIP Upgrade: trigger(segment VIP) → email "bem-vindo VIP" → delay(1d) → email "benefícios"
8. Browse Abandonment: trigger(viewed product) → delay(30min) → condition(added to cart?) → NO: email "vimos que gostou"

### 2.5 Conectar webhooks → flow engine
Verificar se webhook handler (Shopify ou outros) chama flow engine após eventos:
```bash
grep -rn "processEvent\|triggerFlow\|triggerAutomation" src/app/api/webhooks --include="*.ts"
```
Se não: adicionar chamada para triggerar automações em eventos relevantes.

### 2.6 Automações lista melhorada (ref K04, R05)
MELHORAR visual da página /automations:
- Cards KPI no topo: bg-white border-gray-200 (NÃO cards com background laranja grande como está agora)
- Tabela: header bg-gray-50, status badges padronizados, tipo trigger, métricas (entered, emails, conversions)
- Busca + filtros (Todas, Ativas, Pausadas, Rascunhos)
- Galeria templates: cards com thumbnail, badge canal (Email/WhatsApp/Multi), nome, descrição
- Botão "Nova Automação" brand-500

`pnpm build`

---

## FASE 3 — CONTENT HUB (ref K13, K14, K15)

### 3.1 Verificar existente
```bash
find src/app -path "*content*" -name "page.tsx" | head -10
find src/app -path "*product*" -name "page.tsx" | head -5
```

### 3.2 Criar/melhorar sub-rotas

**/content/templates** — redirect ou link para templates de email (criado pelo Claude A)

**/content/whatsapp-templates** — Se já existe página de templates WhatsApp: melhorar visual (cards brancos, badges). Se não: criar listagem REAL dos templates WhatsApp da organização no Supabase.

**/content/products** — Se /products existe: melhorar visual (tabela com imagem thumbnail, nome, preço R$, status badge, vendor). Dados REAIS. Se não: criar com SELECT products WHERE organization_id.

**/content/media** — Criar biblioteca de mídia:
- Grid de cards: thumbnail, nome, tamanho formatado, data
- Upload: input file + drag zone → Supabase Storage (se configurado) ou base64 na tabela media_files
- Botões: copiar URL, deletar
- INSERT/DELETE REAIS na tabela media_files
- Empty state: "Nenhuma mídia. Faça upload da sua primeira imagem"

**/content/coupons** — Criar CRUD de cupons:
- Tabela: código, tipo badge (% ou R$), valor, usos (X de Y), validade, status badge
- Dialog "Criar Cupom": code input, tipo select, valor input, min_purchase, max_uses, validade date picker
- INSERT/UPDATE/DELETE REAIS na tabela coupons
- Empty state: "Nenhum cupom criado"

### 3.3 Sidebar
Adicionar "Conteúdo" na sidebar com submenu: Templates Email, Templates WhatsApp, Produtos, Mídia, Cupons. Se sidebar não tem espaço, organizar em seção "CONTEÚDO" com ícone FileText.

`pnpm build`

---

## FASE 4 — ANALYTICS COMPLETO (ref K16, K17)

### 4.1 Analytics Email
Criar src/lib/analytics/email-metrics.ts:
```typescript
export async function getEmailDashboardMetrics(supabase: any, orgId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  // Queries REAIS em email_sends e email_campaigns
  // Se tabelas não existem (Claude A não terminou): try/catch, retornar zeros
  try {
    const { data: emails } = await supabase.from('email_sends').select('*').eq('organization_id', orgId).gte('created_at', since)
    const total = emails?.length || 0
    const delivered = emails?.filter((e: any) => e.delivered_at).length || 0
    const opened = emails?.filter((e: any) => e.opened_at).length || 0
    const clicked = emails?.filter((e: any) => e.clicked_at).length || 0
    const bounced = emails?.filter((e: any) => e.bounced_at).length || 0
    return {
      emailsSent: total, delivered, opened, clicked, bounced,
      openRate: delivered > 0 ? ((opened / delivered) * 100).toFixed(1) : '0',
      clickRate: delivered > 0 ? ((clicked / delivered) * 100).toFixed(1) : '0',
      bounceRate: total > 0 ? ((bounced / total) * 100).toFixed(1) : '0',
    }
  } catch { return { emailsSent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, openRate: '0', clickRate: '0', bounceRate: '0' } }
}

export async function getEmailsOverTime(supabase: any, orgId: string, days = 30) {
  // Agrupar email_sends por dia para Recharts
}

export async function getTopEmailCampaigns(supabase: any, orgId: string, limit = 5) {
  // Top campanhas por open rate
}
```

Criar/adicionar /analytics/email:
- 4 KPI cards: Emails Enviados, Open Rate, Click Rate, Bounce Rate — dados REAIS
- Gráfico Recharts: 3 linhas (sent, opened, clicked) por dia
- Top 5 campanhas tabela
- Deliverability score: 100 - bounce_rate*10
- Se tabelas vazias → 0 com empty state

### 4.2 Corrigir Shopify 403
```bash
grep -rn "shopify.*api\|403\|access_token\|SHOPIFY" src/app/api --include="*.ts" | head -20
grep -rn "shopify\|Shopify" src/app --include="*.tsx" -path "*analytics*" | head -10
```
Investigar causa do 403. Opções:
- access_token expirado → mostrar mensagem "Reconecte Shopify"
- Scopes insuficientes → adicionar scopes na reconexão
- URL errada → corrigir endpoint
Adicionar error handling graceful: try/catch + mensagem amigável em vez de banner vermelho.

### 4.3 Dashboard métricas email
Encontrar dashboard. ADICIONAR (não substituir) cards de email marketing:
- Se email_sends existe: mostrar Emails Enviados, Open Rate, Click Rate
- Se não: mostrar 0 com texto "Configure email marketing"
Verificar se Claude A já mexeu no dashboard. Se sim: não conflitar, apenas adicionar o que falta.

### 4.4 Analytics existentes (Vendas/CRM, WhatsApp, Shopify)
MELHORAR visual dos analytics que já existem:
- Cards: bg-white border-gray-200 shadow-sm (NÃO cards com backgrounds coloridos como laranja/verde)
- Gráficos: cor brand-500 como primária, gray-200 grid
- Tabelas: header bg-gray-50
NÃO mudar lógica/queries. SÓ visual.

`pnpm build`

---

## FASE 5 — SETTINGS COMPLETOS (ref K18-K25)

### 5.1 Verificar existentes
```bash
find src/app -path "*settings*" -name "page.tsx" | sort
```

### 5.2 Criar os que FALTAM

Para CADA sub-rota abaixo, verificar se existe. Se NÃO: criar com design clean (bg-white, cards, forms funcionais).

**/settings/account** — Perfil pessoal (nome, email, avatar) + Organização (nome empresa, CNPJ, endereço). Forms com save REAL no Supabase (UPDATE profiles/organizations).

**/settings/users** — Tabela organization_members REAL: avatar (iniciais), nome, email, role badge (Admin/Editor/Viewer), data. Botão "Convidar" → dialog email + role. Para MVP: INSERT organization_members ou invite via email.

**/settings/billing** — Card do plano atual (Free/Pro), barra de uso (emails enviados / limite), data renovação. Dados da organização REAIS. Para MVP: info estática + uso real.

**/settings/tracking** — Toggles: rastreamento abertura, cliques, visitantes anônimos. Inputs: Facebook Pixel ID, Google Analytics ID. Salvar em organizations.email_settings JSONB REAL.

**/settings/attribution** — Config janela atribuição: Email (select 1-7 dias, default 5), WhatsApp (1-3d), SMS (1-3d). Explicação. Salvar em organizations.email_settings REAL.

**/settings/utm** — Config UTM padrão: utm_source input, utm_medium input. Toggle auto-add. Preview de URL. Salvar REAL.

**/settings/api** — Se organization_api_keys existe: listar API keys REAIS, criar/deletar. Se não: criar tabela ou usar settings JSONB.

**/settings/security** — Toggle 2FA (placeholder com "Em breve"). Sessões ativas (placeholder). Audit log: SELECT audit_logs WHERE organization_id ORDER BY created_at DESC LIMIT 20. Se tabela existe: dados REAIS.

### 5.3 Layout de settings
Settings deve ter: submenu vertical à esquerda (bg-white border-r, items com text-gray-700, ativo com text-brand-600 border-l-2 border-brand-500) + conteúdo à direita.

`pnpm build`

---

## FASE 6 — INBOX/CHAT MELHORADO (ref R02, K11)

### 6.1 Encontrar inbox
```bash
find src -path "*inbox*" -o -path "*whatsapp/inbox*" | grep "\.tsx" | sort
```

### 6.2 Melhorar design das 3 colunas

**Coluna 1 — Lista conversas**: bg-white border-r border-gray-200
- Card conversa: px-4 py-3 hover:bg-gray-50 border-b border-gray-100 cursor-pointer
- Avatar: w-10 h-10 rounded-full bg-brand-100 text-brand-700 text-sm font-medium (iniciais)
- Nome: text-sm font-medium text-gray-900
- Preview msg: text-xs text-gray-500 truncate
- Tempo: text-xs text-gray-400
- Badge não-lida: w-2 h-2 rounded-full bg-brand-500
- Badge canal: pill pequeno (WhatsApp=bg-green-100 text-green-700, Email=bg-blue-100 text-blue-700)

**Coluna 2 — Chat**: bg-gray-50
- Header: bg-white border-b border-gray-200 px-4 py-3, nome + badges + botões
- Bolhas inbound: bg-white border border-gray-200 rounded-lg rounded-tl-none p-3 max-w-[70%] shadow-sm
- Bolhas outbound: bg-brand-50 border border-brand-100 rounded-lg rounded-tr-none p-3 max-w-[70%]
- Timestamps: text-[10px] text-gray-400 text-center my-2
- Input bar: bg-white border-t border-gray-200 p-3, textarea + botões (anexo, emoji, enviar brand-500)

**Coluna 3 — Contexto contato**: bg-white border-l border-gray-200
Se NÃO existe: CRIAR. Se existe: MELHORAR.
- Avatar grande: w-16 h-16 rounded-full bg-brand-100 text-brand-700 text-xl
- Nome: text-lg font-semibold text-gray-900
- Email, phone com ícones
- Métricas: Total Gasto (R$), Pedidos, Última compra — dados REAIS do contact
- Seção "Listas": badges das listas
- Seção "Últimos Pedidos": 3 últimos com valor
- Botão "Ver Perfil" → link para /crm/contacts/[id] ou /contacts/[id]

`pnpm build`

---

## FASE 7 — FORMS MELHORADO (ref K05-K08)

### 7.1 Verificar existente
```bash
find src -path "*form*" -name "page.tsx" | sort
```

### 7.2 Lista de forms
Melhorar visual: tabela com tipo badge (Popup/Embedded/Landing), status badge (Active/Inactive), submissions count, conversion rate %. Botão "Criar Formulário" brand-500. Empty state.

### 7.3 Editor de form (se existe, melhorar; se não, criar)
Layout 3 painéis:
- Esquerda (config): tabs Design (cores, título, subtítulo, imagem), Campos (email obrigatório + opcionais), Comportamento (trigger popup: delay/exit intent/scroll), Sucesso (mensagem)
- Centro (preview): mockup device, atualiza em tempo real
- Direita (destino): lista destino select, tag automática, trigger flow

### 7.4 Embed code
Botão "Obter Código" → modal com snippet para copiar:
- Popup: `<script src="https://worder1.vercel.app/embed/{formId}.js"></script>`
- Embedded: `<div data-worder-form="{formId}"></div>`

### 7.5 API submissions
Criar/melhorar src/app/api/forms/submit/route.ts:
POST público (sem auth). Recebe { form_id, email, name?, phone?, custom? }. Upsert contact REAL. Add to list REAL. INSERT form_submissions REAL. Retornar { success }.

`pnpm build`

---

## FASE 8 — CRM + WHATSAPP VISUAL

### 8.1 CRM Kanban (ref Klaviyo contacts)
Melhorar visual do /crm:
- Tabs: underline brand-500 no ativo (não bg-orange inteiro)
- Kanban colunas: bg-gray-50 rounded-lg
- Cards: bg-white border border-gray-200 rounded-lg shadow-sm p-3 hover:shadow-md
- Header coluna: text-sm font-semibold text-gray-700
- Botão "+ Novo Deal": brand-500
- KPIs no topo: cards bg-white border-gray-200 (NÃO texto laranja gigante como está)

### 8.2 WhatsApp Analytics (já funciona, melhorar visual)
- Cards KPI: bg-white border border-gray-200 shadow-sm (remover backgrounds coloridos dos cards)
- O card "Enviadas" com bg-brand-500 → manter SÓ esse como destaque, resto bg-white
- Gráficos: cor brand-500
- Tabela ranking: header bg-gray-50, rows clean

### 8.3 Automações página lista
Já coberto na Fase 2.6, mas confirmar que ficou com visual Klaviyo.

`pnpm build`

---

## FASE 9 — LINKS QUEBRADOS + PÁGINAS FALTANTES

### 9.1 Verificar todos os links da sidebar
```bash
# Extrair todos os links da sidebar
grep -rn "href\|to=\|push(" $(find src -name "*.tsx" | xargs grep -l "sidebar\|Sidebar" 2>/dev/null) | grep -oP "(?:href|to)=['\"]([^'\"]+)" | sort -u

# Comparar com páginas existentes
find src/app -name "page.tsx" | sort
```

### 9.2 Criar páginas faltantes
Para CADA link que não tem page.tsx correspondente:

Se é uma página real que deveria existir (ex: /email-marketing, /facebook-ads, /google-ads, /tiktok-ads):
Criar page.tsx com:
- Layout correto (bg-gray-50, dentro do dashboard layout)
- Título da página h1 text-2xl font-semibold text-gray-900
- Se é integração: card com ícone do serviço + status "Desconectado" + botão "Conectar" brand-500
- Se é funcionalidade: empty state "Em breve" com descrição + ícone
- NÃO deixar 404. TODA rota da sidebar deve ter página.

### 9.3 Verificar navegação
Clicar em cada item da sidebar mentalmente e garantir que tem página. Se /email-marketing deveria linkar para /content/templates ou para a seção de campanhas de email: ajustar o href na sidebar.

`pnpm build`

---

## FASE 10 — BUILD FINAL E PUSH

```bash
pnpm build
```

Se falhar: ler TODOS erros. Os mais comuns:
1. Import de módulo que não existe → verificar se Claude A criou, se não: criar stub
2. Tabela referenciada que não existe → adicionar try/catch
3. Tipo incompatível → ajustar interface
4. Componente de lib que não existe → verificar path

Repetir `pnpm build` até ZERO erros.

```bash
git add -A
git commit -m "feat: flows email + content hub + analytics + settings + inbox + forms + visual fixes"
git push origin claude-b/flows-analytics-settings
```

Se push falhar: `git pull --rebase origin main && git push`. NÃO PARE ATÉ O PUSH.
