# Worder · Agentes por Evento — Documento de Implementação Completo

**v1.0 · 11 ago 2026.** Fonte única para o agente implementador. Consolida: a ideia central (IA por evento), as especificações de arquitetura e produto, o encaixe backend (fork do motor Python), o design da UI (IA Hub) e a observabilidade. Escrito para entrar em `core/` do monorepo Worder como documento-fonte-de-verdade: **mudança de comportamento passa pelo doc primeiro.**

**Como usar (agente implementador):** leia as Partes I–II inteiras antes de escrever qualquer código; a Parte III governa o backend, a IV a UI, a V a instrumentação, a VI a ordem. Nada é implementado fora do que está aqui; o que estiver marcado **[PENDENTE]** é pergunta para o Bruno, não licença para inventar. Disciplina herdada do motor: test-first (nenhum código de produção sem teste vermelho antes), migrations só na fonte canônica, design é contrato, relógio sempre injetável.

> **Adendo de execução (12/ago/2026):** ver §A no fim deste arquivo — registra as decisões tomadas na implementação, as divergências conscientes e as correções de referências deste doc contra o repositório real. O estado vivo da execução fica em `core/STATUS-agentes-por-evento.md`.

---

# PARTE I — A ideia central

## 1.1 De IA-por-canal a IA-por-evento

Hoje a IA do Worder mora dentro do WhatsApp, acorda só em mensagem inbound, e a automação apenas a liga (`action_whatsapp_ai` seta `bot_active`). A virada: a IA sai do canal e vai para trás do EventBus. **O evento define o comportamento; o cliente define o jeito; o canal é só o meio de entrega.** Um agente por loja, presente em todos os canais, agindo diferente em cada situação.

## 1.2 Invariantes de projeto (as frases que decidem empates)

1. **Quem decide o que fazer varia; o que é verdade não varia.** Missão é local, estado é global, canal é adapter.
2. O agente define o **teto**; restrição **acumula** (união), permissão **estreita** (interseção); só a **delegação amplia**, limitada pelo teto.
3. **Adaptação ao cliente mexe em como o agente fala, nunca em quanto custa.**
4. **As áreas nunca conversam entre si** — escrevem objetos com ID; o prompt é montado do zero a cada turno pelo compilador, único componente que enxerga tudo. "Não enviam prompt, enviam IDs."
5. Saber e poder são camadas separadas: **o prompt informa, a tool trava.**

## 1.3 A cascata

```
AGENTE (quem é)                       teste: muda se trocar de situação? → não é daqui
 └─ MISSÃO DO EVENTO (o que há)       teste: muda entre o toque 1 e o 3? → não é daqui
     └─ MISSÃO DO NÓ (onde estamos)   teste: é igual em todo carrinho? → sobe pro evento
         └─ DELEGAÇÃO (autorizado)    único que amplia; validado por código (grant)
```

**Merge por campo:**

| Campo | Regra |
|---|---|
| objetivo, critério de sucesso, tom situacional | nó **substitui** evento |
| o que não fazer | **soma** (união das camadas; ninguém remove proibição de cima) |
| tools | **interseção** em cada camada |
| contexto e fatos | **soma** |
| delegação | nó pede; gate **limita** pela `concession` da missão |
| incentivo | offer engine decide: **reusa · upgrade · nega — nunca soma** |
| missões concorrentes | **uma vence** por turno; as outras viram estado |

## 1.4 Arbitragem e missão descoberta

Uma missão por turno; dono = toque mais recente ao qual a pessoa respondeu, desempate por prioridade de evento; a perdedora entra no prompt como contexto, nunca como segundo objetivo. Determinístico, resolvido antes do prompt. A mesma caixa aplica frequency caps e supressão de canal.

Inbound sem missão atribuída ganha a **missão descoberta**: classificar a intenção no primeiro turno e promover (pedido→status; produto→venda; reclamação→handoff). O viés vendedor/suporte/híbrido do lojista (antiga área "Papel" do design) vive **aqui** — é o default de quando ninguém trouxe missão, nunca um viés global do agente.

## 1.5 Momento comercial (campanha sazonal como ESTADO)

Um 8/8 muda tudo ao mesmo tempo → muda **uma vez, num lugar só**: objeto `commercial_moment` (não chamar de "campanha" — campanha no Worder é disparo). É estado com validade, **resolvido por relógio a cada turno** — nunca gravado em ledger, RAG ou prompt permanente; no dia seguinte a query devolve vazio sem limpeza.

Pode: **somar fatos** (todo mundo passa a saber), **somar restrições**, e **virar o padrão** (a oferta pública deve ser mencionada quando `promote_moment` da missão permitir). Não pode: encostar no teto do agente. Empilhamento com delegação de fluxo é resolvido pelo offer engine (reusa/upgrade/nega). Precisa de: prioridade entre sobrepostos, preview ("o que a IA responderia hoje"), kill switch imediato, e prontidão de template por canal verificada na ativação **e re-checada no preflight de cada envio**.

## 1.6 O caminho do dinheiro

**O nó PEDE · o offer engine DECIDE · a tool EXECUTA.** Ninguém cria cupom direto (o `action_shopify_coupon` atual é o antipadrão). O engine consulta momento ativo + grants vigentes + `concession` da missão e responde: **emite** grant novo, manda **reusar** o existente, ou **nega** — gravando grant e ledger na mesma transação. O grant (autorização numerada: valor, validade, usos, contato+objeto, quem autorizou) entra no prompt como informação e na tool como trava: `create_coupon` exige `grant_id` e o código valida **o grant em si** (existe, não expirou, não consumiu, contato+objeto certos, valor bate com o grant) — **nunca contra a concession da missão do turno**, senão o reuso legítimo quebra. A `concession` limita a **emissão**. Corrida entre dois fluxos morre na `idempotency_key` UNIQUE do banco: o 2º INSERT conflita e recebe o grant do 1º.

---

# PARTE II — Decisões estruturais fechadas

| # | Decisão |
|---|---|
| D1 | **Caminho B:** runtime Python (fork do motor agents-worder) é o plano de execução dos agentes; Next.js segue dono de UI, fluxos, campanhas e canais |
| D2 | **Fork dentro do monorepo:** `worder/runtime/` (Python) ao lado de `src/` (Next.js), `worker/` (TS), `sql|supabase/` (migrations), `core/` (docs). `FORK.md` registra o commit de origem; ao tocar coalescer/CAS/outbox, conferir upstream. Deploys separados por path filters (Vercel ignora `runtime/**`; CI roda pytest só em `runtime/**`) |
| D3 | **Filas:** pgmq para os agentes; **QStash congela** (nada novo nasce nele). Corte do debounce é **por conversa** via flag de migração por loja — uma conversa nunca está nos dois mecanismos |
| D4 | **Chave de LLM:** cascata no `llm.py` — (1) chave direta de provider da org → (2) chave OpenRouter da org → (3) default da plataforma **[PENDENTE-1]**. Armazenamento em `organization_api_keys` com o codec AES-256-GCM existente (`src/lib/ai/api-key-codec.ts`); **Vault não é usado**. **Judge 1 e embeddings sempre pela chave da plataforma** |
| D5 | **Observabilidade:** stack duplo Logfire + Grafana Cloud, herdado do motor (Parte V) |
| D6 | **UI:** visão **radial** é a tela oficial do Agente; a **clássica** é o fallback mobile (breakpoint, mesma fonte de dados `AreaFields`). Momentos tem entrada própria na sidebar, fora da aba IA |
| D7 | **Tool custom entra na v1** — o lojista configura a integração HTTP sozinho (spec em 4.6). Tool custom **nunca concede** benefício — dinheiro só via `create_coupon`+grant |
| D8 | **`ai_agent_actions` morre** — WHEN/DO migram para dentro das missões (a missão de `whatsapp.received` absorve os intents) |

