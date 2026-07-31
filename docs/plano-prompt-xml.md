# Plano: arquitetura de prompt em camadas (XML)

Estado: **desenho para revisão. Nada implementado.**

## As decisões fechadas

| # | pergunta | resposta |
|---|---|---|
| 1 | escopo do XML | substitui tudo, exceto runtime (contato, RAG, ações) |
| 2 | como o lojista preenche | wizard atual mapeado para as seções |
| 3 | camada de venda (SPIN/Voss/Cialdini) | opcional, por tipo de agente |
| 4 | aceite da revisão com IA | campo a campo, com edição da sugestão |
| 5 | fontes | reusa `ai_agent_sources` + RAG que já existem |
| 6 | loja | `ai_agents.store_id`; loja delimita canais, agente escolhe quais |
| 7 | agentes existentes | migram automaticamente |
| 8 | `drift_mitigation` | orquestrador, não é seção do XML |

## A regra que manda em tudo

**Uma fonte só. Montado na hora. Sem cópia, sem cache, sem webhook.**

O XML nunca é armazenado. É montado a cada atendimento a partir de
`ai_agents.prompt_sections`. O que o lojista salva é o que o agente recebe na
mensagem seguinte — não existe passo intermediário onde os dois divirjam.

Toda variante que guarda o texto pronto — congelar na criação, webhook no
salvar, cache com carimbo de tempo — recria o bug que estamos consertando.

---

# PARTE 1 — O que existe hoje

## Os quatro caminhos que montam prompt

| # | caminho | como monta | status |
|---|---|---|---|
| 1 | `engine.ts` → `PromptBuilder` | 10 blocos concatenados | **vivo — é o inbox** |
| 2 | `api/ai/respond/route.ts:105` | `system_prompt` cru | vivo, rota alternativa |
| 3 | `ai-chat-service.ts:343` | `buildSystemPrompt` próprio | **código morto** |
| 4 | `test-runner.ts:145` | lê `system_prompt` para gerar cenários | vivo |

O caminho 3 tem **zero consumidores** (`grep -rn "ai-chat-service"` fora do
próprio arquivo volta vazio) e usa um tipo `AIAgent` **diferente**
(`src/lib/services/whatsapp/types.ts`), com `store_id`, `agent_type`,
`knowledge_base`, `handoff_keywords` e `mode` — campos que o tipo canônico
(`src/lib/ai/types.ts`) não tem. É resquício de um desenho anterior.

## Os 10 blocos do caminho vivo

| # | bloco | origem |
|---|---|---|
| 1 | `system_prompt` ou `buildPersonaBase()` | banco, congelado |
| 2 | `## Sua Função` | `persona.role_description` |
| 3 | `## Tom de Voz` | `persona.tone` → 1 de 4 textos fixos |
| 4 | `## Tamanho das Respostas` | `persona.response_length` → 1 de 3 |
| 5 | `## Idioma` | `persona.language` |
| 6 | `## Diretrizes Específicas` | `persona.guidelines` |
| 7 | `## Informações do Cliente` | runtime, sanitizado |
| 8 | `## INSTRUÇÕES ESPECIAIS` | ações ativas |
| 9 | `## Conhecimento Base` | RAG condicional |
| 10 | `## Regras Importantes` | 8 regras hardcoded |

## Os defeitos

- **B1** prompt congelado; `generatePromptFromTemplate` só roda em `CreateAgentFlow.tsx:280`
- **B2** o campo "Função e Personalidade" (`PersonaTab.tsx:114`) edita
  `persona.role_description`, **não** o `system_prompt`. Como os dois nascem
  com o mesmo texto, o lojista corrige o que vê, salva, e o `system_prompt`
  segue com a versão defeituosa — que continua indo ao modelo no bloco 1,
  agora acompanhada da correção no bloco 2. **Cada edição cria uma
  contradição nova e a versão errada nunca sai.**
- **B3** o `if/else` cobre só o bloco 1; blocos 3–6 são anexados sempre
- **B4** `Seu nome é ${agent.name}` vive no ramo `else` → agente com
  `system_prompt` nunca recebe o próprio nome
