# Auditoria de Legado WhatsApp / IA

Data: 2026-06-08
Repositório: `/home/user/worder1` (Next.js / TypeScript + Supabase)
Escopo: mapear resquícios da integração Evolution API (removida) e classificar o que é
**MORTO (A)**, **REUTILIZÁVEL (B)** e **AMBÍGUO/INVESTIGAR (C)**, com foco no objetivo do
próximo passo: **religar a auto-resposta de IA ao envio via WhatsApp Cloud API (Meta)**.

> Esta auditoria é somente leitura. Nenhum código de produção foi alterado.

## Sumário do estado atual (mapa mental)

Existem **DUAS pilhas WhatsApp coexistindo** no código:

- **Pilha CLOUD (viva, canônica)** — tabelas `whatsapp_business_accounts`,
  `whatsapp_cloud_conversations`, `whatsapp_cloud_messages`, view de inbox
  `whatsapp_inbox_messages`. Webhook em `/api/whatsapp/cloud/webhook` →
  QStash worker `/api/workers/whatsapp-webhook` → `src/lib/whatsapp/webhook-processor.ts`.
  Envio via `WhatsAppCloudAPI` (`src/lib/whatsapp/cloud-api.ts`) +
  `getAccessToken` (`src/lib/whatsapp/account-loader.ts`).
- **Pilha LEGADA (Evolution-era, tabelas antigas)** — tabelas `whatsapp_instances`,
  `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_ai_agents`,
  `whatsapp_ai_configs`. Processador legado em
  `src/lib/services/whatsapp/webhook-processor.ts` (sem callers).

O **motor de IA novo** (`ai_agents` + `src/lib/ai/*`) está intacto e desacoplado de envio.

---

## (A) MORTO — seguro remover (sem callers/imports)

### A1. `src/lib/services/whatsapp/webhook-processor.ts` — processador legado completo
- **Evidência de morte**: nenhum import/caller. Busca por
  `from '@/lib/services/whatsapp/webhook-processor'` retorna 0 ocorrências. O único hit
  por `from './webhook-processor'` é `src/lib/services/shopify/index.ts:52` (Shopify, não
  relacionado). As rotas vivas de webhook importam o OUTRO processador
  (`@/lib/whatsapp/webhook-processor`): `src/app/api/whatsapp/cloud/webhook/route.ts:17` e
  `src/app/api/workers/whatsapp-webhook/route.ts:22`.
- **Conteúdo**: lê/escreve em `whatsapp_instances`, `whatsapp_conversations`,
  `whatsapp_messages` (linhas 64, 202-256, 551-561), `whatsapp_business_hours` (634),
  `whatsapp_opt_status` (287, 335). Tem wiring de IA em `webhook-processor.ts:262-280`
  chamando `handleAIResponse` — porém esse caminho NUNCA executa, pois ninguém chama
  `processWebhookPayload` deste arquivo.
- **Recomendação**: remover o arquivo. Antes, ver B2 (a função `handleAIResponse` que ele
  invoca contém o único padrão de "gerar resposta IA + enviar via Cloud" já escrito — pode
  servir de referência para a religação).

### A2. `whatsappVerifyToken` / `verifyWebhookToken` do processador legado
- **Evidência**: `src/lib/services/whatsapp/webhook-processor.ts:55` (`verifyWebhookToken`)
  só é referenciada dentro do próprio arquivo morto. O webhook Cloud vivo faz a própria
  verificação em `src/app/api/whatsapp/cloud/webhook/route.ts:27-62` contra
  `whatsapp_business_accounts.webhook_verify_token`.
- **Recomendação**: remover junto com A1.

### A3. Comentários residuais "Evolution" no código vivo (cosmético)
- Apenas comentários, sem efeito funcional. Exemplos:
  - `src/lib/whatsapp/message-content.ts:5`
  - `src/lib/services/whatsapp/webhook-processor.ts:63` (vai junto com A1)
  - `src/app/api/ai/test/webhook/route.ts:225`
  - `src/hooks/useWhatsAppConnectionManager.ts:9`
  - `src/app/api/whatsapp/webhook/route.ts:4-12`
  - `src/app/api/whatsapp/inbox/conversations/[id]/{route,messages,media}.ts` (comentários
    "Conversas legadas (Evolution) não enviam mais")
  - `src/components/whatsapp/settings/AccountsTab.tsx:50`
