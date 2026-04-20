# PROMPT DEFINITIVO — Sistema WhatsApp Completo para Worder

> **INSTRUÇÃO PRINCIPAL:** Você é um programador senior. Desenvolva este sistema completo, funcional e pronto para produção. Não deixe TODOs, não pule partes, não implemente versões parciais. Cada feature deve estar 100% funcional. Ao final, gere o SQL consolidado e faça a revisão completa.

---

## 1. CONTEXTO DO PROJETO

**Repositório:** https://github.com/matheusmarques6/worder1  
**Branch:** claude/merge-branches-unified-0aI2u

**Stack existente:** Next.js 14, TypeScript 5, React 18, Supabase (PostgreSQL + Realtime + Auth + Storage), Tailwind CSS, Radix UI, Zustand, Upstash (QStash + Redis), @xyflow/react, Vercel, date-fns, lucide-react, clsx + tailwind-merge, recharts, framer-motion, exceljs.

**Multi-tenant:** TODAS as tabelas usam `organization_id` + `store_id` com RLS. Seguir o padrão de `SEGURANCA-MULTI-TENANT.md` do repo. Hook `useStoreApi`/`useStoreStore` já existe para contexto de loja.

**Já funciona no sistema:**
- CRM completo: pipelines, deals, contatos com filtro por store_id
- Builder visual de automações: @xyflow/react funcional (cria, salva, executa fluxos)
- Integração Shopify: webhooks funcionando (carrinho abandonado, pedido criado, pedido pago, pedido enviado, pedido entregue)
- Campaign worker: `worker/campaign-worker.ts` existente
- Sistema de agentes: tabela de agents com status
- Tabelas WhatsApp parciais: `whatsapp_conversations` e `whatsapp_messages` (com bugs de duplicação já documentados em `CORRECAO-MENSAGENS-README.md`)
- Webhook WhatsApp existente (Evolution API): `src/app/api/whatsapp/evolution/webhook/route.ts` — será substituído pela conexão direta com Meta

**Padrão de código da Worder (seguir rigorosamente):**
- Imports: `@/lib/`, `@/components/`, `@/stores/`, `@/hooks/`
- Componentes UI: Radix UI (Dialog, Popover, Select, Tabs, Tooltip, DropdownMenu, Avatar)
- State global: Zustand (NÃO useState para state compartilhado)
- Ícones: lucide-react
- Datas: date-fns (formatDistanceToNow, format, parseISO)
- Classes CSS: clsx + tailwind-merge via função cn()
- API routes: Next.js App Router (export async function GET/POST/PUT/DELETE)
- Supabase server: usar `createServerComponentClient` ou `createRouteHandlerClient`
- Supabase admin (webhook): usar `createClient` com SUPABASE_SERVICE_ROLE_KEY

---

## 2. O QUE CONSTRUIR

Sistema completo de WhatsApp para e-commerce com conexão DIRETA à API oficial da Meta (Cloud API via graph.facebook.com). Zero dependências externas (sem Evolution API, sem Chatwoot, sem BSPs).

### Módulo A — Multi-atendimento
- Inbox compartilhado com múltiplos agentes
- Múltiplos números WhatsApp por organização
- Filas de atendimento por departamento (vendas, suporte, financeiro)
- Distribuição automática de conversas (round-robin)
- Transferência entre agentes e departamentos
- Notas internas (só agentes veem)
- Respostas rápidas com /slash commands
- Tags em conversas e contatos
- Status de conversa (aberta, pendente, resolvida, arquivada)
- Horário de atendimento (dentro/fora do expediente)
- Avaliação de satisfação (CSAT) ao resolver conversa
- Painel CRM do contato integrado ao chat
- Indicador de janela de serviço 24h

### Módulo B — Automações de e-commerce (via WhatsApp)
- Recuperação de carrinho abandonado
- Recuperação de boleto/PIX pendente
- Pós-venda automático
- Rastreamento de pedido (status updates)
- Confirmação ativa de pedido (SIM/NÃO)
- Notificação back-in-stock (produto voltou ao estoque)
- Giftback / Cashback automático (gerar cupom Shopify)
- Recompra/reativação automática baseada em RFM
- Delays configuráveis por step
- Teste A/B (randomizer) nos fluxos
- Nós de WhatsApp no builder visual @xyflow/react existente

