# Plano: arquitetura de prompt em camadas (XML)

## As decisões

| # | pergunta | resposta |
|---|---|---|
| 1 | escopo do XML | **A** — substitui tudo, exceto runtime (contato, RAG, ações) |
| 2 | como o lojista preenche | **C** — wizard atual mapeado para as seções |
| 3 | camada de venda (SPIN/Voss/Cialdini) | **A** — opcional, por tipo de agente |
| 4 | aceite da revisão com IA | **A** — campo a campo, com edição da sugestão |
| 5 | fontes | **A** — reusa `ai_agent_sources` + RAG que já existem |
| 6 | loja | **A** — `ai_agents.store_id`; loja delimita canais, agente escolhe quais |
| 7 | agentes existentes | **A** — migram automaticamente |
| 8 | `drift_mitigation` | orquestrador, não é seção do XML |

## A decisão que falta, e é a mais importante

**O XML é armazenado pronto ou renderizado a cada uso?**

Se for armazenado pronto, recriamos exatamente o bug que estamos consertando:
o prompt congela na criação e para de refletir a configuração.

**Recomendação: renderizado.** As seções viram dado estruturado em
`ai_agents.prompt_sections` (jsonb), e o XML é montado a partir delas. Editar
a persona muda o prompt no próximo atendimento, sem regenerar nada.

O resto deste plano assume isso. Se você preferir congelado, vários pontos
mudam e eu reescrevo.

---

# PARTE 1 — Como está hoje

## Fluxo dos dados

```
wizard (5 steps)
  │
  ├─ nicho ────────────> template.promptTemplate  (texto com {{vars}})
  ├─ nome/descrição ──┐
  ├─ tarefas ─────────┼─> generatePromptFromTemplate()
  ├─ FAQs ────────────┤        │
  └─ análise da loja ─┘        │
                               ├─> system_prompt  (TEXTO, congelado)
                               └─> persona.role_description (MESMO TEXTO)
  ├─ tom/tamanho/delay ──────────> persona.{tone,response_length,reply_delay}
  └─ fontes (upload) ────────────> ai_agent_sources → embeddings → RAG
```

Em runtime, `PromptBuilder` concatena 10 blocos com `parts.join('\n\n')`:

| # | bloco | origem |
|---|---|---|
| 1 | `system_prompt` (ou `buildPersonaBase()`) | banco, congelado |
| 2 | `## Sua Função` | `persona.role_description` |
| 3 | `## Tom de Voz` | `persona.tone` → 1 de 4 textos fixos |
| 4 | `## Tamanho das Respostas` | `persona.response_length` → 1 de 3 |
| 5 | `## Idioma` | `persona.language` |
| 6 | `## Diretrizes Específicas` | `persona.guidelines` |
| 7 | `## Informações do Cliente` | runtime, sanitizado |
| 8 | `## INSTRUÇÕES ESPECIAIS` | ações ativas |
| 9 | `## Conhecimento Base` | RAG condicional |
| 10 | `## Regras Importantes` | 8 regras hardcoded |

## Os defeitos conhecidos

- **B1** prompt congelado na criação; `generatePromptFromTemplate` só roda em `CreateAgentFlow.tsx:280`
- **B2** nenhuma aba do editor lê ou escreve `system_prompt`
- **B3** o `if/else` cobre só o bloco 1; blocos 3–6 são anexados sempre → instrução duplicada e contraditória
- **B4** `Seu nome é ${agent.name}` vive no ramo `else`, então agente com `system_prompt` nunca recebe o próprio nome
- **B5** blocos 1 e 2 recebem **o mesmo texto** (`system_prompt` e `persona.role_description`), duplicando tokens
- **B6** prompt renderizado não é persistido — impossível auditar o que o modelo recebeu

## Schema atual relevante

```
ai_agents           id, organization_id, name, description, system_prompt,
                    persona (jsonb), settings (jsonb), provider, model,
                    temperature, max_tokens, is_active
                    ⚠️ NÃO tem store_id
                    ⚠️ não é criada por migration nenhuma do repositório

ai_agent_sources    fontes por agente (url, file), com embeddings e RAG
ai_agent_versions   versionamento de ['system_prompt','persona','settings']
ai_prompt_proposals propostas de melhoria geradas por IA
agent_traces        input (mensagem do cliente), output, tokens, latency
whatsapp_ai_run_steps  passos do run
```