- **Recomendação**: limpeza cosmética opcional, baixíssima prioridade.

### A4. Fallback de token em texto claro (legado de migração, não de Evolution)
- `src/lib/whatsapp/account-loader.ts:29-31` — fallback para coluna `access_token` em
  texto claro. O próprio comentário (linhas 5-7) diz que vira código morto após a migração
  `20260523` de drop. **Não é Evolution**; é dívida de migração de criptografia.
- **Recomendação**: investigar se a migração de drop já rodou; se sim, remover o fallback.

---

## (B) REUTILIZÁVEL — infraestrutura viva para religar a IA ao Cloud

### B1. Motor de IA novo (intacto, pronto para gerar respostas)
- **`src/lib/ai/whatsapp-integration.ts`** — `handleIncomingWhatsAppMessage` (linha 203) e
  `processWhatsAppWithAgent` (linha 51). É o motor preservado.
  - **Caller atual**: APENAS `src/app/api/ai/test/webhook/route.ts:360-367` (simulador de
    teste, nunca envia ao WhatsApp real — confirmado em `route.ts:225-227, 248`).
  - **Atenção (gap)**: este motor lê histórico de `whatsapp_messages`
    (`whatsapp-integration.ts:213`) e contato de `whatsapp_conversations` (linha 228) —
    tabelas LEGADAS. Para a pilha Cloud ele precisaria ler de `whatsapp_cloud_messages` /
    `whatsapp_cloud_conversations`. Ver seção "Prontidão".
- **`src/lib/ai/engine.ts`** — `createAgentEngine` (linha 379), lê tabela `ai_agents`
  (linhas 356, 388), usa `OPENAI_API_KEY` (406), `update_agent_stats` RPC (347).
- **RPC `get_active_agent_for_conversation`** — viva; definida em
  `sql/ai-agents-functions.sql:100`, `sql/ai-agents-rpc-functions.sql:12`,
  `sql/ai-agents-stored-procedures.sql:47`. Usada em `whatsapp-integration.ts:69`,
  `ai/test/route.ts:492`, `ai/test/webhook/route.ts:344`.
- **CRUD de `ai_agents`** — vivo via `/api/ai-agents` (`route.ts:20,50,87,116`) e
  `/api/ai/agents/*`. Demais infra de IA viva: `rag.ts`, `embeddings.ts`,
  `prompt-builder.ts`, `actions-engine.ts`, `intent-detector.ts`, `store-analyzer.ts`.
- **Recomendação**: este é o cérebro a ser religado. Reaproveitar `handleIncomingWhatsAppMessage`
  ajustando as fontes de leitura para tabelas Cloud (ou criar variante Cloud).

### B2. Padrão "gerar IA + enviar via Cloud" já escrito (no código morto A1)
- `src/lib/services/whatsapp/ai-chatbot-service.ts:240` (`handleAIResponse`) +
  `processWithAI` (linha 26) implementam o ciclo completo: buscar agente → chamar OpenAI
  (`callOpenAI`, linha 311) → enviar via `sendMessage` (`message-service.ts`). PORÉM opera
  em tabelas LEGADAS (`whatsapp_ai_agents`, `whatsapp_conversations`, `whatsapp_messages`).
- **Recomendação**: NÃO religar este caminho (acopla a IA ao legado). Usá-lo apenas como
  referência de fluxo. O motor canônico é B1 (`ai_agents`).

### B3. Cliente/envio Cloud (vivo, é o que a IA deve usar)
- **`src/lib/whatsapp/cloud-api.ts`** — `class WhatsAppCloudAPI` (linha 69),
  `sendText(to, text)` (linha 163), `sendTemplate` (307). Também `verifyWebhookSignature`,
  `extractWebhookMessageText`, `getMessageType`, `normalizePhone`.