**Pendências (perguntar ao Bruno, não decidir):**

- **[PENDENTE-1]** Default sem chave nenhuma: (a) caminho plataforma-cobra (chave OpenRouter da Worder + metering + margem — a tela Budget em R$ pressupõe isso) ou (b) BYO-only oficial (estado de fato do código hoje; Budget vira informativo e ativar agente exige chave). Muda metering, billing e ativação. **[Resolvido na execução: BYO-only por ora — ver Adendo §A.1]**
- **[PENDENTE-2]** Conteúdo final das missões padrão (rodada 2 da entrevista): os seeds da seção 4.5 são rascunhos v0 vindos do protótipo — bons para dev, não aprovados como copy final.
- **[PENDENTE-3]** Rodadas 3–4: detalhes de momentos (prioridades entre sobrepostos na prática) e arbitragem/caps (números).

---

# PARTE III — Backend (fork do motor)

## 3.0 Fase 0 — pré-condições (antes de qualquer tabela nova)

1. **Consolidar migrations.** DDL vivo está em 4 lugares (`supabase/migrations/`, `supabase/` raiz, `sql/`, `docs/migrations/`); `ai_agents` nasce em `sql/ai-agents-complete-migration.sql`; `organization_api_keys` **não tem CREATE TABLE em lugar nenhum** (schema fora de banda). Fase 0 = baseline: dump do schema real vira a migration inicial canônica em `supabase/migrations/`, e tudo novo nasce ali. Migrations expand-contract dali em diante. **[Execução: na verdade são 8 lugares; baseline implementado como prereqs-only — ver Adendo §A.2]**
2. **Unificar clients de canal.** Invariante "nada chama API de canal exceto senders" exige fechar as chamadas diretas a `graph.facebook.com` (10 arquivos) e as duas libs paralelas de Instagram (`instagram/api.ts` + `instagram/instagram-api.ts`). Plano existente: `docs/superpowers/plans/whatsapp-scale/phase5-unify-clients.md` — vira dependência declarada. **[Execução: esse arquivo de plano não existe no repo — escopo definido no Adendo §A.3]**
3. **Estado das chaves registrado.** O drift UI→`organization_api_keys` / runtime→`api_keys` já foi corrigido no código (`cloud-runner.ts:553-561`; fallback a `process.env.OPENAI_API_KEY` removido — `embedding-key.ts` documenta). Falta só a migration da tabela (item 1). Estado de fato: BYO-only.

## 3.1 Os planos

```
┌─ HUB — Next.js no Vercel (o Worder que existe) ─────────────────────────┐
│ UI · Fluxos · Campanhas · Canais · aba IA · Momentos · Contatos         │
│ ESCREVE config: ai_agents, ai_missions, commercial_moments             │
│ LÊ: agent_traces, incentive_ledger, conversations (hub/inbox)          │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ (só objetos com ID no banco — nunca chama o runtime)
┌─ INGESTÃO ────────────────────▼─────────────────────────────────────────┐
│ Webhooks de canal/loja + EventBus + nó action_ai_mission               │
│ Grava dado + pgmq.send NA MESMA TRANSAÇÃO — via RPCs emit_* (§3.2.1)   │
│ Inbound NÃO enfileira: seq atômico + pending_response_at               │
└──────────────────────────────┬──────────────────────────────────────────┘
┌─ POSTGRES (Supabase do Worder) — fonte única ─▼─────────────────────────┐
│ dados · config versionada · conversas · pgmq · outbox · pgvector ·      │
│ grants/ledger · evals · traces                                          │
└──────────────────────────────┬──────────────────────────────────────────┘
┌─ RUNTIME (worder/runtime — fork Python, Docker) ▼───────────────────────┐
│ coalescer 2s · weighted polling 8:4:2:1 · lease + CAS                   │
│ mission_resolver → offer_engine → prompt_compiler → agent_core          │
│ → Judge 1 pré-envio (100%) → message_outbox                             │
└──────────────────────────────┬──────────────────────────────────────────┘
┌─ SENDERS / CANAIS ────────────▼─────────────────────────────────────────┐
│ WhatsApp cloud_api (herdado) · e-mail e Instagram como adapters futuros │
│ Únicos que tocam API de canal · preflight re-checa template do momento  │
└─────────────────────────────────────────────────────────────────────────┘
  QStash (congelado): segue com delays/campanhas legadas; nada novo.
```

## 3.2 Fluxos críticos

### 3.2.1 As escritas do Next.js viram RPCs

`supabase-js` não tem transação multi-statement. "Grava + enfileira na mesma transação" só existe como **função SQL chamada por RPC** (`emit_ai_mission_job(...)`: INSERT do pedido + `pgmq.send` no mesmo commit). As `emit_*` existentes (de automação) não servem de base; o precedente do gate atômico é o detector de browse-abandoned (INSERT + `23505`). **Regra: qualquer escrita que precise aparecer junto com job de fila é RPC `emit_*` — nunca duas chamadas do app.** No runtime, `message_outbox` é escrito dentro da transação de conclusão (CAS) — padrão que o fork já traz.

### 3.2.2 F1 — Toque de fluxo (outbound com IA)

1. Nó `action_ai_mission` (substitui `action_whatsapp_ai`, `node-executors.ts` l.1752) → uma chamada: `emit_ai_mission_job(organization_id, contact_id, event_family, node_ref, delta, concession_request, preferred_channel)`.
2. Runtime consome (lease da conversa). `mission_resolver` resolve a **família** `(organization_id, event_type)` → versão **ativa**; arquivada/inexistente → toque **não sai** + linha em `alerts` + caminho de erro do nó. Nunca toque sem missão.
3. `offer_engine` (único emissor) avalia o `concession_request` → **emite / reusa / nega**; grant + ledger na mesma transação; idempotência no banco.
4. `prompt_compiler` monta o frame por blocos tipados — agente · missão · delta do nó · estado (momento por relógio + ledger + contato) · canal · conversa — cada bloco só aceita o schema do seu dono; grava os IDs.
5. `agent_core` roda o loop; toda tool valida sozinha (`create_coupon` exige `grant_id`).
6. Judge 1 pré-envio (100%, 2 regenerações; esgotou → não envia + `alerts`) → `message_outbox` no CAS → sender (preflight inclui template do momento).
7. `agent_traces` grava `mission_version_id, node_ref, grant_id, moment_ids, channel`.

