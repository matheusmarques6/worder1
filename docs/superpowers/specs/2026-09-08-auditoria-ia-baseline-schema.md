# Baseline canônico do schema da aplicação

**Data:** 2026-09-09

**Branch de implementação:** `fix/ai-engine-schema-baseline`

**Base:** `c5dfa94bb1df71814bcf0b28bb63b61f32d30901`

**Escopo do programa:** W0-T3 da Auditoria do Motor de IA

## 1. Contexto

O replay protegido do stream `supabase/migrations` falha de forma determinística
na migration `20260904000001_attribution_v2_single_credit.sql`, com SQLSTATE
`42P01`. A primeira relação ausente é `public.email_sends`; corrigir apenas essa
relação deslocaria a falha para outras dependências também ausentes.

O mesmo ciclo revelou uma falha operacional separada: `supabase db reset`
recria o container do Postgres, mas o executor persiste e exige o `containerId`
anterior. Por isso, até uma falha SQL conhecida deixa o cleanup automático sem
identidade suficiente para parar o projeto.

O replay parte somente de `supabase/migrations`. Arquivos em `supabase/`,
`supabase/migrations-archive/` e `sql/` são evidência histórica de contrato;
eles não são scripts de bootstrap e não serão carregados pelo executor.

## 2. Objetivo

Produzir dois caminhos locais, explícitos e comprováveis:

1. um bootstrap completo para bancos novos, capaz de reproduzir todo o stream;
2. um upgrade exclusivamente forward-only para bancos que já possuem as
   tabelas legadas e o histórico atual aplicado.

Os dois caminhos podem ter históricos diferentes, mas devem terminar com o
mesmo contrato observável para os objetos deste escopo e preservar os dados do
upgrade.

## 3. Não objetivos

Este trabalho não:

- altera prompts, modelos, provedores ou decisões do Motor de IA;
- unifica APIs antigas e novas de campanhas ou automações;
- executa dump, seed da aplicação ou introspecção de produção; as fixtures
  sintéticas versionadas existem somente no teste local de upgrade;
- faz push, merge, deploy ou migration remota;
- usa `migration repair`, `--include-all`, reset remoto ou down migration;
- cria um segundo executor, framework genérico de schema diff ou dependência;
- corrige antecipadamente políticas de RLS pertencentes às ondas seguintes;
- apaga ou normaliza silenciosamente dados incompatíveis.

## 4. Decisões aprovadas

### B0-A — autoridade do contrato

O código atual da aplicação e as migrations ativas são a autoridade. Fontes
históricas servem para recuperar nomes, tipos, vínculos e estados legados, mas
não vencem um produtor ou consumidor atual.

Quando dois consumidores atuais divergem, o baseline preserva a união
compatível dos dois contratos. Não cria trigger de sincronização, alias ou
conversão automática que não exista hoje.

### B1-B — bootstrap novo e compensação forward-only

O caminho fresh inclui uma migration histórica nova no ponto necessário ao
replay. O caminho upgrade não executa essa migration retroativa: recebe somente
uma compensação com versão posterior ao último histórico existente.

Versões fixadas:

- bootstrap fresh: `20260812000005_app_baseline_prereqs.sql`;
- compensação: `20260909230000_app_baseline_forward_compat.sql`;
- trigger de auth: `20260910000000_auth_user_created_trigger.sql`.

## 5. Objetos canônicos

Há oito bloqueios imediatos da atribuição e três dependências de runtime e
cadastro. A ordem de materialização respeita suas dependências.

| Grupo | Relações | Contrato selecionado |
|---|---|---|
| Tenancy | `organization_members` | `user_id` anulável para convites; `organization_id`, `role`, `email`, `name`, `status`, convite e entrada; unicidade por organização/usuário e lookup por organização/e-mail. O tipo `user_role` inclui `owner`, `admin`, `member` e `agent`. |
| CRM inicial | `pipelines`, `pipeline_stages` | Pipeline por organização/loja; stages ordenados com `probability`, `is_won` e `is_lost`; FKs com cascata do pipeline para os stages. |
| Automação | `automations`, `automation_runs` | Automação por organização/loja, configuração/nós/arestas em JSONB e contadores. Runs aceitam `pending`, `waiting`, `running`, `completed`, `failed` e `cancelled`, com campos de lock, resultado, retry e erro usados pelos workers. |
| Campanhas | `email_campaigns`, `whatsapp_campaigns`, `sms_campaigns` | Shapes usados pelos produtores atuais, métricas e atribuição. SMS permanece no contrato mínimo comprovado, sem inventar um pipeline de campanha inexistente. |
| Envios | `email_sends`, `whatsapp_sends`, `sms_sends` | Identidade de organização, loja, contato, campanha e automação; payload, estado, provider, timestamps, métricas e atribuição; FKs e índices semânticos usados pelo runtime. |