### Módulo C — IA e Chatbot
- Chatbot com IA (OpenAI API — gpt-4o-mini)
- Treinar com FAQ da loja (knowledge base)
- Agente de vendas IA (foco em conversão)
- Agente de suporte IA (foco em resolver)
- Modo configurável pelo usuário: "só IA", "só humano", "IA primeiro → humano se precisar", "humano com copilot IA"
- Handoff inteligente IA → humano (keywords ou incerteza)
- Copilot: sidebar que sugere respostas ao agente em tempo real

### Módulo D — Campanhas em massa
- Envio em massa via WhatsApp
- Gestão de templates Meta (criar, submeter para aprovação, ver status)
- Segmentação por tags, pipeline CRM, segmento RFM, comportamento
- Agendamento de envio
- Rate limiting (80msg/s, respeitar tier Meta)
- Retry automático para falhas
- Dashboard com métricas (enviadas, entregues, lidas, falhadas)
- Carrossel de produtos no WhatsApp

### Módulo E — Catálogo e vendas no WhatsApp
- Enviar catálogo de produtos no chat (Meta Product Catalog)
- Enviar produto individual com imagem, preço, descrição, botão
- Link de pagamento no chat (integração com gateway)
- Rastrear conversão de vendas por conversa

### Módulo F — Ferramentas e configuração
- Opt-in / opt-out management (gestão de consentimento)
- Plugin de WhatsApp para o site do cliente (widget JS)
- Horário de atendimento automático (dentro/fora do expediente)
- Matriz RFM (segmentação comportamental de contatos)
- Click-to-WhatsApp Ads tracking (janela 72h)
- WhatsApp Flows (formulários nativos no WhatsApp)
- Selo de verificado (Blue Tick) — documentação de como obter

---

## 3. REPOSITÓRIOS PARA CLONAR, ESTUDAR E COPIAR

```bash
git clone https://github.com/hetref/whatsapp-chat.git /tmp/wachat
git clone https://github.com/macbservices/Whaticket-Saas-2024.git /tmp/whaticket
git clone https://github.com/WhatsApp/WhatsApp-Nodejs-SDK.git /tmp/meta-sdk
```

### 3.1 WaChat (MIT — pode copiar e modificar)
Mesma stack da Worder (Next.js, TypeScript, Supabase, Tailwind, Vercel).

**Copiar e adaptar estes arquivos:**
- `app/api/webhook/route.ts` → `src/app/api/whatsapp/webhook/route.ts` (adicionar multi-tenant, rotear por instance_id)
- `app/api/send-message/route.ts` → `src/lib/services/whatsapp/client.ts` (transformar em service, adicionar sender tracking)
- `app/api/send-template/route.ts` → `src/app/api/whatsapp/send-template/route.ts`
- `app/api/upload-media/route.ts` → `src/app/api/whatsapp/media/route.ts` (trocar AWS S3 por Supabase Storage)
- `app/api/templates/route.ts` → `src/app/api/whatsapp/templates/route.ts`
- `components/` (ChatWindow, MessageList, MessageInput) → `src/components/inbox/` (adaptar para Radix UI)
- Schema SQL do README → expandir com multi-tenant + agentes + filas

**NÃO copiar:** auth/middleware (Worder tem o próprio), AWS S3 config, layout geral, package.json.

### 3.2 Whaticket SaaS 2024 (MIT — copiar lógica de negócio)
Stack diferente (Express + MySQL + Sequelize), mas a lógica de multi-atendimento é a mais completa que existe em open source.

**Copiar a LÓGICA destes services e adaptar de Sequelize → Supabase:**
- `backend/src/services/TicketServices/CreateTicketService.ts` → lógica de criação de conversa + round-robin
- `backend/src/services/TicketServices/UpdateTicketService.ts` → transferência, mudança de status
- `backend/src/services/TicketServices/ListTicketsService.ts` → listagem com filtros
- `backend/src/services/QueueService/` → filas de atendimento
- `backend/src/services/QuickMessageService/` → respostas rápidas
- `backend/src/services/MessageServices/` → CRUD de mensagens
- `backend/src/services/TagService/` → tags
- `backend/src/services/ContactServices/` → integrar com contacts da Worder
- `backend/src/helpers/SetTicketMessagesAsRead.ts` → marcar como lidas + chamar API Meta
- `frontend/src/components/TicketsList/` → referência para UI da lista
- `frontend/src/components/TransferTicketModal/` → referência para modal

