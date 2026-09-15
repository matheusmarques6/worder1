# Auditoria IA — política de cobrança e custo desconhecido (Wave 4, Task 4)

Registro de 2026-09-15: o usuário condicionou a continuidade do pacote recomendado à sincronização com o remoto e à compatibilidade. O controlador informou a condição cumprida, com gates locais de app/runtime/static/build e Docker DB/RLS/pipeline verdes no BASE `bd50a3ee76325192d2ea84ce32bc14675f9fc6dd`. Resposta do usuário neste registro é paráfrase desse aceite condicional, não citação literal nem prova de implementação. Toda mudança de código permanece sujeita a TDD, revisão de tarefa e revisão final.

Referências: [plano da Wave 4, Tasks 4–6](../plans/2026-09-08-auditoria-ia-wave-4-ai-product-cost.md) e [spec do programa](2026-09-08-auditoria-motor-ia-sdd-program-design.md). Base conferida na branch `fix/ai-engine-schema-baseline`, worktree `.worktrees/sync-remote-ai-2026-09-08`.

## Evidência e decisões aprovadas

O contrato existente usa `BudgetCheckResult(allowed,budgetUsd,spentUsd,hasUnknownCost)`, `TrackAiUsageInput` e custo nullable. A ausência de preço/usage não prova gratuidade. O default de USD 50 não é teto efetivo para custo desconhecido. A tabela abaixo define a política a implementar, não afirma que budget, instrumentação e UI já a cumprem.

| ID estável | Estado | Escolha aprovada; alternativa rejeitada | Dono | Resposta do usuário | Data |
|---|---|---|---|---|---|
| W4-CP-01 | aprovado; implementação pendente | Erro DB/leitura de orçamento em request cobrável da organização: bloquear antes do provedor com `AiBudgetUnavailableError`, HTTP 503. Orçamento realmente esgotado: `AiBudgetExceededError`, HTTP 402. Rejeitado continuar com alerta/fallback permissivo. | Sol, Tasks 5/6; Astra revisa dinheiro/DB. | Aprovou condicionalmente bloquear indisponibilidade com erro distinto de esgotamento. | 2026-09-15 |
| W4-CP-02 | aprovado; implementação pendente | Modelo sem preço conhecido/custo desconhecido cobrável: bloquear. Uso cobrável desconhecido persistido mantém requests posteriores bloqueados até preço/reconciliação resolver. Rejeitado inventar preço, supor teto de USD 50 ou liberar N chamadas desconhecidas. | Sol, Tasks 5/6; Astra revisa; reconciliação operacional com evidência externa. | Aprovou condicionalmente bloquear custo desconhecido da organização. | 2026-09-15 |
| W4-CP-03 | aprovado; implementação pendente | Destino único `ai_usage_logs`, com `metadata.billable` booleano; histórico sem flag é cobrável. Rejeitado destino paralelo e misturar plataforma ao teto da organização. | Sol, Tasks 5/6; Astra revisa; guardião DB prova RPC. | Aprovou condicionalmente classificação explícita e separação dos totais. | 2026-09-15 |
| W4-CP-04 | aprovado; implementação pendente | Registrar cada request emitido com custo real ou `null`; falha de persistência observável não repete chamada concluída. Rejeitada síntese de tokens/custo e retry do resultado por rejeição do log. | Sol, Task 6; Astra revisa. | Aprovou condicionalmente medição por tentativa, sem dupla cobrança por erro de log. | 2026-09-15 |

Impacto: requests cobráveis podem ser recusados antes do provedor quando orçamento/custo não são confiáveis; o consumo da plataforma não bloqueia o orçamento da organização.

## Pagador por superfície

| Superfície | Chave / Pagador | `metadata.billable` | Participa do teto | Feature / unidade de medição |
|---|---|---|---|---|
| Inbox copiloto, `src/lib/services/whatsapp/ai-chatbot-service.ts::callOpenAI`, ambos os chamadores | Plataforma | `false` | Não | `copilot`; cada request emitido pelos dois chamadores usa o helper compartilhado. |
| Segmento Anthropic | Plataforma | `false` | Não | `segment_generation`; cada retry enviado ao provedor deixa seu próprio log. |
| Embedding unitário, cache miss | Organização/BYO | `true` | Sim | `embedding`; um request/log. Cache hit: nenhum request ou log. |
| Embedding batch | Organização/BYO | `true` | Sim | `embedding`; um check/log por lote enviado ao provedor, não por vetor. |
| Transcrição | Organização/BYO | `true` | Sim | `transcription`; custo permanece `null` quando o provedor não fornece preço/tokens. |