### 5.1 Conflitos que o contrato resolve

#### `email_sends`

- O estado inicial canônico é `queued`, conforme o produtor atual.
- O contrato inclui `to_email`, `sender_email` e `dedupe_key`, mesmo sem DDL
  histórico correspondente, porque o produtor atual os escreve.
- `dedupe_key` recebe índice UNIQUE parcial quando não nula; a chave já inclui
  automação, nó, contato e dia.
- `pending` permanece aceito durante a janela de compatibilidade, mas o default
  novo é `queued`; nenhum valor legado é reescrito. Estados fora da união
  aprovada são diagnosticados e abortam antes de alterar o CHECK.
- O bootstrap inclui os estados atuais de entrega, engajamento, falha e opt-out,
  além dos campos de atribuição, tracking e contadores consumidos pelas
  migrations posteriores.

#### `organization_members`

- `user_id` permanece anulável, pois um convite existe antes do cadastro.
- O upgrade não aplica a definição histórica `NOT NULL`.
- A associação ativada pelo signup preenche `user_id`, `joined_at` e `status`.

#### `automations` e `automation_runs`

- Novas automações usam `frequency_config = {"type":"once"}` quando o produtor
  não envia configuração; linhas existentes não são reclassificadas.
- Runs aceitam `pending` e `waiting`, exigidos por dispatcher e cron, além dos
  estados terminais.
- `organization_id` de runs só se torna obrigatório depois de uma prova de
  preenchimento pelo pai; o baseline não força `NOT NULL` sobre linhas que um
  produtor atual ainda cria sem a coluna.

#### `email_campaigns`

- O contrato preserva os contadores históricos `total_opened`/`total_clicked` e
  os atuais `opens`/`clicks`; eles não passam a ser aliases automaticamente.
- `failed` é estado permitido porque o envio atual o grava.
- `template_id` mantém uma FK real para permitir os joins do PostgREST.

#### `whatsapp_campaigns`

Dois consumidores atuais coexistem:

- o caminho moderno usa `name`, `total_*` e estados minúsculos;
- o worker legado usa `title`, `*_count` e estados maiúsculos.

O baseline mantém as duas famílias de colunas e não converte caixa ou sincroniza
contadores. A retirada do worker legado e a unificação do contrato ficam fora
deste pacote. A atribuição continua usando os campos comuns de receita e
conversão.

#### `pipelines`

O contrato inclui `organization_id` e `store_id`, pois migrations ativas criam
políticas para os dois recortes. Como políticas permissivas se combinam por OR,
esta onda apenas reproduz e testa o comportamento atual; não afirma que a
unificação de isolamento por loja esteja resolvida.

## 6. Arquitetura de migrations

### 6.1 Manifesto fresh

O manifesto fresh é o inventário integral e ordenado de
`supabase/migrations`, incluindo o bootstrap retroativo, a compensação e o
trigger de auth. O fluxo é:

1. `20260812000001_agents_baseline_prereqs.sql` cria organizações, profiles e
   demais dependências já canônicas;
2. `20260812000005_app_baseline_prereqs.sql` cria as 11 relações ausentes no
   menor shape que permite às migrations posteriores executarem seus próprios
   efeitos;
3. o restante do histórico aplica tracking, atribuição, scheduling, segurança e
   métricas;
4. `20260909230000_app_baseline_forward_compat.sql` completa e valida o contrato
   final; no fresh, deve ser idempotente sobre o shape já produzido;
5. `20260910000000_auth_user_created_trigger.sql` instala exatamente um trigger
   de cadastro após a definição atual de `public.handle_new_user`.

O bootstrap não antecipa indiscriminadamente todo o schema final. Uma coluna
cujo efeito pertence a uma migration posterior continua sendo criada por ela,
desde que sua ausência não impeça a própria migration de executar.

### 6.2 Manifesto upgrade

O manifesto upgrade representa o histórico aplicado até
`20260909140000_definer_search_path.sql`, exclui somente o bootstrap fresh e
acrescenta, nessa ordem:

1. `20260909230000_app_baseline_forward_compat.sql`;
2. `20260910000000_auth_user_created_trigger.sql`.