**Adaptação Sequelize → Supabase:**
- `Model.findOne({ where: { id } })` → `supabase.from('tabela').select().eq('id', id).single()`
- `Model.findAll({ where, order })` → `supabase.from('tabela').select().eq().order()`
- `Model.create(data)` → `supabase.from('tabela').insert(data).select().single()`
- `Model.update(data, { where })` → `supabase.from('tabela').update(data).eq().select().single()`
- `Socket.io emit` → Supabase Realtime (automático, sem precisar emitir — o INSERT/UPDATE já notifica)

### 3.3 SDK oficial Meta (MIT — copiar types)
- Copiar types de `src/types/` para `src/lib/services/whatsapp/types.ts`
- Usar como referência para validação de webhook HMAC-SHA256

---

## 4. BUGS E ERROS QUE VOCÊ NÃO PODE COMETER

### 4.1 Race condition no webhook (CRÍTICO)
A Meta envia o mesmo webhook mais de uma vez. SEMPRE usar upsert com ON CONFLICT:
```typescript
// CORRETO
const { data } = await supabase.from('whatsapp_messages')
  .upsert({ wamid, conversation_id, content, ... }, { onConflict: 'wamid' })
  .select().single();

// ERRADO — gera duplicatas
const { data } = await supabase.from('whatsapp_messages')
  .insert({ wamid, conversation_id, content, ... });
```

### 4.2 Conversas duplicadas (CRÍTICO)
A Worder já teve esse bug (ver `CORRECAO-MENSAGENS-README.md`). SEMPRE usar upsert com UNIQUE(instance_id, contact_phone):
```typescript
const { data } = await supabase.from('whatsapp_conversations')
  .upsert({
    instance_id, contact_phone, contact_name,
    last_message_at: new Date().toISOString(),
    last_message_preview: messageText?.substring(0, 100),
    organization_id, store_id,
  }, { onConflict: 'instance_id,contact_phone' })
  .select().single();
```

### 4.3 Webhook DEVE retornar 200 imediatamente (CRÍTICO)
A Meta espera resposta em menos de 20 segundos. Se não, faz retry e gera duplicatas.
```typescript
export async function POST(request: NextRequest) {
  const body = await request.json();
  // 1. Validar HMAC-SHA256
  // 2. Retornar 200 ANTES de processar
  // 3. Processar em background
  waitUntil(processWebhook(body)); // ou processar async
  return NextResponse.json({ status: 'received' }, { status: 200 });
}
```

### 4.4 Memory leak no Supabase Realtime
TODA subscription DEVE ter cleanup:
```typescript
useEffect(() => {
  const channel = supabase.channel(`inbox-${conversationId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public',
      table: 'whatsapp_messages',
      filter: `conversation_id=eq.${conversationId}`
    }, handleNewMessage)
    .subscribe();
  return () => { supabase.removeChannel(channel); }; // OBRIGATÓRIO
}, [conversationId]);
```

### 4.5 Janela de serviço 24h da Meta
Fora da janela, SOMENTE templates aprovados. SEMPRE verificar antes de enviar:
```typescript
const isWindowOpen = conversation.service_window_expires_at &&
  new Date(conversation.service_window_expires_at) > new Date();