- **`src/lib/whatsapp/account-loader.ts:25`** — `getAccessToken(account)` (decripta token).
- **Padrão canônico de envio** (a copiar na religação) em
  `src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts:99-159`:
  1. buscar `whatsapp_cloud_conversations` + join `whatsapp_business_accounts`;
  2. `createWhatsAppCloudClient({ phoneNumberId, accessToken: getAccessToken(account) })`;
  3. `client.sendText(phone, content)`;
  4. persistir em `whatsapp_cloud_messages` (`onConflict: 'message_id'`);
  5. atualizar `whatsapp_cloud_conversations` (last_message_*).
- **guard de opt-out** disponível: `requireOptIn` (`src/lib/whatsapp/opt-out-guard.ts`),
  já usado nessa rota (linha 111) e no processor Cloud-adjacente.

### B4. Webhook Cloud + worker + processador (ponto de injeção da IA)
- **Ingestor**: `src/app/api/whatsapp/cloud/webhook/route.ts` (HMAC + persiste
  `whatsapp_webhook_events` + enfileira via `enqueueWhatsAppWebhook`).
- **Worker**: `src/app/api/workers/whatsapp-webhook/route.ts` (claim atômico +
  `processWebhookPayload`).
- **Processador vivo**: `src/lib/whatsapp/webhook-processor.ts` —
  `processMessage` (linha 221) insere inbound em `whatsapp_cloud_messages` (250), dispara
  `RuleEngine.processCreationRules` (318-339). **NÃO há chamada de IA aqui** — este é
  exatamente o lugar onde a auto-resposta de IA deve ser religada (após o insert da
  mensagem inbound, linha ~341).
- **Recomendação**: inserir aqui (ou no worker) a chamada à IA (B1) + envio Cloud (B3).

### B5. Fila / Workers (QStash) — viva e usada por vários sistemas
- `src/lib/queue.ts` continua amplamente usado APÓS a remoção do enqueue de IA Evolution.
  Não existe mais `enqueueWhatsAppAI` no código (0 ocorrências). Callers vivos de `queue.ts`:
  - `enqueueWhatsAppWebhook` → `cloud/webhook/route.ts:18,175`,
    `cron/reprocess-whatsapp-pending/route.ts:15,51`.
  - `enqueueAutomationRun`/`Step` → `automation/event-processor.ts:7`, `events.ts:395`,
    crons `check-delayed-runs`, `auto-process`, worker `automation-step`.
  - `enqueueShopifySync`/`Webhook` → rotas Shopify.
  - `enqueueEmailSend`, `enqueueWebhookDelivery` → email/webhooks outbound + sweepers.
  - `verifyQStashSignature` → todos os `/api/workers/*`.
- **`enqueueWhatsAppSend`** (`queue.ts:381`) existe e é exportado (linha 586), mas **não
  tem caller** nas rotas (busca por `enqueueWhatsAppSend` só acha a definição/export).
  Classificável como semi-morto — **REUTILIZÁVEL** para a religação se quisermos enviar a
  resposta de IA de forma assíncrona/com delay (ver "Prontidão", risco de janela 24h).
