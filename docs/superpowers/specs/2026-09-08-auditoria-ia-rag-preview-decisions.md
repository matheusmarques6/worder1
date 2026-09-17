# Auditoria IA — decisões de RAG e preview (Wave 4, Task 7)

Registro de 2026-09-15: o usuário condicionou a continuidade do pacote recomendado à sincronização remota e à compatibilidade. O controlador forneceu a condição cumprida: gates locais de app/runtime/static/build e Docker DB/RLS/pipeline verdes no BASE `bd50a3ee76325192d2ea84ce32bc14675f9fc6dd`. Resposta do usuário abaixo é paráfrase do aceite condicional, não citação literal nem prova de implementação. Mudanças de código seguem TDD, revisão de tarefa e revisão final.

Referências: [plano da Wave 4, Tasks 7/8](../plans/2026-09-08-auditoria-ia-wave-4-ai-product-cost.md), [política de custo](2026-09-08-auditoria-ia-cost-policy.md) e [spec do programa](2026-09-08-auditoria-motor-ia-sdd-program-design.md). Base conferida na branch `fix/ai-engine-schema-baseline`, worktree `.worktrees/sync-remote-ai-2026-09-08`.

## Evidência e decisões aprovadas

O responder já dispõe das mensagens pending de autor `contact`; o toucher recebe objetivo resolvido e transcript. `SearchKnowledge` existente tem escopo de tenant e limite. Preview sem contato não dispõe de conversa real; a representação `conversation_id="preview"` não é FK válida, e `run_tool` grava `tool_calls`.

| ID estável | Estado | Escolha aprovada; alternativa rejeitada | Dono | Resposta do usuário | Data |
|---|---|---|---|---|---|
| W4-RP-01 | aprovado; contrato reativo preservado | Query reativa concatena em ordem todas as mensagens pending de autor `contact`, mantendo a composição atual, sem N e sem truncamento novo. Rejeitado reduzir às últimas N ou incluir outros autores. | Sol, Task 8; Astra revisa. | Aprovou condicionalmente conservar a query reativa. | 2026-09-15 |
| W4-RP-02 | aprovado; implementação pendente | Query proativa é exatamente `resolved.objective`, depois de resolver delta do nó. Rejeitados tail do transcript, híbrido, separador, N e configuração de fallback. | Sol, Task 8; Astra revisa. | Aprovou condicionalmente usar literalmente o objetivo resolvido no toque. | 2026-09-15 |
| W4-RP-03 | aprovado; ausência preservada | Preview A: sem RAG, embedding ou chamada paga; declarar ausência de knowledge/state. Rejeitado preview pago B com query digitada e trilha nova. | Produto/controlador; Sol, Task 8; Terra, UI; Astra revisa. | Aprovou condicionalmente preview sem busca e sem cobrança. | 2026-09-15 |

Impacto: contexto antigo não desvia a busca do objetivo atual da missão; o preview declara suas ausências. A decisão não demonstra implementação da Task 8.

## Queries exatas e exemplos

Os textos abaixo são entradas ilustrativas; a regra aprovada é passar `resolved.objective` literalmente, sem incorporar o transcript.

| Cenário | Entrada | Query resultante |
|---|---|---|
| Contato frio | Transcript vazio; objetivo base resolvido `Apresentar a coleção de primavera.` | `Apresentar a coleção de primavera.` |
| Carrinho abandonado | Transcript antigo discute troca de tamanho; objetivo resolvido `Retomar o carrinho abandonado.` | `Retomar o carrinho abandonado.`; não inclui discussão antiga. |
| Delta do nó | Objetivo base `Retomar o carrinho abandonado.`; delta substitui por `Confirmar disponibilidade do item reservado.` | `Confirmar disponibilidade do item reservado.`; valor final de `resolved.objective` literal. |
| Query vazia no toque | `resolved.objective` vazio | Nenhuma busca de conhecimento, embedding ou tool de knowledge. |
| Query vazia no reativo | Concatenação atual das mensagens pending de contato vazia | Zero embedding/tool de knowledge e nenhum bloco de conhecimento resultante. |
| Preview, inclusive query vazia | Sem conversa real | Zero busca, embedding e chamada paga; nenhum bloco de conhecimento recuperado. Ausência de knowledge/state declarada explicitamente. |

O modo reativo não recebe novo limite ou regra de concatenação. Mensagens de outros autores não entram na query. Ausência de query não cria fallback para transcript nem busca genérica.

## Pagador, destino e critérios futuros

Pagador do preview: `none`; custo zero. Não criar cliente LLM para buscar conhecimento no listener, FK fictícia de `conversation_id`, tool trace ou `source_ids` inventados a partir do texto. A opção paga foi rejeitada: nenhum plano filho de preview pago é necessário ou autorizado; não criar `auditoria-ia-paid-knowledge-preview.md`.

Task 8 deve reutilizar `SearchKnowledge` com escopo de tenant e limite existentes, mover o único produtor `KNOWLEDGE` para `compile_prompt` e reutilizar os mesmos chunks no prompt e no juiz. Proveniência usa IDs reais dos chunks; texto isolado não fornece `source_ids`. A consulta real de runtime segue a política de pagador da superfície correspondente, sem atribuir cobrança ao preview.

Retenção/destino: nenhum conteúdo/trace novo no preview, retenção existente inalterada. Critérios futuros: casos frio/carrinho/delta, query vazia com zero trabalho, isolamento de tenant, uma única produção de `KNOWLEDGE`, mesmos chunks no prompt/juiz e preview sem cliente pago nem FK falsa.

## Limites e rollback

Somente decisão documental; código/testes da Task 8 permanecem pendentes. Não altera `_preview`, planos, checklist, HTML, dados ou migrations; não executa DB, Docker, chamada paga, push, merge ou deploy. Rollback por nova decisão com ID, aceite e data; eventual reversão de código preserva política sem cobrança do preview e não acrescenta conteúdo fictício ao histórico.
