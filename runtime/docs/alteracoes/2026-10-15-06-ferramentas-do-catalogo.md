# 2026-10-15-06 · As ferramentas do catálogo passam a existir no runtime

Plano de implementação IA, M1 passo 9. Fecha o item 12 do `FORK.md` e o
item 87 da auditoria de 28/08 ("seis tools oferecidas na UI que o runtime não
executa").

## O que mudou

O modelo, no runtime, pode pedir as seis ferramentas que a aba Ferramentas
já oferecia e que só o motor legado executava:

| Ferramenta | O que faz | Exige loja Shopify |
|---|---|---|
| `transfer_to_human` | desliga a IA na conversa com um motivo codificado e registra resumo na timeline | não |
| `save_customer` | cria ou atualiza o contato (nome, e-mail, etiquetas, campos) com fusão, sem sobrescrever | não |
| `save_interests` | etiquetas `interesse:…` e linha em `whatsapp_product_interests` | não |
| `timeline` | lê as últimas 10 atividades do contato ou registra uma | não |
| `product_lookup` | busca por título ou SKU no espelho `shopify_products` | sim |
| `order_status` | pedido por número, e-mail ou telefone do contato no espelho `shopify_orders` | sim |

`search_knowledge` continua rodando antes da geração (passo 8) e
`create_coupon` continua sozinha na porta do dinheiro, pela interseção
missão∩agente. A aba Ferramentas da UI volta a mostrar o catálogo inteiro
para orgs no runtime (`toolCatalogForRuntimeMode` removido).

## Por quê

O plano exige paridade do runtime com o legado antes de desligar o legado.
Sem estas ferramentas, "cadê meu pedido?" e "tem o tamanho M?" eram
respondidos de memória, e o modelo não tinha como pedir um humano por conta
própria. O protótipo da nova aba IA mostra ferramentas como blocos do
Construtor com métricas por chamada; isso só faz sentido se o motor as
executar e registrar.

## Como

### Banco (`20261016000005_runtime_tool_grants.sql`)

O `worker_role` só lia `contacts` e colunas de `shopify_orders`. A migration
dá, coluna a coluna, o que cada ferramenta usa e cria a política por org
(`current_app_organization_id()`) onde faltava: SELECT em
`shopify_products`, SELECT de `phone` em `shopify_orders`, INSERT/UPDATE
restritos em `contacts`, SELECT/INSERT em `contact_activities` e em
`whatsapp_product_interests`. Um helper `pg_temp.ensure_policy` cria as
políticas só se não existirem (idempotente).

### Runtime

- `repository/crm.py`: `find_contact` (id → telefone → e-mail, a ordem do
  TS por causa do unique de e-mail), `update_contact`, `insert_contact`,
  `recent_activities`, `add_activity` (tipos fora da lista viram `note`),
  `product_interest_exists`, `add_product_interest`.
- `repository/catalog.py`: `search_products` (ILIKE por título ou SKU, com
  parâmetro ligado, nunca filtro montado em string) e `has_store`.
- `repository/orders.py`: `find_orders` (número → e-mail → últimos 11
  dígitos do telefone, a régua de privacidade do TS).
- `agent_core/handoff.py`: `transfer_to_human` e `UNMIRRORED_DETAIL` saem
  do `responder.py` sem mudar, para a ferramenta, o responder e o toucher
  usarem a mesma função (o responder reexporta os nomes).
- `tools/base.py`: `ToolContext` ganha `contact_id`, `agent_id`,
  `channel_account_id` e `phone`, preenchidos pelo responder a partir do
  estado lido (`ConversationState.contact_phone`, novo, lido do contato e
  nunca posto no prompt).
- `tools/builtin.py`: as seis classes, os `ToolSpec` e o catálogo
  `BUILTIN_TOOLS`; `builtin_tools_for(enabled, has_store)` devolve, na
  ordem do catálogo, as que o agente ligou e a loja consegue servir.
- `responder.py`: oferece as builtin pelo `settings.tools.enabled` do
  agente (como as custom), `has_store = purchase is not None`.

### Motivos de transferência

`transfer_to_human` recebe `reason` em `{asked_human, discount_over_limit,
complaint, health_topic, no_knowledge, other}`. A marca no espelho leva
`reason = "tool:<código>"` e a atividade na timeline guarda
`metadata.handoff_reason`. É o que a tela Atividade (M5) agrega em "Por que
transferiram".

### TypeScript

`src/lib/ai/tools/catalog.ts`: `toolCatalogForRuntimeMode` removido,
`RUNTIME_TOOL_NAMES` exportado, texto de `search_knowledge` atualizado;
`AreaFields.tsx` mostra o catálogo inteiro e avisa que as duas de Shopify
exigem loja conectada.

## Testes

`tests/unit/test_builtin_tools.py` (16 casos): seleção por catálogo e por
loja, specs válidos, query vazia, disponibilidade de produto, fallback de
telefone e número só com dígitos no pedido, timeline ler/registrar/sem
contato, fusão de etiquetas e campos, contato novo com o telefone do
contexto, argumentos nunca escolhem a org, interesses viram etiquetas e
linha de produto, motivo codificado e desconhecido → `other`. Suíte unit:
2092 verdes. `tools-catalog.test.ts` ajustado.

Pendente (exige banco): casos de db para `crm.py`, `catalog.py` e
`find_orders`, e um pipeline em que o modelo pede `order_status` e responde
com o dado.

## O que NÃO entrou

- `send_cart_link`: não há, hoje, de onde tirar a URL do carrinho do
  contato (o `object_ref` das missões não carrega link). Fica para quando a
  ingestão de checkout gravar a URL.
- Frete por CEP, novo PIX, rastreio e foto do produto: dependem de
  integrações que o produto não tem.
- O loop não é interrompido depois de `transfer_to_human`: o modelo recebe a
  instrução de responder em uma frase curta avisando a transferência, e o
  Juiz 1 revisa como qualquer resposta. A IA já está desligada para os
  turnos seguintes pela marca no espelho.