## Vínculo loja ↔ canal (já existe)

```ts
// /api/whatsapp/numbers/route.ts:95
.from('whatsapp_business_accounts')
.eq('organization_id', organizationId)
.or(`store_id.eq.${storeId},store_id.is.null`)
```

`whatsapp_business_accounts.store_id`, `whatsapp_numbers.store_id` e
`whatsapp_instances.store_id` existem. Convenção: **`store_id` nulo = número
org-wide, aparece em todas as lojas.**

A escolha do agente é feita por uma RPC:

```ts
// cloud-runner.ts:393
rpc('get_active_agent_for_conversation', {
  p_organization_id, p_channel_id: account.id, p_pipeline_stage_id: null
})
```

Comentário do código: compara `p_channel_id` contra
`settings.channels.channel_ids`; `all_channels=true` casa sempre.

⚠️ **Essa função não existe em migration nenhuma.** Não consegui ler o corpo.
É o maior ponto cego deste plano — ver "O que não sei".

---

# PARTE 2 — Como fica

## Novo fluxo

```
wizard (mesmos 5 steps)
  │
  └─> prompt_sections (jsonb estruturado, uma chave por seção)
         │
         ├─ (opcional) revisão com IA ──> diff campo a campo ──> aceite
         │
         └─> renderXmlPrompt(sections, agent, store, sources, tipo)
                    │
                    └─> <system_prompt> montado a cada atendimento
```

O prompt deixa de ser texto congelado e passa a ser **função** do estado atual
do agente.

## O XML e a origem de cada seção

| seção | conteúdo vem de | condicional? |
|---|---|---|
| `<constitution>` | default por tipo de agente, editável; IA enriquece | sempre |
| `<persona>` | `agent.name`, `store.name`, `persona.tone` | sempre |
| `<system_context>` | runtime: data/hora, canal, horário da loja, política de escalonamento | sempre |
| `<tools>` | `agent.settings.tools` serializado | se houver tool ativa |
| `<critical_rules>` | as 8 regras de hoje + regras de transferência do wizard + IA | sempre |
| `<style_guidelines>` | `persona.tone`, `response_length`, `language`, `reply_delay`, whitelist de emoji | sempre |
| `<discovery_framework>` | template SPIN | **só `sales` e `leads`** |
| `<objection_handling>` | template Voss | **só `sales` e `leads`** |
| `<persuasion_ethics>` | template Cialdini | **só `sales` e `leads`** |
| `<slot_filling>` | campos a coletar, do wizard ou da IA | se configurado |
| `<flows>` | gerado pela IA a partir do tipo + tarefas | se houver |
| `<examples>` | gerado pela IA | se houver |
| `<persona_anchors>` | gerado pela IA | se houver |
| `<sources>` | **novo** — lista de `ai_agent_sources` com nome e quando usar | se houver fonte |
| `<contact>` | runtime, com `wrapAsDataBlock` | se houver contato |
| `<knowledge>` | RAG, com `wrapAsDataBlock` | se houver resultado |

`drift_mitigation` **não é seção** — é comportamento do `cloud-runner`.

**Regra de ouro:** seção sem conteúdo é **omitida**, nunca renderizada vazia.
É o bug E4, resolvido por construção.

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

Nota: o campo "nome da loja" digitado à mão sai de cena. Vem da loja
selecionada, que é editável mas tem default da loja logada.

## O que muda em cada arquivo

| arquivo | mudança |
|---|---|
| `src/lib/ai/prompt-builder.ts` | reescrito: deixa de concatenar 10 blocos, passa a renderizar XML de `prompt_sections`. Mantém `wrapAsDataBlock` e `sanitizeForPrompt` |
| `src/lib/ai/xml-prompt.ts` | **novo** — renderizador, com omissão de seção vazia |
| `src/lib/ai/prompt-sections.ts` | **novo** — schema das seções, defaults por tipo, validação |
| `src/lib/ai/templates/index.ts` | `generatePromptFromTemplate` passa a devolver `prompt_sections` em vez de texto |
| `src/lib/ai/templates/*.ts` (9 nichos) | `promptTemplate` (texto) → defaults por seção |
| `src/components/agents/create/CreateAgentFlow.tsx` | grava `prompt_sections`; para de gravar `role_description` duplicado |
| `src/components/agents/tabs/PromptTab.tsx` | **novo** — vê e edita as seções; mostra o XML efetivo |
| `src/components/agents/tabs/ChannelsTab.tsx` | **novo** — seleciona os números da loja |
| `src/app/api/ai/agents/[id]/prompt-review/route.ts` | **novo** — a revisão com IA |
| `src/app/api/ai/agents/route.ts` | aceita `store_id` e `prompt_sections` |
| `src/lib/ai/diff.ts` | versiona `prompt_sections` também |
| `src/lib/ai/cloud-runner.ts` | grava o prompt renderizado no trace; reinjeção periódica (drift) |
| `src/app/api/ai/respond/route.ts` | passa a usar o `PromptBuilder` em vez de `system_prompt` cru |