- **B5** blocos 1 e 2 recebem o mesmo texto → tokens duplicados
- **B6** prompt renderizado não é persistido → impossível auditar

## Vínculo loja ↔ canal (já existe)

`whatsapp_business_accounts.store_id`, `whatsapp_numbers.store_id` e
`whatsapp_instances.store_id` existem. Convenção: **`store_id` nulo = número
org-wide, visível em todas as lojas.**

A escolha do agente é feita por `get_active_agent_for_conversation`
(`cloud-runner.ts:393`), que compara `p_channel_id` contra
`settings.channels.channel_ids`; `all_channels=true` casa sempre.

⚠️ **Essa função não está em migration nenhuma.** Não consegui ler o corpo.

---

# PARTE 2 — Blast radius

## O que É afetado

### Núcleo — reescrita
| arquivo | mudança |
|---|---|
| `src/lib/ai/prompt-builder.ts` | deixa de concatenar 10 blocos; passa a renderizar XML |
| `src/lib/ai/xml-prompt.ts` | **novo** — renderizador, com omissão de seção vazia |
| `src/lib/ai/prompt-sections.ts` | **novo** — schema das seções, defaults por tipo, validação |

### Geração de prompt — 10 arquivos
| arquivo | mudança |
|---|---|
| `src/lib/ai/templates/index.ts` | `generatePromptFromTemplate` devolve seções, não texto |
| `templates/{custom,baby,beleza,casa,delivery,fitness,joias,moda-feminina,pet-shop}.ts` | `promptTemplate` (texto com `{{vars}}`) → defaults por seção |

### Execução
| arquivo | mudança |
|---|---|
| `src/lib/ai/engine.ts` | passa `prompt_sections` ao builder |
| `src/lib/ai/cloud-runner.ts` | grava prompt renderizado no trace; reinjeção periódica (drift) |
| `src/app/api/ai/respond/route.ts` | passa a usar o builder em vez de `system_prompt` cru |

### Interface
| arquivo | mudança |
|---|---|
| `create/CreateAgentFlow.tsx` | grava `prompt_sections`; para de duplicar em `role_description` |
| `tabs/PersonaTab.tsx` | o campo único vira edição por seção |
| `tabs/PromptTab.tsx` | **novo** — XML efetivo, visível |
| `tabs/ChannelsTab.tsx` | **novo** — números da loja |
| `tabs/VersionsTab.tsx` | diff passa a ser por seção |
| `tabs/SourcesTab.tsx` | ganha `display_name` e `usage_hint` |

### Sistemas adjacentes — atenção
| arquivo | por quê |
|---|---|
| `src/lib/ai/proposals.ts` | **gera `proposed_prompt` como prompt COMPLETO em texto** e escreve direto em `ai_agents.system_prompt`. Incompatível com seções — precisa passar a propor por seção |
| `src/lib/ai/test-runner.ts:145` | lê `agent.system_prompt` para gerar cenários de teste |
| `src/lib/ai/diff.ts:12` | versiona `['system_prompt','persona','settings']` → precisa incluir `prompt_sections` |
| `src/lib/ai/evals.ts` | pontua por `version_id`; evals antigas passam a comparar formatos diferentes |

### API
`api/ai/agents/route.ts`, `[id]/route.ts`, `[id]/proposals/*`, `[id]/reports/route.ts`

### Schema
`ai_agents`, `ai_agent_sources`, `agent_traces`

## O que NÃO é afetado

| área | por quê |
|---|---|
| `rag.ts`, `embeddings.ts`, `crawler.ts`, `source-storage.ts` | reuso integral; o RAG continua entrando como bloco de runtime |
| `prompt-sanitizer.ts` | `wrapAsDataBlock` e `sanitizeForPrompt` mantidos como estão — a defesa contra injection não muda |
| `tools/*`, `actions-engine.ts` | tools continuam vindo de `settings`; só a serialização no XML é nova |
| `guards.ts`, cooldown, debounce, `run-steps.ts` | o ciclo do run não muda |
| `webhook-processor.ts`, envio, realtime do inbox | fora do escopo |
| `services/whatsapp/ai-chat-service.ts` | **código morto** — zero consumidores. Não será migrado; proposta é remover |
| tabelas `agents`, `whatsapp_agents`, `agent_permissions` | são **atendentes humanos** (`user_id`, `email`, `status`), não IA |
| `judge.ts`, `sentiment-analyzer.ts`, `intent-detector.ts` | usam prompt próprio, não o do agente |

