# Runbook: colocar o runtime piloto num servidor

Este runbook existe porque o Apply de 12/08 falhou em silêncio: o Render disse
"deployed", o heartbeat nunca bateu, e a única pista era um log que ninguém
tinha aberto. As Tasks 1–3 deste plano deram uma ferramenta —
`runtime/scripts/piloto_check.py`, três subcomandos (`env`, `probe`, `smoke`)
— que substitui a inspeção manual por um veredito de saída 0/1. Este runbook é
o caminho: uma seção por gate, na ordem, cada uma com o comando exato, o que
observar, e como reverter.

Nenhum passo `[GATE-usuário]` foi executado ao escrever este documento — são
instruções para quem vai apertar o botão, não um registro de execução.

## Antes de começar: o que a ferramenta prova e o que ela não prova

- `env` é pura e offline: lê variáveis de ambiente (ou um `Mapping` em teste),
  nunca abre rede nem banco. Roda antes de existir servidor.
- `probe` e `smoke` leem o banco Postgres, não o Render — o runtime não expõe
  nenhum HTTP alcançável daqui (egress bloqueado para `onrender.com` neste
  ambiente). A sonda prova o que aconteceu no banco; o motivo de um heartbeat
  ausente mora no log do Render, não em lugar nenhum que esta ferramenta
  alcance.
- As três reportam um veredito com o motivo quando o banco está inalcançável
  (`banco inalcançável: <motivo>`) — nenhuma delas sobe um traceback cru.
- A linha de chips no `smoke` é só um aviso (`aviso chips de progresso: …`):
  o runtime emite chips dentro de `try/except` (um chip perdido nunca pode
  custar um turno), então a ausência de chips nunca reprova o smoke.
- Um heartbeat fresco prova que o **processo está vivo**, não que as filas
  estão drenando. Em `runtime/src/agents_runtime/app.py` a task do heartbeat e
  as tasks dos workers são `create_task` independentes sob o mesmo `gather`:
  um worker travado não impede o heartbeat de bater. `probe` verde não é prova
  de que mensagens estão sendo processadas — só de que o processo não morreu.
  Detectar um worker travado com heartbeat vivo é mecanismo novo, fora do
  escopo desta ferramenta e deste runbook (registrado como pendência para
  outro plano).

## Passo 1 — `[GATE-usuário]` Empurrar a branch

355+ commits nunca saíram desta worktree (`fix/ai-engine-schema-baseline` não
tem upstream configurado) e o CI nunca viu as migrations que eles carregam.

```
git push -u origin fix/ai-engine-schema-baseline
```

**O que observar:** o push tem que aparecer no GitHub e disparar os workflows
de CI do app e do runtime para essa branch.

**O que o push acopla:**
- CI do app (`.github/workflows/*`) roda sobre as migrations da branch pela
  primeira vez — é a primeira vez que as ~40+ migrations que só existiam aqui
  são testadas por uma pipeline limpa.
- CI do runtime (`tests-db`, `boundaries`, unit) roda sobre o código dos
  subcomandos `env`/`probe`/`smoke` e sobre tudo mais na branch.
- Um preview da Vercel é criado para a branch (não para produção — a branch de
  produção do app é outra; este push não promove nada a produção).

**Como reverter:** nada a reverter no código — um push não muda o estado do
runtime nem do banco. Se o CI ficar vermelho, o problema é da branch, não
deste passo; investigar os workflows antes de prosseguir.

## Passo 2 — Conferir o ambiente antes do console

Antes de tocar no Render, validar que as variáveis que vão para o Apply batem
com o contrato de `runtime/DEPLOY.md` — offline, sem depender do Render estar
no ar.

```
uv run --directory runtime python scripts/piloto_check.py env --app-encryption-key <chave do app>
```