### 3.2.3 F2 — Inbound espontâneo

1. Webhook → ingestão valida assinatura, grava `messages` com `seq` atômico, seta `pending_response_at = now() + debounce`. Não enfileira.
2. Coalescer (2s) cria o job único `{conversation_id, generation, target_seq}` — só para conversas de loja migrada (D3).
3. Arbitragem: missão aberta dona? Senão, **missão descoberta**. Segue como F1 passo 4+. Mensagem nova durante a geração → CAS falha → draft descartado.

## 3.3 Dicionário — tabelas novas

Convenções: uuid PK, `timestamptz`, enums `text + CHECK`, RLS em toda tabela de negócio, tenant = **`organization_id`**. Todas com `store_id uuid nullable` reservado (v1: sempre NULL = escopo da org; grant vale org-wide).

### 3.3.1 `conversations` — canônica, agnóstica de canal

| Atributo | Tipo | Regras |
|---|---|---|
| id | uuid PK | |
| organization_id / store_id | uuid FK / uuid FK nullable | RLS; store reservado |
| contact_id | uuid FK → contacts | |
| status | text CHECK | `open \| human \| closed` — `human` = takeover; retorno manual |
| owner_mission_version_id | uuid FK nullable | dona do turno; trocada pelo resolver, nunca pelo modelo |
| next_inbound_seq / next_outbound_seq | int | contadores atômicos; `UNIQUE (conversation_id, direction, seq)` em `messages` |
| processing_generation | int | invalida draft |
| pending_response_at | timestamptz nullable | só o coalescer limpa |
| last_channel | text | default de resposta |
| created_at / updated_at | timestamptz | |

Origens de sync (e depois morrem): **`whatsapp_cloud_conversations` (a viva)**, `whatsapp_conversations` (legado morto), `instagram_conversations`.

### 3.3.2 `channel_identities`

| Atributo | Tipo | Regras |
|---|---|---|
| id / organization_id / contact_id | uuid | |
| channel | text CHECK | `whatsapp \| email \| instagram` |
| external_id | text | E.164 / e-mail normalizado / IGSID |
| UNIQUE | | `(organization_id, channel, external_id)` |

Sem consentimento aqui no v1 — fonte de verdade segue `contacts` (`is_subscribed_*`) + opt-out-guard existentes.

### 3.3.3 `ai_missions` — catálogo por evento, append-only (padrão local `ai_agent_versions`, migration `20260610`)

| Atributo | Tipo | Regras |
|---|---|---|
| id / organization_id / store_id | uuid | |
| event_type | text NOT NULL | nomes do catálogo real: `cart.abandoned \| checkout.abandoned \| whatsapp.received \| order.fulfilled \| payment.pix.abandoned \| payment.boleto.abandoned` (1ª leva); não é enum fechado |
| parent_version_id | uuid FK nullable | árvore |
| status | text CHECK | `draft \| active \| archived`; **um `active` por `(organization_id, event_type)`** (índice parcial UNIQUE) |
| origin | text CHECK | `worder_default \| lojista \| flywheel` |
| situation / objective | text / text NOT NULL | objetivo único |
| success_criteria / failure_criteria | text | observáveis; alimentam evals |
| context_fields | jsonb | campos do payload no bloco de contexto |
| enabled_tools | text[] | interseção com o agente |
| forbidden | text[] | soma |
| max_turns | int | insistência |
| topic_change_policy | text CHECK | `cede \| insiste \| transfere` |
| promote_moment | boolean default false | |
| concession | jsonb NOT NULL | `{kind: none\|percent\|fixed\|free_shipping, max_value, validity_hours, max_uses}` — limita a EMISSÃO; default `{kind: none}` |
| tone_delta | text nullable | |
| change_summary / created_at / activated_at | | |

### 3.3.4 `commercial_moments`

| Atributo | Tipo | Regras |
|---|---|---|
| id / organization_id / store_id | uuid | |
| name | text | |
| starts_at / ends_at | timestamptz NOT NULL | fuso resolvido na gravação |
| public_claim | text | a frase que a IA pode afirmar |
| offer | jsonb | `{kind, value, coupon_code?, auto_apply}` |
| exclusions | jsonb | verificáveis por código |
| temp_facts | jsonb | só na janela |
| forbidden | text[] | |
| priority | int default 0 | sobrepostos: fatos somam, postura promocional só uma |
| template_readiness | jsonb | por canal; verificado na ativação **e no preflight de cada envio**; falha → alerta + supressão do outbound do momento naquele canal |
| status | text CHECK | `draft \| approved \| killed` |
| killed_at | timestamptz nullable | kill switch vence a janela |

**Ativo é computado:** `approved AND now() BETWEEN starts_at AND ends_at AND killed_at IS NULL`. Nunca entra no RAG.

### 3.3.5 `incentive_grants` (só o `offer_engine` escreve)

| Atributo | Tipo | Regras |
|---|---|---|
| id | uuid PK | o `grant_id` da tool |
| organization_id / store_id / contact_id / conversation_id | uuid (conversation nullable) | |
| object_kind / object_ref | text CHECK / text | `cart \| checkout \| order` + id |
| source | text CHECK | `mission \| moment` |
| mission_version_id / moment_id | uuid FK nullable | quem autorizou |
| node_ref | text nullable | `flow_id:node_id` |
| kind / value | text CHECK / numeric | `percent \| fixed \| free_shipping` |
| validity_until / max_uses / uses | | |
| status | text CHECK | `issued \| consumed \| expired \| revoked` |
| idempotency_key | text UNIQUE | `org:contact:object_kind:object_ref:kind` — 2º pedido recebe o grant do 1º |

**Validação:** `concession` limita a emissão; a tool valida **o grant em si**, nunca a missão do turno (reuso legítimo do momento não pode quebrar).

### 3.3.6 `incentive_ledger` — append-only

| Atributo | Tipo | Regras |
|---|---|---|
| id / organization_id / contact_id | | |
| entry_kind | text CHECK | `issued \| reused \| denied \| consumed \| expired \| revoked` |
| grant_id | uuid FK nullable | `denied` sem grant |
| reason | text | "já tem 20% do 8/8" |

Grants = estado vigente que a tool valida; ledger = história que entra no bloco de estado e na timeline do contato. Engine grava nos dois na mesma transação.

### 3.3.7 Alterações em tabelas existentes

| Tabela | Mudança |
|---|---|
| `agent_traces` | + `mission_version_id`, `node_ref`, `grant_id`, `moment_ids uuid[]`, `channel` |
| `ai_agents` | + `presentation_mode text CHECK (transparente \| nome_funcao \| discreta)`, `client_adaptation jsonb` |
| `ai_agent_actions` | aposentada (D8) |
| conversas por canal | viram origem de sync e morrem |
| filas pgmq | payloads ganham `otel` (traceparent) e `mission_ref` quando origem é fluxo |

## 3.4 Invariantes de runtime

