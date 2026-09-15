# Auditoria IA — decisão de estado e ausência no preview (Wave 4, Task 10)

Registro de 2026-09-15: o usuário condicionou a continuidade do pacote recomendado à sincronização com o remoto e à compatibilidade. O controlador confirmou a condição, com gates locais de app/runtime/static/build e Docker DB/RLS/pipeline verdes no BASE `bd50a3ee76325192d2ea84ce32bc14675f9fc6dd`. As respostas são paráfrases desse aceite condicional, não citações literais nem evidência de UI pronta. Toda mudança de código continua sujeita a TDD, revisão de tarefa e revisão final.

Referências: [plano da Wave 4, Task 10](../plans/2026-09-08-auditoria-ia-wave-4-ai-product-cost.md), [decisão de RAG/preview](2026-09-08-auditoria-ia-rag-preview-decisions.md) e [spec do programa](2026-09-08-auditoria-motor-ia-sdd-program-design.md). Base conferida: branch `fix/ai-engine-schema-baseline`, worktree `.worktrees/sync-remote-ai-2026-09-08`.

## Evidência e decisões aprovadas

O runtime serializa `RenderedBlock(kind,text,ghost,source_ids)`. Sem conversa real, os dados da organização não constituem o estado completo do contato; `StateBlock` inclui campos de organização e de conversa. A apresentação deve distinguir conteúdo real e ausente por texto/semântica.

| ID estável | Estado | Escolha aprovada; alternativa rejeitada | Impacto | Dono | Resposta do usuário | Data |
|---|---|---|---|---|---|---|
| W4-PS-01 | aprovado; UI/testes pendentes | Estado A: manter STATE inteiro ghost sem conversa real. Rejeitado estado parcial B com momentos da organização. Não mudar Python `_preview`. | Evita apresentar dados organizacionais como estado completo do contato. | Produto/controlador; Terra implementa Task 10; Sol revisa. | Aprovou condicionalmente manter todo STATE indisponível sem conversa. | 2026-09-15 |
| W4-PS-02 | aprovado; UI/testes pendentes | Ghost A: preservar texto/cabeçalho e acrescentar rótulo visível exatamente `Não disponível neste preview`, borda esquerda tracejada e tratamento secundário/itálico. Rejeitado ocultar ghost e substituí-lo por resumo B. | Ausência identificável sem depender somente de cor. | Terra implementa Task 10; Sol revisa; Terra verifica. | Aprovou condicionalmente rótulo explícito e apresentação tracejada. | 2026-09-15 |

## Exemplos e acessibilidade

| Bloco | Resultado escolhido |
|---|---|
| Real AGENT, texto `# AGENTE` seguido do nome do agente | Preservar cabeçalho/texto; sem rótulo de ausência e sem tratamento ghost. |
| Ghost STATE, texto `# ESTADO` seguido de `Sem conversa` | Preservar todo o texto e cabeçalho; mostrar `Não disponível neste preview`, borda esquerda tracejada e estilo secundário/itálico. |
| Estado parcial da organização | Opção rejeitada; não renderizar momentos organizacionais como STATE parcial neste preview. O bloco inteiro continua ghost. |

Leitor visual ou assistivo deve distinguir real versus ghost pelo texto e pela semântica. Não depender só de cor, reduzir contraste arbitrariamente ou usar opacidade para ocultar conteúdo. React continua escapando o texto; não introduzir renderização markdown/HTML. Aplicar a mesma indicação de ausência no caminho de fetch e no fallback, preservando cabeçalhos portugueses.

## Critérios futuros, limites e rollback

UI e testes da Task 10 ainda pendentes: provar render de bloco real e ghost, texto literal do rótulo, preservação de cabeçalhos, fallback coerente e texto escapado, além do smoke em viewport estreita quando a UI for implementada. Este aceite não implementa o componente/CSS nem prova acessibilidade executada. A opção A de estado não exige alteração de `_preview` ou teste DB de estado parcial.

Nenhuma nova retenção/destino: a decisão muda a futura apresentação de dados já retornados, sem gravar contato ou conteúdo. Sem código, testes, planos, checklist, HTML, schema ou dados alterados; sem Docker/DB, chamada paga, push, merge, deploy ou migration remota.

Rollback documental: decisão substitutiva cita IDs, novo aceite e data; manter este histórico. Rollback da implementação futura reverte UI/CSS e seus consumidores juntos, sem alterar Python ou apagar dados. A reversão não deve passar ghost por conteúdo real.
