# Plano: o prompt do agente diverge do que foi configurado

## O sintoma

O `system_prompt` gravado do agente em produção:

```
## IDENTIDADE
Você é , assistente virtual de **wdww**.

## SOBRE O NEGÓCIO

## TOM DE VOZ
Defina o tom de voz ideal para seu negócio.
```

Três defeitos num texto só: nome vazio, seção sem conteúdo, e um
placeholder de instrução para o operador que foi parar no prompt do
modelo. E nada do que foi configurado depois na aba de Agentes aparece
ali.

## A causa: quatro bugs empilhados

### B1 — o prompt é congelado na criação e nunca mais regenerado

`generatePromptFromTemplate` é chamado em **um único lugar** do
código-fonte: `src/components/agents/create/CreateAgentFlow.tsx:280`. O
resultado é enviado como `system_prompt` no POST e vira um snapshot.

Verificação:

```
grep -rn "generatePromptFromTemplate" src
  -> src/lib/ai/templates/index.ts        (definição)
  -> src/components/agents/create/CreateAgentFlow.tsx  (única chamada)
```

Se os campos do formulário estiverem vazios na criação, o template
mantém os placeholders — e eles ficam salvos para sempre.

### B2 — o editor não tem como ver nem corrigir o prompt

Este comando volta vazio:

```
grep -rn "system_prompt" src/components/agents/ --include=*.tsx | grep -v "create/"
```

Nenhuma aba do editor — Persona, Configurações, Ações, Ferramentas,
Fontes, Integrações — lê ou escreve `system_prompt`. Elas gravam em
`persona` e `settings`. O operador configura, vê a tela salvar, e o
prompt não muda. Não há sequer onde inspecionar o valor atual.

Isso explica a percepção de que "o que criei na aba não tem nada a ver
com o que está no system_prompt": literalmente não tem, e o produto não
oferece nenhum sinal disso.

### B3 — o prompt final recebe instruções contraditórias

`src/lib/ai/prompt-builder.ts:66`:

```ts
if (this.agent.system_prompt) {
  parts.push(this.agent.system_prompt)   // congelado, pode ter placeholder
} else {
  parts.push(this.buildPersonaBase())
}
// ... e daqui para baixo SEMPRE roda, independente do if acima:
parts.push(this.buildToneInstructions())      // persona.tone
parts.push(this.buildLengthInstructions())    // persona.response_length
parts.push(this.buildLanguageInstructions())  // persona.language
parts.push(this.buildGuidelinesSection())     // persona.guidelines
```

O `if/else` só cobre o primeiro bloco. Os quatro seguintes são
adicionados sempre. Resultado, no prompt que chega ao modelo:

| bloco | origem | conteúdo |
|---|---|---|
| 1 | `system_prompt` congelado | "Defina o tom de voz ideal para seu negócio." |
| 3 | `persona.tone` | o tom real configurado |

O modelo lê uma instrução para *definir* um tom — que não é instrução
para ele, é para o operador — e três blocos depois recebe o tom de
verdade. O mesmo vale para `## SOBRE O NEGÓCIO` vazio.

### B4 — o agente não sabe o próprio nome

`buildPersonaBase()` contém `Seu nome é ${this.agent.name}`, e é o ramo
**else** do B3. Com `system_prompt` preenchido, ele nunca executa.

A única menção ao nome no prompt do agente em produção é o
`Você é ,` quebrado. O nome configurado não chega ao modelo por caminho
nenhum.

## O que isso afeta na Worder

### Área de produto

- **Todo agente criado até hoje** carrega o snapshot da criação. A
  consulta em "Medir o alcance" abaixo diz quantos.
- **Configurar a persona não muda o comportamento** de forma consistente:
  parte entra (blocos 3–6), parte é contradita pelo bloco 1.
- **O agente se apresenta sem nome** ou com nome vazio.

### Sistemas que dependem de `system_prompt` e precisam continuar de pé

O campo não é acessório — há infraestrutura construída em volta dele:

| sistema | arquivo | o que faz |
|---|---|---|
| Versionamento | `src/lib/ai/diff.ts:12` | versiona `['system_prompt','persona','settings']` |
| Histórico + rollback | `tabs/VersionsTab.tsx` | mostra diff do prompt entre versões |
| Propostas de IA | `api/ai/agents/[id]/proposals/*` | gera melhorias e as aplica sobre `system_prompt` |
| Relatórios | `api/ai/agents/[id]/reports` | lê `system_prompt` |