if (!isWindowOpen && messageType !== 'template') {
  return { error: 'Janela expirada. Somente templates permitidos.' };
}
```
Na UI: quando janela expirada, DESABILITAR campo de texto livre e mostrar apenas botão "Enviar template".

### 4.6 Error handling da API Meta
SEMPRE tratar estes códigos:
- 130472: Rate limit → pausar envio, retry com backoff exponencial
- 131000: Erro genérico → logar detalhes, não retry
- 131026: Não entregável → marcar como failed, não retry
- 131047: Re-engagement necessário → só template permitido
- 132000: Parâmetros do template incorretos → logar e notificar usuário
- 368: Conta temporariamente bloqueada → pausar TODOS os envios, alertar admin

Logar TODOS os erros na tabela whatsapp_messages com error_code e error_message.

### 4.7 Estado global poluído
Separar stores Zustand:
- `inboxStore` → conversations, activeConversation, filters, unreadCounts
- `whatsappConfigStore` → instances, templates, queues, quickReplies, aiAgents

### 4.8 Performance da lista de conversas
Se tiver mais de 50 conversas visíveis, usar virtualização (react-window ou observer intersection). Sem isso, re-render de 200+ conversas trava a UI.

### 4.9 Loading states em TUDO
TODA operação assíncrona DEVE ter: estado loading (skeleton/spinner), estado error (mensagem + retry), estado empty (ilustração + texto orientativo), estado success. Botão "Enviar" DEVE desabilitar durante envio. NUNCA deixar botão sem feedback visual ao clicar.

### 4.10 Optimistic UI para mensagens
Ao enviar mensagem, MOSTRAR IMEDIATAMENTE na tela com status "enviando..." (ícone de relógio). Quando a API da Meta confirmar, atualizar para ✓. Se falhar, mostrar ❌ com opção de reenviar.

### 4.11 RLS em TODAS as tabelas novas
```sql
ALTER TABLE nome_tabela ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON nome_tabela FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));
```

### 4.12 Não usar console.log em produção
Usar um logger service que pode ser desligado. Em produção, zero console.log.

### 4.13 TypeScript sem any
Tipar TUDO. Se um repo de referência tem `any`, corrigir para o tipo correto. Usar os types do SDK Meta como base.

---

## 5. TELAS — ESPECIFICAÇÃO COMPLETA DE CADA TELA

### Tela 1: Inbox (/inbox)

**Layout:** 3 colunas responsivo. Em desktop: 320px | flex-1 | 300px. Em tablet: 2 colunas (lista + chat, painel esconde). Em mobile: 1 coluna (lista → chat → painel, navegação por stack).

**Coluna esquerda — Lista de conversas (320px):**
- Header fixo:
  - Campo de busca com ícone Search (debounce 300ms, busca por nome ou telefone)
  - Botão de filtros (Popover Radix UI) com: Status (todas/abertas/pendentes/resolvidas), Agente (todas/minhas/selecionar), Fila, Tags
  - Tabs rápidas: "Minhas" | "Não atribuídas" | "Todas"
- Lista scrollável:
  - Cada item: Avatar (iniciais ou foto), nome do contato (bold se não lida), preview da última msg (truncar 60 chars, italic se é nota interna), horário relativo (date-fns formatDistanceToNow em pt-BR), badge de não lidas (bolinha com número, bg-destructive), mini-avatar do agente atribuído (canto inferior direito do avatar), ícone de robô se bot ativo, chip de tag colorido (primeiro tag só)
  - Conversa ativa: bg-accent
  - Ordenar por last_message_at DESC
  - Scroll infinito com paginação cursor-based (carregar 20 por vez)
- Footer: contador "X conversas abertas"

**Coluna central — Chat (flex-1):**
- Header fixo:
  - Avatar + nome + telefone do contato
  - Badge de status (aberta=verde, pendente=amarelo, resolvida=cinza)
  - Indicador de janela: "Janela ativa — Xh restantes" (verde) ou "Janela expirada" (vermelho com ícone de alerta)
  - Botões de ação (à direita):
    - "Resolver" (CheckCircle) → muda status para resolved, envia CSAT automaticamente se configurado
    - "Transferir" (ArrowRightLeft) → abre modal de transferência
    - "Bot" (Bot) → toggle IA on/off com confirmação
    - Menu dropdown (MoreVertical): "Marcar pendente", "Arquivar", "Adicionar tag" (sub-popover com input), "Enviar catálogo", "Enviar link de pagamento"
- Barra de janela de serviço (condicional):
  - Se janela ativa: barra verde sutil no topo "Janela de serviço ativa — expira em Xh Xmin"
  - Se janela expirada: barra vermelha "Janela expirada — somente templates permitidos"
- Área de mensagens (scroll):
  - Mensagens do cliente: alinhadas à esquerda, fundo bg-muted, rounded-lg
  - Mensagens do agente: alinhadas à direita, fundo bg-primary text-primary-foreground, rounded-lg
  - Mensagens do bot: alinhadas à direita com ícone de robô pequeno, fundo bg-blue-100
  - Notas internas: centralizado, fundo bg-yellow-50, borda dashed, ícone de cadeado, texto "Nota interna de [Agente]"
  - Separador "Mensagens não lidas" (linha com texto centralizado)
  - Status de mensagem enviada: ✓ (enviada), ✓✓ (entregue), ✓✓ azul (lida), ❌ (falhou + botão reenviar), ⏳ (enviando — optimistic)
  - Horário em cada mensagem (formato HH:mm)
  - Mídia inline: imagem (thumbnail clicável → lightbox), vídeo (player HTML5), áudio (player com barra de progresso), documento (ícone + nome + tamanho + download)
  - Template renderizado: card visual com header/body/footer/botões estilizados
  - Catálogo/produto: card com imagem, nome, preço, botão "Ver produto"
  - Scroll automático para baixo ao receber nova mensagem (só se já estiver no bottom)
  - "Carregar mensagens anteriores" no topo (paginação por cursor)
- Input de mensagem (fixo no bottom):
  - Se janela ativa:
    - Textarea autoexpand (1-5 linhas), Enter=enviar, Shift+Enter=nova linha
    - Botão de anexo (Paperclip): dropdown com Imagem, Vídeo, Áudio, Documento — ao selecionar, preview antes de enviar
    - Botão de emoji (Smile): emoji picker (usar componente leve, não lib pesada)
    - Botão de template (FileText): abre selector de templates aprovados
    - Botão de catálogo (ShoppingBag): abre selector de produtos
    - Ao digitar "/", mostrar dropdown de respostas rápidas filtradas pelo que digitou
    - Botão enviar (Send) — desabilita durante envio, volta após confirmação
  - Se janela expirada:
    - Textarea desabilitada com placeholder "Janela expirada"
    - Único botão ativo: "Enviar template" (azul, destaque)
  - Indicador de digitação: "Agente X está digitando..." (se implementar)

**Coluna direita — Painel do contato (300px):**
- Seção "Contato": foto (Avatar grande), nome, telefone, email, WhatsApp, botão "Editar contato"
- Seção "Tags": chips de tags com cores, botão "+" para adicionar (input com autocomplete de tags existentes)
- Seção "Atendimento": agente atribuído (avatar + nome), fila atual, tempo de espera, botão "Alterar agente"
- Seção "CRM": card com pipeline atual → estágio → valor do deal. Botão "Ver deal" (link) ou "Criar deal" (abre modal CRM existente)
- Seção "Compras recentes" (dados Shopify): lista das últimas 5 compras com número do pedido, valor (formatado R$), data, status (pago/enviado/entregue) com chip colorido
- Seção "Notas internas": lista de notas com avatar do agente, texto, data relativa. Campo para adicionar nova nota (textarea + botão "Salvar nota")
- Seção "Histórico": lista de conversas anteriores (data, duração, agente, status). Clicar abre a conversa no chat.
- Seção "Métricas do contato": total de conversas, tempo médio de resposta, última compra, valor total gasto (Shopify), segmento RFM (badge colorido: "Campeão", "Em risco", etc.)

### Tela 2: Modal de transferência

- Radix UI Dialog (max-w-md)
- Tabs: "Agente" | "Fila"
- Tab "Agente": lista de agentes com avatar, nome, status (online=bolinha verde, ausente=amarelo, offline=cinza), quantidade de conversas abertas. Só mostrar agentes online/ausentes. Select para escolher.
- Tab "Fila": lista de filas com nome, cor, quantidade de agentes online, conversas na fila. Select para escolher.
- Campo "Motivo" (textarea, opcional)
- Botões: "Cancelar" | "Transferir" (loading state ao clicar)
- Ao transferir: atualizar assigned_agent_id e/ou queue_id na conversa, inserir log em whatsapp_transfers, mensagem de sistema no chat "Conversa transferida de [Agente A] para [Agente B]"

### Tela 3: Configurações WhatsApp (/settings/whatsapp)

**Sub-seções em Tabs:**

**Tab "Números":**
- Lista de instâncias WhatsApp conectadas: card com número formatado, nome do negócio, status ativo/inativo (toggle), badge "Verificado" se Blue Tick, data de conexão
- Botão "Conectar número" → Modal com: Phone Number ID (input), WABA ID (input), Access Token permanente (input password com toggle visibilidade), Webhook Verify Token (gerado automaticamente, com botão copiar), instruções de como configurar no painel da Meta (texto explicativo com link)
- URL do webhook para configurar na Meta (mostrar formatado e com botão copiar): `https://seudominio.com/api/whatsapp/webhook`