A compensação cria relações ou colunas ausentes, adiciona apenas constraints e
índices aprovados e valida objetos existentes. `IF NOT EXISTS` não é considerado
prova de compatibilidade.

A compensação aplica somente as transformações enumeradas na seção 5.1,
incluindo relaxamentos de constraints e mudanças de defaults para linhas
futuras quando expressamente previstos. A matriz executável de transformação
registra objeto, propriedade, estado legado aceito e resultado esperado.

Divergências fora dessa lista e dados incompatíveis com o resultado aprovado
causam `RAISE EXCEPTION` com objeto e propriedade, revertendo a compensação
transacional. Nenhum `DELETE`, `TRUNCATE` ou conversão de valor faz parte do
caminho.

## 7. Executor descartável

### 7.1 Rotação de container após reset

O executor passa a ter uma janela de readopção estrita imediatamente após
`supabase db reset`, tanto no sucesso quanto quando o comando termina com erro.
Somente `containerId` pode mudar. Antes de persistir o novo ID, o executor exige:

- mesmo `projectId` e project label;
- mesmo workdir aprovado;
- mesma imagem;
- mesmo volume novo aprovado;
- mesma porta `45322`;
- mesmo `systemIdentifier` do cluster;
- exatamente um container DB candidato.

Se qualquer propriedade divergir, o projeto fica `unproven` e não há Stop
automático. Se a readopção for válida, o novo ID é persistido antes da prova ou
do cleanup. Uma falha SQL original continua sendo a falha primária nos
artefatos; a readopção não a mascara.

### 7.2 Lane sintética de upgrade

O executor existente recebe um único caminho fechado para preparar o upgrade;
não aceita diretório de migrations, SQL ou lista de exclusão fornecidos pelo
chamador.

Nesse caminho ele:

1. inicia um projeto com migrations automáticas desabilitadas;
2. aplica o prefixo real até `20260812000004_engine_functions.sql`;
3. executa uma fixture versionada e sem segredos com os shapes legados das 11
   relações e dados representativos;
4. aplica o histórico restante até `20260909140000`, sem o bootstrap fresh;
5. comprova histórico, identidade e sentinela;
6. executa somente o sufixo forward-only aprovado com `migration up --local`.

O comando não usa reset, `repair` nem `--include-all`. A allowlist contém apenas
o nome fixo do bootstrap que distingue os manifestos; não existe filtro
genérico.

O executor materializa internamente, dentro do workdir aprovado, a projeção
fixa de migrations correspondente a cada fase. Antes de cada chamada do CLI,
confere versões e hashes contra o manifesto; os arquivos originais permanecem
intactos. O CLI registra o prefixo e depois o restante do histórico. A execução
final usa a projeção upgrade, que exclui exclusivamente o bootstrap fresh.

## 8. Preservação e equivalência

O upgrade sintético contém ao menos uma linha por relação e uma linha por estado
ou vínculo que a compensação toca. Antes e depois são comparados:

- chaves primárias e contagens;
- valores legados e JSONB;
- FKs e relacionamentos;
- defaults aplicados somente a novas linhas;
- índices UNIQUE e comportamento de deduplicação;
- signup normal e convite.

O catálogo normalizado cobre apenas o escopo desta especificação:

- relações e colunas, com tipo, nulabilidade e default;
- tipos enum referenciados, incluindo valores e ordenação;
- PKs, FKs, UNIQUEs e CHECKs;
- índices semânticos;
- RLS e policies;
- funções, trigger de auth, grants e ACLs associados.

OID, relfilenode e objetos internos do Supabase são excluídos. Fresh e upgraded
devem produzir a mesma representação normalizada. Os históricos de migration
não são comparados entre si; cada um é comparado ao seu manifesto próprio.

## 9. Auth e cadastro

Antes de alterar triggers, `20260910000000_auth_user_created_trigger.sql` valida
a definição de qualquer `on_auth_user_created` existente e inventaria todos os
triggers habilitados em `auth.users` que executam `public.handle_new_user()`.
Uma definição homônima conflitante ou uma invocação habilitada sob outro nome
aborta sem remover o objeto desconhecido.

Quando ausente ou já canônico, a migration deixa exatamente um
`on_auth_user_created` habilitado, apontando para `public.handle_new_user()`, e
uma única invocação da função por inserção em `auth.users`.

Um signup normal deve produzir exatamente:

- um profile com papel `owner`;
- uma membership ativa na mesma organização;
- um pipeline default;
- seis stages ordenados.