---

# PARTE 3 — Requisitos de sucesso

## Funcionais

| # | requisito | como verificar |
|---|---|---|
| **RF1** | Salvar qualquer configuração reflete no atendimento seguinte, sem passo de regeneração | mudar o tom, mandar mensagem, conferir `rendered_prompt` do trace |
| **RF2** | Existe uma fonte só; `system_prompt` e `role_description` deixam de coexistir | nenhum agente com os dois campos em uso após migração |
| **RF3** | Seção sem conteúdo é omitida, nunca renderizada vazia | teste: seções vazias → XML sem a tag |
| **RF4** | O agente sempre recebe o próprio nome | teste: `<persona>` contém `agent.name` em todos os caminhos |
| **RF5** | Camada de venda só existe em agente `sales`/`leads` | teste por tipo: `faq` não tem `<discovery_framework>` |
| **RF6** | Cada fonte chega ao modelo com nome e quando usar | `<sources>` lista `display_name` + `usage_hint` |
| **RF7** | O agente pertence a uma loja e só atende canais dela | seletor lista só números da loja + org-wide |
| **RF8** | Revisão com IA mostra diff por seção; aceitar aplica, rejeitar mantém o original | teste do fluxo de aceite parcial |
| **RF9** | Agentes existentes migram sem perder configuração | preview antes/depois por agente |
| **RF10** | É possível auditar o prompt exato de qualquer atendimento | `agent_traces.rendered_prompt` preenchido |

## Não funcionais

| # | requisito | limite |
|---|---|---|
| **RNF1** | Renderizar não adiciona consulta ao banco | a linha do agente já é buscada; montagem é string em memória |
| **RNF2** | Renderizar não adiciona latência perceptível | < 5 ms por atendimento |
| **RNF3** | O prompt não fica maior que o de hoje | a deduplicação de B5 deve reduzir; medir tokens antes/depois |
| **RNF4** | A defesa contra prompt injection é preservada | contato e RAG continuam em `wrapAsDataBlock`; teste de injection mantido |
| **RNF5** | Toda mudança de comportamento fica atrás de flag | `prompt_format` = `legacy` \| `xml`, default `legacy` |
| **RNF6** | Rollback é uma coluna | voltar `prompt_format` para `legacy` restaura o comportamento |
| **RNF7** | Migrations idempotentes, sem `CREATE TABLE IF NOT EXISTS` | só `ADD COLUMN IF NOT EXISTS` — ver `2026-07-30_colunas_divergentes.sql` |
| **RNF8** | Cobertura de teste antes de mexer na composição | `prompt-builder.test.ts` sai de 4 casos para a matriz completa |
| **RNF9** | Nenhum dado de cliente vaza para log | decidir se `rendered_prompt` grava o bloco de contato |
| **RNF10** | A revisão com IA respeita orçamento | passa por `checkAiBudget` — hoje quebrado, `ai_budgets` não existe |

## Como saber que deu errado

- prompt renderizado maior que o de hoje para o mesmo agente → RNF3 violado
- qualquer `<tag></tag>` vazia no XML → RF3 violado
- agente `faq` com `<objection_handling>` → RF5 violado
- trace sem `rendered_prompt` após a fase 1 → RF10 violado
- tempo do passo `generating` subindo após a fase 3 → RNF2

---

# PARTE 4 — Como fazer, dada a arquitetura

## O que a arquitetura já oferece

**Ponto único de montagem.** `PromptBuilder` é instanciado em um lugar só
(`engine.ts:52`), e `engine` é criado por `createAgentEngine`, usado pelo
`cloud-runner`. Trocar a implementação do builder atinge o caminho vivo
inteiro sem caçar chamadas.

**Sanitização pronta.** `wrapAsDataBlock` e `sanitizeForPrompt` já resolvem
delimitação de dado não confiável. O XML herda isso sem reescrever.

