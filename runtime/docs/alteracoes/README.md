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
| 2026-10-15 | [2026-10-15-03-audio-e-visao.md](2026-10-15-03-audio-e-visao.md) | Áudio transcrito (STT pela chave da org) e imagem inline para o modelo; fecha FORK item 11 |
| 2026-10-15 | [2026-10-15-04-teto-mensal.md](2026-10-15-04-teto-mensal.md) | Teto mensal de gasto por org e por agente; tabela de preços para chave direta; alerta `budget_exceeded` |
| 2026-10-15 | [2026-10-15-05-rag-limiar-e-proveniencia.md](2026-10-15-05-rag-limiar-e-proveniencia.md) | Busca vetorial com piso 0,7, `source_id` na saída da tool e consulta à base sem depender da tool ligada |
| 2026-10-15 | [2026-10-15-06-ferramentas-do-catalogo.md](2026-10-15-06-ferramentas-do-catalogo.md) | As seis ferramentas do catálogo (CRM, catálogo, pedidos, transferência com motivo) executadas pelo runtime; grants do worker |
| 2026-10-15 | [2026-10-15-07-copiloto-e-paridade.md](2026-10-15-07-copiloto-e-paridade.md) | Copiloto do inbox servido pelo runtime (`/internal/suggest-reply`, purpose `copilot`); verificação de paridade do envio; FORK itens 23 e 26 marcados |
| 2026-10-15 | [2026-10-15-08-modelo-multiagente.md](2026-10-15-08-modelo-multiagente.md) | Schema multiagente (`ai_agents.status/role`, `ai_agent_entries`, `ai_missions.agent_id`, `conversations.agent_id`, seed por agente) e fixtures db; sem mudança de comportamento até o passo 14 |
