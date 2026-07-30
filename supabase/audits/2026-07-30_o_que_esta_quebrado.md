# O que está quebrado hoje, e a ordem para consertar

Resultado de `2026-07-30_bloco2_pendentes.sql` no banco de produção, em
30/07/2026:

```
75 aplicadas / 28 parciais / 12 nao aplicadas   (de 115 arquivos com objeto verificavel)
```

Uma lista de 40 migrations pendentes não diz o que fazer. O que decide a
ordem é outra coisa: **quais objetos ausentes o código realmente chama.**
Cruzando as duas listas, sobram **33 objetos referenciados em `src/` que
não existem no banco.**

O resto das ausências é quase todo índice — afeta desempenho, não
correção. Fica no fim.

---

## 1. Falhando em intervalo fixo, agora

Estes são chamados por cron. Não é risco futuro: está acontecendo desde
que o cron existe.

| objeto ausente | quem chama | frequência | migration |
|---|---|---|---|
| `webhook_deliveries` (tabela) | `cron/webhook-deliveries-sweeper` | **a cada 5 min** | `20260419_webhook_deliveries.sql` |
| `claim_webhook_delivery`, `dispatch_insert_deliveries` | `workers/webhook-delivery`, `lib/webhooks/outbound-dispatcher` | por entrega | `20260419_webhook_rpcs.sql` |
| `browse_abandoned_emissions` (tabela) | `cron/browse-abandoned` | a cada 15 min | `20260419_browse_abandoned_emissions.sql` |
| `detect_browse_abandoned` (função) | idem | a cada 15 min | `20260419_browse_abandoned_rpc.sql` |
| `segment_memberships_snapshot` (tabela) | `cron/detect-segment-changes` | a cada 15 min | `20260415_segment_snapshots.sql` |
| `lgpd_retention_policies` (tabela) | `cron/lgpd-retention` | diário, 03:00 | `20260415_lgpd_lists_stripe.sql` |
| `emit_date_events` (função) | `cron/check-dates` | diário, 00:01 | `20260110_orders_and_extra_triggers.sql` |

O sweeper de webhooks roda **288 vezes por dia** contra uma tabela que
não existe. Vale olhar os logs de função da Vercel antes de qualquer
coisa — se estiverem cheios de 42P01, é isto.

## 2. Silenciosamente perdendo dado

Não quebram tela: falham no meio de um fluxo de escrita e o dado não é
gravado. São os piores de diagnosticar depois.

| objeto ausente | efeito | migration |
|---|---|---|
| `increment_campaign_opens`, `increment_campaign_clicks` | **toda abertura e todo clique de e-mail** deixam de ser contados — `api/t/o/[id]`, `api/t/c/[id]`, `webhooks/resend` | `20260415_event_unification_and_indexes.sql` |
| `increment_contact_events`, `increment_contact_revenue` | tracking de evento e de receita por contato | idem |
| `contact_purchases`, `contact_sessions` (tabelas) | timeline do contato e tracking da Shopify | `shopify-enrichment.sql` |
| `claim_automation_run`, `heartbeat_automation_run`, `release_automation_run` | lock de execução de automação: sem eles não há proteção contra execução duplicada | `20260415_automation_workers_lock.sql` |

O caso das métricas de e-mail é o mais caro: os números do painel estão
errados desde que a migration não rodou, e não há como recuperar o
histórico depois.

## 3. Funcionalidade que não existe

A tela abre e erra, ou vem vazia. Impacto limitado a quem usa.