**Versionamento pronto.** `ai_agent_versions` + `diff.ts` já versionam três
campos. Adicionar `prompt_sections` à lista é uma linha.

**Fontes prontas.** `ai_agent_sources` + embeddings + RAG funcionam. Falta só
nome e dica de uso.

**Tipagem central.** `src/lib/ai/types.ts` é o contrato. As seções entram como
tipo novo ali, e o TypeScript aponta todos os pontos de ajuste.

## O que a arquitetura atrapalha

**Dois tipos `AIAgent`.** O de `services/whatsapp/types.ts` descreve outra
forma de agente. Enquanto existir, gera confusão sobre qual é o contrato.
Proposta: remover junto com o `ai-chat-service`.

**`proposals.ts` assume prompt como texto único.** Ele pede ao modelo um
"PROMPT DE SISTEMA COMPLETO já reescrito" e escreve em `system_prompt`. Com
seções, isso vira proposta por seção — é reescrita, não ajuste.

**`ai_agents` não tem `CREATE TABLE` no repositório.** Não há como saber o
schema real sem consultar o banco.

**Quatro caminhos de montagem.** Corrigir só o `PromptBuilder` deixa
`api/ai/respond` divergente.

## Estratégia

**Flag por agente, não global.** `prompt_format` decide qual caminho o builder
usa. Permite migrar um agente, observar, e seguir — sem big bang.

**Renderização pura e testável.** `renderXmlPrompt(sections, ctx)` sem efeito
colateral, sem I/O. Todo o comportamento novo coberto por teste unitário.

**Snapshot como rede.** Fixar o prompt que o código produz hoje antes de
mexer. Qualquer alteração aparece no diff do snapshot.

**Observabilidade antes de comportamento.** Persistir `rendered_prompt`
(fase 1) antes de qualquer mudança de composição. Foi a ausência disso que
deixou o bug atual sobreviver.

## Schema

```sql
-- A UNICA fonte do prompt. Nao existe coluna com o XML pronto.
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS prompt_sections jsonb;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS store_id uuid;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS agent_type text;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS prompt_format text NOT NULL DEFAULT 'legacy';

ALTER TABLE ai_agent_sources ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE ai_agent_sources ADD COLUMN IF NOT EXISTS usage_hint text;

ALTER TABLE agent_traces ADD COLUMN IF NOT EXISTS rendered_prompt text;
ALTER TABLE agent_traces ADD COLUMN IF NOT EXISTS prompt_hash text;
```

`system_prompt` e `persona.role_description` **não são apagados** na migração —
ficam como rollback. Deixam de ser lidos quando `prompt_format='xml'`.

## Fases

| # | fase | risco | depende de |
|---|---|---|---|
| 0 | Rede de teste: matriz + snapshot do prompt atual | baixo | — |
| 1 | `rendered_prompt` no trace | baixo | — |
| 2 | Schema + `xml-prompt.ts` + `prompt-sections.ts` (nada em produção usa) | baixo | schema real de `ai_agents` |
| 3 | Builder respeita `prompt_format`; nenhum agente é `xml` ainda | médio | 0, 2 |
| 4 | Aba Prompt: XML efetivo visível | médio | 3 |
| 5 | Wizard grava seções; agente novo nasce `xml` | médio | 3 |
| 6 | Loja e canais | **alto** | **leitura da RPC** |
| 7 | Revisão com IA | médio | 5, `ai_budgets` |
| 8 | Fontes com nome e dica | baixo | 3 |
| 9 | Migrar agentes existentes | **alto** | 4, 5 |
| 10 | Drift mitigation no orquestrador | médio | 3 |
| 11 | Unificar caminhos; remover código morto | médio | 3 |

Fases 0 e 1 são independentes de tudo e podem começar já.

---

# PARTE 5 — O que não sei

1. **`get_active_agent_for_conversation`** — decide qual agente responde, não
   está em migration nenhuma. **Bloqueia a fase 6.**
   ```sql
   SELECT pg_get_functiondef(oid) FROM pg_proc
   WHERE proname = 'get_active_agent_for_conversation';
   ```