Os nomes de helpers homônimos fora dessa superfície não ampliam este inventário. Consulta de metadados/validação de chave não é inferência e fica fora. Payer da geração copiloto não altera o payer de um embedding BYO eventualmente usado no seu RAG.

## Matriz de orçamento, erros e reconciliação

| Caso | Decisão antes/depois do request | Uso/log esperado |
|---|---|---|
| Teto USD 50; gasto conhecido USD 49 | Permite o próximo request cobrável, se não houver outro bloqueio. | Após emissão, uma tentativa com usage real ou custo `null`. |
| Teto USD 50; gasto conhecido USD 50 | Bloqueia antes do provedor: `AiBudgetExceededError`, HTTP 402. | Nenhuma linha de uso por bloqueio pré-request. |
| Teto USD 50; gasto conhecido USD 51 | Mesmo bloqueio por esgotamento, HTTP 402. | Nenhuma linha nova. |
| Erro DB / lookup indisponível, payer organização | Falha fechada antes do provedor: `AiBudgetUnavailableError`, HTTP 503. | Nenhuma linha por request que não ocorreu. |
| Modelo sem preço conhecido, payer organização | Bloqueia antes do provedor; não inventa preço. | Nenhuma linha por bloqueio; não apresentar USD 50 como garantia. |
| Histórico com uso cobrável desconhecido | Bloqueia requests cobráveis posteriores até preço/reconciliação resolver. | Preservar desconhecimento e histórico, sem custo artificial. |
| Plataforma com `cost_usd=null`, `billable=false` | Excluído do cálculo e do unknown do teto da organização. | Uma linha por request efetivo; total da plataforma separado. |
| Linha histórica sem `metadata.billable` | Considerada cobrável (`is distinct from false`). | Custo conhecido entra na soma; custo `null` participa do unknown cobrável. |
| Cache hit de embedding | Zero provedor; nenhum check de request a emitir. | Zero nova linha de uso. |
| Request emitido sem usage, inclusive falha de rede/HTTP ou retry | Não sintetizar tokens/custo. | Uma linha da tentativa com `cost_usd=null` e billable correto, quando persistência disponível. |
| Rejeição PostgREST ao persistir request concluído | Warning observável, sem repetir nem falhar o resultado já concluído do provedor. | Falta de log permanece lacuna explícita; fatura/reconciliação exige evidência externa. |

O budget check ocorre imediatamente antes de cada request cobrável ao provedor, inclusive cada retry e cada lote. Um pequeno excesso após autorizar com USD 49 é aceito: esta política verifica gasto já conhecido e não acrescenta reserva atômica. Concorrência e custo ainda em trânsito impedem prometer teto estrito; não criar sistema de reserva neste escopo.

## Destino, retenção e critérios futuros

Destino: conservar uma `ai_usage_logs`. Toda linha nova escreve `metadata.billable` booleano. Budget RPC, fallback TS e view de uso devem usar o mesmo predicado de inclusão, `is distinct from false`, também ao determinar custo desconhecido; só `false` explícito exclui consumo. UI/relatórios mostram organização cobrável e plataforma não cobrável em totais com rótulos distintos.

Retenção: conservar a política existente do destino; este registro não grava linhas nem aprova novo conteúdo/prazo. Nenhum prompt, áudio, chave ou header Authorization é armazenado. Cada request efetivo deixa uma tentativa quando persistência está disponível; falha de persistência não pode ser apresentada como prova de metering completo. Reconciliação de fatura continua evidência externa, sem solicitação paga ou consulta externa neste lote.

Critérios executáveis futuros das Tasks 5/6: regressões 49/50/51, DB indisponível, modelo sem preço, histórico sem flag, plataforma com null, ambos os chamadores de `callOpenAI`, retries Anthropic, cache miss/hit, batch por request, transcrição sem usage e rejeição PostgREST sem dupla chamada. Budget RPC/fallback/view precisam concordar no mesmo conjunto de linhas; revisão independente de dinheiro/DB continua obrigatória.

## Limites e rollback

Somente decisão documental. Tasks 5/6, instrumentação, UI, RPC e seus testes ainda não estão implementados por este aceite. Sem código, migration, plano, checklist, HTML ou dados alterados; sem push, merge, deploy, migration remota ou chamada paga. Rollback documental por decisão substitutiva com IDs, aceite e data; implementação futura reverte leitores/writers coordenadamente sem apagar histórico de uso ou converter null em zero.
