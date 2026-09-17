# Auditoria IA — decisões de traces e contadores (Wave 4, Task 1)

Registro de 2026-09-15: após receber o pacote recomendado, o usuário condicionou a continuidade à sincronização com o remoto e à comprovação de compatibilidade. Segundo a evidência fornecida pelo controlador, a condição passou nessa data: gates locais de app/runtime/static/build e Docker DB/RLS/pipeline verdes no BASE `bd50a3ee76325192d2ea84ce32bc14675f9fc6dd`. As respostas abaixo são paráfrases do aceite condicional, não citações literais nem prova de implementação. Toda mudança de código continua sujeita a TDD, revisão de tarefa e revisão final.

Referências: [plano da Wave 4, Tasks 1–3](../plans/2026-09-08-auditoria-ia-wave-4-ai-product-cost.md) e [spec do programa](2026-09-08-auditoria-motor-ia-sdd-program-design.md). Base documental conferida na branch `fix/ai-engine-schema-baseline`, worktree `.worktrees/sync-remote-ai-2026-09-08`, inicialmente limpa e zero commits atrás da referência remota local.

## Evidência e consumidores

- Consumidor de traces existente: `src/lib/ai/proposals.ts` e `src/lib/ai/evals.ts` leem `agent_traces` junto de `agent_trace_annotations`. Não foi confirmado escritor alcançável nem dono de `agent_trace_annotations`; a existência dos leitores não fecha o fluxo de anotação.
- Não foi confirmada superfície ativa de produto para os totais legados; seleção diagnóstica/inicialização de campos em API não prova contador vivo. `AIAgentCard` já foi removido. RPC arquivada não constitui escritor runtime.
- `internal.llm_calls`, chamadas de tools e scores do juiz já fornecem telemetria operacional. Não substituem um trace de produto anotado, nem tornam conteúdo gerado em conteúdo aceito.
- `GuardedOutcome.selected_attempt` da Task 2 está pronto. A ponte multi-WABA W2-T5 aceita, o consumidor/dono de anotações e o plano filho de transporte de trace aceito ainda faltam para a Task 3.

## Decisões aprovadas

| ID estável | Estado | Escolha aprovada; alternativa rejeitada | Evento contado | Consumidor | Dono | Resposta do usuário | Data |
|---|---|---|---|---|---|---|---|
| W4-TC-01 | aprovado; implementação bloqueada | Traces B: persistir somente o resultado selecionado depois de CAS/commit bem-sucedido, quando existir o consumidor faltante. Rejeitado gravar todas as gerações com estados A; nenhum escritor novo agora. | Um resultado selecionado de turno aceito e confirmado. | Leitores proposal/eval existentes; escritor/dono de anotações não confirmado. | Produto/controlador confirma consumidor; Sol implementa Task 3 após dependências; Astra revisa. | Aprovou condicionalmente B, mantendo o bloqueio por consumidor e transporte. | 2026-09-15 |
| W4-TC-02 | aprovado; alteração de produto aplicada em 2026-09-17 | Contadores A: retirar exposição/labels que apresentam totais congelados como vivos; preservar colunas e dados de `ai_agents`. Rejeitada atualização materializada B e reativação de RPC arquivada. Aplicado no commit `fix: stop presenting frozen agent totals as live activity` (Task 7 do fechamento 2026-09-17): a varredura confirmou uma única superfície (a) — `src/app/api/ai/test/route.ts` (`action=list_agents`) selecionava e devolvia `total_messages`/`total_tokens_used` cruas no corpo da resposta; as duas colunas saíram do `select`, sem tocar nas demais. Nenhuma outra leitura de `ai_agents` apresentava os quatro campos como atividade ao usuário: os demais achados da varredura eram escritores legados (`src/lib/ai/engine.ts`, `src/lib/services/whatsapp/ai-chatbot-service.ts`, `src/lib/ai/cloud-sender.ts`, deixados gravando, como a decisão permite) ou campos homônimos de outras entidades (`contacts`, `agent_status`, `whatsapp_agents`, `whatsapp_ai_configs`, `api_keys`, SLA/números — computados ou de coluna própria, fora do escopo desta decisão). Colunas e dados de `ai_agents` permanecem intocados. | Métrica futura deve declarar evento real e janela, conforme denominadores abaixo. | Superfície ativa confirmada e retirada: `src/app/api/ai/test/route.ts`. Nenhum agregado novo por agente autorizado nem criado. | Produto/controlador; Sol nos leitores confirmados; Astra revisa. | Aprovou condicionalmente A e a preservação do histórico. | 2026-09-15 |
| W4-TC-03 | aprovado; retirada de wording pendente | Ações A: retirar `ai_agent_actions.times_triggered/last_triggered_at` da linguagem de produto; preservar schema e histórico. Rejeitado conservar promessa de execução sem ação/consumidor. | Nenhum novo evento/contador de ação. | Nenhuma ação executável ou consumidor confirmado. | Produto/controlador; implementador da retirada; Astra revisa. | Aprovou condicionalmente retirar a promessa de contadores de ações sem consumidor. | 2026-09-15 |