**Herdados do motor:** transação curta jamais atravessa LLM · lease + CAS · mensagem durante geração invalida draft · inbound não enfileira (só coalescer) · nada chama API de canal exceto senders · Judge 1 pré-envio 100% (2 regenerações) · weighted polling 8:4:2:1 com promoção por idade · PII nunca sai do Postgres para telemetria · relógio injetável.

**Novos:** (1) offer_engine único emissor; concession limita emissão; tool valida o grant. (2) Momento por relógio, nunca gravado. (3) Adaptação nunca mexe em dinheiro. (4) Uma missão por turno. (5) Restrição acumula, permissão estreita, só delegação amplia. (6) Agente nunca nega ser IA quando perguntado — linha fixa do compilador, fora do alcance do lojista. (7) Judge 1 e embeddings sempre pela chave da plataforma. (8) Toque sem missão ativa não sai (alerta). (9) Escrita+fila = RPC `emit_*`, nunca duas chamadas.

## 3.5 O que copiar do motor (fork)

De `agents-worder-main` para `worder/runtime/`: `runtime/src/agents_runtime/` inteiro (queueing, agent_core, judges, repository, evals, tools, channels, obs, clock/randomness, config) + `runtime/tests/` + Dockerfile; o `docker-compose.yml`; e os docs `core/observabilidade-e-monitoramento.md`, `core/testes-e-cicd.md` como referência de disciplina. Criar `FORK.md` na raiz do runtime com o commit de origem. Renomes: `agents_runtime` pode ficar; `agent_core/prompt.py` evolui para o `prompt_compiler` de blocos; `channels/cloud_api.py` é o sender WhatsApp herdado. Módulos novos: `mission_resolver.py`, `commerce/moments.py`, `commerce/offer_engine.py`.

---

# PARTE IV — UI (IA Hub)

## 4.1 Navegação

`src/app/(dashboard)/layout.tsx` l.90–118: entra `{ name: 'IA', href: '/ai' }` depois de Fluxos; entra `{ name: 'Momentos', href: '/moments' }` depois de Campanhas; sai o child "Agentes IA" do WhatsApp (l.116). WhatsApp fica: Inbox, Templates, Números, opt-status, qualidade, widget, botão Bot Ativo/Off por conversa.

## 4.2 As 5 sub-abas da aba IA

| Sub-aba | O que configura | De onde vem |
|---|---|---|
| **Agente** | nome, voz, apresentação (3 opções), adaptação (toggles), handoff, budget/modelo, tools, juízes | PersonaTab + ToolsTab + parte da SettingsTab; tela radial (D6) |
| **Conhecimento** | fontes, RAG, integrações | SourcesTab + IntegrationsTab |
| **Missões** | catálogo por evento; **limite de concessão dentro de cada missão** | nova |
| **Limites** | tópicos bloqueados, invariantes do lojista, consolidado de concessão (leitura) | SettingsTab.safety |
| **Atividade** | traces (missão por linha), evals, versões, propostas | EvalsTab + VersionsTab + AnnotationTab + Reports |

## 4.3 Regra de ouro e destinos por área

Áreas escrevem objetos com ID; o compilador monta o frame no turno. Teste de saúde: **texto de missão dentro de nó, regra de campanha dentro de fluxo, ou nome de template dentro de missão = fronteira vazou.**

| Objeto | Onde configura | Por quê |
|---|---|---|
| Delta do toque + delegação + canal preferido | **Fluxos**, nó `action_ai_mission` (dropdown lê o catálogo, guarda `mission_ref` da família — nunca o texto) | é sequência |
| Momento comercial | **Momentos** (entrada própria); banner de leitura em Campanhas/Fluxos | é comercial, não é IA |
| Templates, números, credenciais, opt-in | **Canais** | física do canal |
| Ledger, promessas, consentimento, supressões | **perfil do Contato** (timeline, leitura) | é estado |
| Arbitragem, janela 24h, caps | **código, sem tela** | limite físico não vira formulário |

## 4.4 O protótipo é o contrato visual — com esta punch list aplicada

Arquivos: `IA Hub.html` + `ia/{app,shell,data,radial,classic,tabs}.jsx` + `agents/icons.jsx` (zip do design). Tema: `.agents-theme` já existente no produto (Plus Jakarta Sans + Geist Mono escopados; app global segue DM Sans).

1. Rotear as **5 subs** no `app.jsx` (hoje só `agente`/`atividade`; Missões está implementada e inalcançável) e listá-las no `shell.jsx`.
2. Matar o toggle "Comparar propostas": radial = tela do Agente; clássica renderiza por breakpoint mobile (mesma `AreaFields`).
3. Área "Papel" → **"Missão descoberta (default)"**; some o "Seu papel é VENDER" global do `buildPrompt`.
4. Apresentação: linha fixa não-editável no preview em todas as opções ("se perguntarem se você é IA, confirme com naturalidade"); default do vazio = **nome+função** (meio), não transparente.
5. Adaptação: + 2 toggles — **insistir menos com quem já reclamou** e **saudação diferente para recorrente vs. primeira compra**. (Permitidos: espelhar tom/tamanho/emoji + esses dois. Proibido: qualquer benefício por perfil.)
6. Preview: renomear "Prompt inicial" → "O que o agente sabe"; adicionar blocos fantasmas fixos `MISSÃO — entra a cada conversa`, `ESTADO — momento ativo e promessas`, `CANAL`; **Juízes e Motor saem do box** (viram cards ao lado — não são prompt). O preview chama a mesma função de compile do runtime em modo preview — uma fonte só; `buildPrompt()` do protótipo não vira código de produção.
7. **Editar playbook**: a tela dos 10 campos da missão (3.3.3), com `concession` estruturada. Na textarea de invariantes sai o exemplo de desconto; entra hint "limites de dinheiro moram nas missões".
8. Órbita → telas: nós Conhecimento/Limites abrem painel editável reutilizando `KnowledgeTab`/`LimitsTab` sobre o mesmo estado (um dado, N portas, nunca dois formulários).

## 4.5 Catálogo padrão v0 (seeds — **[PENDENTE-2]**, rascunho para dev)

| event_type | objective | concession | notas |
|---|---|---|---|
| `cart.abandoned` / `checkout.abandoned` | recuperar a compra sem parecer cobrança | até `{percent, 10, 24h, 1 uso}` **no toque final via delegação**; missão default `{none}` | tom leve, lembra o item pelo nome |
| `whatsapp.received` | missão descoberta: classificar e promover | `{none}` | viés vendedor/suporte/híbrido do lojista |
| `order.fulfilled` | responder status com dado real; **resolver sem vender** | `{none}` (frete grátis condicional por atraso = decisão do lojista, não default) | tom direto, tranquiliza |
| `payment.pix.abandoned` / `payment.boleto.abandoned` | reenviar código e destravar o pagamento | `{none}` — zero desconto em todos os toques (o pedido já foi decidido) | útil, nunca insistente |

## 4.6 Agente — campos novos e tool custom

**Apresentação (`presentation_mode`):** `transparente` ("sou a assistente virtual da loja") · `nome_funcao` ("aqui é a Duda, do time X" — default de fábrica) · `discreta` (só responde; se apresenta se perguntarem). Invariante 6 vale nas três.

