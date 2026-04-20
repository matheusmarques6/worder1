# AUTORUN-FLOW-BUILDER-V2.md
# Prompt de Execução Definitivo — Flow Builder Completo da Worder

```
═══════════════════════════════════════════════════════════════════
MODO: AUTORUN
Branch: claude/merge-branches-unified-0aI2u
NÃO PARE. NÃO PERGUNTE. Execute tarefa por tarefa.
LER CADA ARQUIVO ANTES DE MODIFICAR. grep ANTES de editar.
pnpm build APÓS CADA TAREFA.
ZERO mock data. ZERO emoji no UI. ZERO any no TypeScript.
ZERO gradientes. ZERO neon. Design profissional limpo.
═══════════════════════════════════════════════════════════════════
```

## DOCUMENTO DE REFERÊNCIA OBRIGATÓRIO

Este prompt é a parte executável do documento completo:
`WORDER-FLOW-BUILDER-COMPLETO.md`

Leia esse documento ANTES de começar para entender:
- Todas as funcionalidades da Klaviyo e Omnisend que servem de referência
- O design system completo (cores, ícones, layout)
- As integrações com Shopify, Email e CDP
- Os erros comuns de IA a evitar

---

## STEP 0 — VERIFICAÇÃO DO ESTADO ATUAL

Executar TODOS os comandos abaixo e LER os resultados. NÃO pular.

```bash
cd /path/to/worder1
git checkout claude/merge-branches-unified-0aI2u && git pull

echo "══════════════════════════════════════"
echo "FLOW BUILDER COMPONENTS"
echo "══════════════════════════════════════"
find src/components/flow-builder -name "*.tsx" | sort
wc -l src/components/flow-builder/*.tsx src/components/flow-builder/nodes/*.tsx src/components/flow-builder/panels/*.tsx src/components/flow-builder/edges/*.tsx 2>/dev/null

echo "══════════════════════════════════════"
echo "STORES & TYPES"
echo "══════════════════════════════════════"
cat src/stores/flowStore.ts | head -80
cat src/types/flow-builder.ts | head -100

echo "══════════════════════════════════════"
echo "SIDEBAR — TIPOS DE NODES ATUAIS"
echo "══════════════════════════════════════"
grep -n "type:\|label:\|icon:" src/components/flow-builder/Sidebar.tsx | head -60

echo "══════════════════════════════════════"
echo "PROPERTIES PANEL — TAMANHO E CONFIGS"
echo "══════════════════════════════════════"
wc -l src/components/flow-builder/panels/PropertiesPanel.tsx
grep -n "function.*Config\|EmailActionConfig\|DelayConfig\|ConditionConfig" src/components/flow-builder/panels/PropertiesPanel.tsx

echo "══════════════════════════════════════"
echo "EXECUTION ENGINE"
echo "══════════════════════════════════════"
wc -l src/lib/automation/execution-engine.ts src/lib/automation/node-executors.ts src/lib/automation/event-processor.ts src/lib/automation/variable-engine.ts 2>/dev/null
grep -n "export.*function\|async function" src/lib/automation/event-processor.ts | head -10

echo "══════════════════════════════════════"
echo "APIs DE AUTOMAÇÃO"
echo "══════════════════════════════════════"
find src/app/api -path "*automat*" -o -path "*worker*" -o -path "*track*" -o -path "*webhook*" 2>/dev/null | grep route.ts | sort

echo "══════════════════════════════════════"
echo "DARK MODE HARDCODED?"
echo "══════════════════════════════════════"
grep -rn "bg-gray-9\|bg-\[#1\|bg-\[#2\|bg-black\|bg-slate-9\|dark:" src/components/flow-builder/ | head -30

echo "══════════════════════════════════════"
echo "EMAIL TEMPLATES API"
echo "══════════════════════════════════════"
cat src/app/api/email/templates/route.ts 2>/dev/null | head -40

echo "══════════════════════════════════════"
echo "SHOPIFY WEBHOOK HANDLER"
echo "══════════════════════════════════════"
grep -n "processEvent\|event-processor\|automation" src/app/api/webhooks/shopify/route.ts 2>/dev/null | head -10

echo "══════════════════════════════════════"
echo "TRACK EVENT API"
echo "══════════════════════════════════════"
grep -n "processEvent\|event-processor\|automation" src/app/api/track/event/route.ts 2>/dev/null | head -10

echo "══════════════════════════════════════"
echo "MIGRATION SQL"
echo "══════════════════════════════════════"
ls -la supabase/migrations/*flow* supabase/migrations/*automat* supabase/migrations/*event* 2>/dev/null

echo "══════════════════════════════════════"
echo "NODE MODULES — REACT FLOW INSTALADO?"
echo "══════════════════════════════════════"
grep "@xyflow/react" package.json

echo "══════════════════════════════════════"
echo "PAGES"
echo "══════════════════════════════════════"
ls -la src/app/\(dashboard\)/automations/ 2>/dev/null
```