**Tab "Filas":**
- Lista de filas: nome, cor (color picker), mensagem de saudação, agentes vinculados (avatares), toggle ativo/inativo
- Botão "Criar fila" → Modal: nome, cor, mensagem de saudação (textarea), selecionar agentes (multi-select com avatares)

**Tab "Respostas rápidas":**
- Lista: /atalho, título, preview do conteúdo (truncado)
- Botão "Criar" → Modal: atalho (/sem-espaco), título, conteúdo (textarea com suporte a variáveis {nome}, {telefone}, {pedido}), categoria (select: saudação, suporte, vendas, encerramento)

**Tab "Agentes de IA":**
- Cards dos agentes: nome, tipo (badge: vendas/suporte/pós-venda), modelo, toggle ativo
- Botão "Criar agente IA" → Formulário completo:
  - Nome (input)
  - Tipo (select: vendas, suporte, pós-venda)
  - Modelo (select: gpt-4o-mini, gpt-4o)
  - System prompt (textarea grande, 10 linhas, com placeholder de exemplo)
  - Knowledge base / FAQ (textarea, formato livre — será injetado no prompt como contexto)
  - Temperatura (slider 0.0 a 1.0, default 0.7)
  - Max tokens (input number, default 500)
  - Keywords de handoff (input de tags — quando IA detecta essas palavras, transfere para humano)
  - Modo (select: "Responder automaticamente", "Sugerir ao agente (copilot)", "Ambos")
  - Toggle ativo/inativo