**Tool custom (v1):** formulário — nome, descrição, "quando usar" (lado do prompt) + endpoint URL, método, autenticação (header/API key como secret via codec AES), parâmetros que a IA preenche (nome/tipo/descrição), timeout, **botão testar chamada** com payload de exemplo (obrigatório passar antes de ligar). Backend: tabela `ai_agent_custom_tools` + executor HTTP genérico plugado no tool-loop. Regra na UI e no código: tool custom lê e consulta; **nunca concede**.

**Juízes:** área do agente (2 padrão embutidos + criáveis), com cadência (`toda mensagem / fim da conversa / amostra 20% / 1×dia / 1×semana`) e custo somado ao budget. Execução/resultados na Atividade.

## 4.7 Perguntas por área (critério de aceitação de cada tela)

**Agente:** quem fala · como fala · como se apresenta · o que adapta por cliente · quando desiste · quanto pode custar. **Conhecimento:** o que sabe e qual fonte prevalece · o que faz quando não sabe · o que nunca entra (nada com validade) · quando reprocessar. **Missões (por evento):** situação · objetivo único · sucesso/falha observável · contexto do payload · tools da situação · o que não fazer · quantos turnos insistir · mudança de assunto (cede/insiste/transfere) · pode promover o momento? · até quanto conceder. **Limites:** tópicos proibidos · consolidado (leitura) · quem edita o quê · desligar tudo agora. **Atividade:** qual missão/toque converte · versão no ar · o que prometeu e a quem · por que esta resposta saiu assim. **Fluxos·nó:** que missão · que toque e o que muda · o que autorizo (≤ limite da missão) · canal preferido/fallback · o que tira do nó · se responder, espera ou segue. **Momentos:** o que é verdade e até quando · frase pública · oferta · exclusões · fatos temporários · o que não fazer · quem vence sobreposto · templates prontos por canal · aprovar/preview/desligar. **Canais:** credenciais/números · templates aprovados · consentimento · qualidade. **Contato (leitura):** quem é em todos os canais · o que foi prometido e vale · consentiu/suprimido · situações abertas. **Runtime (código):** dono do turno · ordem do offer engine · ordem dos blocos e bloco faltante · caps antes de envio · o que entra no trace.

Teste de fronteira: pergunta aparecendo no formulário de outra área = vazou.

---

# PARTE V — Observabilidade

**Stack duplo herdado do motor** (`core/observabilidade-e-monitoramento.md` v2.0 do motor, spec): **Logfire** = depuração profunda ("o que aconteceu nesta conversa?" — traces, spans GenAI com tokens/custo, event loop, SQL ad hoc); **Grafana Cloud** = saúde e alerta ("o sistema está de pé e quem acorda?" — Mimir/Loki/Tempo, Alerting → IRM → webhook → n8n → WhatsApp do Bruno, Synthetics no `/health`). Tudo OpenTelemetry; Alloy como sidecar roteando cópia OTLP.

**Dois planos ligados pelo `trace_id`:** conteúdo integral no **Postgres** (`messages`, `agent_traces`, `llm_calls`, `tool_calls`, `judge_scores`); estrutura/tempo/custo/IDs na **telemetria**. PII nunca sai do Postgres.

| Pergunta | Conteúdo (Postgres) | Estrutura (telemetria) |
|---|---|---|
| Input / o que estava na mesa | `messages` + `agent_traces` (IDs do frame) | span `compile` com os IDs como atributos |
| Output / custo | `messages` + `llm_calls` (tokens, `cost_usd`, latência) + `judge_scores` | span GenAI; custo por tenant como métrica |
| Think | payload em `agent_traces`/`llm_calls` | span `think_gate` (duração + flag; nunca o texto) |
| Quais dados pegou em X | `tool_calls` (input/output jsonb, sucesso, latência) + `claims_used` conferido no trace | um span por tool na árvore do turno |

**Kit Python:** `logfire.configure(service_name="worder-runtime", environment=...)` + `instrument_openai()` (OpenRouter é OpenAI-compatible) + `instrument_anthropic()` (chave direta D4) + `instrument_httpx()` + `instrument_psycopg()` + `instrument_system_metrics()`; `traceparent` na coluna `otel` do payload pgmq; **span links** ligando coalescer e sender.

**Cuidados obrigatórios:** captura de conteúdo do GenAI **desligada/redigida** (3 linhas de defesa: não enviar → redação no Alloy → scrubbing do Logfire); `conversation_id`/`contact_id` são atributos de span, **nunca labels de métrica**; `service.name` + `deployment.environment` sempre presentes; export assíncrono nunca bloqueia o laço.

**Atributos novos do Worder nos spans de domínio:** `mission_version_id`, `grant_id`, `moment_ids`, `channel` (espelham `agent_traces`). **Audiências:** aba Atividade = lojista (Postgres) · Logfire = Bruno (depuração) · Grafana = quem acorda.

---

# PARTE VI — Ordem de execução

1. **Fase 0** (§3.0): baseline de migrations · unificação de clients de canal · migration de `organization_api_keys`.
2. **Identidade agnóstica:** `conversations` + `channel_identities` + sync das três origens.
3. **Missões + compiler:** `ai_missions` + seeds v0 + `prompt_compiler` de blocos tipados + `mission_resolver`.
4. **Runner + adapter:** fork operacional consumindo pgmq; `channels/cloud_api` como sender; Judge 1 no caminho.
5. **Momentos + offer engine:** `commercial_moments` + `incentive_grants`/`ledger` + gate no `create_coupon`.
6. **Nó novo no flow builder:** `action_ai_mission` + RPC `emit_ai_mission_job`; `action_whatsapp_ai` deprecado.
7. **UI da aba IA:** navegação + 5 subs + punch list do protótipo + tela Editar playbook + Momentos.

**Fatia vertical antes de generalizar:** `cart.abandoned`, um canal (WhatsApp), **uma loja migrada** — atravessa um item de cada etapa. Convivência: flag de migração por loja decide o dono de cada conversa (QStash legado × coalescer); agentes existentes seguem no caminho atual até a troca da sua loja; big bang proibido.

**Definition of done por entrega:** teste escrito antes e verde · migration na fonte canônica · observabilidade da entrega no ar (spans + atributos) · trace explica qualquer resposta pelos IDs · nenhum invariante da §3.4 violado (fitness tests em CI).

**Artefatos companheiros deste doc:** `worder-encaixe-motor-e-dicionario.md` (v1.1 — detalhe do backend), `worder-visao-completa.html` (arquitetura + mapa do agente), `worder-integracao-plataforma.html` (áreas + caminho do dinheiro ilustrado), zip do design IA Hub (contrato visual, com a punch list 4.4 por aplicar), repositório `agents-worder-main` (origem do fork).

---

# §A — Adendo de execução (12/ago/2026)

Registra as decisões de implementação, correções de referência e divergências conscientes deste doc contra o repositório real. O plano completo com etapas e commits está em `core/STATUS-agentes-por-evento.md`.

## A.1 Pendências resolvidas na execução