**Consequência de projeto:** eliminar o `system_prompt` e derivar tudo de
`persona` — que era a alternativa mais simples — quebraria versionamento,
rollback e o sistema de propostas. Está descartado.

### Caminhos de execução divergentes

Há mais de um lugar montando prompt, e eles não concordam:

| caminho | como monta | usado por |
|---|---|---|
| `engine.ts` → `PromptBuilder` | 10 blocos empilhados | **inbox WhatsApp Cloud** (o que rodou hoje) |
| `api/ai/respond/route.ts:105` | `{role:'system', content: aiConfig.system_prompt}` cru | rota alternativa |
| `ai-chat-service.ts` | `PromptBuilder` | serviço de chat |

Qualquer correção feita só no `PromptBuilder` deixa `api/ai/respond` com
comportamento diferente. Há ainda três APIs paralelas de agente
(`api/ai-agents`, `api/whatsapp/ai`, `api/whatsapp/agents`) que também
leem o campo.

### Cobertura de teste atual

`src/lib/ai/__tests__/prompt-builder.test.ts` tem **4 casos**. É pouco
para mexer na composição com segurança — a fase 0 do plano trata disso.

## A decisão de projeto

Três desenhos possíveis. Recomendo o terceiro.

**A — regenerar o prompt quando a persona mudar.**
Mantém tudo, mas torna o `system_prompt` derivado na prática. Conflita
com as propostas de IA e com edições manuais: qualquer ajuste seria
sobrescrito no próximo save da persona. Perde-se a edição manual.

**B — eliminar `system_prompt`, montar tudo de `persona`.**
O mais limpo em teoria. Quebra versionamento, rollback, diff e propostas.
Descartado pela seção anterior.

**C — tornar o modo explícito (recomendado).**
Um campo `prompt_mode` no agente, com dois valores:

- `guided` — o prompt é montado a partir da `persona`. O
  `system_prompt` não é usado. É o padrão para agente novo, e o que a
  maioria dos operadores espera: configurou, mudou.
- `custom` — o `system_prompt` é o prompt, inteiro, e **substitui** os
  blocos derivados da persona em vez de conviver com eles. É o modo em
  que as propostas de IA e o versionamento fazem sentido.

Isso resolve B3 por construção (nunca há dois blocos disputando o mesmo
assunto), preserva versionamento e propostas no modo `custom`, e dá ao
operador um lugar visível para escolher.

## O plano

Fases pensadas para serem entregues e verificadas uma a uma. Cada uma é
independente e reversível.

### Fase 0 — rede de proteção (antes de qualquer mudança)

Sem isto, as fases seguintes são mudanças às cegas na composição do
prompt.

1. Ampliar `prompt-builder.test.ts` dos 4 casos atuais para cobrir a
   matriz que importa: com e sem `system_prompt`, com e sem cada campo
   de persona, com e sem RAG, com e sem contato.
2. Teste de caracterização: fixar o prompt que o código produz **hoje**
   para um agente de exemplo. Serve de linha de base — qualquer
   alteração posterior fica visível no diff do snapshot.

Risco: baixo. Só adiciona teste.

### Fase 1 — parar de perder o nome (B4)

Injetar `Seu nome é ${agent.name}` em ambos os ramos do `if`, não apenas
no `else`.

Correção pequena, isolada, e a de maior efeito imediato: o agente passa
a saber quem é. Não depende de nenhuma das outras fases.

Risco: baixo.

### Fase 2 — tornar o prompt visível (B2)

Nova aba **Prompt** no `AIAgentEditor`, mostrando:

- o `system_prompt` atual, editável;
- **o prompt efetivo montado** — os 10 blocos, como o modelo recebe;
- um botão "regerar a partir da persona".

Esta é a fase que devolve o controle ao operador, e a que teria evitado
que o problema passasse despercebido. Também é o ponto em que a
divergência atual fica óbvia sozinha, sem precisar de SQL.

Risco: médio. Só UI e leitura, mas depende de expor a montagem do prompt
por uma rota nova.

