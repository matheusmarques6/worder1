# CLAUDE-A-PROMPTS.md — Redesign + Email Marketing + Segments + Recovery + Onboarding

## PROMPT PARA COLAR NO CLAUDE CODE:
```
NÃO faça perguntas. NÃO peça confirmação. NÃO pare para perguntar nada. Tome todas as decisões sozinho. Se encontrar ambiguidade, escolha a opção mais razoável. Se encontrar erro, corrija e continue. Só pare quando o git push final for feito com sucesso.

Leia o arquivo CLAUDE-A-PROMPTS.md na raiz do repositório e execute ABSOLUTAMENTE TUDO que está descrito, na ordem, sem pular nenhuma tarefa. São 10 fases. Execute todas.
```

---

## CONTEXTO GERAL

### O que é o Worder
Plataforma SaaS de marketing para e-commerce brasileiro. Combina: WhatsApp, CRM, Email, Automações, Shopify, AI Agents. Online em worder1.vercel.app com 732 commits.

### Stack técnico
- Next.js 14.0.4 + React 18 + TypeScript 5
- Tailwind CSS + Radix UI (avatar, dialog, dropdown, popover, select, tabs, tooltip)
- Framer Motion + Lucide icons + Recharts
- Zustand (state management)
- Supabase (auth, database, RLS) + Upstash Redis
- @xyflow/react (flow builder) + DnD Kit
- Multi-tenant via organization_id. RLS com helper auth.organization_id() ou organization_members

### O que JÁ funciona (NÃO quebrar)
Auth, Onboarding, Dashboard, Inbox/WhatsApp (com conversas reais), CRM (Kanban, deals, pipelines), Automações, Shopify sync, AI Agents, Analytics (WhatsApp, Shopify, Vendas), Settings (parcial), Forms (parcial), 200+ API routes

### O que FALTA e você vai criar
1. Design profissional estilo Klaviyo/Omnisend/Brevo (atualmente está genérico/feio)
2. Email marketing completo (Resend + Unlayer + tracking + campaigns)
3. Segment builder visual
4. Recovery page (carrinhos, PIX, boleto)
5. Onboarding melhorado

### Referências de design
- **Klaviyo**: sidebar escura, conteúdo branco, cards limpos com border sutil, tabelas com header bg-gray-50, botões com cor accent, flow builder horizontal, KPIs com comparação de período
- **Omnisend**: muito limpo, espaçado, editor de email com library à esquerda, templates em grid, empty states educativos
- **Brevo**: moderno, tipografia forte, dashboard clean com métricas claras, forms intuitivos
- O documento Worder-UIUX-Frontend-Guide-Completo1.docx no repo tem referências K01-K32 (Klaviyo) e R01-R07 (Reportana)

### Repos de referência para código
- github.com/matheusmarques6/adtracked — Shopify webhooks (1173 linhas), tracking server-side, OAuth
- github.com/matheusmarques6/worder-email — Acelle Mail: StringHelper.php (merge tags), SendMessage.php (sending pipeline), CampaignController.php (tracking), SegmentCondition.php (conditions→SQL)
- github.com/useplunk/plunk — domain verification, sending engine, tracking endpoints

### APIs (versões atuais)
- Resend: https://resend.com/docs/api-reference/introduction (sem versionamento, sempre latest)
- Resend npm: `resend` package
- Unlayer: react-email-editor npm, docs https://docs.unlayer.com/

---

## SETUP INICIAL

```bash
git checkout main && git pull origin main
git checkout -b claude-a/redesign-email-segments

# Instalar dependências novas
pnpm add resend react-email-editor react-querybuilder @react-querybuilder/dnd
```

---

## FASE 1 — MAPEAR O CÓDIGO EXISTENTE (OBRIGATÓRIO ANTES DE TUDO)

Execute estes comandos e LEIA os resultados para entender os padrões:

