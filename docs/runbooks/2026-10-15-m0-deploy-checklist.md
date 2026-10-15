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
