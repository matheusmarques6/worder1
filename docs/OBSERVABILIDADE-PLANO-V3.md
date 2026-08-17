# Observabilidade do Worder — Plano V3 (ADR-Obs-3)

**Versão:** 3.1 · **Data:** 2026-08-17 · **Substitui:** ADR-Obs-2 (`runtime/docs/observabilidade-e-monitoramento.md` v2.0)
**Status:** proposto — aguarda decisão de §7.1 antes da execução

---

## 0. Changelog

**v3.0 → v3.1** — revisão após verificação das premissas de fornecedor contra fontes
públicas (§9). Cinco correções, todas restritivas:

| # | O que a v3.0 assumiu | O que se verificou | Efeito |
|---|---|---|---|
| 1 | Retenção do free tier do Grafana ≈ 30 dias | **14 dias**, em todo tipo de telemetria; 3 usuários | §7.1 vira decisão bloqueante; nasce o rollup no Postgres (§5.1.4) |
| 2 | Logfire alimenta o hub por datasource, inclusive alertas | Infinity **não alerta** sem parser de backend e **não foi desenhado pra volume** | Rebaixado a painel de leitura; alerta de LLM fica no Logfire (§4.2) |
| 3 | Log Drain da Vercel → Loki é configuração | Drains são **Pro/Enterprise** e **não há caminho direto pro Loki** — exige adaptador HTTP próprio | Sai da Fase 3, vira condicional (§5.4) |
| 4 | Sentry instrumenta os 35 crons automaticamente | `automaticVercelMonitors` **não suporta App Router**; o substituto é `_experimental` | Check-in manual no `withCron.ts` (§5.2.3) |
| 5 | Fase 0 lê o Postgres sem ressalva | Grafana **não valida a segurança da query**; dashboard é carga no banco de produção | Salvaguardas viram critério de pronto (§5.1.2) |

Além disso, a v3.1 registra o que a v3.0 omitia: o padrão proposto é reconhecido na
literatura como anti-pattern quando mal-entendido (§4.4), e não existe dono de plantão
definido (§7.2).

**v2.0 → v3.0** — o v2.0 desenhou a observabilidade *do runtime Python* e tratou o hub
como coadjuvante. A medição (§1) mostra o inverso: o hub é o maior produtor de telemetria
do sistema por uma ordem de grandeza e tem **zero** instrumentação. Daí: o Alloy sai do
desenho (§3), a amostragem vira requisito do dia 1 (§2), e o Grafana passa a ser
explicitamente o **hub de agregação**, não um segundo backend em paralelo (§4).

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
  span lento a 100%. A decisão fica em código (§5.2.4) porque não há Collector para tomá-la.
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
trabalho da Fase 1 (§5.2.2).

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
 Mimir (métricas)                              datasource Postgres  ◄── 1ª classe
 Loki  (logs)                                    → Supabase direto
 Tempo (traces)                                datasource Sentry    ◄── 1ª classe
    ▲                                            → issues agrupados
    │ OTLP                                      datasource Infinity ◄── só leitura
    │                                             → Logfire Query API
 ┌──┴────────────┬──────────────────┬─────────────────┐
 │               │                  │                 │
