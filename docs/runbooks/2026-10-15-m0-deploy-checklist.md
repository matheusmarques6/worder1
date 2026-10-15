# Checklist M0 · subir o runtime no Render e fechar o piloto

Plano de implementação IA (15/10/2026), passo 5. Complementa o runbook
`2026-09-17-piloto-runtime.md`, que continua sendo o caminho de deploy; este
arquivo lista o que mudou desde então e as decisões que só o operador pode
tomar. Itens `[GATE]` exigem uma pessoa.

## Estado encontrado em 15/10/2026 (leitura do banco de produção)

- `ai_runtime_rollout`: 1 org (`425db1ba…`) em `runtime`, cutover de 17/08.
- `internal.runtime_heartbeats`: processo `runtime-pc-piloto`, último beat
  25/09 13:38 UTC. O runtime está morto desde então; a org não recebe
  resposta de IA.
- `pgmq q_inbound_dlq`: 4 mensagens de 17/08, todas da mesma conversa
  `578d9e5b…`: três com `HTTP 401 User not found` (chave OpenRouter da org
  inválida naquele dia) e uma com `claude-haiku-4-5 is not a valid model ID`
  (slug do Juiz 1, já corrigido no código para `anthropic/claude-haiku-4.5`).
- `public.alerts`: 2 `critical_violation` abertos de 17/08 (Juiz 1 reprovou e
  nada foi enviado), sem reconhecimento.
- `public.ai_budgets`: não existia (migration `20261016000001` cria).

## 1. Migrations `[GATE]`

Aplicar na ordem, via Supabase CLI ou SQL editor:

- `supabase/migrations/20261016000001_ai_budgets.sql`
- `supabase/migrations/20261016000002_ai_eval_tables_in_chain.sql`

Verificação: `select to_regclass('public.ai_budgets')` não nulo. As duas são
idempotentes (`create … if not exists`) e não alteram colunas existentes.

## 2. Fila morta e alertas `[GATE]`

Não reprocessar: as 4 mensagens respondem a uma conversa de dois meses atrás.
Arquivar e fechar os alertas com motivo:

```sql
select pgmq.archive('q_inbound_dlq', array[1,2,3]::bigint[]);  -- ids 1..4
select pgmq.archive('q_inbound_dlq', array[4]::bigint[]);
update public.alerts
   set status = 'resolved', resolved_at = now()
 where status = 'open' and type = 'critical_violation'
   and created_at < '2026-09-01';
```

Antes disso, conferir no OpenRouter que a chave da org (`organization_api_keys`,
provider `openrouter`) está válida: o `401 User not found` da DLQ era dela.

## 3. Render Blueprint `[GATE]`

`render.yaml` mudou em 15/10: região `virginia` (mais perto de `sa-east-1`),
`AGENTS_WORKERS: "2"` explícito, e o comentário de que o token do Logfire já
basta para os spans de domínio. Segredos a preencher no Apply:

| Segredo | De onde |
|---|---|
| `SUPABASE_DB_URL` | session pooler, porta 5432 (nunca 6543) |
| `AGENTS_OPENROUTER_API_KEY` | chave da PLATAFORMA (Juiz 1 e embeddings) |
| `ENCRYPTION_KEY` | o mesmo da Vercel |
| `AGENTS_PREVIEW_TOKEN` | o mesmo da Vercel (`AGENTS_PREVIEW_TOKEN`) |
| `AGENTS_LOGFIRE_TOKEN` | projeto Logfire; vazio desliga |

Antes do Apply, rodar localmente com as mesmas variáveis:

```
cd runtime && uv run python scripts/piloto_check.py env
```

## 4. Prova pelo banco (sem gate)

```
cd runtime && uv run python scripts/piloto_check.py probe
```

Esperado: heartbeat com `process_name = agents-runtime-render` nos últimos
60 s. Apagar a linha antiga `runtime-pc-piloto` de
`internal.runtime_heartbeats` depois que a nova aparecer, para o `/healthz`
não ler o beat morto.

No log do Render, a primeira linha útil deve ser
`"logfire ligado" … "domain_spans": true` (ver
`runtime/docs/alteracoes/2026-10-15-01-spans-logfire.md`).

## 5. Smoke e rollback `[GATE]`

```
cd runtime && uv run python scripts/piloto_check.py smoke
```

Depois, uma mensagem de texto real no número da org piloto; esperado: resposta
do agente em até ~15 s, uma linha nova em `internal.llm_calls` com
`purpose = agent_reply` e outra com `judge_pre`, e um span `turn` no Logfire.

Rollback (testar uma vez, documentar o horário aqui):