```bash
echo "=== ESTRUTURA DE PÁGINAS ==="
find src/app -name "page.tsx" | sort

echo "=== COMPONENTES ==="
find src/components -name "*.tsx" | sort | head -40

echo "=== LAYOUT ROOT ==="
cat src/app/layout.tsx

echo "=== TAILWIND CONFIG ==="
cat tailwind.config.ts

echo "=== SUPABASE CLIENTS ==="
find src -name "*.ts" -path "*supabase*" | head -10
cat $(find src -name "*.ts" -path "*supabase*" -name "*.ts" | head -1)

echo "=== COMO APIS USAM SUPABASE ==="
cat $(find src/app/api -name "route.ts" | head -1) | head -40

echo "=== TABELAS EXISTENTES ==="
grep -rn "\.from(" src/ --include="*.ts" --include="*.tsx" | sed "s/.*\.from('//" | sed "s/').*//" | sort -u | head -30

echo "=== SIDEBAR ==="
find src -name "*.tsx" | xargs grep -l "sidebar\|Sidebar\|SideBar" 2>/dev/null | head -5
cat $(find src -name "*.tsx" | xargs grep -l "sidebar\|Sidebar" 2>/dev/null | head -1) | head -80

echo "=== CONTATOS SCHEMA ==="
grep -rn "contacts" src/ --include="*.sql" | head -20
grep -rn "first_name\|last_name\|email_consent\|phone\|total_spent\|total_orders" src/ --include="*.ts" --include="*.tsx" --include="*.sql" | head -20

echo "=== AUTH PATTERN ==="
grep -rn "getUser\|auth\.\|organization_id\|org_id" src/app/api --include="*.ts" | head -20
```

**Guardar mentalmente os padrões encontrados.** TODO código que você criar DEVE seguir os mesmos padrões de:
- Como o Supabase client é criado/importado
- Como organization_id é obtido nas API routes
- Como RLS funciona
- Nomes reais das tabelas e colunas
- Estrutura de pastas das pages

---

## FASE 2 — REDESIGN GLOBAL (Klaviyo/Omnisend/Brevo style)

### 2.1 Instalar DM Sans

No src/app/layout.tsx (ou o arquivo root layout encontrado):
```tsx
import { DM_Sans } from 'next/font/google'
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
```
Aplicar `dmSans.className` no `<body>`. MANTER todas as classes existentes no body, SÓ ADICIONAR a fonte.

### 2.2 Atualizar tailwind.config.ts

NÃO deletar o config existente. ADICIONAR ao extend.colors:
```typescript
brand: {
  50: '#FFF7ED',
  100: '#FFEDD5',
  200: '#FED7AA',
  300: '#FDBA74',
  400: '#FB923C',
  500: '#F97316',
  600: '#EA580C',
  700: '#C2410C',
  800: '#9A3412',
  900: '#7C2D12',
},
```

No extend.fontFamily:
```typescript
sans: ['"DM Sans"', 'system-ui', '-apple-system', 'sans-serif'],
```

MANTER todas as animations, keyframes, plugins, e cores existentes (orange, gold, etc podem coexistir).

### 2.3 Mudar backgrounds de conteúdo (NÃO sidebar)

```bash
grep -rn "bg-dark\|bg-gray-900\|bg-gray-800\|bg-\[#0\|bg-\[#1[^A8]\|bg-\[#2" src/ --include="*.tsx" --include="*.ts" -l | sort -u
```

Para CADA arquivo encontrado, abrir e substituir no CONTEXTO CORRETO:
- **Cards/containers de conteúdo**: bg-dark* → `bg-white border border-gray-200 shadow-sm rounded-lg`
- **Background de página**: bg-dark* → `bg-gray-50` ou `bg-white`
- **Texto principal**: text-white (em conteúdo) → `text-gray-900`
- **Texto secundário**: text-gray-400 (em conteúdo) → `text-gray-500`
- **Bordas**: border-gray-700 → `border-gray-200`
- **Hover de rows**: hover:bg-gray-800 → `hover:bg-gray-50`
- **Inputs**: bg-dark* → `bg-white border-gray-300`
- **Dropdowns/selects**: bg-dark* → `bg-white border border-gray-200 shadow-lg`

**EXCEÇÕES — NÃO MUDAR:**
- Sidebar → MANTER escura
- Tooltips → podem ficar escuros
- Modal backdrop → bg-black/50 ok
- Toast notifications → manter como estão

### 2.4 Padronizar botões globalmente

Se existe componente Button reutilizável, atualizar variants. Se não, padronizar em cada página:
```
Primary:     bg-brand-500 hover:bg-brand-600 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors
Secondary:   bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 font-medium rounded-lg px-4 py-2 text-sm
Ghost:       text-gray-600 hover:bg-gray-100 rounded-lg px-3 py-2 text-sm
Destructive: bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm
```

### 2.5 Padronizar tabelas

TODAS as tabelas no app:
```
Container: bg-white rounded-lg border border-gray-200 overflow-hidden
Header:    bg-gray-50 px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-left
Row:       border-b border-gray-100 hover:bg-gray-50 transition-colors
Cell:      px-6 py-4 text-sm text-gray-900
Empty:     p-12 text-center — ícone cinza 48px + título text-gray-600 + descrição text-gray-400 + botão CTA brand-500
```

