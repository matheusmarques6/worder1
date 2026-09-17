# Programa SDD — correções da Auditoria do Motor de IA

**Data:** 2026-09-08

**Status:** desenho aprovado pelo usuário

**Branch de trabalho:** `integration/sync-remote-ai-2026-09-08`

**Worktree:** `.worktrees/sync-remote-ai-2026-09-08`

**Fontes:** `docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md` e `docs/SYNC-REMOTE-AI-2026-09-08.md`

## 1. Objetivo

Tratar todo o saldo da auditoria do Motor de IA com rastreabilidade, testes independentes e isolamento de dados. O programa cobre:

- as 64 caixas textualmente abertas do checklist;
- a reclassificação de três caixas já resolvidas no `HEAD`, restando 61 pendências reais;
- o novo risco encontrado na migration de associação de convidados;
- decisões de produto, evidências de ambiente, migrations, RLS, Docker e promoção;
- atualização final do checklist e do relatório HTML.

O resultado esperado é uma branch comparativa candidata à produção, não um deploy automático.

## 2. Estado inicial e invariantes

O ponto de partida é o merge `04b916327e72be9f60950da2ec310f433db4e097`, que combina:

- base local auditada: `f0be80619cf6fbd006c27c05abe8fa81c2a8c84e`;
- base remota sincronizada: `4847440c0317e106b0abde6c8c61f0c25b689d5a`.

Antes deste programa, passaram no merge: typecheck, build Next, Vitest, Ruff, Import Linter e testes unitários Python. DB, RLS e pipeline não foram aprovados por falta de banco descartável seguro.

Invariantes:

1. A branch principal e suas alterações locais permanecem intocadas.
2. Nenhum teste destrutivo aponta para banco existente, pooler ou produção.
3. Nenhum subagente pode fazer push, merge, deploy ou migration remota.
4. Nunca há dois implementadores escrevendo no mesmo worktree ao mesmo tempo.
5. Toda lógica não trivial recebe ao menos um teste de regressão executável.
6. Decisões de produto antecedem implementação.
7. O menor diff responsável vence; código especulativo não será criado.

## 3. Decisão de arquitetura

Foram consideradas três alternativas:

1. plano monolítico, rejeitado por dificultar revisão e rollback;
2. branches paralelas por domínio, rejeitadas para o caminho principal devido a conflitos de migrations e contratos compartilhados;
3. programa SDD em ondas numa worktree isolada, escolhido por preservar comparação, revisão por tarefa e rollback granular.

Implementações serão integradas sequencialmente. Apenas investigações e verificações somente leitura poderão ocorrer em paralelo.

## 4. Reconciliação do catálogo

As três caixas abertas que já estão resolvidas no `HEAD` serão revalidadas e encerradas na Onda 0:

- `formatDate` para fuso negativo: corrigido em `src/lib/reports/utils.ts`;
- `.gitignore` para `supabase/.branches/` e `supabase/.temp/`: corrigido em `.gitignore`;
- guarda RLS nas conexões diretas: presente em `responder.py` e `toucher.py`.

O item 87 está parcialmente resolvido: a UI principal já oculta seis tools incompatíveis no runtime novo, mas `MissionEditorModal.tsx` ainda sugere `get_customer_context` inexistente e apresenta `search_knowledge` como tool de missão.

O programa acrescenta um bloqueador de segurança: `20260905091000_invited_members_join_org.sql` confia em `raw_user_meta_data` para escolher organização e papel sem provar um convite válido. Isso deve ser corrigido e testado antes de qualquer promoção.

## 5. Ondas de execução

| Onda | Escopo | Condição de saída |
|---|---|---|
| 0 — Baseline confiável | Catálogo; Supabase/Docker descartável; bootstrap canônico das migrations; gates de CI | Replay completo das migrations e suítes DB/RLS/pipeline executáveis sem risco a dados existentes |
| 1 — Segurança e produção | Convites; itens 71, 80, 94 e 95; fail-open; prompt injection; HTTP 303; entradas não suportadas | Nenhum Critical/Important; testes negativos de tenant, autenticação e autorização verdes |
| 2 — Estado, filas e cutover | `ai_pending`; takeover humano; itens 70, 78, 79, 81 e 82; multi-WABA; opt-out | Migrations reaplicáveis, idempotência e flip IA/humano comprovados |
| 3 — Contratos e limites | Itens 63, 66 e 68; schedules; timezone; guards; alertas; timeouts | Fixtures compartilhadas e testes de contrato, cancelamento e limites verdes |
| 4 — Produto, IA e custos | Itens 65, 67, 69, 72, 73, 75–77, 83, 85 e 89 | Decisões registradas; custo, RAG, preview e tool-loop testados |
| 5 — Integrações e limpeza | Item 64; status; item 87; código morto; scripts; workers; documentação | Sem importadores órfãos; conectores, typecheck e build verdes |
| 6 — Infraestrutura e prova operacional | Windows/TZ; imagem Docker; advisors; envs/rollout; item 92 | Mesmo commit verde em app, runtime, DB, RLS e Docker; evidência operacional registrada |
| 7 — Promoção | Revisão integral, comparação, regressões e rollback | Nenhum Critical/Important e revisão final aprovada |