| área | tabelas ausentes | migration |
|---|---|---|
| CRM avançado: NPS, SLA, lead scoring, templates de chat | `chat_templates`, `crm_analytics_cache`, `lead_distribution_rules`, `lead_scores`, `nps_responses`, `nps_surveys`, `sla_configs`, `sla_metrics` | `20260307_crm_advanced_features.sql` |
| Instagram Direct | `instagram_contacts`, `instagram_messages`, `instagram_quick_replies` | `20260225_instagram_direct.sql` |
| Distribuição de leads | `lead_distribution_logs` | `20260307_lead_distribution_logs.sql` |
| Orçamento de IA | `ai_budgets`, `ai_monthly_cost_usd` | `20260616_ai_budgets.sql` |
| Histórico de qualidade WhatsApp | `whatsapp_quality_history`, `save_quality_history` | `whatsapp-quality-history.sql` |
| Versões de template de e-mail | `email_template_versions` | `2026_06_22_email_template_versions.sql` |
| Central de ajuda | `help_articles` | `PARTE2_help_e_outras_tabelas.sql` |

## 4. Índices

O grosso das 28 parciais. Nenhum quebra funcionalidade; alguns cobrem
consulta de listagem e vão pesar conforme o volume cresce.

Vale registrar **por que faltam**, porque não é o que parece: são todos
`CREATE INDEX IF NOT EXISTS`, sem `CONCURRENTLY`. Não falhariam por já
existir nem por estar dentro de transação. A explicação que sobra é que
a migration abortou antes de chegar neles — índice costuma ficar no fim
do arquivo, depois das tabelas e funções. Isso é consistente com o
padrão geral: **28 parciais é assinatura de script que morre no meio, não
de 28 acidentes independentes.**

Um caso confirma: `idx_audit_logs_org_action` falta nas duas migrations
que tentam criá-lo, e ele indexa `(organization_id, action, created_at)`.
A `20260420_audit_logs_defensive.sql` adiciona `created_at` e
`organization_id` com `ADD COLUMN IF NOT EXISTS`, mas **não** adiciona
`action` — sinal de que `audit_logs` já existia com outro formato. Se a
coluna `action` não existir, o `CREATE INDEX` levanta 42703 e o
`IF NOT EXISTS` não protege, porque o que falta é a coluna, não o índice.

Confirme antes de tentar recriar:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='audit_logs'
ORDER BY ordinal_position;
```

---

## Ordem sugerida

Uma migration por vez, verificando entre elas. Não em lote: várias delas
já abortaram no meio uma vez, e rodar dez de uma vez esconde qual morreu.

1. `20260419_webhook_deliveries.sql` + `20260419_webhook_rpcs.sql` — para o cron de 5 em 5 minutos
2. `20260415_event_unification_and_indexes.sql` — para a perda de métrica de e-mail
3. `20260415_automation_workers_lock.sql` — lock de automação
4. `20260419_browse_abandoned_emissions.sql` + `_rpc.sql`, `20260415_segment_snapshots.sql` — crons de 15 min
5. `20260415_lgpd_lists_stripe.sql`, `20260110_orders_and_extra_triggers.sql` — crons diários
6. O grupo 3, conforme a área for usada
7. Índices, por último

Depois de cada uma, rode `2026-07-30_bloco2_pendentes.sql` de novo: ela
some da lista se aplicou inteira, ou aparece como `PARCIAL` com o que
ficou faltando — que é como se descobre onde o script morreu.

## Ressalvas

- **Nada disto foi executado ou testado.** São arquivos originais do
  repositório, não escritos nesta auditoria. Não sei se rodam limpo no
  estado atual do banco.
- Várias já rodaram parcialmente. Rodar de novo pode dar erro de objeto
  duplicado onde faltar `IF NOT EXISTS`. Leia o arquivo antes.
- `PARCIAL` tem duas causas com ações opostas: script que abortou no
  meio, ou objeto removido de propósito por migration posterior. A lista
  acima só considerou o que o código chama, então esses casos estão
  filtrados — mas confirme abrindo o arquivo antes de rodar.
- Não rode `PARTE3_rls_e_dados.sql`. Ele liga RLS sem policy;
  `2026-07-30_aplicar_faltantes.sql` faz o que ele pretendia sem quebrar.