### 2.6 Padronizar badges de status

```
Active/Live/Verified:  bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 text-xs font-medium
Draft/Pending:         bg-gray-100 text-gray-600 border border-gray-200
Scheduled/Warning:     bg-amber-50 text-amber-700 border border-amber-200
Failed/Error/Bounced:  bg-red-50 text-red-700 border border-red-200
Sending/Processing:    bg-orange-50 text-orange-700 border border-orange-200
```

### 2.7 Padronizar inputs/forms

```
Label:     text-sm font-medium text-gray-700 mb-1.5
Input:     bg-white border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none
Select:    mesma estilização
Textarea:  mesma estilização
Toggle on: bg-brand-500
Checkbox:  checked:bg-brand-500
Error:     border-red-500 + <p className="mt-1 text-sm text-red-600">mensagem</p>
```

### 2.8 Padronizar metric cards

```
Container: bg-white border border-gray-200 rounded-lg p-6 shadow-sm
Icon:      w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center p-2
Label:     text-sm font-medium text-gray-500 mt-3
Value:     text-2xl font-bold text-gray-900 mt-1
Change:    text-xs mt-1 (text-emerald-600 se positivo com ↑, text-red-500 se negativo com ↓)
```

### 2.9 Dashboard Klaviyo-style (ref K02)

REESCREVER o dashboard principal. Novo layout:

1. **Hero card** (1 card grande): `bg-gradient-to-r from-gray-900 to-gray-800` com:
   - Receita Líquida ou métrica principal grande text-white text-3xl font-bold
   - Comparação vs período anterior (% verde/vermelho)
   - Mini sparkline se possível
   - Dados REAIS: buscar da tabela de orders/analytics existente

2. **6 KPI cards** em grid (grid-cols-6 em desktop, grid-cols-2 mobile):
   - Receita Líquida, Pedidos, Ticket Médio, Contatos Ativos, Emails Enviados, WhatsApp Enviados
   - Dados REAIS do Supabase. Se vazio → 0

3. **Gráfico principal** (Recharts AreaChart): performance últimos 30d
   - Cor brand-500 para área/linha
   - Grid gray-200, tooltip bg-white border shadow
   - Dados REAIS: agrupar por dia

4. **2 colunas** (grid-cols-2):
   - Esquerda: "Campanhas Recentes" — tabela com dados REAIS (email_campaigns se existir, senão placeholder)
   - Direita: "Automações Ativas" — tabela com dados REAIS das automações

5. **Métodos de pagamento** (se dados existem): cards Cartão, PIX, Boleto, Outros com valores reais

6. **Ações Rápidas**: 4 botões (Criar Campanha, Criar Automação, Importar Contatos, Ver Analytics)

Server Component. Buscar dados REAIS do Supabase. Cada query com try/catch para não quebrar se tabela não existe.

### 2.10 Login/Signup

Se existem (provavelmente /signup e /login):
```
Background: bg-gray-50
Card central: bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-md mx-auto
Logo: "Worder" text-2xl font-bold text-gray-900
Inputs: como padronizado acima
Botão: w-full bg-brand-500 hover:bg-brand-600 text-white rounded-lg py-2.5 text-sm font-medium
Links: text-brand-600 hover:text-brand-700 text-sm
```

### 2.11 Sidebar

Verificar se sidebar já está escura. Se sim: apenas refinar. Se não: mudar para:
```
Container: w-60 bg-[#1A1D21] h-screen fixed
Logo: px-5 py-5 "Worder" text-lg font-bold text-white
Items inativo: text-gray-400 hover:text-gray-200 hover:bg-[#2C3035] rounded-lg mx-2 px-4 py-2.5 text-sm
Item ATIVO: bg-[#35393E] text-white border-l-[3px] border-brand-500
Submenus: ml-8 text-[13px] text-gray-500 hover:text-gray-300
Separadores: h-px bg-gray-700/50 mx-4 my-2
Footer: avatar bg-brand-100 text-brand-700 + nome text-gray-300 + email text-gray-500
```

`pnpm build` — corrigir todos erros antes de continuar.

---

## FASE 3 — EMAIL SENDING ENGINE (Resend)