HUB           RUNTIME IA          WORKER          (Log Drain da Vercel
Next.js       Python              Node             fica fora — ver §5.4)
@vercel/otel  OTLP duplo ─────► LOGFIRE (nativo, SDK)
```

### 4.1 Divisão de responsabilidades

| Pergunta | Onde é respondida | Como aparece no hub |
|---|---|---|
| "A fila tem quantos itens? O outbox travou?" | **Supabase Postgres** | datasource Postgres — SQL direto, **sem instrumentação** |
| "O que quebrou, desde qual deploy, afetando quem?" | **Sentry** | datasource Sentry — painel de top issues |
| "O que aconteceu dentro desta conversa de IA? Custo?" | **Logfire** | datasource Infinity — **leitura apenas** (§4.2) |
| "Latência p95 por rota, throughput, saúde geral" | **Mimir/Tempo** | nativo |
| "Quem acorda às 3h da manhã?" | **Grafana IRM** | escalation chain → n8n → WhatsApp |
| "Os 35 crons estão vivos?" | **Sentry Crons** (check-in manual) | datasource Sentry |
| "O site está de pé, visto de fora?" | **Grafana Synthetics** | sondas de ≥2 regiões |

### 4.2 Qualidade de cada ponte — verificado, não presumido

**Sentry → Grafana: 1ª classe.** Plugin oficial com backend em Go, ativamente mantido
(v2.2.6, ago/2026). Limitação conhecida: lista só os 100 primeiros projetos da organização
— irrelevante nesta escala. A Canva mantém um fork em produção, o que confirma uso real.

**Postgres → Grafana: 1ª classe.** Datasource de núcleo. As ressalvas são operacionais
(§5.1.2), não de maturidade.

**Logfire → Grafana: leitura apenas.** O datasource Infinity tem três limites que impedem
tratá-lo como fonte de alerta:

- alerta só funciona com parser de *backend* (JSONata/JQ) e exige retorno em série numérica;
- paginação limitada a 5 páginas por padrão;
- a documentação declara que não foi desenhado para volume — acima de ~5 chamadas de API
  ou ~10 mil registros o impacto de performance é sério.

**Decisão daí:** o painel de LLM no Grafana é para *ver*. **Alerta de custo de LLM e
veredito do Judge ficam no Logfire Alerts**, disparando para o **mesmo canal** (n8n →
WhatsApp). O que se unifica no incidente é o canal, não o motor de alerta — e isso é
suficiente, porque quem está de plantão recebe tudo no mesmo lugar de qualquer forma.

**Vercel → Grafana: fora do escopo por ora.** Ver §5.4.

### 4.3 O limite honesto deste desenho

O hub unifica **saber e ser avisado**. Não unifica **investigar**.

O painel mostra "23 erros novos em `deals/route.ts` desde o deploy das 14h" e "custo de LLM
3x acima da média das últimas 24h". Para o stack trace com source map, ou para ler a
conversa do agente turno a turno, o clique leva ao Sentry ou ao Logfire. Isso é o desenho
correto: o hub existe para que ninguém precise *procurar* em três lugares — não para
substituir a ferramenta especialista quando a investigação começa.

### 4.4 O que a literatura diz contra este desenho

"Single pane of glass" é listado como **anti-pattern de monitoramento** em *Practical
Monitoring* (O'Reilly) e criticado na literatura corrente com dois argumentos: o painel
único serve bem a um público estreito (SRE/plataforma) e **vira ele próprio um silo**; a
alternativa proposta é "observabilidade componível".

A crítica é válida e é **contra substituir as ferramentas pelo painel** — exatamente o que
o §4.3 recusa fazer. O outro lado do balanço: apenas ~7% das organizações operam de uma
plataforma unificada, 80%+ rodam duas ou mais, 59% apontam a falta de solução unificada
como principal carência não atendida, e a troca de contexto é estimada em +20–40% no tempo
de resolução de incidente.

**Registro da decisão:** adotamos o hub *ciente* do anti-pattern, com a mitigação escrita
em §4.3 como parte do contrato. O dia em que alguém propuser "vamos parar de usar o Sentry
porque já temos o painel", este parágrafo é a resposta.

### 4.5 Por que não colapsar em uma ferramenta só

- **Só Logfire:** sem plantão, sem heartbeat, sem sondas externas, retenção de 30 dias, e
  a DX boa dele só existe em Python — no hub seria OTel cru do mesmo jeito. Os ~10M
  spans/mês de cron viram custo direto. Reviews independentes confirmam: não indicado para
  time poliglota.
- **Só Grafana:** erro de produção vira linha de log. Sem agrupamento, sem stack trace
  legível, sem "primeira vez vista no deploy X". Debugar 513 rotas assim é caro.
- **Só Sentry:** ótimo em erro e cron check-in, fraco como painel de métrica de negócio, e
  não lê o Postgres nem o Logfire — ou seja, não serve como hub.

---

## 5. Fases

### 5.1 Fase 0 — Painel operacional sem escrever código *(dias, não semanas)*

A fase de maior retorno e menor risco, e ela **não depende de nenhuma instrumentação**.

**5.1.1 O painel.** Conta Grafana Cloud; datasource Postgres apontando ao Supabase.
Dashboard "Operação Worder" em SQL puro: profundidade de fila e outbox, mensagens WhatsApp
por estado, campanhas agendadas vs. enviadas, jobs em DLQ, idade do item mais velho de cada
fila. Alertas sobre os mesmos SELECTs → IRM → n8n → WhatsApp. Synthetics contra o hub, o
`/healthz` do runtime e a edge function de ingestão.

**5.1.2 Salvaguardas do banco — critério de pronto, não recomendação.** O Grafana não
valida a segurança da query: um dashboard é carga real no mesmo Postgres que serve o app.
Obrigatório antes do primeiro painel:

- role dedicado **read-only** (jamais `service_role`), com `GRANT SELECT` apenas nas
  tabelas de operação;
- `ALTER ROLE grafana_ro SET statement_timeout = '10s'` — um painel nunca segura conexão;
- toda query filtra por coluna de tempo **indexada**; sem índice, sem painel;
- auto-refresh mínimo de 60s (não 5s), e nenhum `count(*)` sem `WHERE` de tempo;
- conexão pelo **session pooler**, com pool pequeno (10–30), pela mesma razão de IPv4 já
  documentada no `render.yaml`.

**5.1.3 Um runbook por alerta.** Nenhum alerta entra em produção sem uma seção de runbook:
o que aconteceu, onde olhar, qual ação. Alerta sem runbook é ruído — e a v3.0 escrevia essa
regra sem criar um único runbook. A Fase 0 fecha com os seus 4–6 runbooks escritos.

**5.1.4 Rollup de retenção — a resposta ao free tier de 14 dias.** Uma tabela
`ops_metrics_daily` no próprio Supabase, preenchida por um cron diário, agrega os KPIs de
operação (volumes, taxas de erro, latências médias, custo) por dia e por organização. O
hub lê os 14 dias quentes da telemetria **e** o histórico longo do seu próprio banco, que
retém para sempre e não custa nada a mais. Isso resolve o post-mortem de três semanas
atrás sem depender de plano pago.

**Critério de pronto da fase:** derrubar o runtime em staging e o WhatsApp tocar em menos
de 3 minutos, com runbook aberto junto.

### 5.2 Fase 1 — Instrumentação do hub *(o grosso do trabalho, agnóstica de destino)*

Tudo aqui é OpenTelemetry padrão. O destino é variável de ambiente.

**5.2.1 `instrumentation.ts`** na raiz, com `@vercel/otel` — pacote oficial da Vercel,
resolve o problema real de serverless: o flush antes do congelamento da função. Sem ele,
export em batch perde spans silenciosamente.

**5.2.2 `src/lib/observability/` — o módulo compartilhado.** Espelha o
`runtime/src/agents_runtime/obs/` para que os dois sistemas falem o mesmo vocabulário:

- `attributes.ts` — vocabulário fechado, mesma disciplina do `SAFE_ATTRIBUTES` do Python.
  Nomes canônicos: `organization_id`, `conversation_id`, `contact_id`, `queue`, `outcome`,
  `channel`, `provider`, `event_type`. Atributo fora da lista é descartado, não enviado.
- `withObs.ts` — wrapper de route handler. Dá span com nome de baixa cardinalidade,
  `trace_id`, captura de exceção e atributos de tenant sem que cada rota saiba de OTel.

> **Aviso de cronograma.** "Wrapper de rota" é uma linha neste documento e **513 rotas** na
> prática. É aqui que planos como este morrem. A Fase 1 não se compromete com cobertura
> total: ela entrega o wrapper, aplica-o nas rotas de maior valor (crons, webhooks,
> caminho de envio) e deixa o resto para atrito contínuo.

**5.2.3 `withCron.ts` — check-in manual, sem depender de mágica.** O `automaticVercelMonitors`
do Sentry envolvia handlers em tempo de build e por isso **não suporta App Router** (nem
Turbopack) — e o worder1 é App Router inteiro. Existe desde fev/2026 um substituto baseado
em eventos de span, mas está marcado `_experimental`. **Decisão: check-in explícito no
wrapper.** Mais 3 linhas por cron, zero dependência de flag experimental. O wrapper também
implementa a regra "execução vazia emite um span, não uma árvore" (§2).

**5.2.4 Amostragem** conforme §2, no `instrumentation.ts`.

**5.2.5 Fechar a costura do trace.** O hub passa a escrever o carrier W3C em `p_otel`, no
lugar do `null` de `node-executors.ts:1823` e nos demais pontos de enfileiramento. A partir
daí, um evento nascido numa rota do hub é **um único trace** até o envio pelo runtime
Python — visível no Tempo e no Logfire ao mesmo tempo.

**5.2.6 Adoção do `logger.ts`.** Não é um sweep de 503 arquivos. É: (a) o `logger.ts` passa
a carregar `trace_id` e `organization_id` do contexto OTel automaticamente; (b) as rotas
tocadas pela Fase 1 migram; (c) regra de ESLint `no-console` em `src/app/api` como aviso,
virando erro depois. Os 2.655 restantes morrem por atrito, não por mutirão.

### 5.3 Fase 2 — Erros e crons no Sentry

`@sentry/nextjs` no hub, coexistindo com o OTel (não é um segundo tracer competindo).
Check-ins dos 35 crons via `withCron.ts` (§5.2.3). Datasource Sentry ligado no Grafana para
o painel de issues.

### 5.4 Fase 3 — Fechar o hub

- **Export OTLP duplo no runtime**: `OTEL_EXPORTER_OTLP_ENDPOINT` no `render.yaml` — o SDK
  do Logfire **adiciona** exporters, não substitui.
- **Datasource Infinity → Query API do Logfire**, como painel de leitura (§4.2).
- **Worker Node** instrumentado.
- **Log Drain da Vercel → Loki: condicional, não planejado.** Os Drains exigem plano
  Pro/Enterprise, o datasource oficial da Vercel é plugin Enterprise, e **não existe
  caminho direto para o Loki** — precisa de um adaptador HTTP próprio (há projetos
  community, nenhum oficial). Isso é um serviço a escrever e operar. Entra quando houver
  plano Pro **e** alguém para mantê-lo; até lá, os logs ficam na Vercel e a correlação
  acontece pelo `trace_id` nos traces.

---

## 6. Regras que não se negociam

1. **Telemetria nunca derruba negócio.** Falha de export é log local. O padrão do
   `logfire_setup.py` — `try/except` em volta de cada instrumentação — vale no hub.
2. **PII não sai do Postgres.** Vocabulário fechado de atributos, nos dois sistemas.
   Conteúdo de mensagem, nome e telefone ficam no banco. O scrubbing do vendor é a última
   linha, nunca a primeira.
3. **`service.name` + `deployment.environment` + `service.version` em tudo.** Sem os três,
   os dados dos backends não correlacionam entre si nem com deploys.
4. **Cardinalidade:** `organization_id` como rótulo de métrica é aceitável **até ~50
   organizações**; acima disso ele sai de rótulo de métrica e fica só em atributo de span,
   ou as 10 mil séries do free tier evaporam. `conversation_id` e `contact_id` **nunca**
   são rótulo de métrica.
5. **Alerta sem runbook não entra em produção** (§5.1.3).
6. **Observar o observador.** Se o exporter começar a enfileirar ou falhar, isso alerta —
   senão o hub degrada em silêncio e ninguém percebe.

---

## 7. Decisões em aberto — bloqueiam a execução

### 7.1 Retenção: pagar, ou aceitar 14 dias quentes + rollup próprio

O free tier do Grafana Cloud retém **14 dias** (todos os tipos) e permite **3 usuários** —
menos que os 30 dias do Logfire. O hub teria a janela mais curta de todas as fontes que
agrega. Três saídas:

| Opção | Custo | Consequência |
|---|---|---|
| **Free + rollup no Postgres** (§5.1.4) | R$ 0 | Telemetria bruta some em 14d; KPI de negócio vive para sempre no seu banco. Suficiente para 90% dos post-mortems |
| **Grafana pago** | mensalidade | Retenção maior de telemetria bruta e mais assentos |
| **Não usar Grafana como armazenamento** | R$ 0 | Grafana só como painel; tudo persiste nas fontes. Perde correlação nativa de traces |

**Recomendação:** free + rollup. É a única que não gasta dinheiro antes de existir dor, e o
rollup é útil de qualquer forma.

### 7.2 Quem olha e quem acorda

Este plano não define dono de plantão, e sem isso ele vira dashboard bonito. Se a resposta
hoje é "uma pessoa só", o desenho precisa ser calibrado para isso: **poucos alertas, alta
precisão, um canal**. É argumento a favor de parar na Fase 0 por um tempo e contra ligar os
três fornecedores de uma vez.

### 7.3 Nenhum precedente público deste arranjo exato

Há casos documentados de consolidação em Grafana Cloud (Jimdo) e de uso em produção da
ponte Sentry→Grafana (Canva). **Não foi encontrado relato público de alguém montando este
padrão específico** — Grafana lendo Sentry + Postgres de produção + API de plataforma de
LLM. As peças são todas documentadas e mantidas; a montagem é original. Isso não desaconselha
o plano, mas **proíbe estimar prazo por analogia**: cada ponte precisa de uma prova de
conceito antes de entrar no cronograma.

---

## 8. Riscos aceitos

1. **Três contas, três tokens.** Mitigado por: o canal de alerta é um só (n8n → WhatsApp), e
   a instrumentação é uma só (OTel).
2. **O hub pode virar silo** (§4.4). Mitigado pelo contrato do §4.3, escrito para ser citado.
3. **Fase 1 pode não terminar.** Aceito explicitamente: a cobertura das 513 rotas é
   incremental por desenho, não uma promessa de sprint.
4. **Preços e limites de fornecedor mudam.** Os números de §7.1 vêm de fontes de terceiros
   (§9), não das páginas oficiais — confirmar antes de qualquer compromisso contratual.

---

## 9. Fontes das verificações da v3.1

Consultadas em 2026-08-17. Onde a fonte oficial estava inacessível a partir do ambiente de
pesquisa, isso está marcado — e nesses casos o número deve ser reconfirmado antes de virar
compromisso.

**Limites e preço do Grafana Cloud** (páginas oficiais inacessíveis; fontes de terceiros):
- https://monitoringcost.com/grafana-cloud-pricing
- https://cubeapm.com/blog/grafana-cloud-pricing-and-review/
- https://www.cloudzero.com/blog/grafana-cloud-pricing/

**Datasource Sentry** (mantido, v2.2.6 em ago/2026; limite de 100 projetos):
- https://github.com/grafana/sentry-datasource — e `/releases`
- https://github.com/grafana/sentry-datasource/issues/31
- https://github.com/Canva/grafana-sentry-datasource (fork em produção)

**Datasource Infinity** (alerta só com parser de backend; paginação; volume):
- https://grafana.com/docs/plugins/yesoreyeram-infinity-datasource/latest/troubleshooting/
- https://github.com/grafana/grafana-infinity-datasource/discussions/601

**Datasource PostgreSQL** (Grafana não valida a segurança da query):
- https://grafana.com/docs/grafana/latest/datasources/postgres/configure/

**Vercel Drains / datasource Vercel** (Pro-Enterprise; sem caminho direto pro Loki):
- https://vercel.com/blog/introducing-vercel-drains
- https://grafana.com/docs/plugins/grafana-vercel-datasource/latest/
- https://github.com/dacbd/vercel-log-drain

**Sentry Crons e App Router** (`automaticVercelMonitors` não suporta App Router):
- https://github.com/getsentry/sentry-javascript/issues/19196
- https://docs.sentry.io/platforms/javascript/guides/nextjs/crons/

**"Single pane of glass" como anti-pattern, e o contra-argumento:**
- https://www.oreilly.com/library/view/practical-monitoring/9781491957349/ch01.html
- https://www.checklyhq.com/blog/broken-windows-why-the-single-pane-of-glass-is-imp/
- https://observability-360.beehiiv.com/p/beyond-single-pane-glass
- https://oneuptime.com/blog/post/2026-02-28-true-cost-of-observability-tool-sprawl/view

**Casos de consolidação** (material do fornecedor — tratar como direção, não medida):
- https://grafana.com/success/jimdo/
- https://grafana.com/observability-survey/2025/

**OpenTelemetry em Next.js/Vercel serverless:**
- https://signoz.io/blog/opentelemetry-nextjs-production/

**Logfire, avaliação independente:**
- https://www.gartner.com/reviews/product/pydantic-logfire