- **[PENDENTE-1] → BYO-only por ora** (decisão do usuário, 11/ago): sem chave da org (direta ou OpenRouter) o agente não ativa (alerta `no_org_llm_key`; toque morre); tela Budget é informativa; o degrau (3) da cascata fica implementado atrás de `AGENTS_PLATFORM_LLM_ENABLED` (default off). Judge 1 e embeddings sempre pela chave da plataforma (`AGENTS_OPENROUTER_API_KEY`).
- **[PENDENTE-2]**: seeds v0 entram como `status='draft'`, `origin='worder_default'` — 6 linhas (uma por event_type; cart/checkout compartilham copy, pix/boleto idem). Ativação por org é ato explícito (fatia vertical ativa `cart.abandoned` para a loja piloto).
- **[PENDENTE-3]**: números de arbitragem/caps viram constantes nomeadas em `runtime/src/agents_runtime/agent_core/pending_defaults.py` com comentário de pendência.

## A.2 Correções de referência (o repo real vs. este doc)

1. DDL vive em **8** lugares, não 4 (soma: `worder-cloud-api-fixes/` — schema Cloud API autoritativo —, `_archive/sql/`, `src/lib/sql/`, raiz). Baseline implementado como **prereqs-only**: `20260812000001_agents_baseline_prereqs.sql` com as ~15 tabelas preexistentes que o trabalho novo referencia, conformadas ao banco vivo (no-op em produção; bootstrap no CI). O **dump completo** do schema vira item de roadmap (exige `supabase db dump` com acesso direto). Os 7 locais legados ficam congelados (`supabase/README.md`); `supabase/migrations/` antigo → `supabase/migrations-archive/`.
2. Não existe tabela `alerts` — existe `whatsapp_alerts`. O runtime cria a **nova** `public.alerts` genérica (org-scoped, com dedup), sem tocar na existente.
3. `cloud-runner.ts`: o gate BYO está nas l.552–596 (não 553–561).
4. O detector browse-abandoned tem o gate atômico nas l.65–80 (não 104–119).
5. `contacts` usa `is_subscribed_*` (não `subscribed_*`).
6. A flag viva do bot Cloud é `whatsapp_cloud_conversations.ai_enabled`; `bot_active` só existe na tabela legada — o `action_whatsapp_ai` atual é **código morto para conversas Cloud** (reforça o D8/nó novo).
7. Não existem tabelas `llm_calls`/`judge_scores` no Worder; `tool_calls` é campo JSON de `agent_traces`. As tabelas de trilha chegam pelo fork (`internal.*`).
8. `whatsapp.received` é declarado em `src/lib/events.ts` e **nunca emitido**; o caminho WhatsApp ignora o EventBus. A ponte v1 é o branch por rollout no webhook-processor (F2); a emissão no EventBus fica adiada (a missão descoberta é engajada pelo coalescer).
9. `docs/superpowers/plans/whatsapp-scale/phase5-unify-clients.md` **não existe** (referência fantasma). Escopo da unificação: ver A.3.
10. O motor **não tem** observabilidade implementada (`obs/` é stub; sem sidecar Alloy no compose) — a Parte V é construção a partir da spec `core/observabilidade-e-monitoramento.md` do motor. O motor também não tem `agent_traces` nem cascata de provedores (só OpenRouter com chave única de plataforma).
11. Artefatos companheiros (`worder-encaixe-motor-e-dicionario.md` etc.) não estão no repo; este doc + o STATUS são a fonte.

## A.3 Unificação de clients de canal (escopo Fase 0 real)

Os 10 call sites de `graph.facebook.com` estão em: `src/app/api/instagram/auth/connect/route.ts`, `src/app/api/instagram/auth/route.ts`, `src/app/api/integrations/meta/callback/route.ts`, `src/app/api/integrations/meta/route.ts`, `src/config/whatsapp.ts`, `src/lib/instagram/api.ts`, `src/lib/instagram/instagram-api.ts`, `src/lib/meta-api.ts`, `src/lib/services/integration-health/checkers/whatsapp.ts`, `src/lib/whatsapp/api-version.ts` (o canônico, v22). Regra em vigor a partir de agora: **código novo só usa `META_BASE_URL`/`META_API_VERSION` de `src/lib/whatsapp/api-version.ts`**; envio de mensagem só por sender (TS: `cloud-api.ts`; Python: `channels/cloud_api.py`). A consolidação dos call sites existentes e a fusão das duas libs Instagram são roadmap (não bloqueiam a fatia vertical). O invariante "nada chama API de canal exceto senders" aplica-se a **envio de mensagens**; OAuth/health-check/administração não são envio.

## A.4 Divergências conscientes do v1 (registradas também em `runtime/FORK.md`)

1. **Preview do prompt**: o runtime expõe `POST /internal/preview-prompt` (+`/healthz`) via listener HTTP mínimo, guardado por `AGENTS_PREVIEW_TOKEN`, consumido server-side pela rota `/api/ai/preview-prompt`. É a MESMA `prompt_compiler.compile()` em modo preview. Exceção pontual ao "hub nunca chama o runtime" (que segue valendo para ações de negócio); indisponível ⇒ UI degrada para blocos fantasma.
2. **Sender v1 simplificado**: 1 bolha, sem typing/reply-delay; preflights completos (opt-out, janela 24h com fallback de template via `channel_template_policies`, template do momento, idempotência). Humanização (split ≤4 bolhas, typing) e send-guard tiers = roadmap.
3. **Templates por canal**: nova tabela `channel_template_policies (organization_id, event_type, channel, template_name, language, status)` — o lar dos nomes de template na camada de canal (missão nunca carrega template; regra da fronteira §4.3).
4. **Flag de migração**: `ai_runtime_rollout (organization_id PK, store_id NULL, mode legacy|runtime, migrated_at, notes)`.
5. **Cascata D4**: adapters `openai-compatible` (chave direta com base_url) + `anthropic` nativo + OpenRouter; fitness test `test_no_provider_network` atualizado com os hostnames privilegiados escopados a `agent_core/providers*`. Port Python do `secret-box` (scrypt+AES-256-GCM, formatos v2 e legados) validado por vetores cross-language commitados.
6. **RLS das 292 tabelas existentes**: advisor crítico do Supabase (tudo exposto a anon/authenticated). Remediação **fora deste plano** — exige aprovação explícita do usuário + plano de policies + regressão de inbox/realtime. Todas as tabelas novas nascem com RLS + policies.

---

# Adendo §B — Pós-auditoria: operação, divergências e a Etapa 7 como ela era

**v1.0 · 11 ago 2026.** Nasce da auditoria do snapshot pós-"plano de 30 commits": o trabalho entregue é real e disciplinado — migrations aplicadas e verificadas, invariantes no código, test-first genuíno — mas a Etapa 7 foi re-escopada para "UI mínima funcional" sem registro prévio, e cinco divergências do motor ficaram abertas. Este adendo **fecha o escopo do que falta**: ratifica decisões, define as Etapas 8–10 com definition of done, e estabelece regras de relatório para o STATUS.