### 3.1 src/lib/email/resend.ts
```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendEmail(params: {
  to: string; from: string; senderName: string; subject: string; html: string; replyTo?: string
}) {
  try {
    const { data, error } = await resend.emails.send({
      from: `${params.senderName} <${params.from}>`,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      reply_to: params.replyTo,
    })
    if (error) return { error: error.message }
    return { id: data?.id }
  } catch (err: any) {
    return { error: err.message || 'Send failed' }
  }
}
```

### 3.2 src/lib/email/merge-tags.ts
```typescript
export const mergeTags = {
  first_name: { name: 'Nome', value: '{{first_name}}', sample: 'João' },
  last_name: { name: 'Sobrenome', value: '{{last_name}}', sample: 'Silva' },
  email: { name: 'Email', value: '{{email}}', sample: 'joao@email.com' },
  phone: { name: 'Telefone', value: '{{phone}}', sample: '(11) 99999-9999' },
  store_name: { name: 'Nome da Loja', value: '{{store_name}}', sample: 'Minha Loja' },
  order_number: { name: 'Nº Pedido', value: '{{order_number}}', sample: '#1234' },
  order_total: { name: 'Total Pedido', value: '{{order_total}}', sample: 'R$ 199,90' },
  cart_total: { name: 'Total Carrinho', value: '{{cart_total}}', sample: 'R$ 299,90' },
  cart_url: { name: 'Link Carrinho', value: '{{cart_url}}', sample: 'https://loja.com/cart' },
  product_name: { name: 'Produto', value: '{{product_name}}', sample: 'Camiseta Premium' },
  product_price: { name: 'Preço', value: '{{product_price}}', sample: 'R$ 89,90' },
  product_url: { name: 'Link Produto', value: '{{product_url}}', sample: 'https://loja.com/produto' },
}
```

### 3.3 src/lib/email/render.ts
Implementar funções completas:
- `renderMergeTags(html, data)` — regex `{{tag}}` e `{{tag|fallback}}`
- `rewriteUrlsForTracking(html, emailSendId, baseUrl)` — todo href → `/api/t/c/{id}?url=encoded`. Ignorar mailto: e #
- `injectOpenPixel(html, emailSendId, baseUrl)` — img 1x1 antes `</body>`
- `addUnsubscribeLink(html, emailSendId, baseUrl)` — link PT-BR antes `</body>` se não existe
- `prepareEmailHtml(html, contact, org, emailSendId, baseUrl)` — pipeline completo

### 3.4 src/lib/email/send-campaign-email.ts
Pipeline: criar email_send row → prepareEmailHtml → sendEmail via Resend → update status.
Usar o MESMO padrão de Supabase admin client que o worder1 usa nas API routes.

`pnpm build`

---

## FASE 4 — TRACKING ENDPOINTS

### 4.1 Open pixel — src/app/api/t/o/[id]/route.ts
```typescript
import { NextRequest } from 'next/server'
// Importar supabase admin seguindo padrão do worder1

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Buscar email_send por id, se opened_at null → UPDATE opened_at = new Date().toISOString()
  } catch {}
  return new Response(PIXEL, {
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store,no-cache,must-revalidate' }
  })
}
```

### 4.2 Click redirect — src/app/api/t/c/[id]/route.ts
Buscar email_send → UPDATE clicked_at → `NextResponse.redirect(decodedUrl, 302)`

### 4.3 Unsubscribe — src/app/api/unsubscribe/[id]/route.ts
Buscar email_send → contact_id → UPDATE contacts email_consent → HTML PT-BR "Descadastrado"
VERIFICAR o nome real da coluna de consent:
```bash
grep -rn "consent\|opt_in\|marketing\|subscrib" src/ --include="*.ts" --include="*.tsx" --include="*.sql" | head -20
```

### 4.4 Resend webhooks — src/app/api/webhooks/resend/route.ts
POST público. Switch tipo: email.delivered, email.bounced, email.complained → UPDATE email_sends e contacts

### 4.5 Domain verification
- src/app/api/email/domains/route.ts — POST cria domínio real na Resend API, retorna DNS records
- src/app/api/email/domains/verify/route.ts — POST verifica domínio real

`pnpm build`

---

## FASE 5 — UNLAYER EMAIL EDITOR