`<chave do app>` é o `ENCRYPTION_KEY` que já está configurado no app Next.js
(Vercel) — passar aqui confirma que a chave que vai para o Render é a MESMA,
porque uma diferente faz as chaves BYO e a credencial Meta por conta pararem
de abrir (item 20 da auditoria). As demais variáveis (`SUPABASE_DB_URL`,
`AGENTS_PREVIEW_TOKEN`, `AGENTS_OPENROUTER_API_KEY`,
`AGENTS_WORKER_SET_ROLE`, `AGENTS_SENDER_SET_ROLE`) precisam estar no
ambiente de onde o comando roda (exportadas no shell, ou um `.env` carregado
antes).

O check de `SUPABASE_DB_URL` faz parsing real da DSN (`urllib.parse.urlsplit`
sobre `hostname`/`port`, não busca de substring): rejeita a porta 6543
(transaction pooler — `set role` e leases são por sessão, não sobrevivem ao
pooler transacional) e rejeita qualquer host que não termine em
`pooler.supabase.com` (a conexão direta é IPv6-only; o Render não alcança).

**O que observar:** saída termina em `ambiente ok` e código de saída `0`.
Qualquer problema aparece como uma linha `- <variável ou motivo>` antes disso,
e o código de saída é `1`.

**Gate de saída:** sai 0 → pode seguir para o Render. Sai 1 → corrigir a
variável apontada e rodar de novo. Este comando não escreve nada em lugar
nenhum — rodar de novo é sempre seguro.

**Como reverter:** não aplicável — o comando não muda estado.

## Passo 3 — `[GATE-usuário]` Apply no Render

Pelo blueprint da raiz do repo (`render.yaml`): Render Dashboard → **New →
Blueprint** → conectar o repositório na branch `fix/ai-engine-schema-baseline`
(já empurrada no Passo 1).

Preencher os quatro segredos do Apply, exatamente como `runtime/DEPLOY.md`
descreve:
- `SUPABASE_DB_URL` — session pooler, porta 5432, o mesmo formato validado no
  Passo 2.
- `AGENTS_OPENROUTER_API_KEY` — chave da plataforma (Judge 1 + embeddings).
- `ENCRYPTION_KEY` — o MESMO valor conferido no Passo 2.
- `AGENTS_PREVIEW_TOKEN` — um segredo novo; o mesmo valor vai para a Vercel no
  Passo 5.

O Apply de 12/08 não conectou — o serviço subiu, mas nada bateu heartbeat nem
abriu conexão nova no Postgres por ~30 minutos, e a causa ficou presa no log
do Render (build em andamento, env vazia, DSN errada ou senha errada — nunca
diagnosticado, porque ninguém tinha uma sonda pelo banco). É exatamente por
isso que o Passo 4 existe: a resposta para "subiu?" está no banco primeiro, no
log do Render depois se o banco disser não.

**O que observar:** o Apply termina sem erro e o serviço aparece como
"Deploying" e depois "Live" no dashboard do Render.

**Como reverter:** apagar o serviço no Render dashboard (Settings → Delete
Web Service). Não afeta o banco nem o app — o runtime sobe DORMENTE por
design (filas vazias + rollout vazio = idle seguro), então até um deploy que
"funciona" não liga nenhuma organização sozinho.

## Passo 4 — Provar que subiu, pelo banco

```
uv run --directory runtime python scripts/piloto_check.py probe
```

Requer `SUPABASE_DB_URL` no ambiente (a mesma DSN validada no Passo 2). Este
comando não fala com o Render — ele lê `internal.runtime_heartbeats` e as
profundidades de fila direto no Postgres, usando o MESMO limiar de
obsolescência que `/healthz` usa em produção: 180 segundos
(`server.py`, `serve(health_max_age_s=180.0)` — não os 90s de um rascunho
anterior desta sonda; o servidor manda).

**O que observar:**
- Saudável: uma linha `heartbeat: <N>s desde o último beat — processo vivo
  (não prova fila drenando)`, seguida de uma linha `fila <nome>=<N>` por fila
  conhecida (incluindo `dead_letter`, que sempre aparece, cheia ou não —
  reportada, nunca usada para reprovar a saúde). Código de saída `0`.