Agora que leu TUDO, prossiga com as tarefas.

---

## FASE 1 — LIGHT MODE + DESIGN SYSTEM PROFISSIONAL

### Tarefa 1A: Converter Canvas para Light Mode

O canvas está com cores dark hardcoded. Converter TUDO para light.

```bash
# Antes de editar, verificar quais cores existem:
grep -rn "bg-gray-9\|bg-\[#1\|bg-\[#2\|bg-black\|bg-slate-9\|bg-zinc-9\|text-white\|text-gray-1\|text-gray-2\|text-gray-3\|border-gray-7\|border-gray-8" src/components/flow-builder/ | head -50
```

**Regras de substituição:**
```
bg-gray-900, bg-[#1a1a2e], bg-black       → bg-gray-50 (canvas)
bg-gray-800, bg-[#16213e], bg-slate-800    → bg-white (nodes, sidebar, panels)
bg-gray-700, bg-slate-700                  → bg-gray-100 (hover states)
text-white, text-gray-100                  → text-gray-900 (text principal)
text-gray-300, text-gray-400               → text-gray-600 (text secundário)
border-gray-700, border-gray-600           → border-gray-200 (borders)
```

**Canvas específicamente:**
- Background do ReactFlow: `bg-gray-50`
- Background pattern/grid: `color: '#e5e7eb'` (gray-200) com gap 20
- Minimap: `bg-white border border-gray-200 rounded-lg shadow-sm`

**Nodes:**
- Fundo: `bg-white`
- Borda: `border border-gray-200`
- Shadow: `shadow-sm`
- Borda esquerda colorida: 4px por tipo (ver design system no doc completo)
- Texto: `text-gray-900` (principal), `text-gray-500` (secundário)
- Hover: `hover:shadow-md transition-shadow`
- Selected: `ring-2 ring-blue-500 ring-offset-2`

**Sidebar:**
- Fundo: `bg-white`
- Border direita: `border-r border-gray-200`
- Seções: `text-xs font-semibold text-gray-500 uppercase tracking-wider`
- Blocos arrastáveis: `bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 cursor-grab`

**Properties Panel:**
- Fundo: `bg-white`
- Border esquerda: `border-l border-gray-200`
- Seções: títulos em `text-sm font-medium text-gray-700`
- Inputs: `border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md`

**Header:**
- Fundo: `bg-white`
- Border bottom: `border-b border-gray-200`
- Botões: `bg-blue-600 text-white` (primário), `bg-white border border-gray-300 text-gray-700` (secundário)

Depois de cada substituição:
```bash
pnpm build
```

### Tarefa 1B: Ícones Lucide (Zero Emoji)

```bash
# Verificar se há emojis no flow builder:
grep -rn "emoji\|📧\|📱\|⏰\|🔀\|🔔\|📊\|✉\|💬\|🛒\|👤\|🏷\|📋" src/components/flow-builder/ | head -20
```

Se houver emojis, substituir por ícones Lucide React correspondentes:

```typescript
import {
  ShoppingCart, CreditCard, Package, Truck, XCircle, Eye, PlusCircle,
  FileText, UserPlus, Users, Calendar, Zap, Webhook,
  Mail, MessageCircle, Smartphone, Send, Bell,
  Clock, GitBranch, Shuffle,
  UserCog, Tag, List, ArrowRight,
} from 'lucide-react';
```