### 5.1 Componente editor
Criar src/components/email/email-editor.tsx:
```typescript
'use client'
import { useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { mergeTags } from '@/lib/email/merge-tags'

const EmailEditorComponent = dynamic(() => import('react-email-editor'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full"><p className="text-gray-500">Carregando editor...</p></div>
})

interface Props {
  designJson?: Record<string, unknown>
  onSave: (html: string, json: Record<string, unknown>) => void
  onBack?: () => void
  title?: string
}

export default function UnlayerEditor({ designJson, onSave, onBack, title }: Props) {
  const editorRef = useRef<any>(null)
  const onReady = useCallback(() => {
    if (designJson && editorRef.current?.editor) editorRef.current.editor.loadDesign(designJson)
  }, [designJson])

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          {onBack && <button onClick={onBack} className="text-gray-500 hover:text-gray-700 text-sm">← Voltar</button>}
          {title && <h1 className="text-lg font-semibold text-gray-900">{title}</h1>}
        </div>
        <button onClick={() => editorRef.current?.editor?.exportHtml((d: any) => onSave(d.html, d.design))} className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
          Salvar Template
        </button>
      </div>
      <div className="flex-1">
        <EmailEditorComponent ref={editorRef} onReady={onReady} options={{
          mergeTags: Object.fromEntries(Object.entries(mergeTags).map(([k, v]) => [k, { name: v.name, value: v.value }])),
          locale: 'pt-BR',
          appearance: { theme: 'modern_light' },
        }} />
      </div>
    </div>
  )
}
```

---

## FASE 6 — PÁGINAS DE EMAIL (Templates + Campaigns)

### 6.1 Templates (design ref Klaviyo K13)
Encontrar onde faz sentido no router existente. Criar:

**Lista** — Server Component. SELECT email_templates WHERE organization_id REAL. Grid 3 colunas. Cards: thumbnail placeholder cinza h-48, nome text-sm font-medium, badge categoria, botões hover. Filtro, busca, botão "Criar Template" brand-500. Empty state PT-BR.

**New** — Form: nome input, categoria select. INSERT email_templates REAL no Supabase. Redirect edit.

**Edit** — 'use client'. Buscar template REAL. UnlayerEditor fullscreen. loadDesign do design_json. onSave: UPDATE email_templates SET design_json, html. Header com Voltar + nome + botão Teste + botão Salvar.

### 6.2 Campaigns (design ref Klaviyo K03)

**Lista** — Server Component. SELECT email_campaigns REAL. Tabela com 4 KPI cards no topo (Total, Enviadas, Open Rate Médio, Click Rate Médio). Tabela: nome, status badge, data, enviados, abertos%, clicados%. Botão "Nova Campanha" brand-500. Empty state.

**Wizard New** — 4 steps com progress indicator (círculos 1-2-3-4):
- Step 1: nome + tags
- Step 2: destinatários — SELECT listas/segmentos REAIS do worder1 (verificar como armazena). Mostrar contagem REAL.
- Step 3: template (SELECT email_templates REAIS), subject, preview text, sender name/email. Botão "Enviar teste" → POST /api/email/campaigns/test
- Step 4: review resumo + botões "Enviar Agora" (brand-500, confirm dialog) + "Agendar" (date+time picker)
INSERT email_campaigns REAL.

**Relatório [id]** — Server Component. SELECT email_sends WHERE campaign_id REAL. 6 metric cards (Enviados, Entregues, Abertos%, Clicados%, Bounced%, Unsubscribed). Gráfico opens/clicks ao longo do tempo Recharts. Tabela recipients com dados REAIS.

### 6.3 APIs de Campaign
- src/app/api/email/campaigns/send/route.ts — POST {campaignId}. Buscar campaign+template+org. Resolver contacts (consent ativo). Loop sendCampaignEmail para cada. UPDATE campaign stats.
- src/app/api/email/campaigns/test/route.ts — POST {campaignId, testEmail}. Render com dados exemplo. Enviar 1 email REAL via Resend.

### 6.4 Settings Email (ref K20)
Adicionar em /settings (ou criar sub-rota): seção domínio (input + botão adicionar + tabela DNS records com copiar + botão verificar) + seção sender config (sender_name, sender_email, reply_to → salvar na organização)

`pnpm build`

---

## FASE 7 — SEGMENT BUILDER VISUAL

### 7.1 Component
Criar src/components/segments/segment-builder.tsx ('use client'):
- react-querybuilder com visual CUSTOMIZADO (NÃO usar estilo default)
- Renderizar selects/inputs com os componentes do projeto (Radix ou custom)
- Fields baseados nas colunas REAIS da tabela contacts do worder1
- Operators: equals, not_equals, contains, greater_than, less_than, between, is_set, is_not_set, in_last_days
- AND/OR combinator toggle
- onChange emite conditions JSON

