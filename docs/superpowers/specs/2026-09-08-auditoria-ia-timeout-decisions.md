# Auditoria IA — decisões de timeouts (Wave 3, Task 7)

Registro de 2026-09-14: o usuário aprovou as escolhas e os cinco valores abaixo, conforme resposta comunicada pelo controlador. As respostas são paráfrases desse aceite, não citações literais. São uma **baseline inicial aprovada**, sem p95/p99 de produção disponível ou coleta de telemetria autorizada nesta task. O aceite resolve a decisão necessária à Task 8; não comprova implementação, configuração implantada, testes ou aprovação da onda.

Referências: [plano da Wave 3, Tasks 7/8](../plans/2026-09-08-auditoria-ia-wave-3-contracts-limits.md) e [spec do programa](2026-09-08-auditoria-motor-ia-sdd-program-design.md). Base conferida: branch `fix/ai-engine-schema-baseline`, HEAD `aad25c24`, worktree `.worktrees/sync-remote-ai-2026-09-08`.

## Evidência e limites conhecidos

- `runtime/src/agents_runtime/config.py`: defaults de VT 60s, heartbeat do trabalho 45s e lease da conversa 120s. O heartbeat renova VT e lease; eles não são prazo máximo de geração.
- `runtime/src/agents_runtime/queueing/worker.py`: `_turn` e `_touch` já param o keepalive antes de liberar a lease e propagar erro da fase 2; ainda não têm o envelope temporal decidido aqui. A fase 3 conclui por CAS e preserva idempotência.
- `runtime/src/agents_runtime/agent_core/metering.py`: o pior caso de desenho citado é de 16 chamadas, mas `DEFAULT_TURN_LLM_CALL_LIMIT` é 8. Limite de chamadas e timeout individual de provedor não limitam a duração acumulada do turno. Este aceite não muda o limite de chamadas.
- `runtime/src/agents_runtime/server.py`: `HealthConnection` reutiliza uma conexão, serializa a sequência de leitura/reconexão com lock e reabre pela porta guardada `app._connect`. Preview usa `_connection` separadamente. Espera pelo lock também pode prender um probe.
- `render.yaml` declara `healthCheckPath: /healthz`; não declara `maxShutdownDelaySeconds` nem os cinco novos limites. `runtime/DEPLOY.md` descreve conexões de sessão e troca de papel. Esses arquivos não provam env, cadência efetiva dos probes ou configuração atual no Dashboard.
- O controlador verificou em 2026-09-14 a documentação oficial: health HTTP precisa devolver 2xx/3xx em até 5s ([Render Health Checks](https://render.com/docs/health-checks)); shutdown padrão é 30s e `maxShutdownDelaySeconds` aceita 1–300s ([Render Blueprint Specification](https://render.com/docs/blueprint-spec)). A verificação externa foi fornecida no briefing; esta task documental não fez rede. Cadência numérica efetiva do probe e latências de produção permanecem sem evidência autorizada.

## Decisões aprovadas

Os nomes em `snake_case` desta tabela são campos do registro; não afirmam que já existe configuração pública com esses nomes. Donos são responsáveis pela implementação e revisão futuras; o controlador registra o aceite.

| ID estável | Estado | Escolha aprovada; alternativa rejeitada | Impacto esperado | Dono | Resposta do usuário | Data |
|---|---|---|---|---|---|---|
| W3-TD-01 | aprovado | Um teto de `turn_timeout_seconds=90` para responder e toucher, cobrindo a fase 2 inteira de cada produtor. Rejeitados tetos por tipo de job e dependência exclusiva de timeout por chamada. | Uma geração lenta pode ser interrompida e repetida; o cliente pode esperar a próxima tentativa. Não conclui rascunho interrompido. | Task 8: Sol; revisão Astra; verificação Terra + guardião DB Astra. | Aprovou teto único de 90s. | 2026-09-14 |
| W3-TD-02 | aprovado | `connect_timeout_seconds=3` na configuração comum, passado como `connect_timeout` às quatro portas de conexão, incluindo aberturas e reconexões. Rejeitado depender de parâmetro oculto no DSN. | Conexão lenta falha de forma observável; indisponibilidade não vira estado vazio nem bypass de RLS. | Task 8: Sol; revisão Astra. | Aprovou composição comum e conexão de 3s. | 2026-09-14 |
| W3-TD-03 | aprovado | `statement_timeout_ms=15000`, aplicado em cada sessão com `set_config` parametrizado após `SET ROLE`. Rejeitado `ALTER ROLE` ou presumir que a troca de papel aplica configurações do papel. | SQL acima de 15s é cancelado; transação precisa terminar/sofrer rollback antes de reutilização. Nenhuma alteração global no banco. | Task 8: Sol; revisão e DB Astra. | Aprovou 15000ms por conexão, após `SET ROLE`. | 2026-09-14 |
| W3-TD-04 | aprovado | `probe_timeout_seconds=4` para a operação completa de health, incluindo fila do lock, abertura, inicialização da sessão, leitura e eventual reconexão. Rejeitado deixar probe sem teto ou limitar somente sua última consulta. | Banco lento pode produzir 503; evita acumular probes sem prazo e deixa margem nominal de 1s diante dos 5s do Render. | Task 8: Sol; revisão Astra; verificação Terra. | Aprovou probe de 4s. | 2026-09-14 |
| W3-TD-05 | aprovado | `cleanup_timeout_seconds=10`, orçamento total independente para encerrar trabalho cancelado/recursos, parar keepalive e tentar liberar lease. Rejeitados cleanup ilimitado, renovação do orçamento a cada etapa ou uso do deadline já vencido do turno. | Falha de cleanup é observável e não oculta timeout/cancelamento original; lease pode expirar naturalmente se o banco impedir liberação. | Task 8: Sol; revisão Astra; verificação Terra + DB Astra. | Aprovou cleanup independente de 10s. | 2026-09-14 |
| W3-TD-06 | aprovado | Timeout é falha transitória: tenta liberar lease e segue o retry existente, com seus limites, backoff e destino final. Rejeitado arquivamento terminal imediato com novo alerta por timeout ou retry ilimitado. | Pode haver nova tentativa e custo correspondente; não produz resposta parcial. Ao esgotar tentativas, continua a DLQ e o alerta existente. | Task 8: Sol; revisão e pipeline Astra. | Aprovou timeout transitório com liberação da lease e retry existente. | 2026-09-14 |

## Valores, unidades e validação

| Campo da decisão | Baseline aprovada | Representação/escopo da Task 8 | Faixa técnica de entrada |
|---|---|---|---|
| `turn_timeout_seconds` | 90s = 90000ms | `QueueingConfig.turn_timeout: timedelta`; `config_from_env` lê `AGENTS_TURN_TIMEOUT_MS`. | Duração estritamente positiva, finita e representável; override em milissegundos inteiros positivos. |
| `connect_timeout_seconds` | 3s | Inteiro em segundos no kwarg `connect_timeout`, nas quatro portas. | Inteiro positivo representável/aceito pelo conector; nunca zero como forma de desabilitar. |
| `statement_timeout_ms` | 15000ms = 15s | Inteiro em milissegundos convertido em string parametrizada para `set_config`. | Inteiro positivo representável/aceito pelo PostgreSQL; nunca zero como forma de desabilitar. |
| `probe_timeout_seconds` | 4s = 4000ms | Envelope de health incluindo espera pelo lock. | Duração positiva, finita e representável; orçamento operacional menor que os 5s exigidos pelo Render. |
| `cleanup_timeout_seconds` | 10s = 10000ms | Um orçamento próprio para o conjunto do cleanup, separado da geração. | Duração positiva, finita e representável; a baseline usa 10s, abaixo dos 30s de shutdown padrão. |

Rejeitar explicitamente valores inválidos, booleanos usados como número, zero, negativos, NaN, infinito, texto malformado e overflow, sem fallback silencioso que desligue o limite. Limites superiores de representabilidade são os dos tipos/conector, não novos tetos de produto inventados neste registro. A faixa técnica viabiliza injeção de prazos pequenos nos testes; não é evidência de que todo valor aceito foi calibrado para produção. Preservar overrides de teste sem impor relações com o heartbeat de 45s a uma fixture de 10ms.

Os outros quatro nomes de variáveis de ambiente, se necessários à composição, são detalhe de implementação a registrar na Task 8; não existem por efeito deste documento. Nenhuma env foi lida, definida ou promovida. Os cinco valores aprovados são a referência de defaults, não números observados em serviço.

## Ordem e cobertura obrigatórias

1. A composição lê/valida os mesmos valores e os injeta nos consumidores. As quatro portas são `app._connect` (pools de worker/sender/pulse e health), `server._connection` (preview), conexão interna de `build_responder` e conexão interna de `build_toucher`. As factories reais e o preflight devem conduzir a mesma configuração até essas portas; testar apenas o builder isolado não prova essa fiação.
2. Cada abertura recebe `connect_timeout=3`. Depois da conexão, executar `SET ROLE` e aplicar o statement timeout da sessão antes das consultas de trabalho. Conservar `assert_rls_enforced` com o papel esperado por constante e antes de entregar a conexão ao consumidor; falta/troca de papel ou falha de inicialização recusa a sessão e fecha o recurso aberto.
3. Aplicar em todas as sessões, inclusive as reabertas por `HealthConnection`: `await conn.execute("select set_config('statement_timeout', %s, false)", (str(statement_timeout_ms),))`. O `false` define escopo da sessão, não apenas da transação. A prova DB deve ler `SHOW statement_timeout` sob o papel efetivo; nenhum `ALTER ROLE` está autorizado.
4. O deadline do probe começa antes de adquirir o lock e engloba a sequência anterior quando houver conexão/reconexão. O timeout de conexão limita a abertura; o statement timeout limita cada comando depois de aplicado; o probe limita a operação inteira. Eles se sobrepõem: não somar 3s + 15s + 4s nem conceder novo prazo à reconexão. No health, os 4s podem vencer antes dos 15s de SQL.
5. Em timeout de health, devolver 503 e permitir nova tentativa guardada no probe seguinte. Uma sessão interrompida não pode ficar presa/inutilizável ou ser entregue como saudável. A resposta HTTP não pode aguardar um cleanup adicional de 10s: a Task 8 deve provar que fechamento/cancelamento e espera pelo lock não estouram o orçamento do probe. Qualquer limpeza separada precisa ter dono, teto e término verificáveis, sem task órfã.

O envelope de 90s é o limite da fase 2 (`respond(job)`/`toucher(job)`), incluindo loaders, chamadas e recursos abertos dentro do produtor. Claim e conclusão são transações separadas com seus limites DB; não afirmar que a requisição inteira, o job na fila ou a soma de tentativas termina em 90s. No caminho de timeout, o orçamento nominal de geração mais cleanup é 100s, sem incluir claim/conclusão ou espera na fila.

## Timeout, cancelamento e cleanup

- **Timeout interno:** o envelope da fase 2 cancela o produtor e deve terminar com `TimeoutError`; fechar os recursos do produtor, cancelar e aguardar o keepalive antes de reutilizar sua conexão para liberar a lease. Não executar `engine.conclude_turn`, avançar ponteiros como sucesso ou inserir outbox do rascunho abortado. Preservar as chaves de idempotência e CAS existentes para uma tentativa posterior.
- **Cancelamento externo:** `asyncio.CancelledError` conserva sua natureza e propaga após o cleanup limitado; nunca vira `TurnResult.DONE`, silêncio bem-sucedido ou `TimeoutError` de negócio. Não capturá-lo como falha comum para arquivar/repetir imediatamente; o encerramento do processo e a recuperação existente de lease/VT governam a retomada.
- **Cleanup:** os 10s são um orçamento total independente, incluindo encerramento cooperativo do produtor/LLM, cancelamento/espera do keepalive e tentativa de liberação da lease. Não começar a contagem somente depois de um `await` de cancelamento potencialmente ilimitado. Não liberar lease enquanto keepalive ainda puder renová-la ou disputar transação na mesma conexão. Falha de liberação não pode ser relatada como liberação concluída; registrar e deixar a recuperação por expiração existente atuar.
- **Erro ou prazo do cleanup:** preservar a causa original em exceção/log ou encadeamento, inclusive `CancelledError`; registrar a falha secundária sem segredos, sem substituir timeout transitório por erro permanente de cleanup. Cancelamento cooperativo não garante matar código que ignora cancelamento ou bloqueia o event loop; a Task 8 deve cobrir as rotinas reais e declarar qualquer limite não demonstrado.
- **Retry/alerta:** `queueing/failures.py` já classifica `TimeoutError` como transitório. A falha segue `EngineLoop`, sem nova escada de tentativas: defaults atuais de 5 retentativas para inbound/domain events, 3 para scheduled e 2 para evals, após a execução original, totalizando respectivamente 6, 4 e 3 execuções; backoff base 30s, fator 4, teto 1h e jitter existente. Na exaustão, conservar a DLQ e `_alert_dead_letter` (`mission_touch_failed` para toque; `send_failed` no outro caminho). Não criar alerta ou mensagem ao cliente a cada timeout.

Os 90s de turno excedem o shutdown padrão de 30s do Render. Os 10s de cleanup não comprovam que um processo que drena o turno antes de cancelar caberá em 30s. Não foi aprovado mudar `maxShutdownDelaySeconds` nem a política de shutdown neste registro; Task 8 deve verificar cancelamento externo e informar a limitação de drenagem. Adequação operacional em ambiente implantado continua evidência separada da Onda 6.

## Critérios executáveis — Task 8

Gates futuros, não executados nesta task documental:

| Critério | Prova requerida |
|---|---|
| W3-TD-01 / timeout dos dois produtores | Criar `runtime/tests/unit/test_turn_time_limit.py`, parametrizando `_turn`/`_touch` com timeout injetado de 10ms, `asyncio.Event`, `AsyncMock`, transação async vazia e `SystemClock`. O produtor marca fechamento em `finally`; exigir `TimeoutError`, fechamento, `release_lease` aguardada uma vez, `conclude_turn` não chamado e nenhuma task de keepalive pendente. Deadline externo apenas encerra teste quebrado, sem fornecer o timeout afirmado. |
| W3-TD-01/05/06 / sucesso e cancelamento | Cobrir sucesso antes do prazo, cancelamento externo com `CancelledError`, cleanup bloqueado/falho e causa original preservada. Provar orçamento total de cleanup, ordem keepalive → liberação, recursos encerrados e ausência de outbox/conclusão no timeout. Exercitar ambos os produtores; regressão de fechamento LLM deve continuar verde. |
| W3-TD-02/03 / quatro portas | Monkeypatch de `psycopg.AsyncConnection.connect` exige kwarg de 3s em cada porta, incluindo factories reais/preflight/reconexão. Injetar valores distintos dos defaults prova configuração conduzida pela composição. Capturar ordem `connect` → `SET ROLE` → `set_config` → entrega guardada da sessão; provar fechamento na falha de inicialização e manter a guarda RLS. |
| W3-TD-03 / DB real | Em `tests/db/test_database_time_limits.py`, usar somente no descartável `statement_timeout=20`ms e `select pg_sleep(0.1)`: exigir `psycopg.errors.QueryCanceled`. Depois do rollback, transação seguinte retorna `select 1 = 1`. Conferir `SHOW statement_timeout`, papel e isolamento após abertura/reconexão. Os 20ms são fixture, nunca baseline de produção. |
| W3-TD-04 / health | Complementar os testes de `HealthConnection`: consulta suspensa, lock ocupado e abertura/reconexão lenta devem respeitar o único orçamento e produzir 503; probe seguinte recupera por porta guardada. Conservar reuso e uma reconexão diante de concorrência; provar ausência de sessões/tasks órfãs e nenhuma espera adicional de 10s antes da resposta. |
| W3-TD-06 / retry real | Nos cenários pipeline existentes de lease, retry e cancelamento, provar timeout transitório após lease liberada quando o DB está disponível, nova tentativa segundo política atual e DLQ/alerta existente na exaustão. Provar cancelamento externo sem falso sucesso/ack e recuperação por lease/VT quando a liberação falhar. |
| Configuração inválida | Defaults iguais à tabela; override válido conduzido até consumidores; inválidos da seção de validação falham explicitamente. Redução de prazo em teste não altera defaults nem env externa. |

Comandos previstos para o verificador, após implementação:

```text
uv run --directory runtime pytest tests/unit/test_turn_time_limit.py tests/unit/test_agent_llm_closes_after_the_turn.py tests/unit/test_healthz_reuses_one_connection.py tests/unit/test_listener_connects_in_one_guarded_place.py -q
uv run --directory runtime ruff check .
uv run --directory runtime lint-imports
```

Somente o guardião DB, com identidade/sentinela do descartável novamente comprovadas e sem outro operador, executa `uv run --directory runtime pytest tests/db/test_startup_rls_guard.py tests/db/test_database_time_limits.py tests/db/test_server.py -q` e os node IDs pertinentes de `tests/pipeline/test_scenarios_a.py`, `test_scenarios_b.py`, `test_scenarios_c.py`, `test_engine_loop.py`, `test_composition.py` e `test_runtime_process.py`. Coletar os node IDs reais antes do gate e registrar quais cobrem lease/retry/cancelamento; não declarar cobertura apenas pelo nome do arquivo.

Registrar RED/GREEN, incluindo prova de que retirar o envelope deixa os testes falharem, e revisões Spec PASS/Quality APPROVED. Mock de conexão não substitui cancelamento DB real; nenhuma exceção escondida, skip por falha ou repetição até passar. A Task 8 só conclui com os gates e a revisão independente, não com este aceite.

## Limites do registro e rollback

Esta entrega cria somente este documento. Não altera código, plano, checklist, migrations, env ou dados; não executa Docker, banco, rede, commit, push, merge ou deploy. Nenhuma latência, valor implantado, cadência efetiva ou capacidade de drenagem foi inventada. Ausência de p95/p99 permanece uma lacuna de calibração operacional, sem desfazer a aprovação explícita desta baseline inicial.

Rollback documental: nova decisão versionada cita o ID substituído, novo aceite e data. Para a implementação futura, reverter código e configuração juntos; não há `ALTER ROLE` a compensar nesta estratégia. Revisões de valores dependem de evidência e novo registro, preservando o histórico do aceite de 2026-09-14.