Mapeamento completo:
```
Carrinho Abandonado    → ShoppingCart
Checkout Abandonado    → CreditCard
Pedido Realizado       → Package
Pedido Enviado         → Truck
Pedido Cancelado       → XCircle
Produto Visualizado    → Eye
Produto Adicionado     → PlusCircle
Formulário Enviado     → FileText
Contato Criado         → UserPlus
Segmento               → Users
Data/Aniversário       → Calendar
Evento Customizado     → Zap
Webhook Recebido       → Webhook
Enviar Email           → Mail
Enviar WhatsApp        → MessageCircle
Enviar SMS             → Smartphone
Enviar Webhook         → Send
Notificação Interna    → Bell
Delay                  → Clock
Condição/Split         → GitBranch
Teste A/B              → Shuffle
Atualizar Contato      → UserCog
Tag                    → Tag
Lista                  → List
Mover Deal             → ArrowRight
```

```bash
pnpm build
```

### Tarefa 1C: Reorganizar Sidebar

A sidebar deve ter estas seções colapsáveis na ordem:

```
GATILHO (apenas 1 permitido por flow)
├── Todos os triggers listados acima

AÇÃO
├── Enviar E-mail
├── Enviar WhatsApp
├── Enviar SMS
├── Enviar Webhook
├── Notificação Interna

LÓGICA
├── Atraso/Delay
├── Condição (Split)
├── Teste A/B

DADOS
├── Atualizar Contato
├── Adicionar Tag
├── Remover Tag
├── Adicionar à Lista
├── Remover da Lista
├── Mover Deal

Campo de busca no topo que filtra por nome.
```

**Cada bloco deve mostrar:**
- Ícone Lucide (24x24) à esquerda
- Nome do bloco
- `draggable={true}` com `onDragStart` setando `dataTransfer.setData('application/reactflow', nodeType)`
- `cursor-grab` no bloco, `cursor-grabbing` no drag

**Seções colapsáveis:**
- Ícone de chevron (ChevronDown/ChevronUp) à direita do título
- Animação suave de expand/collapse (height transition)
- Estado salvo em localStorage

```bash
pnpm build
# Testar: arrastar cada tipo de bloco para o canvas
```

---

## FASE 2 — PROPERTIES PANEL COMPLETO

### Tarefa 2A: Trigger Configuration Panel

Quando o node de trigger é clicado, o Properties Panel DEVE mostrar:

**Seção 1: Informações Básicas**
- Nome do Nó (input text)
- Descrição (textarea, opcional)
- Tipo do trigger (read-only badge)

**Seção 2: Trigger Filters (até 5)**
- Baseados nos dados do EVENTO (ex: cart_value > 100)
- Botão "+ Adicionar Filtro"
- Cada filtro: [Campo (dropdown)] [Operador (dropdown)] [Valor (input)]
- Campos disponíveis dependem do trigger_type:
  - `abandoned_cart`: cart_value, item_count, product_names, currency
  - `placed_order`: order_value, discount_code, payment_method, item_count
  - `viewed_product`: product_name, product_price, product_category, brand
  - `form_submitted`: form_name, source
  - `contact_created`: source, tags
- Botão de remover filtro (X)

**Seção 3: Audience Filters (perfil do contato)**
- Baseados nas propriedades do CONTATO
- Campos: email, first_name, last_name, phone, city, state, country, tags, lifecycle_stage, total_orders, total_spent, aov, last_order_at, created_at, custom properties
- Mesma UI de filtros (campo, operador, valor)

**Seção 4: Exit Conditions (até 4)**
- Condições que CANCELAM o flow mid-execution
- Tipo de condição: Evento ocorreu (ex: "Placed Order")
- Ou: Propriedade mudou (ex: "lifecycle_stage = churned")
- Verificadas CONTINUAMENTE enquanto contato está no flow

**Seção 5: Frequency**
- Radio: "Uma vez por contato" / "A cada X [horas/dias]" / "Sem limite"
- Input numérico + dropdown de unidade

**Seção 6: Teste de Trigger**
- Botão "Testar Trigger"
- Mostra últimos 10 eventos que teriam disparado (query em contact_events)