- `src/lib/queue/durable-queue.ts` — usado por campanhas de email; vivo.
- **Variáveis**: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`
  — todas vivas e documentadas em `.env.example:44-46`.

### B6. Copilot legado (parcialmente vivo, reaproveitável)
- `getCopilotSuggestion` (`src/lib/services/whatsapp/ai-chatbot-service.ts:164`) é chamado
  por rota viva `/api/whatsapp/ai/copilot/route.ts:7,30`, montada na UI por
  `CopilotSidebar` (`ContactPanel.tsx:58,329`). Porém lê de `whatsapp_conversations` /
  `whatsapp_messages` (LEGADAS) — ver C.
- **Recomendação**: o copilot funciona se essas tabelas ainda existirem; é REUTILIZÁVEL,
  mas precisa decisão (C2) sobre migrar para tabelas Cloud.

---

## (C) AMBÍGUO / INVESTIGAR — precisa decisão humana

### C1. Motor de IA lê de tabelas LEGADAS (o nó da religação)
- `handleIncomingWhatsAppMessage` lê `whatsapp_messages` (`whatsapp-integration.ts:213`) e
  `whatsapp_conversations` (228). A pilha Cloud grava em `whatsapp_cloud_messages` /
  `whatsapp_cloud_conversations`. **Decisão necessária**: (a) adaptar o motor para ler das
  tabelas Cloud, ou (b) criar uma camada de adaptação que monte `messageHistory`/contato a
  partir de `whatsapp_cloud_*` e chame `processWhatsAppWithAgent` diretamente (que recebe
  histórico por parâmetro — mais limpo, evita tocar nas tabelas legadas).

### C2. Cluster `services/whatsapp/*` — parcialmente vivo, parcialmente morto
- **Vivo (importado por rotas de inbox)**: `conversation-service.ts`
  (`transfer`, `tags` routes; `node-executors.ts:1637`), `message-service.ts`
  (`notes`, `payment-link` routes), `back-in-stock-service.ts` (`back-in-stock` route),
  `getCopilotSuggestion` de `ai-chatbot-service.ts` (copilot route).
- **Morto**: `webhook-processor.ts` (A1), `handleAIResponse`/`processWithAI` de
  `ai-chatbot-service.ts` (só chamados por A1), `ai-chat-service.ts` (sem caller — confirmar).
- **Problema**: os serviços VIVOS deste cluster operam em tabelas LEGADAS
  (`whatsapp_messages`, `whatsapp_conversations`, `whatsapp_instances`). Ex.:
  `message-service.ts:42` lê `whatsapp_messages`. **Decisão**: estas rotas de inbox ainda
  apontam para o legado — verificar se a UI de inbox em produção usa estas rotas
  (`transfer`, `notes`, `payment-link`, `tags`) ou as Cloud equivalentes. Risco de inbox
  parcialmente quebrado se as tabelas legadas forem dropadas.

### C3. UI de IA legada montada no inbox/settings
- `AIAgentsTab` (`settings/AIAgentsTab.tsx`) → CRUD de `whatsapp_ai_agents` via
  `/api/whatsapp/ai-agents` (tabela legada, distinta de `ai_agents` do motor novo).
- `AIToggleButton` (`inbox/ChatPanel.tsx:554`) → `/api/whatsapp/conversations/[id]/ai`
  (`whatsapp_conversations.bot_active`/`ai_enabled`, legado).
- `CopilotSidebar` (`inbox/ContactPanel.tsx:329`) → copilot legado (B6).
- **Decisão**: há DOIS modelos de "agente de IA" (`ai_agents` novo vs `whatsapp_ai_agents`
  legado). Definir qual é o canônico para a religação e se a `AIAgentsTab` deve apontar
  para `ai_agents`. Hoje a UI configura agentes em tabela que o motor canônico não lê.

### C4. Rotas AI legadas e fallbacks `42P01`
- `/api/whatsapp/ai/route.ts` usa `whatsapp_ai_configs` (linhas 29-180) — config de IA
  legada com chave em base64 (não criptografada). Verificar se ainda é usada.
- Vários `error.code === '42P01'` (tabela inexistente) guardam leituras de tabelas que
  podem não existir em todos os ambientes: `whatsapp/agents/route.ts:108,468,610,698,793`,
  `whatsapp/numbers/route.ts:52,212,305,366`, `whatsapp/agents/[id]/permissions/route.ts:73,160`,
  `ai/knowledge/route.ts:45,113`, `ai/models/route.ts:65`. Estes são tolerância a schema
  parcial, **não** necessariamente Evolution — investigar caso a caso antes de remover.

### C5. `/api/whatsapp/webhook` e `/api/whatsapp/meta/webhook` — forwarders deprecados
- Ambos hoje só encaminham verbatim para `/api/whatsapp/cloud/webhook`
  (`webhook/route.ts:6-12`, `meta/webhook/route.ts` cabeçalho). Mantidos até telemetria
  confirmar zero hits. **Decisão**: manter por compatibilidade ou remover após telemetria.

---

## Variáveis de ambiente — classificação

| Variável | Status | Onde (evidência) | Balde |
|---|---|---|---|
| `META_APP_ID` | Viva (Cloud/OAuth/Instagram) | `whatsapp/connect/route.ts:368`, `cloud/embedded-signup/route.ts:104`, `integrations/meta/*`, `instagram/auth/route.ts` | B |
| `META_APP_SECRET` | Viva (HMAC webhook Cloud) | `cloud/webhook/route.ts:70`, `webhook-processor` (services):37, `connect/route.ts:369` | B |
| `NEXT_PUBLIC_META_APP_ID` / `NEXT_PUBLIC_META_WA_EMBEDDED_SIGNUP_CONFIG_ID` | Vivas (Embedded Signup) | `hooks/useFacebookEmbeddedSignup.ts:13-14` | B |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Viva (fallback global verify) | `cloud/webhook/route.ts:45`, `api/whatsapp/route.ts:34`, `.env.example:24` | B |
| `WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_WABA_ID` | Doc apenas (UI) | só citadas como exemplo em `integrations/meta/page.tsx:261-263`; não lidas via `process.env` | C (doc) |
| `QSTASH_TOKEN`/`QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY` | Vivas (fila/workers) | `queue.ts:144,155-156`, `workers/*`, `.env.example:44-46` | B |
| `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` | Vivas (rate-limit, cache, circuit-breaker, template cache) | `redis.ts:17-18`, `whatsapp/{circuit-breaker,rate-limiter,template-manager,queue}.ts`, `.env.example:51-52` | B |
| `OPENAI_API_KEY` | Viva (motor IA + embeddings + copilot) | `ai/engine.ts:406`, `ai/rag.ts:242`, `ai/embeddings.ts`, `services/whatsapp/ai-chatbot-service.ts:317` | B (essencial p/ religação) |
| `ANTHROPIC_API_KEY` | Viva (segments AI, store-analyzer) | `segments/ai-generator.ts:307`, `ai/store-analyzer.ts:21` | B |
| `ENABLE_ASYNC_WEBHOOK` | Viva (canary ingest) | `cloud/webhook/route.ts:106`, `.env.example:34` | B |
| `ENCRYPTION_KEY` | Viva (token at-rest) | `.env.example:28`, `token-encryption.ts` | B |
| `CRON_SECRET` | Viva (crons) | `.env.example:39` | B |
| `EVOLUTION_*` | **MORTA** | 0 ocorrências em `process.env` no código (grep `EVOLUTION_` em src = nenhuma leitura de env) | A |

> Não há nenhuma leitura de `process.env.EVOLUTION_*` no código-fonte — a remoção das env
> vars Evolution está completa do ponto de vista de runtime.

---

## Tabelas: LEGADAS vs CLOUD

| Tabela | Pilha | Lida/escrita por (evidência) | Balde |
|---|---|---|---|
| `whatsapp_business_accounts` | Cloud | `whatsapp/webhook-processor.ts:80`, inbox messages route, account-loader | B |
| `whatsapp_cloud_conversations` | Cloud | `whatsapp/webhook-processor.ts:651`, inbox routes | B |
| `whatsapp_cloud_messages` | Cloud | `whatsapp/webhook-processor.ts:236,250`, inbox messages route:140 | B |
| `whatsapp_inbox_messages` (view) | Cloud | usada por rotas de inbox (unifica) | B |
| `whatsapp_webhook_events` | Cloud | ingest/worker/cron | B |
| `whatsapp_contacts` | Cloud | `whatsapp/webhook-processor.ts:570` | B |
| `whatsapp_instances` | **Legada** | `services/whatsapp/webhook-processor.ts:64,556` (A1), `numbers/route.ts`, `AccountsTab.tsx` | C/A |
| `whatsapp_conversations` | **Legada** | `services/whatsapp/ai-chatbot-service.ts:171,249`, `conversations/[id]/ai/route.ts:21`, `whatsapp-integration.ts:228` | C |
| `whatsapp_messages` | **Legada** | `whatsapp-integration.ts:213`, `services/whatsapp/message-service.ts:42`, copilot | C |
| `whatsapp_ai_agents` | **Legada** | `ai-chatbot-service.ts:38`, `ai-agents/route.ts:21` | C |
| `whatsapp_ai_configs` | **Legada** | `whatsapp/ai/route.ts:29-163` | C |

Fallbacks `42P01` (tabela inexistente): ver C4 — são tolerância a schema parcial, não
evidência direta de Evolution.

---

## Componentes / rotas / hooks órfãos ou semi-órfãos

- **Órfão funcional (morto)**: `src/lib/services/whatsapp/webhook-processor.ts` (A1).
- **Forwarders deprecados (vivos por compat)**: `/api/whatsapp/webhook`,
  `/api/whatsapp/meta/webhook` (C5).
- **UI legada montada** (C3): `AIAgentsTab`, `AIToggleButton`, `CopilotSidebar` — operam
  em tabelas legadas mas estão renderizadas no inbox/settings.
- **Hook**: `useWhatsAppConnectionManager.ts` — já migrado para `META_CLOUD`
  (linhas 22, 53); só tem comentário "Evolution removido" (A3). Vivo/ok.
- **Função semi-órfã**: `enqueueWhatsAppSend` (`queue.ts:381`) sem caller (B5).

---

## Docs / SQL legados (baixa prioridade, apenas listar)

Arquivos que ainda mencionam Evolution (não afetam runtime):
- `docs/ZAP-ZAP-06-CORRECOES.md`, `docs/ZAP-ZAP-09-REALTIME-FIX.md`,
  `docs/ZAP-ZAP-11-PLANO-EXECUCAO.md`, `docs/ARQUITETURA-INTEGRACOES.md`,
  `docs/AUDIT_RLS_MIGRATION.md`, `docs/FLOW_BUILDER_INTEGRATIONS.md`,
  `docs/PROMPT-FINAL-CLAUDE-CODE.md`, `docs/TESTES-END-TO-END.md`,
  `docs/whatsapp-caminho-b-multi-store.sql`, `docs/strategy/metrics-queries.sql`,
  `docs/rfcs/fase6-bloco-b-deprecation.md`, `docs/ALL-MIGRATIONS-CONSOLIDATED.sql`,
  `docs/superpowers/specs/2026-04-19-outbound-webhooks-design.md`.
- SQL/seeds: `supabase/whatsapp-schema-v4.sql`,
  `supabase/migrations/{whatsapp-connection-schema,whatsapp-migration-fix,flow-builder-v3-complete,PARTE3_rls_e_dados,001_enable_rls}.sql`,
  `supabase/integrations-v2-complete.sql`, `sql/seed-integrations-catalog.sql`,
  `sql/RESET_ALL_DATA.sql`, `worder-cloud-api-fixes/05A-inbox-unification.sql`.
- Raiz/legado: `README.md`, `RELATORIO-TECNICO-MIDIA.md`,
  `INSTALACAO-COMPLETA-5-FASES.md`, `PATCHES/`, `CORRECAO-MENSAGENS-README.md`,
  `ESTADO-ATUAL-MIDIA.md`, `patch-security.sh`.

---

## Prontidão para religar a IA ao Cloud: o que existe, o que falta, riscos

### O que JÁ existe (vivo e utilizável)
1. **Geração de resposta de IA**: motor canônico `src/lib/ai/whatsapp-integration.ts`
   (`processWhatsAppWithAgent` / `handleIncomingWhatsAppMessage`) + `engine.ts` +
   RPC `get_active_agent_for_conversation` + tabela `ai_agents` + `OPENAI_API_KEY`.
2. **Envio Cloud**: `WhatsAppCloudAPI.sendText` (`cloud-api.ts:163`) + `getAccessToken`
   (`account-loader.ts:25`). Padrão completo de envio + persistência já existe em
   `inbox/conversations/[id]/messages/route.ts:99-159`.
3. **Ponto de entrada da mensagem inbound**: `src/lib/whatsapp/webhook-processor.ts`
   `processMessage` (linha 221), executado pelo worker QStash. Já tem `account`,
   `conversation` (Cloud), `textBody`, `contact`.
4. **Guard de opt-out**: `requireOptIn` (`opt-out-guard.ts`).
5. **Fila opcional** para resposta assíncrona/com delay: `enqueueWhatsAppSend` (B5).

### O GAP exato (o que falta)
No processador Cloud vivo (`src/lib/whatsapp/webhook-processor.ts`), após inserir a
mensagem inbound em `whatsapp_cloud_messages` (~linha 341), **não há nenhuma chamada à IA**.
Para religar é preciso, nesse ponto (ou em um worker dedicado):
1. **Resolver o agente** para a conversa Cloud (ex.: `get_active_agent_for_conversation`
   com `p_channel_id`/`p_pipeline_stage_id` apropriados — hoje o motor passa `channelId`
   como `instanceId` legado; precisa mapear para o conceito Cloud).
2. **Montar o histórico a partir das tabelas Cloud** (`whatsapp_cloud_messages` /
   `whatsapp_cloud_conversations`) — o motor atual lê das tabelas legadas
   (`whatsapp-integration.ts:213,228`). Recomendado: chamar `processWhatsAppWithAgent`
   diretamente, passando `messageHistory`/`contactInfo` montados a partir das tabelas
   Cloud (evita tocar no legado).
3. **Enviar a resposta** com `WhatsAppCloudAPI.sendText` usando
   `getAccessToken(account)` + `account.phone_number_id`.
4. **Persistir** a resposta outbound em `whatsapp_cloud_messages` (com `sender_type='bot'`
   ou equivalente) e atualizar `whatsapp_cloud_conversations`.
5. **Aplicar guards**: `requireOptIn` antes de enviar; respeitar janela de 24h
   (`window_expires_at` em `whatsapp_cloud_conversations`); flag de bot ativo por conversa.

### Riscos / incertezas
- **Dois modelos de agente** (`ai_agents` vs `whatsapp_ai_agents`) e dois toggles de bot
  (`whatsapp_cloud_conversations` vs `whatsapp_conversations.bot_active`/`ai_enabled`).
  A UI legada (`AIAgentsTab`, `AIToggleButton`) configura o modelo LEGADO; o motor canônico
  lê `ai_agents`. **Precisa decisão** de qual é a fonte de verdade antes de religar (C3).
- **Janela de 24h (Meta)**: fora da janela, `sendText` (texto livre) falha; a auto-resposta
  pode precisar de template. Não há tratamento disso no fluxo de IA hoje.
- **Loop de auto-resposta**: o processador insere status updates e mensagens outbound; é
  preciso garantir que respostas do bot não disparem novo processamento de IA (filtrar
  `direction='outbound'`/`sender_type='bot'`).
- **Idempotência/concorrência**: o worker já faz claim atômico do evento; mas a chamada à
  IA + envio precisa ser idempotente por `message_id` para evitar respostas duplicadas em
  reprocessamento (cron `reprocess-whatsapp-pending`).
- **Migração de tabelas legadas**: se `whatsapp_messages`/`whatsapp_conversations` forem
  dropadas, quebram serviços de inbox VIVOS (C2: notes, payment-link, transfer, tags, copilot)
  e o motor de IA atual (C1). Religar a IA na pilha Cloud é pré-requisito para esse drop.
- **`access_token` em texto claro** (A4): confirmar estado da migração de criptografia
  antes de remover o fallback do `account-loader`.

### Caminho recomendado (resumo)
Religar dentro de `src/lib/whatsapp/webhook-processor.ts::processMessage` (ou novo worker
acionado por QStash): resolver agente em `ai_agents` → chamar
`processWhatsAppWithAgent` com histórico montado de `whatsapp_cloud_messages` →
`requireOptIn` → `WhatsAppCloudAPI.sendText` via `getAccessToken` → persistir outbound em
`whatsapp_cloud_messages`. Descartar o caminho `services/whatsapp/ai-chatbot-service`
(legado) exceto como referência.
