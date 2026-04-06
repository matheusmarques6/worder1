# WORDER FLOW BUILDER — Documento Completo de Implementação

## Versão Final | Abril 2026

---

# SUMÁRIO

1. [Pesquisa: Klaviyo Flows — Todas as Funcionalidades](#1-klaviyo)
2. [Pesquisa: Omnisend Automations — Todas as Funcionalidades](#2-omnisend)
3. [Análise Comparativa e Decisões de Design](#3-comparativo)
4. [Repositórios e Bibliotecas Open-Source](#4-repositorios)
5. [Estado Atual do Sistema Worder](#5-estado-atual)
6. [Arquitetura Completa do Flow Builder Worder](#6-arquitetura)
7. [Especificação de Todas as Funcionalidades](#7-funcionalidades)
8. [Design System e Diretrizes Visuais](#8-design)
9. [Integração com Shopify, Email Editor e CDP](#9-integracoes)
10. [Erros Comuns do Claude Code e Como Evitá-los](#10-erros-claude)
11. [Plano de Execução Faseado](#11-fases)
12. [Prompt de Execução para Claude Code](#12-prompt)

---

# 1. PESQUISA: KLAVIYO FLOWS — TODAS AS FUNCIONALIDADES {#1-klaviyo}

## 1.1 Visão Geral

Klaviyo é a referência absoluta em automação para e-commerce. Seu flow builder é uma interface visual drag-and-drop baseada em canvas onde o usuário monta uma sequência de ações disparadas por eventos do cliente.

**Números de referência:** 60+ templates pré-construídos, 193.000+ marcas, RPR médio de $3.65 para carrinho abandonado.

## 1.2 Tipos de Trigger (Gatilho)

A Klaviyo oferece 5 categorias de triggers:

### a) List-Triggered (Adicionado a uma lista)
- Disparado quando alguém é adicionado a uma lista específica
- Exemplo: Welcome Series quando alguém se inscreve na newsletter
- Configuração: Selecionar a lista + definir filtros de perfil

### b) Segment-Triggered (Adicionado a um segmento)
- Disparado quando alguém entra em um segmento dinâmico
- Segmentos são grupos dinâmicos baseados em critérios (ex: "comprou nos últimos 30 dias")
- Atualização contínua — pessoas entram e saem conforme comportamento muda

### c) Metric-Triggered (Evento/Métrica)
- O mais usado: disparado quando ocorre um evento específico
- Eventos disponíveis: Placed Order, Started Checkout, Viewed Product, Added to Cart, Fulfilled Order, Cancelled Order, Refunded Order, Subscribed to List, Custom Events
- Cada evento traz dados específicos (ex: Started Checkout traz valor do carrinho, itens, etc.)
- Filtros de trigger: condições sobre o evento (ex: "cart value > $100")

### d) Price Drop-Triggered
- Disparado quando o preço de um produto que o cliente visualizou cai
- Automático — monitora preços e dispara sem intervenção

### e) Date Property-Triggered
- Disparado baseado em uma propriedade de data no perfil
- Exemplo: Aniversário, data de expiração de assinatura
- Configurável: quantos dias antes/depois da data

## 1.3 Componentes de Lógica (Logic)

### a) Time Delay
- Atraso entre uma ação e a próxima
- Configurações: minutos, horas, dias, semanas
- Opção: "Wait until a specific day of the week" (ex: enviar só de segunda a sexta)
- Opção: "Wait until a specific time" (ex: enviar às 10h)
- Smart Send Time: IA determina melhor horário para cada contato individual

### b) Conditional Split
- Divide o fluxo em dois caminhos: SIM e NÃO
- Baseado em propriedades do PERFIL ou ações tomadas
- Exemplos: "Has placed order zero times since starting this flow", "Gender is Female", "Is in segment VIP"
- Operadores completos: equals, not equals, contains, starts with, greater than, less than, is set, is not set, before date, after date, in last X days
- Importante: precisa de time delay ANTES do split para dar tempo da ação ser avaliada

### c) Trigger Split
- Divide baseado nos DADOS DO EVENTO que disparou o flow
- Disponível APENAS em flows metric-triggered e price drop
- Exemplo: "Cart value > $100" para dar desconto diferente para carrinhos de alto valor
- Não precisa de time delay antes (dados já disponíveis no momento do trigger)

### d) Rejoin Split
- Permite reconectar caminhos que foram separados por um split
- Caminho SIM e NÃO podem convergir novamente para uma ação comum
- Ícone de "rejoin" aparece abaixo de cada caminho do split

## 1.4 Ações de Mensagem

### a) Send Email
- Abre o editor de email embutido (drag-and-drop ou HTML)
- Pode usar template existente ou criar do zero
- Subject line, Preview text, Sender name, Sender email
- Smart Sending: pula se o contato recebeu email recentemente
- UTM Tracking: adiciona parâmetros UTM aos links
- Filtros adicionais: condições extras para quem recebe este email específico
- A/B Testing: testar subject lines, conteúdo, timing

### b) Send SMS
- Mensagem de texto com personalização via merge tags
- Compliance: quiet hours, opt-out automático
- Smart Send: coordena com emails para evitar fadiga

### c) Send Push Notification
- Notificação push mobile
- Título + corpo + URL de destino

### d) Send WhatsApp (novo)
- Mensagens via WhatsApp Business API

## 1.5 Ações de Dados (Data Actions)

### a) Update Profile Property
- Atualiza uma propriedade do perfil do contato
- Opções: Set value, Increment, Decrement, Append to list
- Exemplo: Marcar "welcome_email_sent = true" após enviar welcome

### b) List Update
- Adicionar ou remover contato de uma lista específica
- Exemplo: Mover de "Prospects" para "Customers" após primeira compra

### c) Webhook
- Envia HTTP POST para URL externa
- Payload JSON customizável com variáveis do perfil e evento
- Headers customizáveis (para autenticação)
- Retry com exponential backoff
- Requer 2FA habilitado na conta

### d) Internal Alert
- Envia notificação interna (email para a equipe)
- Útil para alertar vendedores sobre ações importantes

### e) Custom Action
- Ação extensível via API

## 1.6 Status de Ações

Cada ação individual tem seu próprio status:
- **Draft**: Configuração incompleta, não envia
- **Manual**: Pronta, mas requer revisão manual antes de enviar
- **Live**: Ativa, envia automaticamente
- **Paused**: Temporariamente pausada

## 1.7 Analytics no Flow Builder

- Show Analytics: botão no header que expande métricas em cada card de ação
- Métricas por mensagem: Sent, Delivered, Opened, Clicked, Conversions, Revenue, Bounced, Unsubscribed
- Timeframe ajustável: 7 dias, 30 dias, 90 dias, All time
- Recipient Activity: ver quem está Waiting, Queued, Skipped, Sent, Failed
- 30-day performance snapshot no sidebar de configuração
- Flow-level metrics: total revenue, total conversions

## 1.8 Minimap e Navegação

- Minimap no canto inferior: visão bird's-eye de todo o fluxo
- Toolbar de navegação: zoom in, zoom out, fit to view
- Pan com cursor: arrastar o canvas livremente
- Buscar componente: localizar rapidamente um node no canvas

## 1.9 Flow Templates Pré-Construídos

60+ templates organizados por categoria:
- Welcome Series (com split por canal)
- Abandoned Cart (com split por valor do carrinho)
- Browse Abandonment (com split por quantidade de produtos vistos)
- Post-Purchase (com split por primeiro vs. repetido)
- Winback (com incremento progressivo de desconto)
- Review Request (com delay pós-entrega)
- Sunset / Unengaged (limpeza de lista)
- Birthday / Anniversary
- Price Drop Alert
- Back in Stock
- Cross-Sell / Upsell
- VIP Reward
- Subscription Renewal

## 1.10 Flows AI

- Descrever em linguagem natural o fluxo desejado
- IA gera a estrutura completa (trigger, delays, splits, ações)
- Usuário revisa e ajusta
- Disponível para contas pagas com 250+ perfis ativos

## 1.11 Smart Features

- **Smart Send Time**: IA envia no melhor horário individual
- **Predictive Analytics**: CLV, churn risk, next order date
- **A/B Testing nativo**: Testar variações dentro do flow
- **Flow Filters**: Filtros globais no trigger (ex: "only if has email consent")
- **Profile Filters re-checked**: Filtros reverificados antes de cada envio

---

# 2. PESQUISA: OMNISEND AUTOMATIONS — TODAS AS FUNCIONALIDADES {#2-omnisend}

## 2.1 Visão Geral

Omnisend foca em simplicidade com multi-canal nativo (Email + SMS + Push em um único builder). Interface mais limpa que Klaviyo, ideal para quem está começando mas com recursos avançados suficientes.

**Números:** 150.000+ marcas, $79 de retorno por $1 investido.

## 2.2 Triggers Disponíveis

### Triggers de E-commerce
- **Abandoned Cart**: Produto adicionado ao carrinho sem checkout completo
- **Abandoned Checkout**: Checkout iniciado mas não finalizado
- **Browse Abandonment**: Produto visualizado mas não adicionado ao carrinho
- **Placed Order / Paid for Order**: Pedido realizado ou pago
- **Ordered Product**: Trigger por produto específico comprado
- **Fulfilled Order**: Pedido enviado/entregue
- **Cancelled Order**: Pedido cancelado
- **Order Refunded**: Pedido devolvido

### Triggers de Engajamento
- **Signed Up via Form**: Inscrição via formulário Omnisend
- **Subscribed to Channel**: Inscrição em email ou SMS
- **Clicked on Message**: Clicou em link de campanha ou automação
- **Opened Message**: Abriu mensagem

### Triggers de Segmento
- **Contact Enters Segment**: Contato entra em um segmento dinâmico
- **Contact Exits Segment**: Contato sai de um segmento

### Triggers Especiais
- **Birthday**: Baseado na data de aniversário
- **Custom Event**: Evento personalizado via API (ex: AfterShip Delivered, Gorgias Satisfaction)

## 2.3 Trigger Filters (Filtros no Trigger)

- Até 5 trigger filters por workflow
- Filtros específicos por tipo de trigger:
  - Ordered Product: filtrar por Product Description, Price, Weight
  - Abandoned Cart: filtrar por Cart Total
  - Placed Order: filtrar por Order Value, Fulfillment Status
- **Trigger Preview Tool**: testar se contatos qualificam para o trigger

## 2.4 Audience Filters

- Filtros no PERFIL do contato (não no evento)
- Baseados em: Country, Tags, Custom Fields, Subscription Status, Purchase Behavior
- Verificados APENAS na entrada do workflow
- Aviso importante: evitar filtros baseados em segmento no trigger level (delay de 1-2 min pode causar falha)

## 2.5 Exit Conditions

- Até 4 condições de saída por workflow
- Cancelam o workflow quando a condição é satisfeita
- NÃO restringem entrada — cancelam mid-sequence
- Diferem de Audience Filters: são verificadas CONTINUAMENTE durante todo o workflow
- Exemplo: "Placed Order" como exit condition no Abandoned Cart — se o cliente comprar, para de enviar lembretes

## 2.6 Frequency (Frequência)

- Controla com que frequência o mesmo contato pode re-entrar no workflow
- Opções: "At any time" (uma vez, para sempre), "In the last X hours/days"
- Skip Contacts: evitar overlap com outros workflows

## 2.7 Delays (Atrasos)

- Configuráveis em: minutos, horas, dias, semanas, meses
- Calculados a partir do FIM do bloco anterior (não apenas do trigger)
- Opção: "Send on selected day(s) of the week" (ex: não enviar no fim de semana)
- Se o delay cai em dia proibido, espera até o próximo dia permitido
- Hora de envio configurável (ex: enviar entre 9h e 21h)

## 2.8 Conditional Split

- Divide o fluxo em caminhos SIM e NÃO
- Até 10 splits por workflow
- Baseado em:
  - **Event data**: dados do evento que disparou (ex: Cart Value > $50)
  - **Contact profile**: dados do contato (ex: Country = Brazil)
  - **Message behavior**: interação com mensagem anterior (ex: Opened Email #1)
  - **Purchase behavior**: histórico de compras
- Se não houver ação no caminho NÃO, o contato sai do workflow

## 2.9 A/B Test Split

- Divide contatos aleatoriamente entre caminhos A e B
- Percentagem configurável (padrão 50/50, mas pode ser 70/30, etc.)
- Apenas 2 caminhos por bloco (mas pode encadear)
- Métricas por caminho: Completed, Skipped
- Botão para definir um caminho como 100% (winner)
- NÃO suporta Conditional Split dentro do A/B test
- Requer tempo para coletar dados significativos

## 2.10 Canais de Mensagem

### Email
- Editor drag-and-drop completo
- Subject line, Preheader, Sender name, Sender email
- IA para gerar subject line
- Content blocks específicos por trigger (ex: produtos abandonados)
- UTM tags automáticas (source: omnisend)

### SMS
- Editor inline direto no workflow
- Character count e preview
- Compliance: quiet hours automáticas, opt-out

### Push Notification
- Web push (não mobile nativo)
- Título + corpo + imagem + URL

## 2.11 Tags (Ações de Dados)

- Adicionar tag ao perfil do contato
- Útil para segmentação futura
- Exemplo: "welcome_completed" após terminar welcome series

## 2.12 Webhooks

- Enviar HTTP request para URL externa
- Payload customizável
- Útil para notificações internas ou integrações

## 2.13 Workflow Channel Settings

- Controlar quais contatos recebem mensagens baseado em subscription status
- Pode escolher enviar mesmo para não-subscribed (ex: emails transacionais)
- Configurado por workflow, não por mensagem individual

## 2.14 Publish vs. Activate (Dois Passos)

- **Publish Changes**: Salva as edições no workflow
- **Activate Workflow**: Torna o workflow live e começa a enviar
- Ativar sem publicar roda a versão antiga
- Publicar sem ativar mantém desabilitado

## 2.15 Alerts System

- Seção "Alerts" no topo do builder
- **Errors**: Problemas que DEVEM ser corrigidos (ex: trigger ausente)
- **Recommendations**: Melhorias opcionais (ex: adicionar inactivity time)
- Quick action buttons para correção rápida
- Dismiss: descartar alertas que são intencionais

## 2.16 Analytics

- Stats por bloco individual: Sent, Opened, Clicked, Revenue
- Report completo por workflow: performance geral
- Revenue attribution: quanto cada automação gerou
- Link activity tracking: clicks por link individual
- "All-time" date range disponível
- Stats resetam ao editar blocos (30 dias de espera recomendados)

## 2.17 Templates Pré-Construídos

Organizados por categoria:
- Welcome Series (1-3 emails)
- Abandoned Cart (1-3 emails + SMS)
- Abandoned Checkout
- Browse Abandonment
- Product Abandonment
- Post-Purchase / Cross-Sell
- Order Confirmation / Shipping
- Winback / Re-engagement
- Birthday
- Customer Feedback
- Cada template com variações (ex: "with A/B testing", "with split based on engagement")

## 2.18 Dynamic Content em Automações

- Blocos dinâmicos específicos por trigger type
- Produtos abandonados: bloco automático com imagem, nome, preço do produto
- Recomendações: produtos baseados em compras anteriores
- Variáveis do evento acessíveis em todo o email

---

# 3. ANÁLISE COMPARATIVA E DECISÕES DE DESIGN {#3-comparativo}

## 3.1 Tabela Comparativa

| Funcionalidade | Klaviyo | Omnisend | Worder (Objetivo) |
|---|---|---|---|
| Triggers e-commerce | Sim, via metrics | Sim, presets | Sim, via CDP events |
| Trigger filters | Sim, baseados no evento | Sim, até 5 | Sim, até 5 |
| Audience filters | Via flow filters | Sim, perfil | Sim, perfil + segmento |
| Exit conditions | Não explícito | Sim, até 4 | Sim, até 4 |
| Frequency control | Sim, via config | Sim, detalhado | Sim |
| Conditional split | Sim, completo | Sim, até 10 | Sim, até 10 |
| Trigger split | Sim, event data | Não separado (usa conditional) | Sim |
| A/B Test | Sim, no email | Sim, bloco dedicado | Sim, bloco dedicado |
| Rejoin paths | Sim | Não | Sim |
| Time delay | Sim, granular | Sim, com dia/hora | Sim, com dia/hora |
| Smart Send Time | Sim, IA | Não | Fase futura |
| Email | Sim | Sim | Sim (editor custom) |
| SMS | Sim | Sim | Fase futura |
| Push | Sim | Sim (web) | Fase futura |
| WhatsApp | Sim | Não | Sim (já no sidebar) |
| Webhook | Sim | Sim | Sim |
| Property Update | Sim | Sim (via tags) | Sim |
| List Update | Sim | Não | Sim |
| Internal Alert | Sim | Não (via webhook) | Sim |
| Templates pré-built | 60+ | 20+ | 10+ (início) |
| AI Flow Builder | Sim | Não | Fase futura |
| Minimap | Sim | Não | Sim |
| Analytics no canvas | Sim | Sim | Sim |
| Flow-level status | Per-action | Workflow-level | Ambos |

## 3.2 Decisões de Design para a Worder

Baseado na análise, a Worder deve:

1. **Adotar o modelo visual da Klaviyo** (canvas vertical, sidebar esquerda com blocos, sidebar direita com configurações) mas com a **simplicidade de UX da Omnisend** (alertas, publish/activate, exit conditions explícitas)

2. **Multi-canal desde o início**: Email, WhatsApp, SMS, Webhook — todos como ações no flow

3. **Trigger customizável com presets**: Ao selecionar "Carrinho Abandonado", o trigger já vem configurado com os filtros corretos, mas o usuário pode mudar tudo

4. **A/B Test como bloco dedicado** (modelo Omnisend): mais intuitivo que o A/B da Klaviyo que fica escondido dentro do email

5. **Exit Conditions explícitas** (modelo Omnisend): painel dedicado no trigger, não como flow filter

6. **Alerts System** (modelo Omnisend): erros e recomendações antes de ativar

7. **Rejoin Paths** (modelo Klaviyo): reconectar caminhos após split

---

# 4. REPOSITÓRIOS E BIBLIOTECAS OPEN-SOURCE {#4-repositorios}

## 4.1 React Flow (@xyflow/react) — JÁ USADO NO WORDER

- **Repo**: https://github.com/xyflow/xyflow
- **Versão atual**: 12.4.4+ (pacote @xyflow/react)
- **Licença**: MIT
- **Por que é ideal**: Construído especificamente para UIs node-based. Suporta drag-and-drop, zoom, pan, minimap, custom nodes, custom edges
- **Componentes prontos**: React Flow Components (baseados em shadcn/ui) — Auto-layout, drag-and-drop sidebar, dark mode, workflow logic
- **Workflow Editor Template**: Template oficial com auto-layout usando dagre/ELK.js

### Funcionalidades do React Flow que devemos usar:
- `MiniMap`: Minimap nativo
- `Controls`: Zoom controls nativos
- `Background`: Grid de fundo
- `useNodesState` / `useEdgesState`: State management
- `addEdge`: Conexão automática de nodes
- Custom Nodes: Nodes com design totalmente customizado
- Custom Edges: Edges com labels, animação, estilo
- `onConnect`: Handler de conexão
- `onNodeDragStop`: Posição do node após drag
- `fitView`: Ajustar zoom para caber todos os nodes

## 4.2 Automation Workflow Examples (React Flow)

- **Repo**: https://github.com/Azim-Ahmed/Automation-workflow
- **Descrição**: Coleção de exemplos avançados de ReactFlow para automation workflows
- **Inclui**: automation builders, conditional routing, JSON-based node rendering, enterprise-level UI patterns
- **Útil para**: Referência de padrões de implementação

## 4.3 React Flow Builder

- **Repo**: https://github.com/1Madgeek/react-flow-builder
- **Descrição**: Flow builder focado em automação de marketing e AI event-driven
- **Stack**: React + Xyflow + Tabler Icons
- **Útil para**: Referência de componentes custom

## 4.4 Dagre.js (Layout Automático)

- **Repo**: https://github.com/dagrejs/dagre
- **Uso**: Auto-layout de nodes em grafo dirigido
- **Integração**: Usado nos Pro Examples do React Flow
- **Benefício**: Posiciona nodes automaticamente em layout tree/vertical

## 4.5 ELK.js (Layout Avançado)

- **Repo**: https://github.com/kieler/elkjs
- **Uso**: Layout alternativo mais sofisticado que dagre
- **Benefício**: Melhor para fluxos complexos com muitos branches

## 4.6 Zustand (State Management) — JÁ USADO NO WORDER

- **Repo**: https://github.com/pmndrs/zustand
- **Uso**: Gerenciamento de estado do flow builder
- **Benefício**: Simples, performático, undo/redo nativo com middleware

---

# 5. ESTADO ATUAL DO SISTEMA WORDER {#5-estado-atual}

## 5.1 O Que Já Existe (8.909 linhas de código)

### Componentes do Flow Builder
```
src/components/flow-builder/
├── Canvas.tsx              → Canvas principal com @xyflow/react
├── Sidebar.tsx             → Sidebar esquerda com blocos arrastáveis
├── Toolbar.tsx             → Toolbar com controles
├── nodes/                  → Custom nodes (trigger, action, condition, control)
├── panels/
│   └── PropertiesPanel.tsx → Painel de configuração direito (1.953 linhas)
└── edges/                  → Custom edges com labels
```

### Store e Types
```
src/stores/flowStore.ts     → Zustand store com undo/redo
src/types/flow-builder.ts   → Tipos TypeScript para todo o flow builder
```

### Execution Engine
```
src/lib/automation/
├── execution-engine.ts     → Engine principal (executa flow node a node)
├── node-executors.ts       → Executores por tipo de node (1.080 linhas)
├── event-processor.ts      → Processa eventos e dispara flows
└── variable-engine.ts      → Resolve variáveis/merge tags
```

### APIs
```
src/app/api/automations/
├── route.ts                → CRUD de automações
├── [id]/
│   ├── route.ts            → GET/PUT/DELETE individual
│   └── execute/route.ts    → Execução manual
└── src/app/api/workers/
    └── automation/route.ts → Worker de processamento
```

### Schema SQL
```
supabase/migrations/20260401_flow_engine_tables.sql
→ Tabelas: automations, automation_runs, automation_run_steps, event_logs
```

### 13 Tipos de Trigger na Sidebar
- Deal criado, Deal movido, Pedido criado, Carrinho abandonado
- Checkout iniciado, Produto visualizado, Formulário enviado
- Tag adicionada, Webhook recebido, Segmento, Data/Hora, Evento customizado, Contato criado

### 15+ Tipos de Ação/Condição
- Enviar Email, Enviar WhatsApp, Enviar SMS, Enviar Webhook
- Condição, Condição Múltipla, Randomizar, Executar JavaScript, ChatGPT
- Delay, Atualizar Contato, Mover Deal, Criar Tarefa, Adicionar Tag, HTTP Request

## 5.2 Problemas Identificados

### a) Dark Mode Hardcoded
- Cores escuras (bg-gray-900, bg-[#1a1a2e]) nos componentes
- Deveria seguir o tema geral do dashboard (que é light)

### b) Email Action Sem Filtro por Store
- `EmailActionConfig` busca `/api/email/templates` sem `storeId`
- Mostra templates de TODAS as lojas da organização

### c) Email Action Não Renderiza Template
- Node executor `action_email` envia `config.html` direto pelo Resend
- Quando usa templateId, NÃO busca o template, NÃO renderiza HTML, NÃO resolve merge tags

### d) CDP Events Não Conectados aos Triggers
- Event processor existe mas NÃO está conectado com webhooks/pixel Shopify reais
- Eventos chegam no `/api/webhooks/shopify` e `/api/track/event` mas NÃO disparam flows

### e) Delay Worker Inexistente
- Delay nodes criam runs com `status=waiting` mas NÃO existe cron worker para retomar

### f) Sem Detecção de Carrinho Abandonado
- Não existe worker que monitora checkouts sem completion

### g) Sem Flow Templates Pré-Construídos
- Nenhum template pronto para Abandoned Cart, Welcome, Post-Purchase, etc.

### h) Condition Operators Limitados
- Apenas 6 operadores básicos; precisa de 20+

### i) Sem Analytics no Canvas
- Sem métricas visíveis nos cards dos nodes

### j) Configuração de Trigger Não Customizável
- Trigger é selecionado na sidebar mas falta painel de configuração detalhada com filtros, audience filters, exit conditions

## 5.3 Integração Shopify — Estado Atual

### O que funciona:
- OAuth callback confirado e funcionando
- Loja "Curren Relógios Oficial" conectada com access token válido
- Webhooks registrados via GraphQL
- Eventos definidos em `src/lib/shopify/event-types.ts`
- Event service criado em `src/lib/shopify/event-service.ts`
- Track API: `POST /api/track/event` e `POST /api/track/identify`
- Webhook processor: `POST /api/webhooks/shopify`
- Web Pixel Extension e Theme App Extension definidos
- Profile enricher e lifecycle stages definidos

### Webhooks registrados e eventos que chegam:
```
orders/create     → placed_order (com dados: items, value, customer, shipping)
orders/fulfilled  → fulfilled_order
orders/cancelled  → cancelled_order
checkouts/create  → checkout_started (com dados: items, cart_value, email)
customers/create  → customer_created
customers/update  → customer_updated
products/create   → product_created
products/update   → product_updated
```

### Web Pixel captura (client-side):
```
product_added_to_cart  → added_to_cart (ProductID, ProductName, Price, Quantity, CartTotal)
checkout_started       → checkout_started (Value, ItemCount, Items[])
checkout_completed     → checkout_completed (Value, OrderId, Email)
page_viewed           → page_viewed
product_viewed        → viewed_product (ProductID, ProductName, Price, ImageURL)
search_submitted      → searched
collection_viewed     → viewed_collection
```

### Theme App Extension captura:
```
Active on Site, Viewed Product, Viewed Collection
Identificação do cliente ({{ customer.email }})
```

### Variáveis disponíveis em cada evento:
```typescript
// placed_order
{ $value, OrderId, Items[], Currency, ShippingAddress, BillingAddress, DiscountCodes }

// checkout_started
{ $value, ItemCount, Items[], Currency, CheckoutURL }

// added_to_cart
{ ProductID, ProductName, VariantID, Price, Quantity, CartTotal, Currency, ImageURL }

// viewed_product
{ ProductID, ProductName, Price, ImageURL, URL, Brand, Categories }

// customer_created
{ email, first_name, last_name, phone, tags, total_orders, total_spent }
```

## 5.4 Email Editor/Templates — Estado Atual

- Editor custom em React com JSON document model
- Templates salvos na tabela `email_templates` com `design_json` e `html`
- Renderização via `renderDocumentToHtml`
- Merge tags definidos: `{{contact.first_name}}`, `{{contact.email}}`, `{{event.*}}`
- Product blocks com placeholder `<!-- WORDER_PRODUCTS:config -->`
- Resolução server-side em send time

### Integração que deve existir no Flow Builder:
1. Ao adicionar "Enviar Email", poder **selecionar template existente** OU **criar email do zero**
2. Preview do template no painel de configuração
3. Subject line e preheader configuráveis com merge tags
4. Botão "Personalizar" abre o editor de email completo
5. Ao salvar no editor, atualiza o node do flow
6. Variáveis do evento trigger disponíveis como merge tags no email

---

# 6. ARQUITETURA COMPLETA DO FLOW BUILDER WORDER {#6-arquitetura}

## 6.1 Visão Macro

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLOW BUILDER INTERFACE                        │
│                                                                 │
│  ┌──────────┐  ┌──────────────────────────┐  ┌──────────────┐  │
│  │ SIDEBAR  │  │        CANVAS             │  │ PROPERTIES   │  │
│  │          │  │                            │  │ PANEL        │  │
│  │ Triggers │  │   [Trigger Node]          │  │              │  │
│  │ Actions  │  │        │                  │  │ Nome         │  │
│  │ Logic    │  │   [Delay: 1h]            │  │ Descrição    │  │
│  │ Data     │  │        │                  │  │ Config...    │  │
│  │          │  │   [Conditional Split]     │  │              │  │
│  │ Search   │  │      /    \              │  │ [Testar]     │  │
│  │          │  │   [Email] [SMS]          │  │ [Excluir]    │  │
│  │          │  │      \    /              │  │              │  │
│  │          │  │   [Rejoin]               │  │              │  │
│  │          │  │        │                  │  │              │  │
│  │          │  │   [End]                  │  │              │  │
│  │          │  │                            │  │              │  │
│  │          │  │  [MiniMap]  [Controls]    │  │              │  │
│  └──────────┘  └──────────────────────────┘  └──────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ HEADER: Nome | Status | Alerts | Analytics | Test | Save │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 6.2 Data Flow

```
Shopify Webhook/Pixel/Track API
        │
        ▼
  /api/webhooks/shopify
  /api/track/event
        │
        ▼
  event-processor.ts ── Verifica se há automação com trigger matching
        │
        ▼
  execution-engine.ts ── Cria automation_run, executa node a node
        │
        ▼
  node-executors.ts ── Executa cada tipo de node
        │
        ├── action_email → Busca template → Renderiza HTML → Resend
        ├── action_whatsapp → API WhatsApp
        ├── action_sms → API SMS
        ├── action_webhook → HTTP POST
        ├── control_delay → Cria run com status=waiting → Worker continua depois
        ├── condition_* → Avalia condição → Decide caminho YES/NO
        └── data_* → Update profile, add tag, etc.
```

## 6.3 Schema do Banco de Dados

### Tabela: automations
```sql
CREATE TABLE automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  store_id UUID REFERENCES shopify_stores(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft', -- draft, active, paused, archived
  trigger_type TEXT NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  trigger_filters JSONB DEFAULT '[]',
  audience_filters JSONB DEFAULT '[]',
  exit_conditions JSONB DEFAULT '[]',
  frequency_config JSONB DEFAULT '{"type": "once"}',
  flow_data JSONB NOT NULL, -- Nodes + Edges do React Flow
  stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ
);
```

### Tabela: automation_runs
```sql
CREATE TABLE automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  trigger_event_id UUID REFERENCES contact_events(id),
  status TEXT DEFAULT 'running', -- running, waiting, completed, failed, cancelled, exited
  current_node_id TEXT,
  context JSONB DEFAULT '{}', -- variáveis acumuladas durante execução
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  exit_reason TEXT
);
```

### Tabela: automation_run_steps
```sql
CREATE TABLE automation_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES automation_runs(id),
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, executing, completed, failed, skipped
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB DEFAULT '{}',
  error TEXT,
  resume_at TIMESTAMPTZ -- para delays: quando retomar
);
```

---

# 7. ESPECIFICAÇÃO DE TODAS AS FUNCIONALIDADES {#7-funcionalidades}

## 7.1 Sidebar Esquerda — Blocos Arrastáveis

### GATILHO (1 por flow)
```
Carrinho Abandonado    → trigger_abandoned_cart
Checkout Abandonado    → trigger_abandoned_checkout
Pedido Realizado       → trigger_placed_order
Pedido Enviado         → trigger_fulfilled_order
Pedido Cancelado       → trigger_cancelled_order
Produto Visualizado    → trigger_viewed_product
Produto Adicionado     → trigger_added_to_cart
Inscrito no Formulário → trigger_form_submitted
Contato Criado         → trigger_contact_created
Contato Entrou Segmento→ trigger_segment_entered
Contato Saiu Segmento  → trigger_segment_exited
Data/Aniversário       → trigger_date_property
Evento Customizado     → trigger_custom_event
Webhook Recebido       → trigger_webhook
```

### AÇÃO
```
Enviar E-mail          → action_email
Enviar WhatsApp        → action_whatsapp
Enviar SMS             → action_sms
Enviar Webhook         → action_webhook
Notificação Interna    → action_internal_alert
```

### LÓGICA
```
Atraso/Delay           → control_delay
Condição (Split)       → condition_split
Teste A/B              → logic_ab_test
```

### DADOS
```
Atualizar Contato      → data_update_contact
Adicionar Tag          → data_add_tag
Remover Tag            → data_remove_tag
Adicionar à Lista      → data_add_to_list
Remover da Lista       → data_remove_from_list
Mover Deal             → data_move_deal
```

### Busca
- Campo de busca no topo para filtrar blocos
- Seções colapsáveis

## 7.2 Configuração do Trigger (Properties Panel)

Quando o trigger é selecionado, o Properties Panel mostra:

### a) Informações Básicas
- Nome do Trigger (editável)
- Descrição (opcional)
- Tipo do trigger (informativo, não editável)

### b) Trigger Filters (até 5)
- Baseados nos dados do EVENTO
- Para `trigger_abandoned_cart`: Cart Value, Product Name, Product Category
- Para `trigger_placed_order`: Order Value, Discount Code, Payment Method
- Operadores: equals, not_equals, greater_than, less_than, contains, starts_with, in_list
- Botão "+ Adicionar Filtro"

### c) Audience Filters (perfil do contato)
- Baseados nas propriedades do CONTATO
- Campos: email, phone, city, state, country, tags, lifecycle_stage, total_orders, total_spent, custom properties
- Operadores completos
- Botão "+ Adicionar Filtro"

### d) Exit Conditions (até 4)
- Condições que cancelam o workflow mid-execution
- Exemplo: "Placed Order" no Abandoned Cart
- Verificadas CONTINUAMENTE durante todo o workflow
- Botão "+ Adicionar Condição de Saída"

### e) Frequency (Frequência)
- Uma vez por contato (padrão para Welcome)
- A cada X horas/dias (padrão para Abandoned Cart: "once every 4 hours")
- Sem limite

### f) Preview de Trigger
- Botão "Testar Trigger"
- Mostra últimos 10 contatos que teriam qualificado
- Mostra motivo de qualificação ou desqualificação

## 7.3 Configuração de Email Action

Quando um node "Enviar E-mail" é selecionado:

### a) Informações Básicas
- Nome do Nó
- Descrição (opcional)

### b) Seleção de Template
- Dropdown: "Nenhum (criar do zero)" / Lista de templates da LOJA
- Preview thumbnail do template selecionado
- Botão "Criar Novo Template" → Abre editor
- Botão "Editar Template" → Abre editor com template carregado

### c) Configurações do Email
- **Assunto**: Campo de texto com botão "Variáveis" para inserir merge tags
- **Preheader**: Campo de texto com botão "Variáveis"
- **Remetente Nome**: Default da organização, editável
- **Remetente Email**: Default do domínio verificado, editável

### d) Configurações Avançadas
- **Smart Sending**: Toggle para pular contatos que receberam email recentemente (ex: últimas 16h)
- **UTM Tracking**: Toggle + campos para UTM source, medium, campaign
- **Filtros Adicionais**: Condições extras para este email específico

### e) Preview
- Preview do email no próprio painel (compacto)
- Botão "Ver Preview Completo" → Modal com Desktop/Mobile toggle

## 7.4 Configuração de Delay

- **Duração**: Número + unidade (minutos, horas, dias, semanas)
- **Dias da semana**: Checkboxes para enviar apenas em dias selecionados
- **Horário**: "Enviar entre X:00 e Y:00"
- Se o delay termina fora do horário/dia, aguarda até próximo horário permitido

## 7.5 Configuração de Conditional Split

- **Nome da Condição**
- **Campo**: Dropdown com todas as propriedades disponíveis (do evento e do contato)
- **Operador**: equals, not_equals, greater_than, less_than, greater_or_equal, less_or_equal, contains, not_contains, starts_with, ends_with, is_set, is_not_set, in_list, not_in_list, before_date, after_date, in_last_x_days, not_in_last_x_days, between, regex_match
- **Valor**: Campo dinâmico baseado no tipo do campo (texto, número, data, select)
- **Condições múltiplas**: AND / OR com grupo de condições
- Paths: SIM (verde) e NÃO (vermelho) com labels visíveis no canvas

## 7.6 Configuração de A/B Test

- **Split Ratio**: Slider ou inputs para A% / B% (padrão 50/50)
- **Labels**: Nome do caminho A e B (ex: "Com Desconto" / "Sem Desconto")
- Caminho A e B aceitam qualquer bloco exceto Conditional Split dentro
- Botão "Definir Vencedor": Colocar um caminho como 100%
- Métricas por caminho visíveis no painel

## 7.7 Configuração de Webhook

- **URL de Destino**: Input de URL
- **Método**: POST (fixo para agora, futuramente GET, PUT, PATCH)
- **Headers**: Key-Value pairs editáveis (para autenticação)
- **Body (JSON)**: Editor JSON com botão para inserir variáveis do evento/contato
- **Timeout**: 30s (default)

## 7.8 Configuração de Data Actions

### Atualizar Contato
- **Campo**: Dropdown com propriedades do contato
- **Operação**: Set, Increment, Decrement, Append
- **Valor**: Campo dinâmico (pode usar variáveis)

### Adicionar/Remover Tag
- **Tag**: Input de texto ou dropdown com tags existentes

### Adicionar/Remover da Lista
- **Lista**: Dropdown com listas da organização

## 7.9 Flow Templates Pré-Construídos

### Template 1: Carrinho Abandonado (3 emails)
```
Trigger: checkout_started (sem placed_order em 4h)
Exit: Placed Order
Frequency: 1x por 4 horas

→ [Delay: 1 hora]
→ [Email #1: "Você esqueceu algo no carrinho"]
→ [Delay: 24 horas]
→ [Conditional Split: Cart Value > R$200?]
   SIM → [Email #2: "Frete grátis no seu carrinho!" + código]
   NÃO → [Email #2: "Seus itens estão esperando"]
→ [Delay: 48 horas]
→ [Email #3: "Última chance: 10% de desconto"]
```

### Template 2: Boas-Vindas (3 emails)
```
Trigger: contact_created
Exit: Nenhum
Frequency: 1x por contato

→ [Email #1: "Bem-vindo à [Loja]! Aqui está seu cupom" - imediato]
→ [Delay: 2 dias]
→ [Email #2: "Conheça nossos best-sellers"]
→ [Delay: 3 dias]
→ [Conditional Split: Has placed order?]
   SIM → [End]
   NÃO → [Email #3: "Última chance para usar seu cupom de boas-vindas"]
```

### Template 3: Pós-Compra (2 emails)
```
Trigger: placed_order
Exit: Nenhum
Frequency: 1x por 7 dias

→ [Delay: 3 dias]
→ [Email #1: "Como está seu pedido? Conta pra gente!"]
→ [Delay: 7 dias]
→ [Email #2: "Produtos que combinam com o que você comprou" - cross-sell]
```

### Template 4: Reconquistar Clientes (3 emails)
```
Trigger: segment_entered ("Sem compra há 60 dias")
Exit: Placed Order
Frequency: 1x por contato

→ [Email #1: "Sentimos sua falta! Veja as novidades"]
→ [Delay: 7 dias]
→ [Email #2: "10% OFF especial para você voltar"]
→ [Delay: 14 dias]
→ [Email #3: "Último aviso: seu desconto expira amanhã"]
```

### Template 5: Navegação Abandonada (2 emails)
```
Trigger: viewed_product (sem added_to_cart em 2h)
Exit: Added to Cart ou Placed Order
Frequency: 1x por 24 horas

→ [Delay: 2 horas]
→ [Email #1: "Você viu [ProductName] — ainda interessado?"]
→ [Delay: 24 horas]
→ [Conditional Split: Has viewed 3+ products?]
   SIM → [Email #2: "Selecionamos produtos para você" - recomendações]
   NÃO → [End]
```

---

# 8. DESIGN SYSTEM E DIRETRIZES VISUAIS {#8-design}

## 8.1 Princípios de Design

1. **Profissional, não "de IA"**: O design deve parecer feito por designer humano. Sem gradientes excessivos, sem neon, sem efeitos 3D.
2. **Clean e intuitivo**: Menos é mais. Cada elemento deve ter propósito claro.
3. **Consistente com o dashboard**: Mesmas cores, fontes e padrões do resto da Worder.
4. **Feedback visual claro**: O usuário deve sempre saber o que está acontecendo.

## 8.2 Cores e Tema

### Canvas
- Fundo: `bg-gray-50` com grid sutil (`var(--color-gray-200)` com opacity 0.5)
- Grid: Linhas pontilhadas, espaçamento 20px

### Nodes
- **Trigger**: Fundo branco, borda esquerda 4px `emerald-500` (#10b981), shadow-sm
- **Action (Email)**: Fundo branco, borda esquerda 4px `blue-500` (#3b82f6), shadow-sm
- **Action (WhatsApp)**: Fundo branco, borda esquerda 4px `green-500` (#22c55e), shadow-sm
- **Action (SMS)**: Fundo branco, borda esquerda 4px `purple-500` (#a855f7), shadow-sm
- **Action (Webhook)**: Fundo branco, borda esquerda 4px `orange-500` (#f97316), shadow-sm
- **Logic (Delay)**: Fundo branco, borda esquerda 4px `amber-500` (#f59e0b), shadow-sm
- **Logic (Condition)**: Fundo branco, borda esquerda 4px `yellow-500` (#eab308), shadow-sm
- **Logic (A/B Test)**: Fundo branco, borda esquerda 4px `indigo-500` (#6366f1), shadow-sm
- **Data**: Fundo branco, borda esquerda 4px `slate-500` (#64748b), shadow-sm

### Node Selecionado
- Borda: `ring-2 ring-blue-500 ring-offset-2`
- Shadow: `shadow-md`

### Node com Erro
- Borda: `ring-2 ring-red-500`
- Badge vermelho com ícone de alerta

### Edges (Conexões)
- Cor: `gray-300` (default), `blue-500` (selected/hover)
- Tipo: `smoothstep` (curvas suaves)
- Animação: Dashed animation para conexões "waiting" (delay ativo)
- Labels nos paths de split: "Sim" (verde), "Não" (vermelho)

### Sidebar Esquerda
- Fundo: `bg-white`
- Largura: 240px
- Border right: `border-gray-200`
- Seções com ícone Lucide + título + chevron (colapsáveis)
- Blocos: `bg-gray-50 hover:bg-gray-100`, border `border-gray-200`, rounded-lg
- Ícone Lucide por bloco (nunca emoji)

### Properties Panel (Direita)
- Fundo: `bg-white`
- Largura: 360px
- Border left: `border-gray-200`
- Scroll vertical para conteúdo longo
- Seções com título em `text-sm font-semibold text-gray-500 uppercase tracking-wider`
- Inputs: border-gray-300, focus:ring-blue-500, rounded-md

### Header do Flow Builder
- Fundo: `bg-white`
- Border bottom: `border-gray-200`
- Elementos: Nome do flow (editável inline), Status badge, Alerts button, Analytics toggle, Test button, Save button, Save & Close button

## 8.3 Ícones (Lucide React — ZERO EMOJI)

```
Triggers:
- ShoppingCart    → Carrinho abandonado
- CreditCard      → Checkout abandonado
- Package         → Pedido realizado
- Truck           → Pedido enviado
- XCircle         → Pedido cancelado
- Eye             → Produto visualizado
- Plus            → Produto adicionado ao carrinho
- FileText        → Formulário enviado
- UserPlus        → Contato criado
- Users           → Segmento
- Calendar        → Data/Aniversário
- Zap             → Evento customizado
- Webhook         → Webhook recebido

Actions:
- Mail            → Enviar Email
- MessageCircle   → Enviar WhatsApp
- Smartphone      → Enviar SMS
- Send            → Enviar Webhook
- Bell            → Notificação Interna

Logic:
- Clock           → Delay
- GitBranch       → Condição/Split
- Shuffle         → Teste A/B

Data:
- UserCog         → Atualizar Contato
- Tag             → Adicionar/Remover Tag
- List            → Adicionar/Remover da Lista
- ArrowRight      → Mover Deal
```

## 8.4 Layout dos Nodes no Canvas

### Node Trigger (topo do flow)
```
┌─────────────────────────────────────┐
│ 🟢 [Icon]  Carrinho Abandonado     │
│                                     │
│ Dispara quando checkout é criado    │
│ sem conclusão em 4 horas            │
│                                     │
│ ⚙ 2 filtros  👤 1 audience filter  │
└───────────────────┬─────────────────┘
                    │
```

### Node Action (Email, WhatsApp, SMS)
```
┌─────────────────────────────────────┐
│ 📧 [Icon]  Enviar Email            │
│                                     │
│ "Você esqueceu algo no carrinho"    │
│                                     │
│ [Preview thumbnail do email]        │
│                                     │
│ ⚡ Live   📊 352 enviados          │
└───────────────────┬─────────────────┘
```

### Node Delay
```
┌─────────────────────────────────────┐
│ ⏰ [Icon]  Aguardar 1 hora         │
│                                     │
│ Seg-Sex, 9h-21h                     │
└───────────────────┬─────────────────┘
```

### Node Conditional Split
```
┌─────────────────────────────────────┐
│ 🔀 [Icon]  Valor do carrinho       │
│                                     │
│ Cart Value > R$200                  │
│                                     │
│     Sim ─────────── Não             │
└──────┬──────────────┬───────────────┘
       │              │
```

### Node A/B Test
```
┌─────────────────────────────────────┐
│ 🔀 [Icon]  Teste A/B               │
│                                     │
│    A (50%) ──────── B (50%)         │
│                                     │
│ 📊 A: 12.3% conv  B: 8.7% conv    │
└──────┬──────────────┬───────────────┘
       │              │
```

## 8.5 Responsividade

- Canvas: Usa virtualização do React Flow, funciona em qualquer tamanho
- Sidebar: Colapsável via ícone de toggle
- Properties Panel: Colapsável, overlay em telas menores
- Mobile: Flow builder é desktop-only (mensagem amigável em mobile)

---

# 9. INTEGRAÇÃO COM SHOPIFY, EMAIL EDITOR E CDP {#9-integracoes}

## 9.1 Conectar CDP Events aos Triggers do Flow

### Fluxo Completo de um Evento

```
1. Cliente abandona carrinho na Shopify
2. Web Pixel detecta: analytics.subscribe('checkout_started')
3. Pixel envia POST /api/track/event com dados
4. /api/track/event:
   a. Valida accountId + storeId
   b. Resolve contact por email ou shopifyCustomerId
   c. Insere na tabela contact_events
   d. Chama event-processor.ts.processEvent()
5. event-processor.ts:
   a. Busca automações ativas com trigger_type = 'trigger_checkout_started'
   b. Para cada automação:
      - Verifica trigger_filters (ex: cart_value > 50)
      - Verifica audience_filters (ex: country = BR)
      - Verifica frequency (ex: não disparou nas últimas 4h)
      - Se todas passam: cria automation_run
6. execution-engine.ts:
   a. Carrega flow_data (nodes + edges)
   b. Executa node por node seguindo as edges
   c. Para delays: cria step com resume_at e status=waiting
   d. Para conditions: avalia e segue caminho SIM ou NÃO
   e. Para email: busca template, renderiza, envia via Resend
7. Para runs em waiting: cron worker verifica a cada 1 min e retoma
```

### Código do Event Processor (como deve funcionar)

```typescript
// src/lib/automation/event-processor.ts

export async function processEvent(event: {
  type: string;        // 'checkout_started', 'placed_order', etc.
  contact_id: string;
  store_id: string;
  organization_id: string;
  data: Record<string, any>;
  event_id: string;
}) {
  const supabase = getSupabaseAdmin();

  // 1. Buscar automações ativas com este trigger type
  const { data: automations } = await supabase
    .from('automations')
    .select('*')
    .eq('organization_id', event.organization_id)
    .eq('store_id', event.store_id)
    .eq('status', 'active')
    .eq('trigger_type', mapEventToTrigger(event.type));

  if (!automations?.length) return;

  for (const automation of automations) {
    // 2. Verificar trigger filters
    if (!passTriggerFilters(event.data, automation.trigger_filters)) continue;

    // 3. Verificar audience filters (dados do contato)
    const { data: contact } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', event.contact_id)
      .single();
    if (!passAudienceFilters(contact, automation.audience_filters)) continue;

    // 4. Verificar frequency
    if (!passFrequency(event.contact_id, automation.id, automation.frequency_config)) continue;

    // 5. Criar automation_run e executar
    await executionEngine.startRun(automation, contact, event);
  }
}
```

## 9.2 Worker de Delay (Cron)

```typescript
// src/app/api/workers/automation-delay/route.ts
// Chamado via Vercel Cron a cada 1 minuto

export async function GET() {
  const supabase = getSupabaseAdmin();

  // Buscar steps em waiting que já passaram do resume_at
  const { data: pendingSteps } = await supabase
    .from('automation_run_steps')
    .select('*, automation_runs(*)')
    .eq('status', 'waiting')
    .lte('resume_at', new Date().toISOString())
    .limit(100);

  for (const step of pendingSteps || []) {
    await executionEngine.resumeRun(step.run_id, step.node_id);
  }

  return Response.json({ processed: pendingSteps?.length || 0 });
}
```

## 9.3 Worker de Carrinho Abandonado

```typescript
// src/app/api/workers/abandoned-cart/route.ts
// Chamado via Vercel Cron a cada 10 minutos

export async function GET() {
  const supabase = getSupabaseAdmin();

  // Buscar checkouts que não tiveram placed_order em X horas
  // Para cada, gerar evento 'abandoned_cart' e processar
  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 horas atrás

  const { data: abandonedCheckouts } = await supabase
    .from('contact_events')
    .select('*')
    .eq('event_type', 'checkout_started')
    .lte('created_at', cutoff.toISOString())
    .is('abandoned_cart_processed', null); // flag para não processar 2x

  for (const checkout of abandonedCheckouts || []) {
    // Verificar se houve placed_order depois
    const { data: orders } = await supabase
      .from('contact_events')
      .select('id')
      .eq('contact_id', checkout.contact_id)
      .eq('event_type', 'placed_order')
      .gte('created_at', checkout.created_at)
      .limit(1);

    if (!orders?.length) {
      // É abandono! Criar evento e processar
      await processEvent({
        type: 'abandoned_cart',
        contact_id: checkout.contact_id,
        store_id: checkout.store_id,
        organization_id: checkout.organization_id,
        data: checkout.event_data,
        event_id: checkout.id,
      });
    }

    // Marcar como processado
    await supabase
      .from('contact_events')
      .update({ abandoned_cart_processed: true })
      .eq('id', checkout.id);
  }
}
```

## 9.4 Integração com Email Editor

### No Flow Builder → Selecionar Template

```typescript
// Dentro do PropertiesPanel, ao configurar um node action_email:

// 1. Dropdown de templates filtrado por store_id
const { data: templates } = await fetch(
  `/api/email/templates?storeId=${automation.store_id}`
).then(r => r.json());

// 2. Opções:
// - "Nenhum (usar HTML abaixo)" → mostra textarea de HTML
// - Template selecionado → mostra preview + botão "Editar no Editor"
// - "Criar Novo" → abre /email-editor?flowId=X&nodeId=Y

// 3. Ao salvar no editor, retorna com templateId e atualiza o node config
```

### No Executor → Renderizar e Enviar

```typescript
// node-executors.ts → action_email executor

async function executeEmailAction(node, context, contact) {
  let html: string;

  if (node.config.templateId) {
    // 1. Buscar template do banco
    const template = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', node.config.templateId)
      .single();

    // 2. Renderizar JSON para HTML
    html = renderDocumentToHtml(template.design_json);

    // 3. Resolver merge tags
    html = resolveMergeTags(html, {
      contact,
      event: context.triggerEvent,
      store: context.store,
    });

    // 4. Resolver product blocks
    html = await resolveProductBlocks(html, contact, context.store);
  } else {
    html = node.config.html || '';
    html = resolveMergeTags(html, { contact, event: context.triggerEvent });
  }

  // 5. Enviar via Resend
  await resend.emails.send({
    from: `${node.config.senderName} <${node.config.senderEmail}>`,
    to: contact.email,
    subject: resolveMergeTags(node.config.subject, { contact, event: context.triggerEvent }),
    html,
  });
}
```

---

# 10. ERROS COMUNS DO CLAUDE CODE E COMO EVITÁ-LOS {#10-erros-claude}

## 10.1 Erro: "Dizer que fez mas não fez"

**Problema**: Claude Code frequentemente afirma que implementou todas as funcionalidades sem fazer mudanças reais nos arquivos.

**Prevenção**:
- OBRIGATÓRIO: Cada tarefa termina com `pnpm build` — se não compila, não foi feito
- OBRIGATÓRIO: Após cada tarefa, `grep -n "código_esperado" arquivo.tsx` para confirmar
- OBRIGATÓRIO: Nunca aceitar "já estava implementado" — verificar com `cat` do arquivo real

## 10.2 Erro: Criar Componentes Genéricos "de IA"

**Problema**: Código gerado por IA tende a ter aparência genérica — bordas arredondadas demais, gradientes desnecessários, cores neon, layouts simétricos demais.

**Prevenção**:
- Seguir ESTRITAMENTE as cores e padrões definidos na seção 8 deste documento
- ZERO gradientes nos nodes e painéis
- ZERO sombras coloridas (box-shadow deve ser neutro: gray)
- Bordas: 1px solid gray-200, NUNCA mais grossa que 2px (exceto borda esquerda do node que é 4px)
- Fontes: Inter ou system font stack, NUNCA fontes decorativas
- Espaçamento: Usar classes Tailwind padrão (p-3, p-4, gap-2, gap-3), NÃO valores arbitrários

## 10.3 Erro: Não Respeitar Multi-Tenancy

**Problema**: Queries sem `organization_id` ou `store_id` vazam dados entre organizações.

**Prevenção**:
- TODA query ao Supabase DEVE incluir `.eq('organization_id', orgId)`
- Templates filtrados por store_id quando disponível
- Automações sempre filtradas por organization_id E store_id
- NUNCA expor IDs internos em URLs públicas

## 10.4 Erro: Quebrar Funcionalidades Existentes

**Problema**: Ao adicionar features novas, Claude Code frequentemente quebra features existentes por não ler o código antes.

**Prevenção**:
- REGRA NÚMERO 1: `cat` do arquivo ANTES de editar
- REGRA NÚMERO 2: Usar `str_replace` com strings exatas, NUNCA reescrever arquivo inteiro
- REGRA NÚMERO 3: `pnpm build` após CADA modificação
- REGRA NÚMERO 4: Se o build falha, reverter e tentar de novo com abordagem diferente

## 10.5 Erro: State Management Inconsistente

**Problema**: Criar states locais duplicados ao invés de usar o Zustand store existente.

**Prevenção**:
- USAR `flowStore` para TODO estado do flow builder
- Novos campos vão no store existente, NÃO em useState local
- Undo/redo do Zustand deve cobrir todas as mudanças
- NUNCA criar um novo store quando já existe um

## 10.6 Erro: Hardcoded Mock Data

**Problema**: Preencher UIs com dados falsos ao invés de buscar do Supabase.

**Prevenção**:
- ZERO dados mockados na versão final
- Todo dropdown, lista, preview deve buscar dados reais da API
- Se a API não existe, CRIAR a API primeiro, depois o UI
- Loading states obrigatórios enquanto dados carregam

## 10.7 Erro: Ignorar TypeScript Types

**Problema**: Usar `any` em tudo ou não tipar propriedades novas.

**Prevenção**:
- Todo novo campo/prop DEVE ter tipo em `flow-builder.ts`
- ZERO `any` — usar tipos específicos ou `unknown` com type guard
- Interfaces exportadas para reuso

## 10.8 Erro: React Flow — Não Conectar Handles

**Problema**: Nodes sem handles de conexão ou handles posicionados errado.

**Prevenção**:
- Cada node DEVE ter `Handle` de `Position.Top` (source input) e `Position.Bottom` (target output)
- Nodes de Split DEVEM ter 2 outputs: um para SIM e outro para NÃO
- Edge type: `smoothstep` para curvas suaves
- NUNCA `default` edge type (fica com ângulos retos feios)

## 10.9 Erro: Sidebar Drag-and-Drop Não Funcional

**Problema**: Itens da sidebar que parecem arrastáveis mas não funcionam.

**Prevenção**:
- Usar `onDragStart` com `dataTransfer.setData('application/reactflow', nodeType)`
- No canvas: `onDrop` + `onDragOver` com `preventDefault()`
- Testar arrastando CADA tipo de bloco individualmente
- Cursor: `cursor-grab` na sidebar, `cursor-grabbing` durante drag

## 10.10 Erro: Performance com Muitos Nodes

**Problema**: Canvas fica lento com mais de 20 nodes.

**Prevenção**:
- Usar `memo()` em TODOS os custom nodes
- Usar `useCallback` para handlers de events
- NUNCA renderizar componentes pesados dentro dos nodes no canvas — detalhes ficam no Properties Panel
- React Flow já tem virtualização, mas os custom nodes devem ser leves

---

# 11. PLANO DE EXECUÇÃO FASEADO {#11-fases}

## Fase 1: Foundation (Dias 1-3)

### 1A: Light Mode + Design System
- Substituir TODAS as cores hardcoded dark por Tailwind light
- Implementar o design system da seção 8
- Canvas: bg-gray-50 com grid
- Nodes: bg-white com borda esquerda colorida
- Sidebar: bg-white com seções colapsáveis
- Properties Panel: bg-white
- Header: bg-white com border-bottom
- `pnpm build` → Verificar visual

### 1B: Reorganizar Sidebar
- Reorganizar blocos conforme seção 7.1
- Adicionar todos os tipos de trigger e ação faltantes
- Ícones Lucide para cada bloco (zero emoji)
- Campo de busca funcional
- Seções colapsáveis com animação suave
- `pnpm build` → Verificar drag-and-drop de cada bloco

### 1C: Properties Panel — Trigger Config
- Trigger Filters (até 5)
- Audience Filters (dados do contato)
- Exit Conditions (até 4)
- Frequency config
- Preview de Trigger (botão testar)
- `pnpm build` → Verificar que configs salvam no flow_data

## Fase 2: Flow Logic (Dias 4-6)

### 2A: Conditional Split Completo
- 20+ operadores (seção 7.5)
- Múltiplas condições com AND/OR
- Labels SIM/NÃO nos edges
- Cores verde/vermelho nos paths
- Rejoin paths (reconectar SIM e NÃO)
- `pnpm build`

### 2B: A/B Test Block
- Split ratio configurável (slider)
- Labels customizáveis
- Métricas por caminho
- Botão "Definir Vencedor"
- `pnpm build`

### 2C: Delay Configuração Completa
- Duração + unidade
- Dias da semana (checkboxes)
- Horário de envio
- Lógica de "esperar até próximo horário permitido"
- `pnpm build`

## Fase 3: Actions & Integrations (Dias 7-10)

### 3A: Email Action Completa
- Dropdown de templates filtrado por store_id
- Preview do template no painel
- Subject line + preheader com merge tags
- Botão "Criar Novo" e "Editar" que abre editor
- Smart Sending toggle
- UTM Tracking
- `pnpm build`

### 3B: Executor de Email Completo
- Buscar template por templateId
- Renderizar JSON para HTML
- Resolver merge tags (contact, event, store)
- Resolver product blocks
- Enviar via Resend
- `pnpm build`

### 3C: Event Processor → Triggers
- Conectar `/api/webhooks/shopify` com processEvent()
- Conectar `/api/track/event` com processEvent()
- Mapear event types para trigger types
- Verificar trigger_filters, audience_filters, frequency
- Criar automation_run
- `pnpm build`

### 3D: Delay Worker (Cron)
- API route para Vercel Cron
- Buscar steps em waiting com resume_at <= now
- Retomar execução do run
- `vercel.json` com cron config
- `pnpm build`

### 3E: Abandoned Cart Worker
- API route para Vercel Cron (cada 10 min)
- Detectar checkouts sem placed_order após 4h
- Gerar evento abandoned_cart
- `pnpm build`

## Fase 4: Templates & Analytics (Dias 11-13)

### 4A: 5 Flow Templates Pré-Construídos
- Carrinho Abandonado
- Boas-Vindas
- Pós-Compra
- Reconquistar
- Navegação Abandonada
- Cada template com nodes, edges, configs completas
- Modal de seleção de template ao criar novo flow
- `pnpm build`

### 4B: Analytics no Canvas
- Toggle "Show Analytics" no header
- Métricas por node: Sent, Opened, Clicked, Revenue
- Dados vindos de automation_run_steps
- Timeframe selector (7d, 30d, 90d, all)
- Stats aggregados no header do flow
- `pnpm build`

### 4C: Alerts System
- Verificar erros antes de ativar (trigger não configurado, email sem subject, etc.)
- Verificar recomendações (delay antes de split, etc.)
- Badge com count de erros no header
- Painel de alerts com quick-fix buttons
- `pnpm build`

## Fase 5: Polish (Dias 14-15)

### 5A: Minimap e Navegação
- MiniMap do React Flow configurado
- Controls com zoom in/out/fit
- Pan com cursor
- `pnpm build`

### 5B: Undo/Redo Visual
- Botões Undo/Redo no toolbar
- Keyboard shortcuts: Ctrl+Z, Ctrl+Shift+Z
- `pnpm build`

### 5C: Status de Ações Individuais
- Cada action node tem status: Draft, Live, Paused
- Toggle no corner do node
- Status badge visível
- `pnpm build`

### 5D: Copy/Paste de Nodes
- Ctrl+C, Ctrl+V para duplicar nodes
- Botão "Duplicar" no context menu
- `pnpm build`

### 5E: Publish/Activate Flow Duplo
- "Salvar" salva as edições (publish)
- "Ativar" torna o flow live
- Salvar sem ativar mantém versão anterior rodando
- `pnpm build`

### 5F: Teste End-to-End
- Criar flow de Carrinho Abandonado do zero
- Adicionar trigger, delay, email, condition, segundo email
- Salvar e ativar
- Simular evento de checkout_started
- Verificar que automation_run foi criado
- Verificar que delay worker funciona
- Verificar que email seria enviado (modo teste)

---

# 12. PROMPT DE EXECUÇÃO PARA CLAUDE CODE {#12-prompt}

```markdown
# AUTORUN-FLOW-BUILDER-COMPLETO.md

## INSTRUÇÃO CRÍTICA:
```
Branch: claude/merge-branches-unified-0aI2u
MODO AUTORUN. NÃO PARE. NÃO PERGUNTE. Execute até o final.
LER CADA arquivo ANTES de modificar. NÃO assumir conteúdo.
pnpm build APÓS CADA tarefa (1A, 1B, 1C, 2A, etc.).
ZERO dados mockados. Tudo integrado com Supabase real.
ZERO emojis no código/UI. Apenas ícones Lucide React.
ZERO gradientes, neon, 3D. Design limpo e profissional.
ZERO any em TypeScript. Tipos explícitos para tudo.
ZERO useState local para dados do flow. Usar flowStore (Zustand).
```

## REFERÊNCIA OBRIGATÓRIA:
Ler o documento WORDER-FLOW-BUILDER-COMPLETO.md na íntegra antes de começar.

## VERIFICAÇÃO INICIAL (executar ANTES de começar):
```bash
cd /path/to/worder1
git checkout claude/merge-branches-unified-0aI2u
git pull

echo "=== FLOW BUILDER ==="
wc -l src/components/flow-builder/*.tsx src/components/flow-builder/nodes/*.tsx src/components/flow-builder/panels/*.tsx

echo "=== EXECUTION ENGINE ==="
wc -l src/lib/automation/*.ts

echo "=== FLOW STORE ==="
cat src/stores/flowStore.ts | head -50

echo "=== TYPES ==="
cat src/types/flow-builder.ts | head -50

echo "=== EMAIL TEMPLATES API ==="
cat src/app/api/email/templates/route.ts | head -30

echo "=== WEBHOOK PROCESSOR ==="
cat src/app/api/webhooks/shopify/route.ts | head -30

echo "=== EVENT PROCESSOR ==="
cat src/lib/automation/event-processor.ts | head -30

echo "=== CURRENT DESIGN (dark mode?) ==="
grep -rn "bg-gray-9\|bg-\[#\|bg-black\|bg-slate-9\|dark:" src/components/flow-builder/ | head -20
```

## EXECUÇÃO:
Seguir as fases do documento seção 11, tarefa por tarefa.
Após cada tarefa: `pnpm build`
Após cada tarefa: `grep` para confirmar que a mudança foi realmente aplicada.
Ao final: teste completo criando um flow de carrinho abandonado.
```

---

# FIM DO DOCUMENTO

Este documento contém toda a informação necessária para implementar o flow builder completo da Worder:
- Funcionalidades detalhadas da Klaviyo e Omnisend como referência
- Design system completo com cores, ícones e layout
- Integração com todos os sistemas existentes (Shopify, Email, CDP)
- Prevenção de erros comuns do Claude Code
- Plano de execução faseado com critérios de verificação
- Prompt pronto para execução no Claude Code