- Parado ou nunca bateu: `heartbeat: nunca bateu — o processo não chegou ao
  banco` ou `heartbeat parado há mais de 180s`. Código de saída `1`.
- Banco inalcançável: `banco inalcançável: <motivo>`. Código de saída `1`.

**A ambiguidade que este passo existe para fechar:** se não houver beat, a
resposta não está no banco — está no log do Render. É exatamente essa
ambiguidade que custou o Apply de 12/08: o serviço marcado "Live" no Render
não prova que o processo abriu conexão com o Postgres nem chegou a rodar
`python -m agents_runtime`. `probe` sai 1 e diz "sem beat"; o próximo lugar a
olhar é o log do serviço no Render dashboard, não o banco de novo.

**Gate de saída:** sai 0 → pode seguir para a Vercel. Sai 1 com "banco
inalcançável" → checar a DSN e a rede antes de qualquer outra coisa. Sai 1 sem
beat → abrir o log do Render.

**Como reverter:** não aplicável — comando de leitura.

## Passo 5 — `[GATE-usuário]` Envs da Vercel

Setar na Vercel (produção do app, não do runtime):
- `AGENTS_RUNTIME_URL=https://<serviço>.onrender.com`
- `AGENTS_PREVIEW_TOKEN` — o MESMO valor do Passo 3.

Sem as duas, `src/app/api/ai/preview-prompt/route.ts` responde "Runtime não
configurado (AGENTS_RUNTIME_URL / AGENTS_PREVIEW_TOKEN)" e o preview do prompt
na UI (`/ai`, "O que o agente sabe") mostra os blocos fantasmas MISSÃO/
ESTADO/CANAL em vez do prompt real — não é um bug do preview, é o preview
dizendo corretamente que não tem para onde perguntar.

**O que observar:** as duas variáveis aparecem em Vercel → Project Settings →
Environment Variables, no ambiente de produção (e/ou preview, conforme onde o
smoke do Passo 8 vai rodar). Um novo deploy do app (ou um redeploy manual) é
necessário para a Vercel pegar as variáveis novas.

**Como reverter:** remover as duas variáveis na Vercel e redeployar — o
preview volta a mostrar fantasmas, sem quebrar nada mais (o app não depende
delas fora dessa rota).

## Passo 6 — `[GATE-usuário]` Rollout da organização piloto

Inserir a linha que desvia os inbounds da org para o runtime:

```sql
insert into ai_runtime_rollout (organization_id, mode)
values ('<org>', 'runtime');
```

**O que observar:** a partir dessa linha, o webhook desvia os inbounds da
organização para o runtime e o nó de missão passa a emitir toques para ela.
Nenhuma outra organização é afetada — `ai_runtime_rollout` é o interruptor por
org, e uma organização ausente da tabela continua no caminho legado.

**Como reverter (barato, por contrato):**

```sql
update ai_runtime_rollout set mode = 'legacy' where organization_id = '<org>';
```

Efeito imediato no próximo inbound — não é preciso reiniciar nada, o webhook
lê o modo por request.

## Passo 7 — `[GATE-usuário]` Mensagem real

Mandar uma mensagem real para o número da loja piloto (WhatsApp), da mesma
forma que um cliente mandaria.

**O que observar:** a resposta chega no WhatsApp dentro de um tempo razoável;
o inbox da loja mostra a conversa e (se os chips estiverem funcionando) o
andamento do agente. Isto é o insumo que o Passo 8 vai conferir pelo banco —
não substitui o passo 8, e o passo 8 não substitui este: só uma mensagem real
prova o canal Meta de ponta a ponta.

**Como reverter:** não aplicável — é uma mensagem enviada, não um estado do
sistema. Se a suspeita da seção "Suspeita aberta" abaixo se confirmar, o
agente fica em silêncio; isso não precisa de reversão, é o comportamento
esperado (ver abaixo).