**Para o agente implementador:** as etapas deste adendo são o plano vigente. Nada aqui é sugestão; o que depende do Bruno está marcado **[GATE-Bruno]** e bloqueia só o passo que o referencia. A ordem é: Etapa 8 primeiro (caminho crítico do piloto); 9 antes de escalar para a segunda loja; 10 pode correr em paralelo a partir do passo 8.3 concluído.

## B.1 Decisões ratificadas (encerram pendências da auditoria)

| # | Decisão | Detalhe |
|---|---|---|
| **D9** | **PENDENTE-1 ratificado: BYO-only.** | O degrau de plataforma permanece atrás de `AGENTS_PLATFORM_LLM_ENABLED=off` até decisão comercial futura. Consequência de UI: onde a tela de Budget exibir teto em R$ como se a Worder cobrasse, a copy vira controle informativo de gasto na chave do lojista (ajustar quando a tela for tocada na Etapa 10, não antes). Ativação de agente exige chave em `organization_api_keys` — o alerta `no_org_llm_key` já cobre. |
| **D10** | **Humanização do sender é BLOQUEANTE do cutover piloto.** | O caminho runtime hoje responde em bloco único; o legado responde em bolhas com delay. Piloto não sai com regressão no coração do produto. Escopo em 8.3. Linha que não se cruza (mantida): nada de erro de digitação proposital nem typing falso prolongado. |
| **D11** | **Remediação RLS: aprovada em fases, nunca "ligar tudo".** | Fase A (tabelas que o runtime toca): feita. Fase B: tabelas escritas só por service-role — lotes com policies geradas + teste RLS por lote no CI + rollback por lote. Fase C: tabelas lidas pelo app — policies por `organization_id` no padrão existente (`profiles`/`auth.uid()`), lote a lote, começando pelas de maior sensibilidade (contatos/pedidos/mensagens já cobertas na A, depois billing, depois analytics). Cada lote é uma migration própria; **nenhum lote sobe sem a prova no CI**. Advisor do Supabase re-rodado após cada fase. |
| **D12** | **PENDENTE-2 segue aberto e é [GATE-Bruno].** | A copy dos 6 seeds `worder_default` (drafts já no banco) passa pela rodada 2 com o Bruno **antes** de qualquer `activate_ai_mission` na org piloto. Ativar é ato explícito e pós-revisão; primeira leva do piloto: `cart.abandoned` + `whatsapp.received` apenas. |
| **D13** | **Logfire entra (Parte V do doc-fonte vale).** | O `obs/` atual (JSON + OTel opcional + cinto de PII) é a fundação, não o fim. Escopo em 9.1. Captura de conteúdo GenAI permanece desligada — o cinto de PII existente é a 1ª linha; scrubbing do Logfire é a 3ª. |
| **D14** | **Higiene de relatório é regra vinculante.** | Ver B.5. Re-escopagem sem registro prévio foi o único defeito real desta execução; não se repete. |

## B.2 Etapa 8 — Operação e piloto (caminho crítico)

> Objetivo: a fatia vertical viva numa loja real — `cart.abandoned` + inbound, WhatsApp, com humanização — e rollback provado.

| Passo | Escopo | DoD |
|---|---|---|
| 8.1 | **Deploy do runtime** conforme `runtime/DEPLOY.md` (Railway/Render/VPS): `SUPABASE_DB_URL` (session pooler), roles worker/sender, `AGENTS_RESPONDER`+`AGENTS_TOUCHER`, `AGENTS_OPENROUTER_API_KEY` (chave de plataforma — Judge/embeddings), `ENCRYPTION_KEY` idêntico ao do app, `AGENTS_CHANNEL=cloud_api` + `AGENTS_META_ACCESS_TOKEN`, `AGENTS_HTTP_PORT`+`AGENTS_PREVIEW_TOKEN` | container de pé; `/healthz` verde; logs JSON chegando |
| 8.2 | **Vercel:** `AGENTS_RUNTIME_URL` + `AGENTS_PREVIEW_TOKEN` | preview de `/ai` e `/moments` funcionando de ponta a ponta |
| 8.3 | **Humanização do sender (D10):** portar do `cloud-sender.ts` o algoritmo de quebra em bolhas (≤4) e o ritmo (delay por bolha proporcional ao tamanho, teto curto; typing on/off conforme Cloud API permitir) para o sender do runtime. Paridade de comportamento, não de bytes. O outbox já entrega a mensagem inteira; a quebra acontece no sender, e o espelho no inbox registra as bolhas como enviadas | teste com cassette: dado um texto longo, N bolhas com os mesmos cortes do legado (suíte compara com fixtures gerados pelo TS); envio real na loja de teste visivelmente "humano" |
| 8.4 | **Sonda:** healthz no monitor externo (503 = heartbeat parado) — Grafana Synthetics ou equivalente já disponível | alerta dispara com runtime derrubado de propósito |
| 8.5 | **[GATE-Bruno] Rodada 2 dos seeds:** revisar/editar a copy dos drafts com o Bruno; ativar `cart.abandoned` e `whatsapp.received` na org piloto via UI; conferir agente com versão em produção e chave BYO presente | duas missões `active`; `origin` reflete edição |
| 8.6 | **Rollout + smoke** (runbook do STATUS): `insert into ai_runtime_rollout (org, 'runtime')` → mensagem real inbound → conversations/messages/outbox → resposta em bolhas no WhatsApp → espelho no inbox. Fluxo de teste com o nó novo → outbox `funnel_touch` → preflight de template/momento | os dois caminhos (F1 e F2) com trace completo dos IDs |
| 8.7 | **Rollback provado uma vez de verdade:** `update ai_runtime_rollout set mode='legacy'` no meio de uma conversa de teste; conferir que o inbound seguinte volta ao caminho QStash sem mensagem perdida nem dupla | executado e registrado no STATUS com horário |

**Critérios de saída do piloto (medir por 1 semana antes de escalar):** latência inbound→primeira bolha dentro do alvo do debounce; taxa de aprovação do Judge 1 (regenerações raras); **zero** cupom sem grant (query no ledger); zero mensagem sem trace navegável; nenhum alerta `outbox_unknown` sem resolução.

## B.3 Etapa 9 — Fechar as divergências do motor

> Antes da segunda loja. 9.1–9.4 podem paralelizar entre si.

**9.1 Logfire (D13).** `logfire.configure(service_name="worder-runtime", environment=...)` + `instrument_openai()` (OpenRouter) + `instrument_anthropic()` (BYO direto) + `instrument_httpx()` + `instrument_psycopg()` + `instrument_system_metrics()`; cópia OTLP opcional via env (o `obs/` atual já prevê OTel). **Captura de conteúdo GenAI desligada.** Atributos de domínio em todo span do turno: `organization_id`, `conversation_id`, `mission_version_id`, `grant_id`, `moment_ids`, `channel`, `outcome` — espelhando a trilha interna. `traceparent` na coluna `otel` do payload pgmq; span links coalescer↔sender. DoD: uma conversa de teste navegável no Logfire da fila ao envio, sem nenhum conteúdo de mensagem na telemetria (teste automatizado do cinto de PII cobre os atributos novos).