### Fase 3 — o modo explícito (B3)

1. Migration: `prompt_mode text not null default 'custom'` em
   `ai_agents`.
   Padrão `custom` de propósito: preserva o comportamento dos agentes
   existentes. Ninguém muda de comportamento por causa da migration.
2. `prompt-builder.ts`: em `guided`, montar da persona e ignorar
   `system_prompt`; em `custom`, usar `system_prompt` e **não** anexar os
   blocos 3–6.
3. `CreateAgentFlow`: agente novo nasce `guided`.
4. Aba Prompt (fase 2) ganha o seletor de modo, com o aviso de que
   mudar para `guided` faz o `system_prompt` deixar de ser usado.

Risco: alto — muda o prompt que vai ao modelo. É a fase que exige a
fase 0 pronta e um período de observação.

### Fase 4 — não gerar mais andaime na criação (B1)

O fix E1–E4 (commit `0169eab0`) já limpa a renderização. Falta impedir a
origem: o fluxo de criação não deveria produzir seção vazia nem
placeholder de instrução ao operador. Ou o campo é obrigatório, ou a
seção é omitida.

Risco: baixo.

### Fase 5 — observabilidade do prompt

Persistir o prompt renderizado no trace — ou o texto, ou um hash mais o
`prompt_mode` e a versão da persona.

Hoje o prompt é montado, enviado ao modelo e descartado. **Não há como
auditar em produção o que o agente recebeu como instrução.** Foi por isso
que este bug sobreviveu: o sintoma só aparecia na resposta, nunca na
causa.

Decisão pendente: gravar o prompt inteiro tem custo de armazenamento e
implicação de privacidade, já que o bloco de contato carrega dado do
cliente. Um hash resolve "mudou?" mas não "o que dizia". Proposta:
gravar o texto sem o bloco de contato, mais um hash do prompt completo.

Risco: baixo em código, mas exige a decisão acima.

### Fase 6 — unificar os caminhos de execução

Fazer `api/ai/respond` usar o `PromptBuilder` em vez de `system_prompt`
cru, e avaliar as três APIs paralelas de agente.

Deixada por último de propósito: é a de maior alcance e a que menos
contribui para o sintoma relatado. Pode ser adiada sem prejuízo.

## Medir o alcance antes de começar

Quantos agentes carregam andaime hoje:

```sql
SELECT
  count(*)                                                        AS agentes,
  count(*) FILTER (WHERE system_prompt IS NULL OR system_prompt = '') AS sem_prompt,
  count(*) FILTER (WHERE system_prompt ~ 'Você é\s*,')            AS e1_nome_vazio,
  count(*) FILTER (WHERE system_prompt LIKE '%Defina o tom de voz ideal para seu negócio%') AS e2_placeholder,
  count(*) FILTER (WHERE system_prompt ~ '\{\{[^}]+\}\}')          AS e3_variavel_crua,
  count(*) FILTER (WHERE system_prompt ~ '(?m)^##[^\n]*\n\s*(##|$)') AS e4_secao_vazia
FROM ai_agents;
```

Se `sem_prompt` for alto, muitos agentes já rodam pelo ramo `else` e
recebem o nome corretamente — o que muda a prioridade da fase 1.

## Correção imediata, independente do plano

O agente de produção pode ser destravado hoje editando o texto no banco:
remover a linha `Você é ,`, a seção `## SOBRE O NEGÓCIO` vazia e a linha
`Defina o tom de voz ideal para seu negócio.`

É remendo manual e volta a divergir na próxima mudança de persona, mas
tira o agente do estado atual sem esperar o plano.

## O que não sei

- **Quantos agentes existem** — a consulta acima responde.
- **`ai_agents` não é criada por nenhuma migration do repositório.**
  Nenhum arquivo em `supabase/migrations/` tem `CREATE TABLE ai_agents`.
  A tabela veio de schema base ou foi criada à mão. A migration da
  fase 3 precisa disso confirmado antes de ser escrita.
- **Se o `persona` do agente está preenchido.** Se estiver vazio, o modo
  `guided` da fase 3 produziria um prompt pior que o atual, e a ordem
  das fases muda.
- **Nada deste plano foi implementado ou testado.** É desenho a partir
  de leitura de código.
