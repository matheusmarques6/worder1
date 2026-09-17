# Auditoria IA — decisão de shadow e agendamento sem consumidor (Wave 4, Task 11)

Registro de 2026-09-15: o usuário condicionou a continuidade do pacote recomendado à sincronização remota e à compatibilidade. O controlador informou essa condição cumprida, com gates locais de app/runtime/static/build e Docker DB/RLS/pipeline verdes no BASE `bd50a3ee76325192d2ea84ce32bc14675f9fc6dd`. Respostas abaixo são paráfrases do aceite condicional, não citações literais nem prova de remoção executada. Toda mudança de código permanece sujeita a TDD, revisão de tarefa e revisão final.

Referências: [plano da Wave 4, Task 11](../plans/2026-09-08-auditoria-ia-wave-4-ai-product-cost.md) e [spec do programa](2026-09-08-auditoria-motor-ia-sdd-program-design.md). Base conferida na branch `fix/ai-engine-schema-baseline`, worktree `.worktrees/sync-remote-ai-2026-09-08`.

## Evidência

Consumidor confirmado: nenhum para shadow ou scheduled touch. Não foi confirmado dono, leitor ou escritor alcançável da capacidade `shadow_until`; o campo reservado no loader não é um consumidor operacional. Não foi confirmado handler/enqueuer de scheduled touch. Prosa antiga sobre sete dias e o nome `q_scheduled` não constituem consumidores.

Existe handler de `MissionTouchJob` em `domain_events` no app; isso não é handler de `q_scheduled` e não é alvo da retirada. Pesos/retry/promoção reservados e `pending_defaults.py` não comprovam capacidade implementada de agendamento. Ausência de consumidor não comprova fila vazia em ambiente algum.

## Decisões aprovadas

| ID estável | Estado | Escolha aprovada; alternativa rejeitada | Dono | Resposta do usuário | Data |
|---|---|---|---|---|---|
| W4-SS-01 | aprovado; remoção pendente | Remover `shadow_until` dos settings/loaders de tenant runtime. Rejeitada implementação especulativa de shadow sem dono/leitor/escritor. | Produto/controlador; implementador da Task 11; Astra independente revisa. | Aprovou condicionalmente retirada da reserva sem consumidor. | 2026-09-15 |
| W4-SS-02 | aprovado; remoção sujeita ao gate de backlog | Retirar somente pesos, retry, promoção, config, testes e promessas documentais de polling scheduled; preservar filas/dados/compatibilidade. Rejeitado criar enqueuer/handler de agendamento sem consumidor. | Controlador/implementador Task 11; Astra independente revisa; guardião DB prova backlog. | Aprovou condicionalmente retirada do polling reservado, com preservação e prova de destino/backlog. | 2026-09-15 |
| W4-SS-03 | aprovado; remoção pendente | Excluir arquivo sem uso `runtime/src/agents_runtime/agent_core/pending_defaults.py` e referências que prometem capacidade; nenhum número novo aterrissa nele. Rejeitada reserva especulativa para decisão futura. | Implementador Task 11; Astra independente revisa. | Aprovou condicionalmente retirar `pending_defaults` sem consumidor. | 2026-09-15 |

Impacto: runtime deixa de carregar shadow inexistente e de prometer execução scheduled sem handler. A decisão não declara remoção concluída ou branch promotável.

## Pesos, Promoção e preservação

Pesos resultantes aprovados: `INBOUND: 8`, `DOMAIN_EVENTS: 4`, `EVALS: 1`. Scheduled não participa do ciclo. Promoção de scheduled após dez minutos é retirada, incluindo `promote_scheduled_after`; não copiar a política arquivada 8:4:2:1 nem alterar por inferência as demais capacidades de filas ativas.

Preservar `q_scheduled`, migrations, DLQ, mensagens/dados históricos e constantes de nome de fila necessárias à compatibilidade e inspeção. Não apagar tabelas, filas ou dados, não purgar produção nem drenar automaticamente backlog. Remover promessa/teste de capacidade scheduled sem enfraquecer testes de ordem e ausência de starvation das filas restantes.

## Gates e reintrodução

- Antes de parar o polling scheduled numa branch promotável, o guardião DB deve comprovar backlog zero em replay descartável, com identidade/sentinela e evidência registradas. Este lote não executou esse gate.
- Promoção em produção exige verificação de backlog/destino somente leitura, separadamente autorizada. Não foi autorizada nem realizada por este aceite.
- Se houver backlog, parar e decidir destino; não abandonar mensagens silenciosamente nem apagá-las. Resultado vazio no descartável não prova produção vazia.
- Implementação futura testa ciclo 8/4/1, tenant settings sem `shadow_until`, retirada das referências de `pending_defaults` e da promoção/retry scheduled; guardião verifica loader/pipeline no descartável. Busca de importadores precede exclusão de arquivo.
- Reintrodução exige consumidor real, caps/pesos aprovados, handler de `MissionTouchJob` para o caminho scheduled, idempotência de negócio e testes de tenant/cancelamento/duplicidade, além de plano filho aprovado. Nenhum plano filho é criado agora.

## Limites, retenção e rollback

Somente decisão documental: runtime, configurações, testes e promessas de docs existentes ainda não foram retirados. Não alterar neste lote código, plano, checklist, HTML, migrations ou dados; sem DB, Docker, push, merge, deploy, migration remota ou chamada paga. Retenção dos destinos existentes inalterada, preservando histórico para inspeção.

Rollback documental exige novo registro com IDs, aceite e data. Remoção futura é recuperável por revert de código, sem recriar fila ou dados porque foram preservados. Scheduled jamais volta a pollar backlog sem gate de idempotência da Onda 2 e destino comprovado; reverter código não autoriza dreno automático.
