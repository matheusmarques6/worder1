# Alterações no runtime — registro obrigatório

Toda mudança no `runtime/` (código, config, deploy) ganha um arquivo aqui,
no mesmo commit, com três perguntas respondidas: **o que** mudou, **como**
foi feito (arquivos, funções, variáveis de ambiente) e **por que** (o defeito
ou o requisito que motivou, com a evidência). O nome do arquivo é
`AAAA-MM-DD-NN-assunto.md`; o `NN` é sequencial no dia.

Quem lê este diretório deve conseguir reconstruir a história do motor sem
abrir o `git log`. Mudanças só em testes ou só em docs não precisam de
arquivo; mudanças de comportamento, de contrato com o banco ou de variáveis
de ambiente precisam sempre.

| Data | Arquivo | Resumo |
|---|---|---|
| 2026-10-15 | [2026-10-15-01-spans-logfire.md](2026-10-15-01-spans-logfire.md) | Spans de domínio passam a gravar quando só o Logfire está ligado; spans por chamada LLM e por ferramenta |
| 2026-10-15 | [2026-10-15-02-agents-workers.md](2026-10-15-02-agents-workers.md) | `AGENTS_WORKERS` passa a ser lida na partida |
