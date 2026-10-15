# 2026-10-15-02 · `AGENTS_WORKERS` passa a ser lida

Plano de implementação IA, M0 passo 5 (preparação do deploy).

## O que mudou

A variável de ambiente `AGENTS_WORKERS` controla de fato quantos workers
(laços `EngineLoop`, um por conexão) o processo abre. Antes era documentada no
`DEPLOY.md` como "documentada e inalcançável".

## Por quê

`app.run` sempre recebeu `workers=2` fixo porque `__main__._serve` não passava
o argumento. O `DEPLOY.md` (linha 123) já registrava o achado da auditoria.
Com o deploy no Render saindo do papel, o operador precisa de um knob real
para ajustar a concorrência sem rebuild. O teto por tenant (`tenant_slots`)
continua em memória e por processo, como antes.

## Como

`__main__.py` ganha `_workers_from_env(default=2)`: vazio usa 2; inteiro
≥ 1 é honrado; qualquer outra coisa (`"dois"`, `0`, `-1`) levanta
`RuntimeError` na partida, no mesmo padrão dos outros erros de configuração
do entrypoint (nunca "assume 2 em silêncio"). O valor é passado em
`run(..., workers=...)`.

`render.yaml` passa a declarar `AGENTS_WORKERS: "2"` explicitamente e o
`DEPLOY.md` deixa de marcar a variável como inalcançável.

## Testes

`tests/unit/test_obs.py::TestWorkersFromEnv`: padrão, valor honrado e lixo
morrendo na partida.

## Atenção operacional

Cada worker abre uma conexão longa no session pooler. Com N workers o
processo usa cerca de N + 3 conexões (coalescer, sender, healthz). Subir N
exige conferir o limite do pooler do Supabase.