**Tab "Horário de atendimento":**
- Seletor de dias da semana com horário início/fim para cada dia
- Toggle "Ativar resposta automática fora do expediente"
- Textarea para mensagem fora do expediente (com variáveis {horario_abertura})
- Toggle "Ativar bot fora do expediente" (selecionar qual agente IA)

**Tab "Opt-in/Opt-out":**
- Estatísticas: total de opt-ins, total de opt-outs, taxa
- Lista de contatos com status de consentimento (opt-in/opt-out) e data
- Busca e filtro
- Exportar lista CSV
- Configuração de mensagem de opt-out automática ("Você não receberá mais mensagens promocionais")

**Tab "Widget para site":**
- Preview visual do widget (botão flutuante WhatsApp)
- Configurações: posição (direita/esquerda), cor, mensagem de boas-vindas, número WhatsApp, delay para aparecer
- Código para copiar e colar no site (script tag)
- Geração do código JavaScript do widget

### Tela 4: Templates (/settings/whatsapp/templates)

- Lista de templates: nome, idioma (badge), categoria (badge colorido: marketing=roxo, utility=azul, auth=verde), status (aprovado=verde, pendente=amarelo, rejeitado=vermelho), data
- Filtros: por categoria, por status
- Botão "Criar template" → Formulário dividido em 2 colunas:
  - Coluna esquerda (formulário):
    - Nome (slug, lowercase, underscores)
    - Categoria (select com explicação de cada uma)
    - Idioma (select)
    - Header (toggle ativar): tipo (texto/imagem/vídeo/documento) + conteúdo
    - Body (textarea com botão para inserir variável {{1}}, {{2}})
    - Footer (toggle ativar): texto curto (60 chars max)
    - Botões (toggle ativar): até 3 botões, cada um: tipo (quick_reply ou url), texto, payload/url
  - Coluna direita (preview ao vivo):
    - Preview visual do template como apareceria no WhatsApp (mockup de celular ou card estilizado)
    - Atualiza em tempo real conforme edita
  - Botão "Enviar para aprovação" → chama API Meta POST `/{wabaId}/message_templates`, salva com status "pending"
- Auto-refresh de status pendentes (polling a cada 30s via setInterval, cleanup no unmount)

### Tela 5: Campanhas (/campaigns/whatsapp)