## Schema novo

```sql
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS prompt_sections jsonb;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS store_id uuid;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS agent_type text;   -- sales|support|leads|scheduling|faq|custom
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS prompt_format text NOT NULL DEFAULT 'legacy';
                                                              -- legacy | xml

ALTER TABLE ai_agent_sources ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE ai_agent_sources ADD COLUMN IF NOT EXISTS usage_hint text;
                                                              -- "use quando o cliente perguntar sobre trocas"

ALTER TABLE agent_traces ADD COLUMN IF NOT EXISTS rendered_prompt text;
ALTER TABLE agent_traces ADD COLUMN IF NOT EXISTS prompt_hash text;
```

⚠️ `ai_agents` **não é criada por migration nenhuma do repositório**. Antes de
escrever essas migrations é preciso confirmar o schema real da tabela.

⚠️ Toda migration usará `ADD COLUMN IF NOT EXISTS`, nunca
`CREATE TABLE IF NOT EXISTS` — pelo motivo documentado em
`2026-07-30_colunas_divergentes.sql`.

## Loja e canais

O modelo que você descreveu:

```
loja Y ──┬── número 1  ┐
         ├── número 2  ├── whatsapp_business_accounts.store_id = Y
         └── número 3  ┘
              │
              └──> agente da loja Y
                   settings.channels.channel_ids = [1, 3]
```

Três mudanças:

1. `ai_agents.store_id` — default da loja logada, editável
2. o seletor de canais lista **só os números da loja do agente** (+ os org-wide, `store_id is null`)
3. `all_channels=true` passa a significar "todos os canais **da minha loja**"

O item 3 é o mais delicado: hoje `all_channels` é irrestrito, então um agente
provavelmente responde nos números de outra loja. **Depende de ler a RPC.**

## A revisão com IA

```
1. lê prompt_sections + tipo de agente + fontes + dados da loja
2. para cada seção, pede ao modelo uma versão mais clara e específica,
   respeitando a estrutura de camadas
3. devolve, por seção: original, sugerido, resumo do que mudou e por quê
4. o lojista aceita, edita ou rejeita cada uma
5. o aceito grava em prompt_sections → o XML muda no próximo atendimento
```

Decisões embutidas:

- **rejeitar mantém o original**, nunca esvazia
- roda como job, não no request — 14 seções é chamada demais para um POST
- consome orçamento de IA: precisa passar por `checkAiBudget`
  (hoje quebrado — `ai_budgets` não existe no banco)
- guarda a proposta em `ai_prompt_proposals`, reusando o que já existe

## Fontes

Reuso total do que existe. O que muda:

- `display_name` e `usage_hint` por fonte
- nova seção `<sources>` no XML:

```xml
<sources>
  <source name="Política de Trocas e Devoluções">
    Use quando o cliente perguntar sobre devolução, troca ou arrependimento.
  </source>
</sources>
```

Isso resolve um problema real de hoje: o RAG injeta o texto do documento sem
dizer de onde veio nem quando usar. O agente recebe conhecimento sem
proveniência.

## Migração dos agentes existentes

Resposta 7 = migram automaticamente.

```
para cada agente com prompt_format='legacy':
  prompt_sections.persona            <- name, persona.tone
  prompt_sections.style_guidelines   <- persona.tone/response_length/language
  prompt_sections.critical_rules     <- persona.guidelines
  prompt_sections.constitution       <- default do tipo
  prompt_sections.legacy_prompt      <- system_prompt atual, LIMPO do andaime
  prompt_format = 'xml'
```

