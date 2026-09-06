# Revisão completa das tasks 0–63 — Design

**Data:** 2026-09-05
**Branch de trabalho:** `review/tasks-0-63-sdd`
**Fonte de requisitos:** `docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md`

## Objetivo

Revisar individualmente todas as entregas da Fase 0 e das tasks 1–63, confirmar que o
comportamento prometido continua correto no código atual, corrigir regressões no menor ponto
responsável e terminar com os gates completos do app e do runtime verdes.

## Estado de partida

- A ordem de prioridade é 1 → 63; as fases agrupam, mas não reordenam correções.
- As tasks 1–62 estão marcadas como concluídas no checklist.
- A task 63 continua aberta de propósito: parte das lacunas ganhou testes, mas nove lacunas
  permanecem declaradas.
- A Fase 0 também entra no escopo porque suas três entregas tornaram o CI executável.
- Os artefatos SDD antigos em
  `.superpowers/sdd/AUDITORIA-IA-2026-08-28-CHECKLIST/` são evidência histórica, não verdade
  atual. Eles serão reutilizados e conferidos contra o código e o SHA da nova revisão.
- A árvore original contém `.claude/` não rastreado; ela não será tocada.

## Baseline conhecido

Baseline medido na worktree antes da auditoria:

- `uv run --directory runtime pytest -m unit`: **1180 passed, 5 xfailed**. Os cinco XFAILs são
  os contratos explícitos transferidos ao item 95.
- `pnpm test`: **5 falhas**:
  - três asserções de data/timezone em `src/tests/reports-utils.test.ts`;
  - timeout do DOCX em `src/lib/ai/processors/file-extractor.integration.test.ts`;
  - extração incorreta do fixture PDF no mesmo arquivo.

Decisão do usuário: registrar essas cinco falhas, executar primeiro a revisão 0–63 e,
imediatamente depois, investigá-las e corrigi-las.

Até essa correção final, o gate de fase é diferencial: nenhuma falha nova é permitida e as cinco
falhas conhecidas precisam permanecer idênticas. O trabalho inteiro só termina quando a etapa de
baseline repair fechar e a suíte completa passar.

## Escopo

### Incluído

1. Reconstrução do contrato de cada task a partir do checklist, commits e artefatos SDD.
2. Comparação do diff histórico com o código atual.
3. Busca de todos os chamadores e consumidores das interfaces tocadas.
4. Execução de testes direcionados por task.
5. Avaliação de correção, segurança, tenancy, concorrência, custo e eficiência de código.
6. Correção TDD de regressões e violações do contrato implementado.
7. Revisão independente de cada correção, revisão integrada por fase e revisão final da branch.
8. Investigação e correção das cinco falhas conhecidas do baseline após a task 63.

### Excluído

- Implementar automaticamente as nove pendências já declaradas na task 63.
- Executar as tasks 64–95, exceto manter e verificar os cinco XFAILs do item 95.
- Chamar APIs externas reais ou usar credenciais de produção.
- Refatorações não necessárias para um achado confirmado.
- Criar metas artificiais de cobertura percentual.

Se uma pendência antiga fora do contrato implementado for reencontrada, ela recebe evidência e
dono no relatório, mas não vira código por inércia.

## Arquitetura da execução

### Isolamento

Todo o trabalho acontece na worktree `.worktrees/review-tasks-0-63-sdd`, na branch
`review/tasks-0-63-sdd`. A worktree usa dependências próprias e um workspace SDD novo. O ledger e
os relatórios da auditoria anterior permanecem intactos.

### Pipeline por fase

1. O controlador congela `PHASE_SHA`.
2. Gera briefs e pacotes de evidência deterministicamente, sem gastar um agente para copiar texto.
3. Calcula sobreposição de arquivos e interfaces.
4. Lança até três auditores somente-leitura em paralelo quando os domínios forem independentes.
5. Consolida os relatórios na ordem absoluta das tasks.
6. Havendo defeito, lança um único implementador escritor.
7. O implementador executa RED → GREEN, faz o menor commit e registra a prova.
8. Um revisor independente avalia especificação e qualidade.
9. Critical/Important entra no loop SDD de até cinco rodadas.
10. Um revisor de fase examina o diff combinado e as interações entre tasks.
11. O gate diferencial completo da fase é executado.

Auditores podem trabalhar em paralelo porque não alteram código. Implementadores nunca trabalham
em paralelo. Se uma correção tocar o read-set de uma task já auditada, a parte afetada do relatório
fica obsoleta e é reexecutada.

## Papéis dos agentes

### Controlador

- Mantém o ledger, SHAs, dependências, staleness e rulings.
- Extrai briefs e prepara pacotes de diff.
- Não corrige código diretamente.
- Confere o diff e executa verificação fresca antes de aceitar o relato de um agente.

### Auditor de task

- Recebe um brief, o pacote do diff histórico, os artefatos antigos relevantes e o SHA congelado.
- Lê todos os chamadores da função ou contrato tocado.
- Executa os testes direcionados.
- Não edita, não commita e não lança subagentes.
- Produz quatro vereditos: aderência, correção atual, qualidade/Ponytail e cobertura executável.

### Implementador

- Recebe somente achados confirmados e o brief da task.
- Escreve o menor teste que reproduz o defeito e demonstra o RED correto.
- Corrige a raiz compartilhada no menor número de arquivos.
- Executa GREEN, testes vizinhos e gates estáticos.
- Commita a unidade e escreve relatório de execução.

### Revisor de task

- Recebe brief, relatório e pacote completo do diff.
- Emite veredito separado de aderência e qualidade.
- Não repete testes já provados sem motivo específico.
- Critical/Important bloqueia; Minor vai ao ledger para triagem final.