- Lista de campanhas: nome, template, status (badge), números (total/enviadas/entregues/lidas/falhadas como mini-barras), data agendada/executada, custo estimado
- Filtros: por status, por período
- Botão "Criar campanha" → Wizard em 4 steps (usar Tabs ou stepper visual):

  **Step 1 — Configuração:**
  - Nome da campanha (input)
  - Instância WhatsApp (select — qual número enviar)
  - Template (select — só aprovados, com preview ao selecionar)

  **Step 2 — Segmentação:**
  - Fonte: "Contatos do CRM" | "Importar CSV" | "Segmento RFM"
  - Filtros (se CRM): tags (multi-select), pipeline (select), estágio (select), última compra (date range), valor total gasto (range min-max), segmento RFM (multi-select: Campeões, Leais, Em risco, etc.)
  - Se CSV: upload com preview das colunas, mapear coluna de telefone e nome
  - Contador ao vivo: "X contatos selecionados" (atualiza conforme muda filtros)
  - Toggle "Excluir opt-outs" (default: ativado, obrigatório)

  **Step 3 — Variáveis:**
  - Para cada variável do template ({{1}}, {{2}}, etc.): select de campo (nome, telefone, email, campo customizado) ou valor fixo
  - Preview da mensagem montada com dados de um contato exemplo (primeiro da lista)
  - Botão "Ver preview de outro contato" (mostra o próximo)

  **Step 4 — Revisão e envio:**
  - Resumo visual: template (preview), X contatos, custo estimado (contatos × preço por msg), instância
  - Alerta se contatos > tier atual de envio da Meta
  - Botões: "Salvar rascunho" | "Agendar" (datepicker + timepicker) | "Enviar agora" (com confirmação "Tem certeza? Isso enviará X mensagens")

- **Dashboard da campanha** (ao clicar em uma campanha):
  - Cards de métricas: Enviadas, Entregues, Lidas, Falhadas (com % e ícone)
  - Gráfico de linha temporal (recharts): envios ao longo do tempo
  - Gráfico de pizza: distribuição de status
  - Lista de contatos com status individual (tabela paginada com busca)
  - Custo total (calculado)
  - Botão "Exportar relatório" (CSV)

### Tela 6: Automações WhatsApp (integrada ao builder existente)

NÃO criar nova página. Adicionar ao builder de automações @xyflow/react que já existe:

**Novos tipos de nó (com ícone e cor distintos):**
- "Enviar WhatsApp" (MessageSquare, cor verde): config com select template ou textarea livre, variáveis dinâmicas, select instância
- "Aguardar resposta" (Clock, cor azul): timeout configurável (minutos/horas/dias), branch "respondeu" vs "timeout"
- "Condição WhatsApp" (GitBranch, cor amarelo): verificar keyword (contém/igual/regex), branch sim/não
- "Transferir para agente" (UserPlus, cor roxo): select fila ou agente, desativa bot
- "IA responder" (Bot, cor ciano): select agente IA, limitar a N interações
- "Gerar cupom Shopify" (Tag, cor laranja): tipo (% ou valor fixo), valor, validade, prefixo. Output: variável {cupom_codigo}
- "Randomizer A/B" (Shuffle, cor rosa): slider % A vs % B, branches separados
- "Enviar catálogo" (ShoppingBag, cor verde escuro): select produtos ou categorias da Shopify
- "Enviar link pagamento" (CreditCard, cor azul escuro): valor, descrição, gateway
- "Aguardar delay" (Timer, cor cinza): minutos/horas/dias configurável
- "Atualizar contato" (UserCog, cor marrom): adicionar tag, mudar pipeline, atualizar campo
- "Notificar back-in-stock" (Package, cor verde limão): monitorar produto Shopify, enviar quando estoque > 0

**Novos gatilhos (início do fluxo):**
- "Mensagem WhatsApp recebida" (qualquer)
- "Keyword detectada" (lista configurável)
- "Primeira mensagem do contato" (contato nunca conversou antes)
- "Contato entrou em segmento RFM" (ex: mudou de "Leal" para "Em risco")
- "Produto voltou ao estoque" (webhook Shopify inventory_levels/update)
- "Click-to-WhatsApp Ad" (conversa originada de anúncio — janela 72h)

---

## 6. SCHEMA SQL COMPLETO

Ao final de todo o desenvolvimento, gerar UM ÚNICO arquivo `sql/whatsapp-migration-final.sql` com TODO o SQL necessário. O arquivo deve ser autocontido — eu vou copiar e colar no Supabase SQL Editor e tudo deve funcionar. Incluir:

1. Todas as tabelas com `IF NOT EXISTS`
2. Todas as constraints UNIQUE
3. Todos os índices
4. Todas as RLS policies
5. Funções de upsert se necessário
6. Triggers se necessário
7. Habilitar Realtime nas tabelas de conversas, mensagens, notas
8. Comentários explicando cada seção
9. REPLICA IDENTITY FULL para tabelas com Realtime

