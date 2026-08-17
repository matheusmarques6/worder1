# Observabilidade do Worder — Plano V3 (ADR-Obs-3)

**Versão:** 3.0 · **Data:** 2026-08-17 · **Substitui:** ADR-Obs-2 (`runtime/docs/observabilidade-e-monitoramento.md` v2.0)
**Status:** proposto — aguarda execução da Fase 1

**O que muda em relação ao v2.0:** o v2.0 desenhou a observabilidade *do runtime Python*
e assumiu o hub como coadjuvante. A medição do repositório (§1) mostra que o hub é o maior
produtor de telemetria do sistema por uma ordem de grandeza, e que ele tem **zero**
instrumentação. Três consequências: o Alloy sai do desenho (§3), a amostragem vira
requisito do dia 1 e não otimização futura (§2), e o Grafana passa a ser explicitamente
o **hub de agregação** — não mais um segundo backend em paralelo ao Logfire (§4).

---

## 1. Estado real, medido

Números levantados no código em 2026-08-17, não estimados.

| Componente | Onde roda | Superfície | Observabilidade hoje |
|---|---|---|---|
| **Hub** (`src/`) | Vercel | **513** rotas de API, **35** crons | **nenhuma** |
| **Runtime IA** (`runtime/`) | Render (Docker) | processo asyncio único | Logfire + spans OTel, ligado por token |
| **Worker** (`worker/campaign-worker.ts`) | Docker | worker de campanha | nenhuma |
| **Edge functions** | Supabase | ingestão | logs nativos do Supabase |

### 1.1 O que já está pronto e é bom

O módulo `runtime/src/agents_runtime/obs/` é sólido e não deve ser mexido:

- `logfire_setup.py` — Logfire ligado só com `AGENTS_LOGFIRE_TOKEN`; sem token, custo e
  import zero. Três linhas de defesa de PII documentadas.
- `telemetry.py` — `SAFE_ATTRIBUTES`, um **vocabulário fechado** de atributos de domínio.
  Atributo fora da lista é descartado antes de qualquer exporter. Este é o padrão que o
  hub deve copiar, não reinventar.
- `carrier.py` + migration `supabase/migrations/20260813000012_otel_carrier.sql` — o
  `traceparent` W3C atravessa o Postgres pela coluna `internal.message_outbox.otel` e pelo
  parâmetro `p_otel` das RPCs. Distinção correta entre retomar como `parent` (turno→envio,
  mesmo trace) e como `link` (coalescer→turnos, fan-out não vira trace-monstro).

### 1.2 As quatro lacunas

1. **O hub não tem instrumentação.** Sem `instrumentation.ts`, sem dependência OTel ou
   Sentry no `package.json`. 513 rotas invisíveis.
2. **O logger existe e ninguém usa.** `src/lib/logger.ts` é um logger estruturado
   competente (nível, escopo, saída JSON via `LOG_FORMAT=json`) com **0 imports** no
   projeto. Contra ele: **2.655** `console.*` em **503** arquivos — **1.574** só em
   `src/app/api`. Sem `trace_id`, sem `organization_id`, sem correlação.
3. **O trace morre na fronteira.** A tubulação do carrier está pronta dos dois lados, mas o
   hub passa `p_otel: null` (`src/lib/automation/node-executors.ts:1823`). O trace que
   nasce numa rota do hub não continua no runtime Python. Fechar essa costura é a maior
   relação valor/esforço do repositório inteiro.
4. **A metade Grafana do v2.0 nunca foi construída.** Não existe config de Alloy em lugar
   nenhum; o `render.yaml` declara `AGENTS_LOGFIRE_TOKEN` mas nenhum `OTEL_EXPORTER_OTLP_*`.
   O `vercel.json` já exclui um diretório `observability/` do gatilho de build — o caminho
   foi reservado e nunca ocupado.

---

## 2. Volume e custo — o número que decide a arquitetura

