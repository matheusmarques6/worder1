# CLAUDE-A-V3.md — Redesign Klaviyo + Email Funcional

## PROMPT:
```
NÃO faça perguntas. NÃO pare. Leia CLAUDE-A-V3.md e WORDER-ARCHITECTURE.md na raiz e execute TUDO. São 15 fases.
```

## CONTEXTO
Worder já tem telas criadas mas design está ERRADO — não parece Klaviyo. Precisa refazer visual de TODAS as páginas + fazer email funcionar de verdade.

Referência OBRIGATÓRIA: pesquisar screenshots da Klaviyo, Omnisend e Brevo antes de redesenhar. O design system está no WORDER-ARCHITECTURE.md.

## SETUP
```bash
git checkout main && git pull
git checkout -b v3/redesign-functional
```

## FASE 1 — MAPEAR TUDO
```bash
find src/app -name "page.tsx" | sort
find src/components -name "*.tsx" | sort | head -50
cat tailwind.config.ts
cat src/app/layout.tsx | head -30
find src -name "*.tsx" | xargs grep -l "sidebar\|Sidebar" 2>/dev/null | head -3
```

## FASE 2 — TAILWIND + FONT + GLOBALS
- DM Sans via next/font/google no layout root (se não está)
- tailwind: brand colors 50-900 (#F97316 = 500), fontFamily sans DM Sans
- globals.css: body bg-white text-gray-900
- VERIFICAR se já está. Se sim, pular.

## FASE 3 — SIDEBAR REDESIGN
A sidebar atual está ok mas precisa refinar. Abrir o componente e garantir:
- Logo: "Worder" text-white font-bold, subtitle "by Convertfy" text-gray-500 text-[10px]
- Seções: PRINCIPAL, ANALYTICS (novo nome, não FORECAST), SISTEMA
- Items: text-[13px] font-medium (não text-sm normal)
- Ativo: bg-[#35393E] text-white com border-l-[3px] border-brand-500
- Adicionar items faltantes: Contatos, Formulários, Conteúdo (ver WORDER-ARCHITECTURE.md)
- Remover duplicatas se houver
- Footer: avatar circle + nome + org name + botão collapse

## FASE 4 — DASHBOARD COMPLETO (REESCREVER)
O dashboard atual mostra "Financeiro" com RFM e métodos de pagamento. ERRADO para email marketing platform.

REESCREVER para estilo Klaviyo Home:

```
Layout:
1. Header: "Dashboard" h1 + filtro período (7d/30d/90d tabs) + botão refresh
2. Banner onboarding (se incompleto): bg-brand-50 border-brand-200 com checklist
3. Hero section: 2 cards grandes lado a lado
   Card 1: "Receita Atribuída" R$ X.XXX — bg-white border, Recharts sparkline pequeno
   Card 2: "Contatos Ativos" XXXX — bg-white border, trend %
4. Grid 4 KPI cards (bg-white border border-gray-200 p-5):
   - Emails Enviados | Taxa Abertura | WhatsApp Enviados | Pedidos
   - CADA um com: ícone 32px em circle bg-gray-100, label text-xs uppercase gray-500, value text-2xl semibold gray-900, change text-xs emerald/red
5. Gráfico principal: "Performance" — Recharts AreaChart, cor #F97316 (brand), últimos 30d
   Dados REAIS de email_sends agrupados por dia. Se vazio: linha em 0.
6. 2 colunas:
   Esquerda: "Campanhas Recentes" — tabela 5 últimas email_campaigns REAIS
   Direita: "Automações Ativas" — tabela automações com status='live'
7. "Ações Rápidas": 4 botões outline (Criar Campanha, Nova Automação, Importar Contatos, Ver Analytics)
```
TUDO Server Component com dados REAIS. try/catch se tabela não existe.

## FASE 5 — CARDS KPI EM TODAS PÁGINAS
O PROBLEMA ATUAL: cards KPI têm bg colorido (laranja, verde, etc). ERRADO.

Buscar em TODAS páginas:
```bash
grep -rn "bg-brand\|bg-orange\|bg-emerald\|bg-green\|bg-amber\|bg-blue" src/app --include="*.tsx" | grep -v "badge\|Badge\|status\|text-\|border-\|hover:" | head -30
```

Para CADA card KPI com background colorido: mudar para:
```tsx
<div className="bg-white border border-gray-200 rounded-lg p-5">
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
      <Icon className="w-5 h-5 text-gray-600" />
    </div>
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Label</p>
      <p className="text-2xl font-semibold text-gray-900">Valor</p>
    </div>
  </div>
</div>
```

Aplicar em: Dashboard, Automações, Campaigns, Analytics Email, Analytics WhatsApp, Analytics Sales, Recovery.

## FASE 6 — TABELAS EM TODAS PÁGINAS
Padronizar TODAS tabelas:
```bash
grep -rn "<table\|<Table\|<thead\|header.*bg-" src/app --include="*.tsx" | head -20
```

Pattern obrigatório:
- Container: `rounded-lg border border-gray-200 overflow-hidden`
- Header: `bg-gray-50` cells: `px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-left`
- Body row: `border-b border-gray-100 hover:bg-gray-50`
- Body cell: `px-4 py-3 text-sm text-gray-900`
- Empty: `py-16 text-center` icon + text + CTA button

Aplicar em: Campaigns, Automações, Analytics (ranking), Recovery, CRM (contatos tab), Settings.

## FASE 7 — CRM REDESIGN
CRM kanban atual:
- ❌ KPIs "R$ 0" em texto laranja gigante → mudar para cards bg-white como Fase 5
- ❌ Cards deal sem sombra → bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md
- ❌ Colunas sem visual → bg-gray-50 rounded-lg
- ❌ Tabs (Deals, Contatos, Pipelines, Integrações) com texto laranja → underline brand-500 sutil
- Manter TODA funcionalidade (drag-drop, dados reais)

## FASE 8 — AUTOMAÇÕES REDESIGN
Automações atual:
- ❌ Nome da automação NÃO APARECE na lista — corrigir para mostrar nome real
- ❌ Cards KPI sem valores — verificar query e mostrar dados reais
- Adicionar: coluna "Tipo" (trigger) e "Entradas" na tabela
- Adicionar: link "Nova Automação" → modal com galeria de templates (8 cards em grid)

## FASE 9 — ANALYTICS REDESIGN (todas)
### Analytics Email (já existe)
- Cards KPI: trocar bg colorido para bg-white border (como Fase 5)
- Score Entregabilidade: mover para card separado com gauge visual
- Manter gráfico e tabela

### Analytics WhatsApp
- Card "Enviadas" com bg-brand-500 → SÓ esse pode manter destaque. Resto: bg-white border.
- Tabs (Campanhas, Agentes IA, Qualidade): underline brand-500
- Gráfico: manter

### Analytics Sales/CRM
- Cards KPI: bg-white border (NÃO bg colorido laranja/verde)
- Corrigir "undefined deals abertos" → texto correto
- Tabela Comparativo Pipeline: header bg-gray-50

### Analytics Shopify
- CORRIGIR o erro 403: investigar e fazer error handling graceful
```bash
grep -rn "403\|Shopify API error\|shopify.*error" src/ --include="*.tsx" --include="*.ts" | head -10
```
- Se access_token expirado: mostrar card "Reconecte Shopify" com botão
- Se scopes: adicionar scopes

## FASE 10 — EMAIL FUNCIONAL
Verificar se estas libs existem e FUNCIONAM:
```bash
ls src/lib/email/*.ts 2>/dev/null
ls src/app/api/email/ 2>/dev/null
ls src/app/api/t/ 2>/dev/null
```

Se existem: testar que compilam (pnpm build). Se não existem ou estão quebradas, CRIAR:

### Envio
- src/lib/email/resend.ts (Resend SDK real)
- src/lib/email/render.ts (merge tags, tracking URLs, pixel, unsubscribe)
- src/lib/email/send-campaign-email.ts (pipeline completo)

### Tracking
- src/app/api/t/o/[id]/route.ts (open pixel GIF 1x1)
- src/app/api/t/c/[id]/route.ts (click redirect 302)
- src/app/api/unsubscribe/[id]/route.ts (unsubscribe + HTML PT-BR)
- src/app/api/webhooks/resend/route.ts (delivered/bounced/complained)

### Campaigns
- /email/campaigns → lista REAL email_campaigns
- /email/campaigns/new → wizard 4 steps FUNCIONAL (info → destinatários REAIS → template REAL → review+enviar)
- /api/email/campaigns/send → loop contacts reais, sendEmail real via Resend
- /api/email/campaigns/test → 1 email teste real

### Templates
- /email/templates → grid REAL email_templates
- /email/templates/new → form INSERT REAL
- /email/templates/[id]/edit → Unlayer editor, loadDesign/save REAIS
- Se react-email-editor não instalado: `pnpm add react-email-editor`

### Domain
- /api/email/domains → POST real para Resend API
- /settings/email → DNS records reais, botão verificar real

## FASE 11 — SEGMENTOS FUNCIONAL
Verificar /segments:
- "Criar Segmento" → deve abrir builder visual. Se não abre: criar page /segments/new com react-querybuilder
- Se react-querybuilder não instalado: `pnpm add react-querybuilder`
- "Usar este segmento" nos pré-construídos → deve criar segmento e redirect para /segments
- Resolver: src/lib/segments/resolver.ts deve traduzir conditions → Supabase query REAL

## FASE 12 — RECOVERY FUNCIONAL
A página existe mas está vazia. Garantir:
- Queries REAIS na tabela recovery_items
- Webhook Shopify (se existe) popula recovery_items quando: checkouts/create → type='cart', orders com payment_method=pix e status pending → type='pix', etc
- Botão "Enviar WhatsApp" chama API WhatsApp existente do worder1

## FASE 13 — CONTATOS (página principal faltante)
Se /contacts não existe como item principal na sidebar: CRIAR
- Lista: SELECT contacts REAL com paginação, busca, filtro consent
- KPIs: Total, Ativos, Suprimidos, Novos (7d)
- Perfil /contacts/[id]: layout 2 colunas (info + timeline com tabs)
- Import /contacts/import: upload CSV com papaparse, upsert bulk

## FASE 14 — INBOX COLUNA 3
O WhatsApp inbox funciona mas falta coluna 3 (contexto do contato):
- Ao selecionar conversa: mostrar painel direito bg-white border-l
- Avatar grande, nome, email, phone
- Métricas: Total Gasto, Pedidos, Última compra (dados REAIS do contact)
- Últimos 3 pedidos
- Listas/Segmentos do contato
- Botão "Ver Perfil Completo"

## FASE 15 — BUILD + PUSH
```bash
pnpm build
# Corrigir TODOS erros
git add -A && git commit -m "v3: complete redesign + functional email + segments + recovery"
git push origin v3/redesign-functional
```
NÃO PARE.