Um signup convidado deve entrar somente na organização convidante, com o papel
permitido, sem criar outra organização ou pipeline.

## 10. Estratégia de testes

Toda mudança não trivial segue RED, GREEN e self-review antes de commit.

### Testes focais

- unidade do executor para rotação de container no reset bem-sucedido;
- unidade do executor para rotação seguida de falha SQL e cleanup preservando o
  erro primário;
- casos negativos para imagem, volume, label, porta, SID, múltiplos candidatos
  e arquivo de identidade alterado;
- contrato DB das 11 relações;
- defaults, estados, FKs e índices que resolvem divergências;
- compensação sobre legado compatível e aborto sem perda sobre legado
  incompatível;
- trigger, caso negativo de invocação duplicada, signup normal e convite.

### Ciclo fresh

Em um nonce novo:

`Prepare -> Replay -> Test DB/RLS/pipeline completo -> Stop`

O histórico deve ser idêntico ao manifesto fresh, todas as suítes precisam ser
não vazias e sem skips, failures ou errors, e a contagem RLS coletada deve ser
igual à executada.

### Ciclo upgrade

Em outro nonce:

`PrepareUpgrade -> fixtures -> Upgrade forward-only -> equivalência/preservação/auth focal -> Stop`

O gate upgraded não repete toda a suíte da aplicação: equivalência de catálogo,
preservação e auth focal cobrem o risco específico sem duplicar custo.

### Pós-condições Docker

Estas pós-condições são obrigatórias para os dois ciclos de aceite com
identidade comprovada:

- estado final `stopped`;
- zero containers, volumes e redes com a label do projeto;
- portas `45320`, `45321` e `45322` livres;
- lock do executor ausente;
- recursos alheios inalterados;
- árvore rastreada limpa no commit testado.

Uma execução `unproven` bloqueia o aceite e conserva a proibição de cleanup
automático; ela não é considerada concluída.

## 11. Subagent-Driven Development

As tarefas são sequenciais; nunca há dois implementadores escrevendo ao mesmo
tempo. Cada tarefa recebe um implementador fresco, um revisor independente e um
commit próprio.

| Pacote | Implementador | Revisor | Verificador |
|---|---|---|---|
| Rotação de identidade do executor | Sol high | Astra high | testes unitários focais |
| Contrato executável, testes RED e bootstrap fresh | Astra high | Astra xhigh, instância distinta | guardião fresh Astra |
| Compensação e lane upgrade | Sol high | Astra xhigh | guardião upgrade Astra |
| Trigger e fixtures de auth | Terra high | Sol high | ambos os guardiões |
| Branch integral | nenhum implementador | Astra xhigh | gates oficiais no mesmo commit |

O controlador cria briefs, registra BASE/HEAD e evidência no ledger, gera um
review package por tarefa e nunca corrige findings diretamente. Critical ou
Important volta ao implementador e recebe re-review focado. Minor é registrado
para triagem final.

Os testes RED são evidência intermediária dentro da tarefa correspondente, não
um commit quebrado separado. Teste e implementação entram juntos no commit
somente depois do GREEN focal e do self-review.

## 12. Critérios de aceite e promoção

Este pacote só está tecnicamente completo quando:

1. migrations existentes permanecem byte a byte intactas;
2. os dois manifestos têm versões e hashes registrados;
3. o replay fresh percorre todo o stream;
4. upgrade aplica somente o sufixo forward-only;
5. dados sintéticos são preservados;
6. catálogos normalizados são equivalentes;
7. auth e isolamento exercitados pelos testes passam;
8. executor limpa ambos os projetos sem intervenção excepcional;
9. testes app, runtime, DB, RLS e pipeline passam no mesmo commit;
10. revisão final não possui Critical ou Important.

Mesmo com esses critérios verdes, produção continua bloqueada. Push, merge,
migration remota e deploy exigem uma autorização explícita posterior, baseada
no relatório final e no dry-run do ambiente de destino.

## 13. Rollback e falhas

Projetos descartáveis são reconstruídos com nonce novo; não se reutiliza run
falho. Em banco existente, rollback é compensatório e aditivo: não há down
migration que remova tabela ou coluna com dados.

Se o estado real de um ambiente divergir do contrato aprovado, a promoção é
interrompida antes de executar a migration e o processo produz um inventário
saneado da incompatibilidade. A
decisão de remediar dados ou ampliar compatibilidade é uma mudança separada e
exige aprovação própria.