**9.2 Ciclo de vida do grant.** Consumo: webhook de pedido correlaciona `coupon_code` → `uses++`; `uses = max_uses` → `status='consumed'` + entrada `consumed` no ledger. Expiração: sweep periódico marca `expired` + entrada no ledger (o sweep de outbox existente é o padrão). DoD: teste e2e — grant emitido → cupom criado → pedido pago com o código → `consumed` no grant e no ledger; grant vencido → `expired` sem intervenção.

**9.3 O dinheiro no inbound.** (a) `StateBlock` do responder passa a carregar `ledger_lines`/`grant_lines` (o "você já tem o OITO8" acontece no inbound, não só no toque); (b) loop de tool escolhida pelo modelo (E3 do motor) liberado para o responder com `create_coupon` no catálogo — o gate do grant já existe na tool, o loop só o expõe. DoD: conversa inbound onde o cliente pede desconto → engine nega emissão nova mas há grant do momento → a resposta menciona o cupom existente; trace mostra `reused`.

**9.4 Uma trilha só na UI.** A Atividade herdada (Reports/Eval) passa a ler a trilha nova (`internal.llm_calls/tool_calls/judge_scores` + `conversations`) — via views de compatibilidade se preciso — para não existirem dois universos de trace durante a convivência. `ai_message_logs`/`agent_traces` legados ficam congelados para consulta histórica. DoD: uma conversa do runtime aparece na Atividade com missão, custo e judge; uma conversa legada continua visível.

**9.5 (roadmap mantido, não bloqueia)** Unificação dos 10 call sites `graph.facebook.com` + fusão das libs de Instagram, conforme plano `phase5-unify-clients.md`; a regra "código novo só via `api-version.ts`" segue em vigor.

## B.4 Etapa 10 — A Etapa 7 como ela era (IA Hub de verdade)

> Pode iniciar em paralelo após 8.3. O contrato visual é o zip do design (`IA Hub.html` + `ia/*.jsx` + `agents/icons.jsx`) com a punch list abaixo; o tema é o `.agents-theme` existente. A `MissionsTab` entregue **já é** o "Editar playbook" (10 campos + concessão estruturada) — reusa, não reescreve.

| Passo | Escopo |
|---|---|
| 10.1 | **Um agente por loja.** `AIAgentList` sai da aba Agente. Migração: org com 1 agente → vira o canônico automaticamente; org com N → tela única de escolha do canônico (os demais ficam `archived`, somente leitura, restauráveis). O resolver já assume o agente com versão em produção por org — a UI passa a refletir isso |
| 10.2 | **Radial oficial + clássica mobile.** Portar `ia/{radial,classic,shell,data,tabs}.jsx` sobre dados reais (mesma `AreaFields`, um estado). Toggle "comparar propostas" morre; breakpoint decide. Nós Conhecimento/Limites da órbita abrem painel editável **reutilizando** os componentes das telas (um dado, N portas) |
| 10.3 | **Sub-aba Limites** (a que falta): tópicos bloqueados + invariantes do lojista + **consolidado de concessão por missão (leitura — "edite dentro de cada missão")** + desligar o agente inteiro. Fusão de abas: **Avaliação e Atividade se fundem em "Atividade"** (Reports/Eval como sub-views); **API Keys é absorvida pela área Motor/Budget da radial** — até 10.2 aterrissar, as abas atuais ficam como estão para não quebrar uso |
| 10.4 | **`presentation_mode` + `client_adaptation`** chegam em `ai_agents` (migration) e na UI: 3 opções de apresentação (default `nome_funcao`) — a linha fixa "nunca negue ser IA" **já está no compiler**, a UI só exibe; adaptação com os 5 toggles (espelhar tom/tamanho/emoji · insistir menos com quem já reclamou · saudação recorrente vs. primeira compra), lidos pelo `AgentBlock`/`StateBlock`. Regra na tela: adaptação nunca mexe em dinheiro |
| 10.5 | **Preview "O que o agente sabe":** o painel chama `compile_prompt` em modo preview (endpoint `/api/ai/preview-prompt` existe; expor o parâmetro opcional de CONHECIMENTO anotado nas notas vivas) e exibe os blocos reais + fantasmas `MISSÃO — entra a cada conversa` / `ESTADO — momento ativo e promessas` / `CANAL`. **Juízes e Motor ficam fora do box** (cards ao lado) |
| 10.6 | **Área "Missão descoberta (default)"** na radial: o viés vendedor/suporte/híbrido edita a missão de `whatsapp.received` (campo da missão, não do agente) — nada de "Seu papel é VENDER" global |
| 10.7 | **Tool custom v1 (D7):** tabela `ai_agent_custom_tools` + executor HTTP genérico no tool-loop + form (nome, descrição, "quando usar", endpoint, método, auth como secret via codec, parâmetros tipados, timeout, **testar chamada obrigatório antes de ligar**). Regra dupla (UI + código): tool custom lê e consulta, **nunca concede** |
| 10.8 | **Momentos visível fora de Momentos:** banner de leitura "momento X ativo até Y" em Campanhas e no editor de Fluxos, lendo a mesma view `active_commercial_moments` |

DoD da etapa: as 5 sub-abas do doc-fonte navegáveis; radial no desktop e clássica no mobile sobre o mesmo estado; screenshot do print de 11/08 irreproduzível (a tela antiga não existe mais); punch list 1–8 do doc-fonte §4.4 toda verde.

## B.5 Regras de relatório (higiene do STATUS — vinculante)

1. A tabela de etapas do STATUS é atualizada **no mesmo commit** que muda o estado — commits e tabela nunca divergem.
2. "Completo" só se declara **contra o doc-fonte** (incluindo adendos). Plano interno de commits é ferramenta, não referência de completude.
3. **Re-escopagem exige registro prévio**: qualquer redução/adiamento de escopo entra em "Decisões em aberto" com marcação **[GATE-Bruno]** *antes* de executar — nunca descoberta a posteriori numa seção de pendências.
4. Divergência deliberada do doc-fonte (ex.: obs sem Logfire) ganha uma linha própria "DIVERGÊNCIA v1" no STATUS no commit em que nasce, com o plano de fechamento.
5. Toda migration aplicada em produção registra: arquivo, data, via (MCP/manual), verificação executada — o formato atual do STATUS está correto e permanece.

## B.6 Ordem, dependências e gates

```
8.1 → 8.2 → 8.3 ─┬→ 8.4 → 8.5 [GATE-Bruno: copy seeds] → 8.6 → 8.7 → (piloto 1 semana)
                 └→ Etapa 10 (paralelo a partir daqui)
Etapa 9 (9.1–9.4 paralelos) → antes da 2ª loja
9.5 → roadmap (não bloqueia)
RLS fase B/C (D11) → em lotes contínuos, independente das etapas
```

**Gates do Bruno neste adendo:** 8.5 (copy dos seeds — rodada 2) · aprovação de cada lote RLS fase B/C conforme D11 · qualquer nova re-escopagem (B.5-3).