### Revisor de fase e revisor final

- Procuram regressões entre tasks, contratos quebrados, duplicação de soluções e falsos verdes.
- O revisor final usa o modelo mais capaz e examina toda a branch.

## Seleção de modelos

- `gpt-5.6-luna`, esforço médio: tarefas mecânicas de um ou dois arquivos.
- `gpt-5.6-terra`, esforço alto: integração multi-arquivo e reviewers normais.
- `gpt-6-astra`, esforço alto: segurança, migrations, concorrência, revisão de fase e final.

Todo spawn usa `fork_turns: "none"`, modelo e esforço explícitos. Rodadas 1–3 retomam o mesmo
implementador; rodadas 4–5 usam agente novo em tier superior.

## Rubrica Ponytail

Para cada task, o auditor responde nesta ordem:

1. A capacidade ainda precisa existir?
2. Já há helper, tipo, contrato ou padrão reutilizável no repositório?
3. A stdlib ou o recurso nativo cobre?
4. Uma dependência já instalada cobre?
5. Há duplicação, camada morta, configuração sem leitor ou teste vazio?
6. O defeito foi corrigido no ponto compartilhado por todos os chamadores?
7. O diff é o menor que preserva validação, segurança, acessibilidade e prevenção de perda?

Nova abstração, dependência ou configuração precisa de necessidade demonstrada. Hot paths só
recebem otimização com evidência: `EXPLAIN`, contagem de chamadas, batching, lifecycle ou medição.

## Cobertura das fases

| Fase | Tasks | Superfícies dominantes | Gate principal |
|---|---:|---|---|
| 0 | 0a, 0a-bis, 0b | migrations, schema limpo, outbox e boundaries | Supabase limpo + DB + import-linter |
| 1 | 1–8 | RLS, autenticação, ingest, embeddings e índices | app + unit + DB/pipeline |
| 2 | 9–17 | rollout, coalescer, webhook status, retry e fitness | app + DB/pipeline + boundaries |
| 3 | 18–28 | SSRF, tokens, tenancy, auth interna e logging | testes negativos TS/Python + DB |
| 4 | 29–38 | paridade hub/runtime, mídia, providers, sender e trilha | app + runtime + DB/pipeline |
| 5 | 39–53 | prompts, HTTPX, custo, RAG, pool, RPCs e índices | todas as suítes locais |
| 6 | 54–63 | remoções, env drift, fitness e lacunas de teste | deletion fitness + build + runtime |

O plano de execução detalhará, para cada número, os arquivos e testes já inventariados no
checklist. Tasks 6+7 e 16+17 podem compartilhar despacho por terem o mesmo diff e superfície, mas
sempre mantêm vereditos separados.

## Contrato especial da task 63

As nove lacunas vivas precisam de subveredito individual:

1. `agent_llm_from_org_keys` e alerta `no_org_llm_key`.
2. Seleção de missão por `event_type`.
3. `last_order_at` contra o agregado correto.
4. Duplicação do transcript e `exclude_inbound_after_seq`.
5. Origem de `tool_calls.tool_name`.
6. RLS numa tool diferente de `search_knowledge`.
7. Loader e call sites de `never_say_ai`.
8. Entrada malformada em `server._read_request`.
9. Nome desconhecido em `enabled_tools`.

Os testes `xfail(strict=True)` do item 95 precisam continuar XFAIL enquanto seus defeitos não forem
incluídos no escopo. XPASS é falha e exige remover o marcador ou reavaliar o contrato.

## Testes e gates

### App

```powershell
pnpm test
pnpm typecheck
pnpm build
```

### Runtime sem banco

```powershell
uv run --directory runtime ruff check .
uv run --directory runtime lint-imports
uv run --directory runtime pytest -m unit
```

### Runtime com banco

O controlador confirma a identidade do stack antes de usar qualquer porta. O ledger anterior
registrou que `127.0.0.1:54322` já pertenceu a outro projeto. Se necessário, o Supabase será iniciado
em Docker com isolamento próprio; produção nunca é acessada.

```powershell
supabase start
uv run --directory runtime pytest -m "db or pipeline"
```

Durante as fases, os cinco testes de app conhecidos podem permanecer vermelhos, sem alteração de
quantidade, nomes ou sintomas. Depois da task 63, a etapa de baseline repair usa investigação
sistemática e TDD. A verificação final executa todos os comandos acima de forma fresca.

## Artefatos

O workspace SDD novo contém:

- `progress.md`: ledger e rulings;
- `task-N-brief.md`: requisito autocontido;
- `task-N-audit.md`: auditoria read-only;
- `task-N-report.md`: execução de correções;
- `review-BASE..HEAD.diff`: pacote de revisão;
- `phase-N-review.md`: integração da fase;
- `final-review.md`: veredito da branch.

O relatório final mostra task por task: contrato, estado, testes executados, findings, correções,
commits, eficiência e pendências.

## Critérios de conclusão

Uma task só recebe `review-clean` quando tiver contrato histórico reconstruído, código atual
verificado, chamadores examinados, teste direcionado executado, veredito Ponytail e zero
Critical/Important aberto.

Uma fase só fecha quando todas as suas tasks tiverem veredito, a revisão integrada passar e o gate
diferencial não introduzir falha nova.

O trabalho inteiro só termina quando:

1. Fases 0–6 foram revisadas.
2. Tasks 1–63 receberam veredito individual.
3. A task 63 lista honestamente suas nove pendências.
4. As cinco falhas do baseline foram investigadas e corrigidas.
5. A revisão final da branch foi concluída.
6. App, runtime, boundaries e DB/pipeline passaram no SHA final.
7. Todos os rulings foram apresentados ao usuário antes da integração.