**Operadores disponíveis (TODOS os tipos de filtro):**
```typescript
const OPERATORS = [
  { value: 'equals', label: 'Igual a' },
  { value: 'not_equals', label: 'Diferente de' },
  { value: 'greater_than', label: 'Maior que' },
  { value: 'less_than', label: 'Menor que' },
  { value: 'greater_or_equal', label: 'Maior ou igual a' },
  { value: 'less_or_equal', label: 'Menor ou igual a' },
  { value: 'contains', label: 'Contém' },
  { value: 'not_contains', label: 'Não contém' },
  { value: 'starts_with', label: 'Começa com' },
  { value: 'ends_with', label: 'Termina com' },
  { value: 'is_set', label: 'Está definido' },
  { value: 'is_not_set', label: 'Não está definido' },
  { value: 'in_list', label: 'Está na lista' },
  { value: 'not_in_list', label: 'Não está na lista' },
  { value: 'before_date', label: 'Antes de' },
  { value: 'after_date', label: 'Depois de' },
  { value: 'in_last_x_days', label: 'Nos últimos X dias' },
  { value: 'not_in_last_x_days', label: 'Fora dos últimos X dias' },
  { value: 'between', label: 'Entre' },
  { value: 'regex', label: 'Regex' },
];
```

Todos esses dados salvam em `node.data.config` no flowStore (Zustand).

```bash
pnpm build
```

### Tarefa 2B: Email Action Configuration

Quando um node "Enviar E-mail" é clicado:

**Seção 1: Informações Básicas**
- Nome do Nó
- Descrição

**Seção 2: Template de Email**
```typescript
// Dropdown com opções:
// 1. "Nenhum (usar HTML abaixo)" → mostra textarea HTML
// 2. Templates da loja atual (filtrados por store_id)
// 3. "Criar Novo Template" → navega para /email-editor?flowId=X&nodeId=Y

// Fetch templates filtrados:
const fetchTemplates = async () => {
  const storeId = flowStore.getState().automationConfig?.storeId;
  const res = await fetch(`/api/email/templates${storeId ? `?storeId=${storeId}` : ''}`);
  return res.json();
};
```

- Preview thumbnail do template (se selecionado)
- Botão "Editar Template" → abre editor com template carregado
- Botão "Personalizar" → abre editor inline

**Seção 3: Configurações do Email**
- **Assunto**: Input + botão "Variáveis" (abre popover com merge tags disponíveis)
- **Preheader**: Input + botão "Variáveis"
- **Remetente Nome**: Input (default da org)
- **Remetente Email**: Input (default do domínio verificado)

**Seção 4: Merge Tags Disponíveis (popover)**
```
Contato:
  {{contact.first_name}}
  {{contact.last_name}}
  {{contact.email}}
  {{contact.phone}}
  {{contact.city}}
  {{contact.total_orders}}
  {{contact.total_spent}}

Evento (dependem do trigger type):
  {{event.ProductName}}
  {{event.ProductID}}
  {{event.Price}}
  {{event.ImageURL}}
  {{event.CartTotal}}
  {{event.OrderId}}
  {{event.$value}}
  {{event.Items}}
  {{event.Currency}}
  {{event.DiscountCodes}}

Loja:
  {{store.name}}
  {{store.domain}}
  {{store.logo_url}}
```

**Seção 5: Configurações Avançadas (colapsável)**
- Smart Sending: Toggle + "Pular se recebeu email nas últimas X horas" (input)
- UTM Tracking: Toggle + campos UTM source, medium, campaign
- Filtros Adicionais: Mesma UI de filtros (campo, operador, valor)

```bash
pnpm build
```

### Tarefa 2C: Delay Configuration

**Seção 1: Duração**
- Input numérico + dropdown (minutos, horas, dias, semanas)

**Seção 2: Restrições de Dia (opcional)**
- Toggle "Enviar apenas em dias específicos"
- Checkboxes: Seg, Ter, Qua, Qui, Sex, Sáb, Dom
- Se ativado e o delay termina em dia não selecionado → espera até próximo dia permitido

**Seção 3: Janela de Horário (opcional)**
- Toggle "Enviar dentro de horário específico"
- Inputs: "Entre X:00 e Y:00"
- Se ativado e o delay termina fora do horário → espera até próxima janela

