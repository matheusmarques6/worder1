# 2026-10-15-01 · Spans de domínio com Logfire e spans por chamada LLM e por ferramenta

Plano de implementação IA, M0 passo 4.

## O que mudou

1. `span()` passa a gravar quando o Logfire está ligado, mesmo sem
   `OTEL_EXPORTER_OTLP_ENDPOINT`.
2. Cada chamada de modelo (resposta do agente, Juiz 1, embedding) abre um span
   `llm_call`, filho do span do turno.
3. Cada execução de ferramenta abre um span `tool_call`, filho do turno.

## Por quê

O relatório de estado de 15/10/2026 encontrou que, em produção, o Logfire
recebia apenas os spans automáticos de httpx e psycopg. Os spans de domínio
(`coalesce_pass`, `turn`, `mission_touch`, `send`) existiam no código, mas
eram no-op: `obs/telemetry.py` só preenchia o tracer (`_tracer`) dentro de
`configure_telemetry`, e essa função só faz algo quando
`OTEL_EXPORTER_OTLP_ENDPOINT` está definido. O `render.yaml` define apenas
`AGENTS_LOGFIRE_TOKEN`. `configure_logfire` instala um `TracerProvider`
global (via `logfire.configure`), mas nada o ligava ao `_tracer` do módulo.

Sem os spans de domínio, um turno no Logfire aparece como uma sequência de
requisições HTTP e queries soltas, sem o `organization_id`,
`conversation_id`, `mission_version_id` e `outcome` que a lista
`SAFE_ATTRIBUTES` existe para carregar. E não havia span algum por chamada de
LLM ou por ferramenta, então latência e proporção de custo por finalidade só
existiam no Postgres.

## Como

### `obs/telemetry.py`

Nova função `adopt_global_tracer(service_name)`. Se `_tracer` ainda é nulo e
o `TracerProvider` global **não** é o `ProxyTracerProvider` padrão do SDK,
ela faz `_tracer = trace.get_tracer(service_name)` e devolve `True`.
Recusa em três casos, todos devolvendo `False`:

- já existe tracer (endpoint OTLP explícito continua mandando);
- o SDK OTel não está instalado;
- o provider global ainda é o proxy (ninguém configurou nada): adotar esse
  provider criaria spans não gravados e custo de atributos por nada.

Nada muda em `span()` e `annotate()`: o cinto de PII (`SAFE_ATTRIBUTES`)
continua filtrando todo atributo antes de chegar a qualquer exporter.

### `__main__.py`

Em `main()`, depois de `configure_logfire()` devolver instrumentações,
chama-se `adopt_global_tracer()`. A linha de log "logfire ligado" ganha o
campo `domain_spans` (verdadeiro quando a adoção aconteceu), para o deploy
confirmar sem abrir o Logfire.

### `agent_core/metering.py`

`MeteredLlm.chat` e `MeteredLlm.embed` envolvem a chamada ao adapter em
`span("llm_call", kind=<finalidade>, model=<modelo pedido>)` e, ao voltar,
anotam `provider` e `model` com o que foi de fato cobrado. `kind` recebe a
finalidade (`agent_reply`, `judge_pre`, `embedding`, e no futuro `stt`,
`copilot`, `playground`). Mensagens, prompt e resposta não entram: o
vocabulário permitido não tem chave para eles.

### `tools/base.py`

`run_tool` envolve a execução da ferramenta em `span("tool_call",
kind=<nome da tool>)` e anota `outcome` como `ok` ou `failed`. Os argumentos
(que podem conter texto do cliente) e a saída ficam só em
`internal.tool_calls`, como antes.

### Contratos de arquitetura

`agent_core` e `tools` já podiam importar `obs` (o import-linter só proíbe
`channels` e `psycopg` fora de `repository/`). Nenhum contrato foi alterado.

## Testes

- `tests/unit/test_obs.py::TestAdoptGlobalTracer`: recusa com o proxy, adota
  um `TracerProvider` real e grava `turn` com só os atributos do vocabulário,
  e não sobrescreve um tracer explícito.
- `tests/unit/test_llm_metering.py::TestTheSpanPerCall`: um `chat` abre um
  span `llm_call` com `kind` e sem conteúdo.

## Como verificar em produção

Após o deploy, a primeira linha de log do processo deve trazer
`"logfire ligado" … "domain_spans": true`. No Logfire, um turno aparece como
`turn` → `llm_call` (agent_reply) → `llm_call` (judge_pre) → `send`, com
`organization_id` e `conversation_id` no `turn`.

## Alternativa descartada

Definir `OTEL_EXPORTER_OTLP_ENDPOINT` apontando para o endpoint OTLP do
Logfire no `render.yaml`. Funciona, mas cria dois providers no mesmo processo
(o do Logfire e o do `configure_telemetry`), com duas filas de export e dois
conjuntos de credenciais para manter. Adotar o provider já configurado é
mais simples e mantém um único caminho de saída.