A limpeza remove os padrões E1–E4 do texto congelado. Um agente como o de
produção hoje perderia `Você é ,`, a seção `## SOBRE O NEGÓCIO` vazia e o
`Defina o tom de voz...`.

**A migração muda o prompt de todo agente ativo.** Precisa de:

- pré-visualização: renderizar antes/depois de cada agente, sem gravar
- execução por organização, não global
- `prompt_format` de volta para `legacy` como rollback, já que
  `system_prompt` não é apagado

---

# PARTE 3 — Fases

### Fase 0 — rede de proteção
`prompt-builder.test.ts` tem **4 casos**. Antes de reescrever, cobrir a matriz
atual e fixar um snapshot do prompt que o código produz hoje.
*Risco: baixo.*

### Fase 1 — persistir o prompt renderizado
`agent_traces.rendered_prompt` + hash. Sem isso, nenhuma fase seguinte é
verificável em produção — foi essa cegueira que deixou o bug atual sobreviver.
Decisão pendente: gravar o bloco de contato (dado de cliente) ou omitir.
*Risco: baixo. Independente de todo o resto.*

### Fase 2 — schema e renderizador
Migrations + `xml-prompt.ts` + `prompt-sections.ts`. Nada em produção ainda usa.
*Risco: baixo.*

### Fase 3 — o builder passa a renderizar XML
`prompt-builder.ts` respeita `prompt_format`. `legacy` continua no caminho de
hoje; `xml` renderiza. Nenhum agente é `xml` ainda.
*Risco: médio — mexe no caminho quente, mas atrás de flag.*

### Fase 4 — a aba Prompt
Vê e edita as seções, mostra o XML efetivo. É aqui que a divergência atual fica
visível sem SQL.
*Risco: médio.*

### Fase 5 — wizard grava seções
`CreateAgentFlow` grava `prompt_sections` e `prompt_format='xml'`. Agente novo
já nasce no formato novo. Fim do `role_description` duplicado.
*Risco: médio.*

### Fase 6 — loja e canais
`store_id`, seletor de canais por loja, semântica de `all_channels`.
**Bloqueada pela leitura da RPC.**
*Risco: alto — mexe em roteamento de mensagem.*

### Fase 7 — revisão com IA
Job, diff por seção, aceite. Depende de `ai_budgets` existir.
*Risco: médio.*

### Fase 8 — fontes com nome e dica
`display_name`, `usage_hint`, seção `<sources>`.
*Risco: baixo.*

### Fase 9 — migrar os existentes
Preview, execução por organização, rollback por flag.
*Risco: alto — muda o comportamento de agente em produção.*

### Fase 10 — drift mitigation
Reinjeção do system prompt a cada N turnos no `cloud-runner`.
*Risco: médio — aumenta custo por conversa longa.*

### Fase 11 — unificar caminhos
`api/ai/respond` passa a usar o `PromptBuilder`.
*Risco: médio.*

---

# O que não sei

1. **`get_active_agent_for_conversation`** — a função que decide qual agente
   responde não está em migration nenhuma. Não sei se já considera loja, nem o
   que `all_channels` faz. **A fase 6 está bloqueada por isto.**
   ```sql
   SELECT pg_get_functiondef(oid) FROM pg_proc
   WHERE proname = 'get_active_agent_for_conversation';
   ```

2. **Schema real de `ai_agents`** — não há `CREATE TABLE ai_agents` no
   repositório. As migrations da fase 2 precisam do schema confirmado.
   ```sql
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='ai_agents' ORDER BY ordinal_position;
   ```

3. **Quantos agentes existem** e quantos têm andaime — muda o peso da fase 9.

4. **`ai_budgets` não existe no banco** (`20260616_ai_budgets.sql` está PARCIAL).
   A fase 7 gasta IA e deveria passar por budget. Precisa ser corrigido antes.

5. **Custo da revisão com IA** — 14 seções por agente. Não estimei tokens nem
   escolhi modelo.

6. **Seções sem revisão** — com a resposta 2=C, o wizard não cobre
   `constitution`, `flows`, `examples` nem `persona_anchors`. Se o lojista pular
   a revisão, essas seções ficam só com o default do nicho. Confirmar se está
   bom ou se a revisão deve ser obrigatória na criação.

7. **Nada aqui foi implementado ou testado.** É desenho a partir de leitura de
   código.