2. **Schema real de `ai_agents`** — sem `CREATE TABLE` no repositório.
   **Bloqueia a fase 2.**
   ```sql
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='ai_agents' ORDER BY ordinal_position;
   ```

3. **Quantos agentes existem e quantos têm andaime** — dimensiona a fase 9.

4. **`ai_budgets` não existe no banco** (`20260616_ai_budgets.sql` PARCIAL) —
   a fase 7 gasta IA sem controle de custo até isso ser corrigido.

5. **Custo da revisão com IA** — 14 seções por agente; modelo e tokens não
   estimados.

6. **Seções sem revisão** — com a decisão 2, o wizard não cobre
   `constitution`, `flows`, `examples` nem `persona_anchors`. Se o lojista
   pular a revisão, ficam só com o default do nicho. Confirmar se está bom.

7. **`whatsapp_agents`** — presumi que são atendentes humanos, mas não
   confirmei.

8. **Nada foi implementado ou testado.** Todo este documento é leitura de
   código.

---

# ANEXO — O XML e a origem de cada seção

| seção | conteúdo vem de | condicional? |
|---|---|---|
| `<constitution>` | default por tipo de agente, editável; IA enriquece | sempre |
| `<persona>` | `agent.name`, `store.name`, `persona.tone` | sempre |
| `<system_context>` | runtime: data/hora, canal, horário da loja, escalonamento | sempre |
| `<tools>` | `agent.settings.tools` serializado | se houver tool ativa |
| `<critical_rules>` | as 8 regras de hoje + transferência + IA | sempre |
| `<style_guidelines>` | `tone`, `response_length`, `language`, `reply_delay`, emoji | sempre |
| `<discovery_framework>` | template SPIN | **só `sales` e `leads`** |
| `<objection_handling>` | template Voss | **só `sales` e `leads`** |
| `<persuasion_ethics>` | template Cialdini | **só `sales` e `leads`** |
| `<slot_filling>` | campos a coletar | se configurado |
| `<flows>` | IA, a partir do tipo + tarefas | se houver |
| `<examples>` | IA | se houver |
| `<persona_anchors>` | IA | se houver |
| `<sources>` | **novo** — `ai_agent_sources` com nome e quando usar | se houver fonte |
| `<contact>` | runtime, com `wrapAsDataBlock` | se houver contato |
| `<knowledge>` | RAG, com `wrapAsDataBlock` | se houver resultado |

`drift_mitigation` **não é seção** — é comportamento do `cloud-runner`.

**Regra de ouro:** seção sem conteúdo é **omitida**, nunca renderizada vazia.

## Mapeamento: wizard de hoje → seções

| step | campo | vai para |
|---|---|---|
| 1 Nicho | template | defaults de `constitution`, `flows`, `examples` |
| 2 Função | `sales`/`support`/`leads`/`scheduling`/`faq`/`custom` | **decide a camada 4** e o default de `flows` |
| 2 Função | tarefas principais | `critical_rules` + `flows` |
| 2 Personalizar | tom | `style_guidelines` + `persona` |
| 2 Personalizar | tamanho da resposta | `style_guidelines` |
| 2 Personalizar | delay | `style_guidelines` (timing) |
| — | nome da loja | **passa a vir de `store.name`**, não de campo digitado |
| 5 Conhecimento | uploads | `ai_agent_sources` → `<sources>` |

## Migração dos agentes existentes

```
para cada agente com prompt_format='legacy':
  prompt_sections.persona           <- name, persona.tone
  prompt_sections.style_guidelines  <- persona.{tone,response_length,language}
  prompt_sections.critical_rules    <- persona.guidelines
  prompt_sections.constitution      <- default do tipo
  prompt_sections.role              <- system_prompt atual, LIMPO do andaime
  prompt_format = 'xml'
```

A limpeza remove os padrões E1–E4 do texto congelado. O agente de produção
hoje perderia `Você é ,`, a seção `## SOBRE O NEGÓCIO` vazia e o
`Defina o tom de voz...`.

Como `system_prompt` e `role_description` guardam o mesmo texto, a migração
escolhe **um** e descarta a cópia — resolvendo B5.