Tabelas necessárias (mínimo):
- whatsapp_instances
- whatsapp_queues
- whatsapp_queue_agents
- whatsapp_conversations (substituir/expandir a existente)
- whatsapp_messages (substituir/expandir a existente)
- whatsapp_notes
- whatsapp_transfers
- whatsapp_quick_replies
- whatsapp_templates
- whatsapp_campaigns
- whatsapp_campaign_contacts
- whatsapp_ai_agents
- whatsapp_opt_status (opt-in/opt-out por contato)
- whatsapp_business_hours
- whatsapp_csat_ratings
- contact_rfm_scores
- whatsapp_product_interests (back-in-stock)

---

## 7. VARIÁVEIS DE AMBIENTE

Ao final, listar exatamente quais variáveis adicionar no Vercel:
```
META_APP_SECRET=                    # App secret para validação HMAC do webhook
META_WEBHOOK_VERIFY_TOKEN=          # Token de verificação (gerar UUID)
OPENAI_API_KEY=                     # Para agentes IA

# Já existem (não alterar):
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

---

## 8. CHECKLIST FINAL DE REVISÃO

Após implementar TUDO, revisar cada item:

**Funcional:**
- [ ] Webhook Meta recebendo e processando sem duplicatas
- [ ] Envio de todos os tipos de mensagem funcionando
- [ ] Chat em tempo real via Supabase Realtime sem memory leak
- [ ] Round-robin de agentes distribuindo conversas
- [ ] Transferência entre agentes com atualização em tempo real
- [ ] Notas internas visíveis só para agentes
- [ ] Respostas rápidas com /slash
- [ ] Tags em conversas funcionando
- [ ] Horário de atendimento automático
- [ ] CSAT ao resolver conversa
- [ ] Templates: criar, submeter, status, enviar
- [ ] Campanhas: criar, segmentar, enviar, dashboard
- [ ] Automações: todos os nós novos no builder funcionando
- [ ] Chatbot IA respondendo com contexto e handoff
- [ ] Copilot sugerindo respostas ao agente
- [ ] Matriz RFM calculando e segmentando
- [ ] Giftback/cashback gerando cupom Shopify
- [ ] Opt-in/opt-out management
- [ ] Widget WhatsApp para site gerando código
- [ ] Indicador de janela 24h correto
- [ ] Catálogo de produtos no chat
- [ ] Back-in-stock notifications

**Qualidade de código:**
- [ ] Zero console.log em produção
- [ ] TypeScript sem any
- [ ] Todas as tabelas com RLS
- [ ] Todos os useEffect com cleanup
- [ ] Todas as queries com colunas específicas (nunca SELECT *)
- [ ] Error handling em todas as chamadas API
- [ ] Loading states em todas as operações async
- [ ] Empty states em todas as listas
- [ ] Optimistic UI no envio de mensagens

**UX/UI:**
- [ ] Responsivo (desktop, tablet, mobile)
- [ ] Segue padrão visual da Worder (Radix UI, Tailwind, lucide-react)
- [ ] Nenhum botão sem feedback visual
- [ ] Debounce em campos de busca
- [ ] Skeleton loaders durante carregamento
- [ ] Confirmação em ações destrutivas
- [ ] Mensagens de erro claras e acionáveis
- [ ] Tooltips em ícones sem texto

**Produção:**
- [ ] SQL consolidado gerado e testável
- [ ] Variáveis de ambiente documentadas
- [ ] Nenhum TODO no código
- [ ] Nenhuma feature parcial
- [ ] Commit limpo e push feito

---

## 9. EXECUÇÃO

1. Clone os repos de referência
2. Estude TODOS os arquivos indicados antes de começar a codar
3. Execute o schema SQL no Supabase (ou gere para executar depois)
4. Implemente módulo por módulo: A → B → C → D → E → F
5. Dentro de cada módulo, siga a ordem lógica (service → API route → UI)
6. Teste cada parte antes de avançar
7. No final, gere o SQL consolidado em `sql/whatsapp-migration-final.sql`
8. Faça a revisão usando o checklist da seção 8
9. Commite e faça push

**NÃO pule partes. NÃO deixe TODOs. NÃO implemente versões parciais. Versão final de produção.**