```bash
pnpm build
```

### Tarefa 2D: Conditional Split Configuration

**Seção 1: Nome da Condição**
- Input text (ex: "Valor do carrinho alto?")

**Seção 2: Condições**
- **Tipo**: Radio "Dados do Evento" / "Perfil do Contato" / "Comportamento de Mensagem"

Se "Dados do Evento":
- Campo: dropdown com campos do evento trigger
- Operador: dropdown com 20 operadores
- Valor: input dinâmico

Se "Perfil do Contato":
- Campo: dropdown com propriedades do contato
- Operador: dropdown
- Valor: input dinâmico

Se "Comportamento de Mensagem":
- Mensagem: dropdown com emails/SMS anteriores no flow
- Ação: "Abriu" / "Clicou" / "Não Abriu" / "Não Clicou"

**Condições múltiplas:**
- Botão "+ Adicionar Condição"
- Conector: Toggle "E (AND)" / "OU (OR)" entre condições
- Grupo de condições com border visual

**Paths no Canvas:**
- Edge para SIM: cor verde (#10b981), label "Sim"
- Edge para NÃO: cor vermelha (#ef4444), label "Não"

```bash
pnpm build
```

### Tarefa 2E: A/B Test Configuration

**Seção 1: Proporção**
- Slider ou dois inputs: A% / B% (devem somar 100%)
- Default: 50 / 50

**Seção 2: Labels**
- Input "Nome do caminho A" (ex: "Com Desconto")
- Input "Nome do caminho B" (ex: "Sem Desconto")

**Seção 3: Ações**
- Botão "Definir A como vencedor (100%)" → B desativa
- Botão "Definir B como vencedor (100%)" → A desativa

**No Canvas:**
- Node mostra barra visual com proporção A/B
- Dois outputs: um para A, outro para B
- Cor A: azul (#3b82f6), Cor B: laranja (#f97316)

```bash
pnpm build
```

---

## FASE 3 — EXECUTION ENGINE + INTEGRATIONS

### Tarefa 3A: Conectar CDP Events aos Triggers

```bash
# Verificar estado atual do event-processor:
cat src/lib/automation/event-processor.ts
```

O event-processor.ts DEVE:

1. Receber chamada de `/api/webhooks/shopify/route.ts` e `/api/track/event/route.ts`
2. Mapear event type para trigger type:
```typescript
const EVENT_TO_TRIGGER: Record<string, string> = {
  'checkout_started': 'trigger_checkout_started',
  'abandoned_cart': 'trigger_abandoned_cart',
  'placed_order': 'trigger_placed_order',
  'fulfilled_order': 'trigger_fulfilled_order',
  'cancelled_order': 'trigger_cancelled_order',
  'viewed_product': 'trigger_viewed_product',
  'added_to_cart': 'trigger_added_to_cart',
  'form_submitted': 'trigger_form_submitted',
  'contact_created': 'trigger_contact_created',
  'customer_created': 'trigger_contact_created',
};
```

3. Buscar automações ativas com este trigger type
4. Para cada automação: verificar trigger_filters, audience_filters, frequency
5. Se tudo passa: criar automation_run e executar

**IMPORTANTE**: Adicionar chamada `processEvent()` nos handlers existentes.

Em `/api/webhooks/shopify/route.ts`, após inserir o evento:
```typescript
// Após inserir contact_event, disparar automações
import { processEvent } from '@/lib/automation/event-processor';
await processEvent({
  type: eventType,
  contact_id: contactId,
  store_id: storeId,
  organization_id: orgId,
  data: eventData,
  event_id: insertedEvent.id,
});
```

Em `/api/track/event/route.ts`, mesma coisa.

```bash
pnpm build
```

### Tarefa 3B: Email Executor — Renderizar Template Real

```bash
cat src/lib/automation/node-executors.ts | grep -A 50 "action_email"
```

O executor de email DEVE:

```typescript
async function executeEmailAction(node: FlowNode, context: RunContext) {
  const { config } = node.data;
  let html: string;
  let subject: string;

  if (config.templateId && config.templateId !== 'none') {
    // 1. Buscar template do banco
    const { data: template } = await supabaseAdmin
      .from('email_templates')
      .select('design_json, html, name')
      .eq('id', config.templateId)
      .single();

    if (!template) throw new Error(`Template ${config.templateId} not found`);

    // 2. Usar HTML pré-renderizado ou renderizar do JSON
    html = template.html || renderDocumentToHtml(template.design_json);
  } else {
    // HTML direto da config do node
    html = config.html || '<p>Email sem conteúdo</p>';
  }

  // 3. Resolver merge tags
  subject = resolveMergeTags(config.subject || '', context);
  html = resolveMergeTags(html, context);

  // 4. Resolver product blocks (se houver)
  if (html.includes('<!-- WORDER_PRODUCTS:')) {
    html = await resolveProductBlocks(html, context.contact, context.store);
  }

  // 5. Enviar via Resend
  const { data, error } = await resend.emails.send({
    from: `${config.senderName || context.store.name} <${config.senderEmail || context.org.email}>`,
    to: context.contact.email,
    subject,
    html,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);

  // 6. Registrar envio
  await supabaseAdmin.from('email_sends').insert({
    organization_id: context.org.id,
    contact_id: context.contact.id,
    email_template_id: config.templateId || null,
    automation_id: context.automation.id,
    subject,
    status: 'sent',
    resend_id: data?.id,
  });

  return { sent: true, resend_id: data?.id };
}

function resolveMergeTags(text: string, context: RunContext): string {
  return text.replace(/\{\{([\w.]+)\}\}/g, (match, path) => {
    const parts = path.split('.');
    if (parts[0] === 'contact') return context.contact?.[parts[1]] || '';
    if (parts[0] === 'event') return context.triggerEvent?.data?.[parts[1]] || '';
    if (parts[0] === 'store') return context.store?.[parts[1]] || '';
    return match;
  });
}
```

```bash
pnpm build
```

### Tarefa 3C: Delay Worker (Cron)

Criar worker que roda a cada 1 minuto via Vercel Cron:

```typescript
// src/app/api/workers/automation-delay/route.ts

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  // Verificar cron secret (segurança)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Buscar steps em waiting que devem ser retomados
  const { data: pendingSteps } = await supabase
    .from('automation_run_steps')
    .select(`
      *,
      automation_runs (
        id, automation_id, contact_id, context, status
      )
    `)
    .eq('status', 'waiting')
    .lte('resume_at', now)
    .limit(50);

  let processed = 0;

  for (const step of pendingSteps || []) {
    try {
      if (step.automation_runs.status !== 'waiting') continue;

      // Importar dinamicamente para evitar circular deps
      const { resumeRun } = await import('@/lib/automation/execution-engine');
      await resumeRun(step.run_id, step.node_id);
      processed++;
    } catch (err) {
      console.error(`Error resuming run ${step.run_id}:`, err);
      await supabase
        .from('automation_run_steps')
        .update({ status: 'failed', error: String(err) })
        .eq('id', step.id);
    }
  }

  return NextResponse.json({ processed, total: pendingSteps?.length || 0 });
}
```

Adicionar ao `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/workers/automation-delay",
      "schedule": "* * * * *"
    }
  ]
}
```

```bash
pnpm build
```

### Tarefa 3D: Abandoned Cart Worker

```typescript
// src/app/api/workers/abandoned-cart/route.ts

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  // Buscar checkouts que não foram convertidos em 4 horas
  const { data: checkouts } = await supabase
    .from('contact_events')
    .select('*')
    .eq('event_type', 'checkout_started')
    .lte('created_at', fourHoursAgo)
    .is('metadata->abandoned_processed', null)
    .limit(100);

  let processed = 0;

  for (const checkout of checkouts || []) {
    // Verificar se houve placed_order depois
    const { data: orders } = await supabase
      .from('contact_events')
      .select('id')
      .eq('contact_id', checkout.contact_id)
      .eq('event_type', 'placed_order')
      .gte('created_at', checkout.created_at)
      .limit(1);

    if (!orders?.length) {
      // Abandono confirmado! Processar
      const { processEvent } = await import('@/lib/automation/event-processor');
      await processEvent({
        type: 'abandoned_cart',
        contact_id: checkout.contact_id,
        store_id: checkout.store_id,
        organization_id: checkout.organization_id,
        data: checkout.event_data || {},
        event_id: checkout.id,
      });
      processed++;
    }

    // Marcar como processado (independente se é abandono ou não)
    await supabase
      .from('contact_events')
      .update({ metadata: { ...checkout.metadata, abandoned_processed: true } })
      .eq('id', checkout.id);
  }

  return NextResponse.json({ processed });
}
```

Adicionar ao `vercel.json`:
```json
{
  "path": "/api/workers/abandoned-cart",
  "schedule": "*/10 * * * *"
}
```

```bash
pnpm build
```

---

## FASE 4 — TEMPLATES PRÉ-CONSTRUÍDOS + ANALYTICS

### Tarefa 4A: Modal de Seleção de Template ao Criar Flow

Quando o usuário clica "Criar Automação", mostrar modal com:
- "Começar do Zero" → canvas vazio com trigger node
- Grid de templates pré-construídos:
  - Carrinho Abandonado (3 emails)
  - Boas-Vindas (3 emails)
  - Pós-Compra (2 emails)
  - Reconquistar (3 emails)
  - Navegação Abandonada (2 emails)

Cada card de template mostra:
- Ícone + Nome
- Descrição curta
- Número de emails/SMS
- Tag: "Recomendado" / "Popular"

Ao selecionar template:
1. Criar automação no banco com status 'draft'
2. Carregar flow_data do template (nodes + edges pré-configurados)
3. Navegar para o editor com o flow carregado
4. Trigger já vem configurado (mas editável)
5. Emails vêm com placeholders ("Configure o conteúdo deste email")

Os templates devem estar definidos como constantes em:
```typescript
// src/lib/automation/flow-templates.ts
export const FLOW_TEMPLATES = { ... }
```

```bash
pnpm build
```

### Tarefa 4B: Analytics no Canvas

Botão "Mostrar Métricas" no header do flow builder.

Quando ativado:
- Cada node action (email, SMS, etc.) expande para mostrar mini dashboard:
  - Enviados: X
  - Abertos: Y (Z%)
  - Clicados: W (V%)
  - Revenue: R$XXX
- Dados vêm de automation_run_steps JOIN com email tracking

Query:
```sql
SELECT
  node_id,
  COUNT(*) FILTER (WHERE status = 'completed') as sent,
  COUNT(*) FILTER (WHERE result->>'opened' = 'true') as opened,
  COUNT(*) FILTER (WHERE result->>'clicked' = 'true') as clicked,
  COALESCE(SUM((result->>'revenue')::decimal), 0) as revenue
FROM automation_run_steps
WHERE run_id IN (
  SELECT id FROM automation_runs WHERE automation_id = $1
)
AND node_type LIKE 'action_%'
GROUP BY node_id
```

Timeframe selector: 7d, 30d, 90d, All time

```bash
pnpm build
```

### Tarefa 4C: Alerts System

Antes de ativar o flow, verificar:

**Erros (bloqueiam ativação):**
- Trigger não configurado
- Email sem subject line
- Email sem template e sem HTML
- Conditional split sem condição definida
- Node desconectado (sem edge de entrada)

**Recomendações (warnings):**
- Falta delay antes de conditional split
- Primeiro email envia imediatamente (sem delay após trigger)
- Flow sem exit condition
- Email sem preheader

Botão "Alertas" no header com badge de contagem.
Painel dropdown com lista de alertas, cada um com:
- Ícone (AlertTriangle para erro, Info para recomendação)
- Descrição
- Botão "Corrigir" que seleciona o node problemático

```bash
pnpm build
```

---

## FASE 5 — POLISH E UX

### Tarefa 5A: Minimap + Controls

```typescript
import { MiniMap, Controls, Background } from '@xyflow/react';

// No Canvas component, adicionar:
<MiniMap
  nodeColor={(node) => {
    if (node.type?.startsWith('trigger')) return '#10b981';
    if (node.type?.startsWith('action_email')) return '#3b82f6';
    if (node.type?.startsWith('action_whatsapp')) return '#22c55e';
    if (node.type?.startsWith('control_delay')) return '#f59e0b';
    if (node.type?.startsWith('condition')) return '#eab308';
    return '#94a3b8';
  }}
  className="bg-white border border-gray-200 rounded-lg shadow-sm"
  maskColor="rgba(0,0,0,0.08)"
/>
<Controls className="bg-white border border-gray-200 rounded-lg shadow-sm" />
<Background color="#e5e7eb" gap={20} size={1} />
```

```bash
pnpm build
```

### Tarefa 5B: Undo/Redo

```bash
# Verificar se o flowStore já tem undo/redo:
grep -n "undo\|redo\|temporal\|history" src/stores/flowStore.ts | head -10
```

Se não tiver, adicionar middleware temporal do Zustand:
```typescript
import { temporal } from 'zundo';

const useFlowStore = create<FlowState>()(
  temporal(
    (set, get) => ({
      // ... state existente
    }),
    { limit: 50 }
  )
);

// Expor undo/redo
export const useFlowUndo = () => useFlowStore.temporal.getState().undo;
export const useFlowRedo = () => useFlowStore.temporal.getState().redo;
```

Botões no toolbar: Undo (Ctrl+Z), Redo (Ctrl+Shift+Z)

```bash
pnpm build
```

### Tarefa 5C: Listagem de Automações Melhorada

A página `/automations` deve mostrar:

- Header: "Automações" + botão "Criar Automação"
- Cards com:
  - Nome da automação
  - Status badge (Draft, Active, Paused)
  - Trigger type com ícone
  - Métricas: Execuções, Emails enviados, Revenue
  - Toggle on/off (ativa/desativa)
  - Última execução: "há 2 horas"
  - Botões: Editar, Duplicar, Excluir
- Filtros: Status, Trigger type
- Ordenação: Nome, Data criação, Revenue
- Empty state: Ilustração + "Crie sua primeira automação"

```bash
pnpm build
```

### Tarefa 5D: Teste End-to-End

1. Criar flow "Carrinho Abandonado" usando o template
2. Verificar que trigger vem pré-configurado
3. Adicionar delay de 1 hora
4. Adicionar email com subject "Teste {{ contact.first_name }}"
5. Adicionar conditional split (cart_value > 100)
6. Adicionar segundo email no caminho SIM
7. Salvar
8. Ativar
9. Verificar no banco: automation com status 'active'
10. Simular: inserir um contact_event tipo checkout_started no banco
11. Chamar processEvent manualmente
12. Verificar: automation_run criado
13. Verificar: automation_run_steps criados para cada node
14. Verificar: delay step com status 'waiting' e resume_at correto

```bash
pnpm build
echo "TESTE COMPLETO"
```

---

## VERIFICAÇÃO FINAL

```bash
echo "══════════════════════════════════════"
echo "VERIFICAÇÃO FINAL"
echo "══════════════════════════════════════"

# 1. Build sem erros
pnpm build

# 2. Sem dark mode hardcoded
echo "Dark mode residual:"
grep -rn "bg-gray-9\|bg-\[#1\|bg-black\|bg-slate-9" src/components/flow-builder/ | wc -l
# Deve ser 0

# 3. Sem emojis
echo "Emojis residuais:"
grep -rn "📧\|📱\|⏰\|🔀\|🛒\|👤\|🏷" src/components/flow-builder/ | wc -l
# Deve ser 0

# 4. Sem any desnecessário
echo "TypeScript any:"
grep -rn ": any\b" src/components/flow-builder/ src/lib/automation/ src/stores/flowStore.ts | wc -l
# Quanto menor melhor

# 5. Event processor conectado
echo "processEvent chamado em:"
grep -rn "processEvent" src/app/api/ | head -5
# Deve aparecer em webhooks/shopify e track/event

# 6. Workers existem
echo "Workers:"
ls src/app/api/workers/*/route.ts 2>/dev/null

# 7. Templates existem
echo "Flow templates:"
ls src/lib/automation/flow-templates.ts 2>/dev/null
cat src/lib/automation/flow-templates.ts 2>/dev/null | head -5

echo "══════════════════════════════════════"
echo "FIM"
echo "══════════════════════════════════════"
```