**A migração muda o prompt de todo agente ativo.** Exige preview antes/depois
por agente, execução por organização, e `prompt_format` de volta para `legacy`
como rollback.

---

# PARTE 6 — O flywheel de qualidade

## O que já existe

| peça | arquivo / tabela | estado |
|---|---|---|
| Juiz com score 0–100, `note` e `flags` (`turn_index`, `label`, `severe`) | `judge.ts` | funciona |
| Juiz por critério (`pass`/`fail` por `criterion_id`) | `judge.ts` | funciona |
| Casos e critérios de eval | `ai_eval_cases`, `ai_eval_criteria` | existem |
| Resultados de eval por versão | `ai_eval_results` | existe |
| Score médio por `version_id` | `evals.ts` | existe |
| Anotação humana em trace | `agent_trace_annotations`, `AnnotationTab` | existe |
| CSAT real do cliente | `whatsapp_csat_ratings` | existe |
| Propostas de melhoria a partir de sinais | `proposals.ts` | existe |
| Versionamento e rollback | `ai_agent_versions`, `VersionsTab` | existe |

**Quase todas as peças do ciclo já estão construídas.**

## Por que ele não gira hoje

**1. O juiz não avalia conversa real.**
`grep -c "judge" src/lib/ai/cloud-runner.ts` devolve **0**. O juiz roda em
`evals.ts`, `test-runner.ts` e `proposals.ts` — todos sobre cenários
inventados. Nenhuma conversa de produção é pontuada automaticamente.

O ciclo aprende com o que imaginamos, não com o que aconteceu.

**2. Não há como ligar resultado a prompt.**
Sem `rendered_prompt`/`prompt_hash` no trace (B6), é impossível dizer *"as
conversas ruins usavam esta versão do prompt"*. A correlação que sustentaria
todo o resto não existe.

**3. A proposta é um texto inteiro.**
`proposals.ts` pede ao modelo o *"PROMPT DE SISTEMA COMPLETO já reescrito"* e
grava em `system_prompt`. Não dá para dizer **qual parte** estava errada, nem
aceitar só uma correção. É trocar o motor para consertar uma vela.

**4. Nada trava regressão.**
`evals.ts` pontua por versão, mas nada compara a nova com a anterior nem
impede publicar uma versão pior.

**5. O aprendizado não acumula.**
Uma conversa ruim vira, no máximo, uma proposta. Ela não vira caso de teste.
Corrigido o problema, nada garante que ele não volte.

## O desenho

```
   ┌──────────────────────────────────────────────────────────┐
   │                                                          │
   ▼                                                          │
1. ATENDIMENTO                                                │
   trace + rendered_prompt + prompt_hash + version_id         │
   │                                                          │
   ▼                                                          │
2. SINAL                                                      │
   ├─ juiz em AMOSTRA das conversas reais → score + flags     │
   ├─ CSAT real do cliente                                    │
   ├─ implícito: transferiu p/ humano, cliente sumiu,         │
   │             repetiu a mesma pergunta                     │
   └─ anotação humana no inbox                                │
   │                                                          │
   ▼                                                          │
3. ATRIBUIÇÃO POR SEÇÃO                                       │
   cada flag do juiz é mapeada para a seção do XML            │
   responsável. "prometeu prazo sem consultar"                │
   → <critical_rules>                                          │
   │                                                          │
   ▼                                                          │
4. PROPOSTA POR SEÇÃO                                         │
   "<critical_rules>: 7 conversas com esta falha,             │
    veja 3 exemplos. Sugestão: ..."                           │
   │                                                          │
   ▼                                                          │
5. ACEITE campo a campo (RF8) → nova versão                   │
   │                                                          │
   ▼                                                          │
6. PORTÃO DE REGRESSÃO                                        │
   roda os casos de eval na versão nova                       │
   piorou em caso que passava? → bloqueia e avisa             │
   │                                                          │
   ▼                                                          │
7. AS FALHAS VIRAM CASOS PERMANENTES ──────────────────────────┘
   cada conversa que gerou proposta aceita entra em
   ai_eval_cases com o comportamento esperado
```

## O que torna isso um flywheel, e não um loop

**O passo 7.** Sem ele, o ciclo corrige e esquece — e o mesmo problema volta
na próxima reescrita.