```sql
delete from public.ai_runtime_rollout where organization_id = '425db1ba-99c0-4dbb-9434-27fe9cc03ec6';
```

Com a linha apagada o webhook volta ao caminho legado (QStash +
`cloud-runner`). Recriar a linha com `mode = 'runtime'` para voltar.

## 6. Depois do verde

Aceite do M0: `/healthz` 200 por 24 h, uma conversa respondida, `llm_calls`
recebendo linhas, rollback executado e revertido uma vez. Registrar data e
hora de cada gate neste arquivo.

## 7. Cutover geral (M1 passo 12) `[GATE]`

Só depois do aceite do M0 (seção 6) e com `/healthz` verde.

1. Aplicar `supabase/migrations/20261016000007_runtime_cutover.sql`: insere
   `mode = 'runtime'` para toda org com agente e sem linha, e um trigger em
   `ai_agents` passa a criar a linha no primeiro agente de uma org nova.
   Orgs com linha explícita não mudam.
2. Conferir: `select mode, count(*) from public.ai_runtime_rollout group by 1;`
   e `select count(*) from public.ai_agents a where not exists (select 1 from
   public.ai_runtime_rollout r where r.organization_id = a.organization_id);`
   deve dar 0.
3. Rollback por org: `update public.ai_runtime_rollout set mode = 'legacy'
   where organization_id = '<org>';` (não apagar a linha; o trigger não a
   recria, mas apagar e recriar o agente recriaria em runtime).
4. Aceite: nenhuma org em legado por 7 dias sem incidente e
   `ai_usage_logs` recebendo linhas só pelo espelho de `internal.llm_calls`
   (`feature like 'runtime_%'` ou `transcription`/`copilot`).

Os arquivos do caminho legado (`cloud-runner.ts`, `engine.ts`,
`whatsapp-ai-respond`, `reprocess-whatsapp-pending`, `ai-chatbot-service.ts`)
estão com cabeçalho "CONGELADO"; remoção no M7.

## 8. Migrations do plano IA em produção `[GATE]` (15/10/2026)

Leitura de produção (projeto `rqpmoavktzvxfcfsdkcc`) em 15/10: o histórico
para em `instagram_direct` (10/09). Faltam 39 migrations de 28/08 a 18/09
que o runtime e as 15 do plano (`20261016000001`..`015`) usam, entre elas
`internal.llm_calls.agent_id`, o espelho para `ai_usage_logs`, o send guard,
o bridge de conversa por conta e os traces aceitos.

A ferramenta de banco desta sessão não executa nenhum `drop` (pede uma
confirmação que não aparece e expira), e 24 das 54 migrations têm `drop`.
Nada foi aplicado por ela; o banco está como estava.

Rodar no SQL Editor do Supabase, nesta ordem:

1. `docs/runbooks/sql/2026-10-15-ia-producao-ensaio.sql`: aplica as 54 numa
   transação só e desfaz no fim. Esperado na última linha:
   `ENSAIO COMPLETO`. Se parar antes, a mensagem mostra a migration (cada
   uma imprime `<versão> ok`) e nada fica no banco.
2. `docs/runbooks/sql/2026-10-15-ia-producao-aplicar.sql`: uma transação por
   migration, com a linha em `supabase_migrations.schema_migrations`
   (`created_by = 'manual-plano-ia-2026-10-15'`). Esperado: `APLICADO`.

Ficaram de fora de propósito:

| Migration | Por quê |
|---|---|
| `20260812000005_app_baseline_prereqs` | só cria tabela que falta (todas existem) e reescreveria `get_user_organization_id`, já corrigida por `enable_rls_org_tables` |
| `20260909230000_app_baseline_forward_compat` | reconcilia o app inteiro; desfaria `views_security_invoker` e a policy `org_via_pai` corrigida em `rls_org_via_pai_fix` |
| `20260905093000_lgpd_retention_policies_api_keys` | já aplicada como `lgpd_retention_policies_and_api_key_hash` |
| `20260910000000_auth_user_created_trigger`, `20260910010000_verified_member_invites`, `20260910010100_oauth_states_service_only` | auth e convites, fora da IA; trigger e tabela já existem |
| `20260904000001_attribution_v2_single_credit`, `20260910250000_popup_report_fixes`, `20260910340000_instagram_tenant_integrity` | fora da IA; revisar em separado |

Não usar `supabase db push`: as versões no histórico de produção não batem
com os nomes de arquivo, e o CLI tentaria reaplicar tudo.

Depois de aplicar: `select to_regclass('public.ai_sources'),
to_regclass('public.ai_budgets'), to_regclass('public.ai_agent_entries');`
sem nulos. A 0007 (cutover) não muda nada hoje: a única org com agente já
está em `runtime`.