Contagem exata dos 35 crons do `vercel.json`:

| Cadência | Nº de crons | Invocações/dia |
|---|---|---|
| `* * * * *` (a cada minuto) | 11 | 15.840 |
| `*/2` | 2 | 1.440 |
| `*/5` | 1 | 288 |
| `*/10` | 4 | 576 |
| `*/15` | 5 | 480 |
| `*/30` | 2 | 96 |
| diária / `0 */23` | 10 | 10 |
| **Total** | **35** | **≈ 18.730/dia ≈ 562 mil/mês** |

A 15–20 spans por execução (rota + queries Supabase + chamadas HTTP externas), isso é
**8 a 12 milhões de spans/mês vindos só de cron**, antes de um único request de usuário.

O v2.0 estimou "~2M spans/mês, MVP R$ 0" — essa estimativa era do runtime. Para o hub ela
está errada por ~5x. **Consequências que viram regra:**

- **Amostragem no commit 1, não depois.** Cron no caminho feliz a ~5%; erro, exceção e
  span lento a 100%. A decisão fica em código (§5.4) porque não há Collector para tomá-la.
- **Cron que não fez nada não gera trace.** Onze crons rodam a cada minuto e a maioria das
  execuções não encontra trabalho. Uma execução vazia emite **um** span de resultado, não
  a árvore inteira. Isso sozinho corta a maior parte do volume.
- **`span_name` de baixa cardinalidade.** Nome é o template da rota (`POST /api/crm/deals`),
  nunca a URL com ID. IDs vão em atributo. Vale para os dois backends.

---

## 3. Por que o Alloy sai do desenho

O v2.0 põe o Grafana Alloy como sidecar que faz batch, retry, redação de PII e roteamento.
A ideia é correta em geral e **inaplicável aqui**, nos dois maiores produtores:

- **Hub:** Vercel é serverless. Não existe sidecar. Caminho sancionado pela própria doc da
  Grafana nesse caso: SDK direto ao gateway OTLP.
- **Runtime:** é um Render web service de container único (`render.yaml`). Um Alloy ali
  seria um segundo serviço pago, para intermediar um processo só.

O que sobra é **SDK direto para todo mundo** — legítimo, mas com uma consequência que
precisa estar escrita: a redação de PII e a amostragem que o v2.0 delegava ao Alloy
**voltam para o código**. No runtime isso já está resolvido (`SAFE_ATTRIBUTES`). No hub é
trabalho da Fase 1 (§5.2).

O Alloy volta ao desenho no dia em que o runtime sair do Render para uma VPS com compose.
Até lá, custo de operar um sidecar sem ganho.

---

## 4. A arquitetura: Grafana Cloud como hub de agregação

**Princípio.** Cada ferramenta continua fazendo aquilo em que é insubstituível. O
**resultado** de cada uma aparece num único painel. O Grafana é escolhido não por ser o
melhor em alguma categoria, mas por ser o único desenhado para ler os bancos dos outros —
é a função original do produto.

```
                            ┌──────────────────────────────┐
                            │      GRAFANA CLOUD (hub)     │
                            │  dashboards · alerting · IRM │
                            └──────────────────────────────┘
        armazena o que é dele  ▲        ▲  lê o que é dos outros
    ┌──────────────────────────┘        └──────────────────────────┐
    │                                                              │
 Mimir (métricas)                                    datasource Postgres
 Loki  (logs)                                          → Supabase direto
 Tempo (traces)                                      datasource Sentry
    ▲                                                  → issues agrupados
    │ OTLP                                            datasource Infinity
    │                                                   → Logfire Query API
 ┌──┴────────────┬──────────────────┬─────────────────┐
 │               │                  │                 │
HUB           RUNTIME IA          WORKER          LOG DRAIN
Next.js       Python              Node            da Vercel
@vercel/otel  OTLP duplo ─────► LOGFIRE (nativo, SDK)
```