Dependências obrigatórias:

- idempotência de negócio antes do dreno da DLQ;
- detecção e reconciliação de cupons duplicados antes do `UNIQUE`;
- definição da consulta RAG antes de conhecimento no preview;
- definição do estado verdadeiro do preview antes de remover fantasmas;
- política de cobrança antes de instrumentar gastos invisíveis;
- multi-WABA antes de promover organização com várias contas;
- item 92 aberto até existir janela real de pelo menos oito dias.

### 5.1. Rastreabilidade das 64 caixas abertas

| Onda | Caixas do checklist |
|---|---|
| 0 | `formatDate` já corrigido; ignores do Supabase CLI já corrigidos; guardas RLS diretas já corrigidas; `pnpm approve-builds`; suítes DB/RLS/pipeline ainda não executadas; baseline incompleto das migrations |
| 1 | 71, 80, 94, 95; `ssrf-guard` no HTTP 303; fail-open por `NODE_ENV`; prompt injection; resposta de botão em `unsupported`; novo risco da migration de convidados |
| 2 | 70, 78, 79, 81, 82 e 90; limpeza, atomicidade e cache de `ai_pending`; takeover humano amnésico; download de mídia sem consumidor; multi-WABA; predicado/índice de opt-out |
| 3 | 63, 66 e 68; dupla varredura dos guards; schedule parcial; `tzdata`; divergências de matching; alerta suprimido; estado de guard fail-open; `activate_on: manual`; timeouts de conexão e statement |
| 4 | 65, 67, 69, 72, 73, 75, 76, 77, 83, 85 e 89 |
| 5 | 64, 87, 88, 91 e 93; `safeFetch/createSafeAgent`; dois clientes incompatíveis de `/api/agents/status`; `AGENTS_WORKERS` inalcançável |
| 6 | 84 e 92; divergência `aws-0`/`aws-1`; estado real do banco; envs e rollout; RLS vivo; headers de autorização nos spans do Logfire |

As três caixas já corrigidas continuam na matriz porque precisam de revalidação antes de serem marcadas como concluídas. A caixa ampla do item 63 será desmembrada entre testes sem banco, Onda 3, e seus cenários DB/RLS, Ondas 0–2.

## 6. Topologia SDD de agentes

| Papel | Modelo | Responsabilidade |
|---|---|---|
| Controlador SDD | `gpt-6-astra`, high | Ledger, dependências, rulings e aceite; não implementa |
| Implementador mecânico | `gpt-5.6-luna`, medium | Mudanças isoladas e limpezas pequenas |
| Implementador de integração | `gpt-5.6-terra`, high | Frontend, API, runtime, CI e conectores |
| Implementador de alto risco | `gpt-5.6-sol`, high | Tenancy, OAuth, dinheiro, filas, migrations e RLS |
| Implementador excepcional | `gpt-6-astra`, high | Redesenho inevitável de arquitetura ou segurança |
| Revisor de tarefa | `gpt-5.6-sol`, high | Veredictos independentes de especificação e qualidade |
| Verificador de onda | `gpt-5.6-terra`, high | Repete gates a partir do commit |
| Guardião Docker/DB | `gpt-6-astra`, high | Único operador do Supabase descartável e dos gates DB/RLS |
| Revisor final | `gpt-6-astra`, xhigh | Diff integral, regressões, rollback e prontidão |

Todo subagente será fresco, iniciado com `fork_turns: "none"`, modelo e esforço explícitos. Implementadores não criam subagentes. Agentes com o mesmo modelo continuam sendo instâncias distintas.

Fluxo de uma tarefa:

```text
briefing do controlador
  → implementador: RED → correção mínima → GREEN → commit → autorrevisão
  → revisor: Spec PASS/FAIL + Quality APPROVED/CHANGES_REQUIRED
  → correção e nova revisão, quando necessária
  → verificador repete os gates no commit
  → controlador registra evidências e libera a próxima tarefa
```

O limite operacional é o controlador mais um implementador ou revisor. Um terceiro slot pode executar verificação somente leitura; o quarto fica livre para recuperação. O guardião DB trabalha sozinho enquanto o banco descartável estiver ativo.

## 7. Matriz de responsabilidade por pacote