### 7.2 Preview
Criar src/components/segments/segment-preview.tsx ('use client'):
- Recebe conditions → chama API count → mostra "X contatos" + 5 sample contacts REAIS
- Loading skeleton enquanto calcula

### 7.3 Resolver
Criar src/lib/segments/resolver.ts:
- resolveSegment(supabaseAdmin, segmentId, orgId) → contact_ids
- countSegmentByConditions(supabaseAdmin, conditions, orgId) → number
- Traduzir conditions JSON → Supabase filters (.eq, .neq, .gt, .lt, .ilike, .is, .gte para dates)

### 7.4 API
- src/app/api/segments/route.ts — CRUD de segments (GET lista, POST criar)
- src/app/api/segments/count/route.ts — POST {conditions} → retorna count REAL
- src/app/api/segments/[id]/route.ts — GET, PUT, DELETE

### 7.5 Páginas
**Lista** — tabela segmentos REAIS + seção "Prontos para usar" com 8 cards pré-construídos
**New** — nome + descrição + builder + preview contagem tempo real + botão Criar → INSERT REAL

### 7.6 Pré-construídos
8 segmentos como JSON: Engajados (30d), Não Engajados (90d), Recorrentes (2+ orders), Novos (7d), Nunca Comprou, Churn Risk (60d), VIP (>R$500 spent), Cart Abandoners

Adicionar "Segmentos" na sidebar se não existir.

`pnpm build`

---

## FASE 8 — RECOVERY PAGE (ref Reportana R03, R04)

Criar /recovery:

**Header**: "Recuperação de Vendas" h1, subtitle "Carrinhos, PIX, boletos e cartões"

**4 KPI cards** no topo (dados REAIS da tabela recovery_items):
- Pendentes: COUNT WHERE status='pending'
- Recuperados (mês): COUNT WHERE status='recovered' AND recovered_at este mês
- Taxa Recuperação: recovered / total %
- Receita Recuperada: SUM recovery_revenue

**4 Tabs** (shadcn Tabs):
- **Carrinhos** (?tab=cart): SELECT recovery_items WHERE type='cart'. Tabela: nome contato, email, valor R$, itens, tempo desde abandono (relativo), status badge, ações
- **PIX** (?tab=pix): type='pix'. Tabela: nome, pedido#, valor, expiração, status, ações
- **Boleto** (?tab=boleto): type='boleto'. Tabela similar
- **Cartão** (?tab=card): type='card_declined'. Tabela com motivo recusa

Cada tab: dados REAIS. Se vazio → empty state PT-BR. Status badges padronizados.

Ações: botão "Enviar WhatsApp" (se API WhatsApp existe, chamar endpoint existente), "Ver pedido"

Adicionar "Recuperação" na sidebar com ícone RefreshCcw.

`pnpm build`

---

## FASE 9 — ONBOARDING + CONTATOS MELHORADOS

### 9.1 Onboarding (ref K01)
Verificar /onboarding existente. Melhorar visual e completar 6 steps:
1. Conectar Shopify (input domínio + botão OAuth existente)
2. Instalar pixel (código para copiar)
3. Conectar WhatsApp (campos da config WhatsApp existente)
4. Importar contatos (upload CSV funcional com papaparse)
5. Criar formulário (link para /forms)
6. Ativar automação (selecionar template existente)

Design: bg-gray-50, card central branco, progress bar com dots (brand-500 ativo, gray-300 futuro, check verde completo).
Salvar progresso: UPDATE organizations SET onboarding_status = JSON com step e complete.
Dashboard mostra banner "Complete seu setup" se incompleto.

### 9.2 Contatos melhorados (ref K10, K11, K12)

**Lista**: MELHORAR visual — KPIs no topo (total, ativos, suprimidos), avatares na tabela (iniciais em círculo bg-brand-100), badge consent. Dados REAIS.

**Perfil [id]**: MELHORAR — layout 2 colunas (1/3 info card + 2/3 tabs). Info: avatar grande, nome, email, phone, cidade, tags, consent badge. Tabs: Timeline (ícones coloridos por tipo evento), Emails (email_sends do contact), Pedidos, Listas. Dados REAIS.

`pnpm build`

---

## FASE 10 — BUILD FINAL E PUSH

```bash
pnpm build
```

Se falhar: ler TODOS erros, corrigir, repetir até ZERO erros.

```bash
git add -A
git commit -m "feat: complete redesign + email marketing + segments + recovery + onboarding"
git push origin claude-a/redesign-email-segments
```

Se push falhar: `git pull --rebase origin main && git push`. NÃO PARE ATÉ O PUSH.