## Passo 8 — Veredito do smoke

```
uv run --directory runtime python scripts/piloto_check.py smoke --organization <org> --phone <telefone>
```

Requer `SUPABASE_DB_URL` no ambiente. `--phone` é o número que mandou a
mensagem do Passo 7 (com ou sem `+`, o comando tolera os dois formatos, a
mesma tolerância que `internal.emit_ai_run_step` usa). `--minutes` é opcional,
default 15 — a janela de tempo em que o smoke procura evidência; aumentar se
o Passo 7 aconteceu há mais tempo.

**Como ler o veredito:** uma linha por expectativa, na ordem do turno,
prefixada `ok` ou `falhou`:
- `mensagem do cliente na canônica (<N>)` — a mensagem inbound chegou em
  `public.messages`.
- `resposta do agente na canônica (<N>)` — o agente gerou uma resposta
  outbound.
- `outbox sent=<N>` (ou `outbox sem linha sent (<estado>=<N>, …)` / `outbox
  sem linha sent (vazio)` se falhar) — o envio foi enfileirado e processado.
- `espelho do inbox (<N>)` — a mensagem enviada apareceu no espelho que a UI
  lê (`whatsapp_cloud_messages`).
- `chips de progresso: <lista>` (ou `chips de progresso: nenhum`) — **esta
  linha é só um aviso (`aviso`), nunca reprova o smoke**, porque a emissão de
  chips roda dentro de `try/except` no runtime: um chip perdido nunca pode
  custar um turno.

O veredito final é a conjunção das quatro primeiras linhas — código de saída
`0` só se as quatro passarem. Se nenhuma conversa canônica for encontrada para
o telefone, a única linha é `falhou nenhuma conversa canônica para esse
telefone` (o Passo 7 não aconteceu, ou aconteceu para um telefone/organização
diferente do informado aqui).

Se o banco (ou uma das consultas) falhar, a saída é uma linha `banco
inalcançável: <motivo>` e código `1` — nunca um traceback.

**Gate de saída deste plano:** sai 0 → o piloto está de pé, ponta a ponta,
pela primeira vez provado por ferramenta em vez de inspeção manual. Sai 1 →
ler qual linha falhou primeiro; ela diz exatamente em qual elo da cadeia
(mensagem chegou → agente respondeu → envio saiu → espelhou na UI) o turno
parou.

**Como reverter:** não aplicável — comando de leitura.

## Suspeita aberta desde 17/08

No cutover de 17/08, o caminho legado da organização piloto (Dr. Groot,
`425db1ba-…`) falhava com a chave OpenRouter da organização em 1–2 segundos —
rápido demais para ser um timeout de rede, sugerindo rejeição imediata da API.
A hipótese registrada é conta sem crédito. Isso nunca foi confirmado nem
descartado.

Se a causa for essa, o sintoma no runtime **não é um erro visível** — é
silêncio: o agente não responde, e o motivo fica registrado em
`internal.llm_calls` (a tabela grava a chamada e o erro exato quando o
provedor rejeita) ou como um alerta `type="no_org_llm_key"` emitido pelo
responder/toucher (`runtime/src/agents_runtime/agent_core/responder.py`,
`toucher.py`) quando a organização não tem chave utilizável.

**Por que isso é fácil de confundir com "deploy quebrado":** silêncio é o
comportamento CORRETO quando a organização não tem uma chave de LLM que
funcione — o runtime é BYO-only por design, sem fallback para uma chave de
sistema. Um smoke que falha em "resposta do agente na canônica" por essa causa
tem o mesmo sintoma superficial (nada chega) que um runtime que nunca subiu.
A diferença está em olhar `internal.llm_calls` e os alertas antes de assumir
que o deploy falhou: se o `probe` do Passo 4 está saudável (processo vivo,
beat fresco) e o smoke falha só na resposta do agente, a causa mais provável
é esta suspeita, não o deploy.