| Pacote | Implementador | Revisor | Verificação |
|---|---|---|---|
| W0-T1 — inventário e inconsistências do CI | Luna | Terra | Terra |
| W0-T2 — Supabase descartável e guardas de identidade | Sol | Astra | Guardião DB Astra |
| W0-T3 — baseline canônico de migrations | Sol | Astra | Guardião DB Astra |
| W0-T4 — gates Docker/runtime no CI | Terra | Sol | Guardião DB Astra |
| W1-T1 — migration de convidados | Sol | Astra | Guardião DB Astra |
| W1-T2 — cross-tenant, itens 71 e 80 | Sol | Astra | Terra + DB Astra |
| W1-T3 — OAuth 94 e fail-open de cron/workers | Sol | Astra | Terra |
| W1-T4 — prompt injection, HTTP 303 e botões | Terra | Sol | Terra |
| W1-T5 — contratos do item 95 e XFAIL | Luna/Terra | Sol | Terra |
| W2-T1 — `ai_pending`: atomicidade, cache e limpeza | Sol | Astra | Terra + DB |
| W2-T2 — takeover, RPCs, housekeeping e `manual_review` | Sol | Astra | DB Astra |
| W2-T3 — idempotência e DLQ, item 81 | Astra | Astra independente | DB Astra independente |
| W2-T4 — cupons e unicidade, item 82 | Sol | Astra | DB Astra |
| W2-T5 — multi-WABA | Sol | Astra | Terra + DB |
| W2-T6 — opt-out e índice | Sol | Astra | DB Astra |
| W2-T7 — mídia sem consumidor e nó IA Responder no-op | Terra/Sol | Astra | Terra + DB |
| W3-T1 — lacunas de teste, item 63 | Terra | Sol | Terra |
| W3-T2 — paridade, schedules, timezone e guards | Terra | Sol | Terra |
| W3-T3 — teto do turno e timeouts DB | Sol | Astra | Terra + DB |
| W4-T1 — traces e contadores, itens 65 e 67 | Sol | Astra | Terra + DB |
| W4-T2 — política e medição de custos, itens 69 e 85 | Sol | Astra | Astra |
| W4-T3 — RAG e preview, itens 72 e 75 | Sol | Astra | Terra |
| W4-T4 — tool-loop, item 73 | Sol | Astra | Terra |
| W4-T5 — estado e ghost, itens 76 e 77 | Terra | Sol | Terra |
| W4-T6 — shadow e agendamento, itens 83 e 89 | Astra, somente se aprovados | Astra independente | Terra + DB |
| W5-T1 — Shopify REST para GraphQL, item 64 | Terra/Sol | Astra | Terra |
| W5-T2 — status e residual do item 87 | Terra | Sol | Terra |
| W5-T3 — item 91, `safeFetch`, scripts e órfãos | Luna | Terra | Terra |
| W5-T4 — `AGENTS_WORKERS`, documentação e item 88 | Luna/Terra | Sol | Terra |
| W6-T1 — Windows/TZ e filtros do CI | Terra | Sol | CI real |
| W6-T2 — imagem Docker do runtime | Terra | Astra | Guardião Docker Astra |
| W6-T3 — envs, rollout, RLS e advisors | Sem alteração automática | Astra | Evidência externa |
| W6-T4 — telemetria e item 92 | Terra | Sol | Observação de oito dias |
| W7 — gates e comparação final | Nenhum | Astra xhigh | App Terra + runtime Sol + DB/Docker Astra |

## 8. Artefatos e rollback

Cada onda terá:

```text
docs/superpowers/specs/auditoria-ia-<onda>-design.md
docs/superpowers/plans/auditoria-ia-<onda>.md
.superpowers/sdd/auditoria-ia-<onda>/
  progress.md
  task-N-brief.md
  task-N-report.md
  review-N.md
  external-evidence.md
```

O ledger registra `BASE`, commits, comandos, resultados, findings, rodadas, decisões e evidências. Nenhum artefato conterá valores de segredos, URLs privadas ou DSNs reais.

Cada tarefa produz um commit pequeno e reversível. Migrations recebem plano explícito de rollback/compensação. Correções independentes, migrations e limpeza cosmética não serão misturadas.

## 9. Protocolo Docker/Supabase

Os testes de pipeline atuais purgam filas e executam `TRUNCATE public.organizations CASCADE`. O gate usará projeto Supabase exclusivo:

1. criar diretório temporário validado dentro da worktree;
2. copiar somente `config.toml` e migrations, com hashes;
3. escolher `project_id` com nonce e portas exclusivas, como 55320/55321/55322;
4. iniciar com migrations desativadas;
5. validar container, labels, imagem, volume novo e mapeamento de portas;
6. comparar `pg_control_system().system_identifier` por conexão direta ao container e pela DSN loopback;
7. habilitar migrations na cópia e executar reset completo sem seed;
8. revalidar identidade e criar sentinela aleatória pelo container aprovado;
9. exigir a mesma sentinela pela DSN antes de liberar pytest;
10. comparar todo o histórico aplicado com o manifesto de migrations;
11. executar suítes serialmente e capturar evidências;
12. encerrar apenas o projeto do nonce, sem backup.

Proibições:

- `--linked`, banco remoto ou pooler;
- `.env`, seed, dump ou credencial real;
- `runtime/docker-compose --profile piloto`;
- `mirror.ps1`;
- `docker system prune`, `stop --all` ou limpeza global;
- advisors apontados à produção para compensar ausência local.

O reset atual deve falhar em migrations que pressupõem tabelas legadas, começando por `email_sends`. A solução deve estabelecer baseline canônico antes da primeira dependência; não vale carregar arquivos congelados de `sql/` ou dumps de produção.

RLS será testado com `anon`, `authenticated` e serviço. A migration genérica `FOR ALL` será validada tanto contra vazamento entre tenants quanto contra operações indevidas dentro do mesmo tenant.

## 10. Estratégia de testes

Por tarefa:

| Mudança | Gate mínimo |
|---|---|
| Frontend/API | Vitest focal + `pnpm typecheck` |
| Runtime Python | Pytest focal + Ruff |
| Arquitetura Python | Pytest + Ruff + Import Linter |
| Tenant/autorização | Casos positivos e negativos com duas organizações |
| Dinheiro/custo | Limites, arredondamento, custo desconhecido e reconciliação |
| Filas/concorrência | Idempotência, retry, lease, cancelamento e duplicidade |
| Migration/RLS | Replay integral + papéis reais + DB/RLS/pipeline |
| Exclusão de código | Busca por importadores + typecheck + build |
| Docker | Build, import smoke e usuário não-root 10001 |

Gate final no mesmo commit:

```text
pnpm test
pnpm typecheck
pnpm build
uv run --directory runtime ruff check .
uv run --directory runtime lint-imports
uv run --directory runtime pytest -m unit
uv run --directory runtime pytest -m "db or pipeline"
docker build -t worder-runtime:sdd runtime
docker run --rm --entrypoint python worder-runtime:sdd -c "import agents_runtime"
docker run --rm --entrypoint id worder-runtime:sdd -u
```

O resultado esperado do último comando é `10001`. A coleta deve provar que os testes `rls` relevantes foram executados. Nenhum teste será enfraquecido para deixar o gate verde.

## 11. Falhas e decisões

- Critical ou Important bloqueia a tarefa e a onda.
- Minor entra no ledger e só é corrigido se pertencer ao escopo ou reduzir código.
- `Cannot verify from diff` exige teste, ambiente descartável ou evidência externa.
- Decisão de produto retorna ao usuário antes de implementação.
- Falha preexistente não será ocultada nem convertida em skip.
- Teste instável exige diagnóstico; repetição até passar não é evidência.

Correções voltam ao implementador original por até três rodadas. Nas rodadas quatro e cinco entra agente fresco de modelo superior. Persistindo a falha, o controlador registra bloqueio, evidências e alternativas sem inventar arquitetura.

Decisões explícitas são necessárias para orçamento desconhecido, consulta RAG, conteúdo do preview, estado/ghost, shadow/agendamento, contrato do status, alerta de guard, timeouts e destino da telemetria. Se não houver consumidor confirmado para shadow/agendamento, o caminho morto será removido em vez de ampliado.

## 12. Critério de conclusão e promoção

O programa termina quando:

- cada uma das 61 pendências reais e o novo risco de convite estiver corrigido/testado, removido, decidido ou aguardando dependência externa comprovada;
- as três caixas obsoletas estiverem revalidadas e encerradas;
- nenhum Critical/Important estiver aberto;
- XFAIL conhecido não tiver sido escondido;
- migrations forem reproduzidas do zero;
- RLS for provado com papéis reais e duas organizações;
- app, runtime, DB, RLS e Docker passarem no mesmo commit;
- checklist e relatório HTML mostrarem antes/depois, commits, testes e regressões;
- a revisão final Astra aprovar o diff integral;
- o item 92 cumprir sua janela real de oito dias.

Push, merge, migration remota e deploy são etapas separadas e exigem autorização explícita do usuário depois do relatório final.

## 13. Próximo passo

Após aprovação desta especificação versionada, produzir planos executáveis separados por onda. Cada plano deve citar caminhos e símbolos reais, decompor tarefas em passos TDD de poucos minutos e incluir comandos, resultados esperados, rollback e gates de revisão.
