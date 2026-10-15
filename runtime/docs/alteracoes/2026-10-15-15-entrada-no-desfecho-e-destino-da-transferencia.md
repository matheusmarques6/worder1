# 2026-10-15-15 · Entrada no desfecho e destino da transferência

Integração da UI do protótipo, fase F2 (Construtor). Sem migration nova:
a coluna `ai_conversation_outcomes.entry_id` já existe desde
`20261016000013_ai_outcomes_and_events.sql`, mas ninguém a preenchia.

## Por que

O Construtor do protótipo mostra números em cada bloco do canvas. O bloco
de cada entrada (número de WhatsApp) mostra conversas, 1ª resposta e taxa
de compra **daquela entrada**. Sem `entry_id` no desfecho, o app só podia
repetir os números do agente quando havia uma entrada, e deixava "—" quando
havia várias.

O bloco "Transferir p/ …" do protótipo deixa a loja escolher para onde vai
a conversa quando o agente decide que não deve seguir: a equipe ou outro
agente. O app já grava a escolha em `settings.safety.handoff_destination`
(uuid do agente, ou ausente para a equipe), mas o runtime sempre mandava
para pessoas.

## O que mudou

### 1. `repository/outcomes.py` · `record_turn` grava a entrada

- Um CTE `entry` acha a entrada do agente com `kind = 'whatsapp_account'`,
  ativa, cujo `ref_id` é o `channel_account_id` da última mensagem do
  contato na conversa.
- O insert passa a escrever `entry_id`. No conflito, vale
  `coalesce(o.entry_id, excluded.entry_id)`: a entrada da conversa é a da
  primeira vez em que foi achada e não muda no meio dela.
- Sem entrada ligada (agente atende sem entrada específica, toque de
  fluxo, mensagem sem `channel_account_id`), fica `null`, como antes.

### 2. `agent_core/handoff.py` · `handoff_destination(settings)`

Função pura. Lê `settings.safety.handoff_destination` e devolve o `UUID`,
ou `None` quando está ausente, vazio, não é texto ou não é um uuid válido.
`None` significa "equipe".

### 3. `tools/base.py` · `ToolContext.handoff_agent_id`

Campo novo, padrão `None`. O `responder.py` preenche com
`handoff_destination(version.settings)`. Por isso vale a versão em
produção, e o rascunho não salvo não vale.

### 4. `tools/builtin.py` · `transfer_to_human` respeita o destino

- Se `handoff_agent_id` está definido e é diferente do próprio agente, a
  ferramenta tenta `_hand_to_agent_by_id`. Esse passo confere se o destino
  está em `list_active_agents` da mesma org e passa a conversa para ele,
  zerando a missão dona. Também registra `agent_assigned` na timeline do
  contato.
- Se a passagem dá certo, devolve `routed: 'agent'`, o nome e o papel do
  destino, e a instrução de avisar o cliente em uma frase. A IA não é
  desligada: o próximo turno já é do agente de destino.
- Se o destino não está ativo (pausado ou apagado), cai no caminho antigo
  e a conversa vai para a equipe.
- A atribuição e o registro na timeline foram extraídos para
  `_assign_to_agent`, que `transfer_to_agent` (alteração 2026-10-15-09)
  agora reaproveita. O comportamento dele não mudou.

## O que NÃO mudou (de propósito)

Estes casos continuam indo para pessoas, mesmo com um agente escolhido como
destino:

- pedido explícito de atendente (palavra-chave);
- mídia que a IA não interpreta;
- assunto proibido.

Quem pediu uma pessoa não deve cair em outro robô. O destino só vale para
a transferência que o **modelo** decide pela ferramenta.

## No app (mesmo commit)

- `src/lib/ai/activity-data.ts` lê `entry_id`; `OutcomeRow.entry_id` é
  opcional.
- `src/lib/ai/block-metrics.ts`: se algum desfecho tem `entry_id`, cada
  entrada de WhatsApp conta só as suas conversas. Uma entrada sem conversas
  mostra 0, e a taxa de compra fica sem número. Se nenhum desfecho tem
  `entry_id` (histórico anterior a esta alteração), vale a regra antiga:
  uma entrada herda os números do agente, e várias ficam sem número. Toque
  de fluxo fica sem número.

## Cobertura

- Unit: `tests/unit/test_agent_resolution.py::TestHandoffDestination`
  (uuid válido, ausente, vazio, inválido).
- db: `tests/db/test_ai_outcomes.py::TestEntryOfTheTurn`. Cobre a entrada
  achada pelo número da mensagem e o `null` sem entrada ligada. Não roda
  neste ambiente, porque não há Postgres local.
- App: `block-metrics.test.ts` (números por entrada com `entry_id`).

## Como reverter

Reverta o commit. Os `entry_id` já gravados não atrapalham, porque o app
cai na regra antiga quando nenhum está presente. Uma conversa já passada
para outro agente fica com ele até alguém reatribuir.