### 4.1 Divisão de responsabilidades

| Pergunta | Onde ela é respondida | Como aparece no hub |
|---|---|---|
| "A fila tem quantos itens? O outbox travou?" | **Supabase Postgres** | datasource Postgres — SQL direto, **sem instrumentação** |
| "O que quebrou, desde qual deploy, afetando quem?" | **Sentry** | datasource Sentry — painel de top issues |
| "O que aconteceu dentro desta conversa de IA? Custo?" | **Logfire** | datasource Infinity → Query API |
| "Latência p95 por rota, throughput, saúde geral" | **Mimir/Tempo** | nativo |
| "Quem acorda às 3h da manhã?" | **Grafana IRM** | escalation chain → n8n → WhatsApp |
| "Os 35 crons estão vivos?" | **Heartbeat do IRM** | ausência de ping abre incidente |
| "O site está de pé, visto de fora?" | **Grafana Synthetics** | sondas de ≥2 regiões |

### 4.2 O limite honesto deste desenho

O hub unifica **saber e ser avisado**. Não unifica **investigar**.

O painel mostra "23 erros novos em `deals/route.ts` desde o deploy das 14h" e "custo de LLM
3x acima da média das últimas 24h". Para o stack trace com source map, ou para ler a
conversa do agente turno a turno, o clique leva ao Sentry ou ao Logfire. Isso é o desenho
correto: o hub existe para que ninguém precise *procurar* em três lugares — não para
substituir a ferramenta especialista quando a investigação começa.

### 4.3 Por que não colapsar em uma ferramenta só

- **Só Logfire:** sem plantão, sem heartbeat, sem sondas externas, retenção de 30 dias, e
  a DX boa dele só existe em Python — no hub seria OTel cru do mesmo jeito. Os ~10M
  spans/mês de cron viram custo direto.
- **Só Grafana:** erro de produção vira linha de log. Sem agrupamento, sem stack trace
  legível, sem "primeira vez vista no deploy X". Debugar 513 rotas assim é caro.
- **Só Sentry:** ótimo em erro e cron check-in, fraco como painel de métrica de negócio, e
  não lê o Postgres nem o Logfire.

---

## 5. Fases

### Fase 0 — Painel operacional sem escrever código *(dias, não semanas)*

A fase de maior retorno e menor risco, e ela **não depende de nenhuma instrumentação**.

1. Conta Grafana Cloud; datasource **Postgres** apontando ao Supabase com um role
   **read-only dedicado** (nunca o `service_role`), restrito às tabelas de operação.
2. Dashboard "Operação Worder" em SQL puro: profundidade de fila e outbox, mensagens
   WhatsApp por estado, campanhas agendadas vs. enviadas, jobs em DLQ, idade do item mais
   velho de cada fila.
3. Alertas sobre esses mesmos SELECTs (fila acima de N, item mais velho que M minutos,
   DLQ crescendo) → IRM → n8n → WhatsApp.
4. **Synthetics** contra o hub, `/healthz` do runtime e a edge function de ingestão.

Critério de pronto: derrubar o runtime em staging e o WhatsApp tocar em menos de 3 minutos.

### Fase 1 — Instrumentação do hub *(o grosso do trabalho, agnóstica de destino)*

Tudo aqui é OpenTelemetry padrão. O destino é variável de ambiente.

**5.1 `instrumentation.ts`** na raiz, com `@vercel/otel` — é o pacote oficial da Vercel e
resolve o problema real de serverless: o flush antes do congelamento da função. Sem ele,
export em batch perde spans silenciosamente.

**5.2 `src/lib/observability/` — o módulo compartilhado.** Espelha o
`runtime/src/agents_runtime/obs/` para que os dois sistemas falem o mesmo vocabulário:

- `attributes.ts` — vocabulário fechado, mesma disciplina do `SAFE_ATTRIBUTES` do Python.
  Nomes canônicos: `organization_id`, `conversation_id`, `contact_id`, `queue`, `outcome`,
  `channel`, `provider`, `event_type`. Atributo fora da lista é descartado, não enviado.
- `withObs.ts` — wrapper de route handler. Dá span com nome de baixa cardinalidade,
  `trace_id`, captura de exceção e atributos de tenant sem que cada rota saiba de OTel.
- `withCron.ts` — o mesmo para cron, mais o check-in de heartbeat e a regra "execução
  vazia emite um span, não uma árvore".

**5.3 Fechar a costura do trace.** O hub passa a escrever o carrier W3C em `p_otel`, no
lugar do `null` de `node-executors.ts:1823` e nos demais pontos de enfileiramento. A partir
daí um evento nascido numa rota do hub é **um único trace** até o envio pelo runtime
Python — visível no Tempo e no Logfire ao mesmo tempo.

**5.4 Amostragem** conforme §2, no `instrumentation.ts`.

**5.5 Adoção do `logger.ts`.** Não é um sweep de 503 arquivos. É: (a) o `logger.ts` passa a
carregar `trace_id` e `organization_id` do contexto OTel automaticamente; (b) as rotas
tocadas pela Fase 1 migram; (c) regra de ESLint `no-console` em `src/app/api` como aviso,
virando erro depois. Os 2.655 restantes morrem por atrito, não por mutirão.

### Fase 2 — Erros e crons no Sentry

`@sentry/nextjs` no hub. Ele coexiste com o OTel — não é um segundo tracer competindo.
**Sentry Crons** nos 35 jobs: um cron morto passa a ser detectado pela *ausência* do
check-in. Datasource Sentry ligado no Grafana para o painel de issues.

### Fase 3 — Fechar o hub

Export OTLP duplo no runtime (`OTEL_EXPORTER_OTLP_ENDPOINT` no `render.yaml` — o SDK do
Logfire **adiciona** exporters, não substitui). Datasource Infinity → Query API do Logfire.
Log Drain da Vercel → Loki. Worker Node instrumentado. Dashboard único consolidado.

---

## 6. Regras que não se negociam

1. **Telemetria nunca derruba negócio.** Falha de export é log local. O padrão do
   `logfire_setup.py` — `try/except` em volta de cada instrumentação — vale no hub.
2. **PII não sai do Postgres.** Vocabulário fechado de atributos, nos dois sistemas.
   Conteúdo de mensagem, nome e telefone ficam no banco. O scrubbing do vendor é a última
   linha, nunca a primeira.
3. **`service.name` + `deployment.environment` + `service.version` em tudo.** Sem os três,
   os dados dos backends não correlacionam entre si nem com deploys.
4. **Cardinalidade:** `organization_id` como rótulo de métrica é aceitável;
   `conversation_id` e `contact_id` **nunca** — explodem séries. Esses são atributo de span.
5. **Alerta sem runbook é ruído.** Todo alerta crítico aponta para o que olhar e onde.
6. **Observar o observador.** Se o exporter começar a enfileirar ou falhar, isso alerta —
   senão o hub degrada em silêncio e ninguém percebe.

---

## 7. A verificar antes de contratar

Preços e limites de free tier de 2026 mudaram nos três produtos e **não foram verificados
contra as páginas oficiais** na elaboração deste documento. Confirmar antes de qualquer
compromisso:

- Limites do free tier do Grafana Cloud (séries de métrica, GB de log, execuções de
  Synthetics, se o IRM está incluso).
- Se o Log Drain da Vercel entrega direto no Loki ou exige adaptador.
- Preço/retenção do Logfire (o relatório de base cita US$ 2/milhão e 30 dias a partir de
  1/1/2026) e do Sentry para o volume de erro esperado.
- Se o datasource oficial do Sentry no Grafana cobre a versão de API do plano contratado.

O volume de §2 é o insumo dessas conversas — leve o número, não a intuição.