Impacto: o produto deixa de sugerir atividade atual a partir de `total_messages`, `total_tokens_used`, `avg_response_time_ms` e `total_conversations` congelados. A decisão não preenche esses campos nem cria estatísticas derivadas sem evento e atribuição comprovados.

## Denominadores e exemplos verificáveis

| Métrica/ocorrência | Semântica aprovada e limite |
|---|---|
| `accepted_turns` | Um turno aceito com commit, independentemente do número de bolhas. Um turno com três bolhas conta 1, não 3. |
| `served_conversations` | Quantidade de IDs distintos de conversa com pelo menos um turno aceito e confirmado na janela selecionada. Dois turnos da mesma conversa na janela contam uma conversa. |
| Tokens/custo | Todas as tentativas efetivamente emitidas ao provedor e todas as finalidades, inclusive perdedoras, vetadas e superseded. Contagens de saída aceita não incluem essas saídas rejeitadas. |
| Atribuição por agente | Não exibir agregado por agente até a identidade do agente ser transportada pelo turno aceito. Usar agente do turno e identidade WABA da ponte aceita, nunca o agente ativo no momento da consulta. |
| Latência | Latência de geração e latência de entrega são distintas; cada relatório deve nomear o evento medido e a janela. Uma não representa a outra. |
| Retry com tentativas 0, 1 e 2; vencedora 0 | Futuro trace contém apenas resultado/tools da tentativa 0, depois do CAS bem-sucedido. Não deduzir vencedora pela última tentativa; custos das três tentativas continuam no metering. Reentrega do mesmo turno não duplica saída aceita. |
| Veto | Nenhum trace/contador de saída aceita; tentativas pagas permanecem na medição operacional. |
| Superseded / CAS recusado | Rascunho superado não produz trace/contador de saída aceita; chamadas já realizadas continuam custeadas. |

## Retenção, destino e dependências

A implementação W2-T5 usa a migration `supabase/migrations/20260915010000_account_scoped_conversation_bridge.sql`: `p_waba_id uuid` identifica `whatsapp_business_accounts.id`, e `channel_account_id` acompanha o job, o turno e a outbox. O aceite independente da ponte continua sendo requisito para o transporte de trace.

Retenção: nenhuma linha ou conteúdo novo neste lote; a retenção existente permanece inalterada. Futuro trace aceito usa somente o destino existente `agent_traces`, depois de consumidor e transporte aprovados. Segredos e headers nunca são retidos. Não copiar conteúdo para `internal.llm_calls` nem alterar histórico.

Task 3 bloqueada, não implementada: exige consumidor/dono confirmado de `agent_trace_annotations`, plano filho `docs/superpowers/plans/2026-09-08-auditoria-ia-accepted-trace-transport.md` aprovado e executado, e ponte multi-WABA W2-T5 implementada e aceita. `selected_attempt` sozinho não autoriza persistência. Critérios futuros incluem transporte até commit/CAS, retry idempotente, vínculo tenant/WABA correto e custo das tentativas perdedoras preservado. Não se cria o plano filho neste lote.

## Limites e rollback

Entrega somente documental: sem código, testes executáveis, migrations ou dados alterados; sem push, merge, deploy, migration remota ou chamada paga. O aceite não fecha a Task 3 nem a onda. Rollback documental exige decisão substitutiva com ID, aceite e data, preservando este histórico. Qualquer implementação futura reverte escritor/leitor em ordem segura e mantém colunas/registros históricos; não apaga traces nem reconta produção automaticamente.