Com ele, **cada falha real vira caso de teste permanente**. O conjunto de
avaliação cresce com o uso, e toda mudança futura passa a ser conferida contra
todos os problemas já vividos por aquele agente.

O ativo que acumula não é o prompt: é o **corpus de casos**. O prompt fica bom
como consequência.

## Como a arquitetura nova viabiliza isso

Duas coisas que só passam a existir com o XML por seções:

**Atribuição.** Hoje, com um blocão de texto, saber "que parte causou a falha"
é chute. Com seções nomeadas, a flag do juiz aponta um lugar.

**Correção cirúrgica.** Propor mudança em `<critical_rules>` sem tocar em
`<persona>` só é possível se as duas forem coisas separadas.

O flywheel **depende** da arquitetura de seções. Não é um módulo à parte.

## O que precisa ser construído

| item | onde | esforço |
|---|---|---|
| `prompt_hash` + `version_id` no trace | `cloud-runner.ts`, `agent_traces` | pequeno — já está na fase 1 |
| Juiz em amostra de produção | novo worker, ou cron | médio |
| Taxa de amostragem configurável | `settings` do agente | pequeno |
| Mapa flag → seção | `prompt-sections.ts` | médio — é design, não código |
| Sinais implícitos (transferência, abandono, repetição) | `reports-metrics.ts` | médio |
| Propostas por seção | reescrever `proposals.ts` | **grande** |
| Portão de regressão | `evals.ts` + API de publicação | médio |
| Promover trace a caso de eval | `ai_eval_cases` + UI | médio |

## Requisitos do flywheel

| # | requisito | como verificar |
|---|---|---|
| **RF11** | Todo trace é rastreável até o prompt exato e a versão | `prompt_hash` e `version_id` preenchidos |
| **RF12** | Conversas reais são avaliadas, não só cenários | `ai_eval_results` com origem de produção |
| **RF13** | Toda falha aponta uma seção | flag do juiz tem `section` |
| **RF14** | Proposta cita evidência: N conversas, exemplos | proposta sem trace de origem é rejeitada |
| **RF15** | Versão que regride caso que passava não publica sozinha | portão bloqueia e avisa |
| **RF16** | Falha corrigida vira caso permanente | `ai_eval_cases` cresce com proposta aceita |
| **RNF11** | Julgar produção respeita orçamento | amostragem configurável + `checkAiBudget` |
| **RNF12** | Julgar não atrasa resposta ao cliente | roda fora do caminho da resposta, assíncrono |
| **RNF13** | Conteúdo de conversa em caso de eval respeita LGPD | anonimizar ao promover, ou pedir consentimento |

## Fases do flywheel

| # | fase | risco | depende de |
|---|---|---|---|
| 12 | `prompt_hash` + `version_id` no trace | baixo | 1 |
| 13 | Mapa flag → seção | baixo | 2 |
| 14 | Juiz em amostra de produção, assíncrono | médio | 12, `ai_budgets` |
| 15 | Sinais implícitos | médio | 12 |
| 16 | Propostas por seção com evidência | **alto** | 5, 13, 14 |
| 17 | Portão de regressão | médio | 16 |
| 18 | Promover trace a caso de eval | médio | 16 |

**Ordem sugerida:** 12 e 13 podem entrar junto com as fases 1 e 2 — são
baratas e destravam todo o resto. Da 14 em diante, só depois do XML rodando.

## Riscos próprios

- **Custo.** Julgar conversa real é chamada de LLM por conversa. Sem
  amostragem e sem `ai_budgets` funcionando, escala mal.
- **Juiz enviesado.** O juiz é um LLM com prompt próprio. Se ele estiver
  errado, o flywheel otimiza para a métrica errada — e com convicção. Precisa
  de calibração contra anotação humana.
- **Otimizar o mensurável.** Score de juiz e CSAT não capturam tudo. O ciclo
  vai empurrar o agente para o que é medido; o que não é medido pode piorar
  sem aparecer.
- **Privacidade.** Promover conversa real a caso de teste guarda mensagem de
  cliente indefinidamente. Precisa de decisão antes, não depois.
