# Colocar o runtime no ar — Render e Vercel

Este roteiro usa os contratos do código publicado e o `render.yaml`. Guardar
senhas, DSNs completas e tokens no gerenciador de segredos e nos provedores.

## 1. Preparar as duas credenciais no Supabase

No projeto de produção, abrir **Connect → Session pooler** e copiar o host,
database e project reference exibidos. Usar porta **5432**. O username customizado
é `nome_da_role.PROJECT_REF`; a conexão direta usa somente `nome_da_role`.
Não usar transaction pooler/porta 6543: o runtime mantém estado por sessão.
[Documentação Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

As roles esperadas são `runtime_worker_login` e `runtime_sender_login`. Para
definir suas senhas, conectar por `psql` como administrador, com `-W` para pedir
a senha interativamente; preencher o host/ref com os valores do próprio painel:

```text
psql "host=SESSION_POOLER_HOST port=5432 dbname=postgres user=postgres.PROJECT_REF sslmode=require" -W
```

Dentro de `psql`:

```text
\password runtime_worker_login
\password runtime_sender_login
\q
```

Definir duas senhas distintas no gerenciador de segredos. Senhas aleatórias de
32 ou mais caracteres URL-safe simplificam as DSNs; outros caracteres exigem
percent-encoding. Não executar `ALTER ROLE ... PASSWORD 'senha'` em um editor
que registre o texto, nem colocar senha na linha de comando.

Montar duas DSNs, substituindo os campos pelos valores reais guardados:

```text
postgresql://runtime_worker_login.PROJECT_REF:SENHA_WORKER@SESSION_POOLER_HOST:5432/postgres?sslmode=require
postgresql://runtime_sender_login.PROJECT_REF:SENHA_SENDER@SESSION_POOLER_HOST:5432/postgres?sslmode=require
```

Cada login recebe somente seu role correspondente. Não trocar por `postgres`,
`service_role`, BYPASSRLS ou SUPERUSER para resolver erro de partida. A guarda
verifica a identidade real da conexão antes de abrir HTTP.

## 2. Conferir o que será processado na partida

O serviço pode começar a trabalhar imediatamente se já houver organização em
`ai_runtime_rollout` com `mode=runtime`. Não presumir partida inativa. No SQL
Editor, conferir somente contagens e idades, sem copiar mensagens:

```sql
select mode,count(*) from public.ai_runtime_rollout group by mode;
select 'inbound' as queue,count(*),min(enqueued_at) as oldest from pgmq.q_q_inbound
union all
select 'scheduled',count(*),min(enqueued_at) from pgmq.q_q_scheduled
union all
select 'evals',count(*),min(enqueued_at) from pgmq.q_q_evals;
select status,count(*) from internal.message_outbox group by status;
```

Revisar trabalho antigo antes de iniciar. Não reenfileirar automaticamente as
mensagens de DLQ. Não arquivar ou apagar filas apenas para obter health verde.

## 3. Configurar o serviço no Render

No [Render](https://dashboard.render.com/), abrir o serviço
`worder-agents-runtime`, se já existir. Para criar, usar **New → Blueprint**,
repositório `matheusmarques6/worder1`, branch `claude/debug-console-error-FWrLE`,
arquivo `render.yaml`. Conferir o plano e a cobrança apresentados antes de criar.

Se preencher um Web Service manualmente, usar estes campos equivalentes:

| Campo | Valor |
|---|---|
| Name | `worder-agents-runtime` |
| Branch | `claude/debug-console-error-FWrLE` |
| Runtime | Docker |
| Root Directory | `runtime` |
| Dockerfile Path | `./Dockerfile`, relativo à raiz do serviço |
| Docker Build Context | `.` dentro de `runtime` |
| Region | Virginia; não tentar mudar a região de um serviço existente |
| Health Check Path | `/healthz` |
| Start Command | Usar o CMD da imagem: `python -m agents_runtime` |
| Auto-Deploy | After CI Checks Pass / `checksPass` |

O plano `starter` do Blueprint corresponde ao plano de 0,5 CPU/512 MB; conferir
o nome atual e os recursos no painel. [Referência de planos](https://render.com/docs/compute-plans).

Em **Environment**, preencher os valores abaixo. Os campos `sync: false` não são
preenchidos automaticamente pelo Blueprint.

| Variável | Valor a colocar |
|---|---|
| `AGENTS_WORKER_DB_URL` | DSN do login worker montada no passo 1 |
| `AGENTS_SENDER_DB_URL` | DSN do login sender montada no passo 1 |
| `SUPABASE_URL` | URL HTTPS do mesmo projeto Supabase usado pelo app |
| `AGENTS_OPENROUTER_API_KEY` | Chave OpenRouter da plataforma; não a chave de um lojista |
| `ENCRYPTION_KEY` | Exatamente o valor atual do app na Vercel; não gerar outra |
| `AGENTS_PREVIEW_TOKEN` | Novo segredo aleatório forte, guardado para usar também na Vercel |
| `AGENTS_LOGFIRE_TOKEN` | Token do projeto Logfire, se utilizado; opcional |

O Blueprint também fornece as constantes abaixo; conferir que estão presentes
se o serviço foi configurado manualmente:

```dotenv
DEPLOY_ENV=production
AGENTS_HTTP_PORT=10000
AGENTS_WORKERS=2
AGENTS_PROCESS_NAME=agents-runtime-render
AGENTS_LOG_LEVEL=INFO
AGENTS_RESPONDER=agents_runtime.agent_core.responder:agent_responder
AGENTS_TOUCHER=agents_runtime.agent_core.toucher:agent_toucher
AGENTS_CHANNEL=agents_runtime.channels.cloud_api:from_env
AGENTS_WORKER_SET_ROLE=worker_role
AGENTS_SENDER_SET_ROLE=sender_role
AGENTS_META_API_VERSION=v22.0
```

Retirar `SUPABASE_DB_URL` privilegiada do ambiente do runtime depois de conferir
as duas DSNs mínimas. Não criar token Meta global: as credenciais Meta pertencem
às contas autorizadas de cada organização.

O gatilho `checksPass` aguarda os checks do commit. Antes da implantação,
concluir a homologação descrita em [ai-regression-runbook.md](../qa/ai-regression-runbook.md)
e exigir `Release readiness` aprovado. Não mudar o gatilho para `commit` nem
usar um deploy manual para contornar o resultado reprovado. Guardar o SHA
revisado que foi efetivamente implantado. [Gatilhos do Render](https://render.com/docs/deploys).

## 4. Conferir o runtime antes de conectá-lo ao app

Depois do deploy aprovado, copiar a URL pública HTTPS exibida pelo serviço e
abrir `URL_DO_RUNTIME/healthz`. Esperado: HTTP 200, `status=ok`,
`environment=production` e `commit` igual ao SHA escolhido. O health mede a
idade do heartbeat; sozinho não prova envio ou processamento de filas.

Confirmar no SQL Editor:

```sql
select process_name,beat_at,now()-beat_at as age
from internal.runtime_heartbeats
where process_name='agents-runtime-render';
```

O heartbeat deve atualizar continuamente, de preferência com idade inferior a
60 segundos; o health do código recusa idade acima de 180 segundos. Verificar
nos logs que worker e sender iniciaram sem erros de credenciais/privilégios.
Não usar o antigo `piloto_check.py env`: esse comando ainda espera a DSN legada.

## 5. Configurar a Vercel e republicar

No projeto **worder1**, abrir **Settings → Environment Variables**, selecionar
**Production** e adicionar/atualizar:

| Variável | Valor |
|---|---|
| `AGENTS_RUNTIME_URL` | URL HTTPS pública do serviço Render, sem `/healthz` no final |
| `AGENTS_PREVIEW_TOKEN` | Exatamente o mesmo segredo usado no Render |

Conferir a mesma `ENCRYPTION_KEY` nos dois serviços. Não colocar essas variáveis
sob prefixo `NEXT_PUBLIC_`. URLs/chaves de Preview devem apontar para QA separado,
não para a produção.

Salvar e executar **Redeploy** do commit aprovado no ambiente Production.
Mudanças de env só entram em um novo deploy.
[Instruções da Vercel](https://vercel.com/docs/environment-variables/managing-environment-variables).

## 6. Aceite

1. `/api/health` do app e `/healthz` do runtime identificam os SHAs esperados.
2. Login e mídia continuam funcionando; acesso anônimo e entre organizações é
   negado. Manter o bucket privado.
3. Em conta de teste autorizada, consultar `/api/ai/evals/UUID_VALIDO_INEXISTENTE`.
   Exigir 404 com JSON `{"error":"avaliação não encontrada"}` do runtime,
   em vez de 503 de configuração ou 502. Um 404 genérico não comprova esse salto.
4. Rodar a jornada QA com destinatário de teste e conferir persistência,
   aceitação Meta e uso dos dois pools. Health e preview não substituem isso.
5. Se falhar, interromper a implantação e corrigir configuração. Não afrouxar
   roles, substituir DSNs por owner ou reabrir o bucket como rollback.
