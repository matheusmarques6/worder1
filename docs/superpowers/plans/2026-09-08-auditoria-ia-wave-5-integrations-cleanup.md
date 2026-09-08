# Auditoria IA — Wave 5: integrações e limpeza Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar itens 64, 87, 88, 91 e 93 e os resíduos de status, safeFetch e AGENTS_WORKERS com contratos preservados.

**Architecture:** Reutilizar o conector httpx e as duas rotas de presença já autenticadas. Remover somente símbolos sem consumidores comprovados e corrigir documentação no mesmo pacote da capacidade descrita; não criar outro runtime ou framework de integração.

**Tech Stack:** Python 3.13+, httpx, Decimal, pytest, Ruff, Import Linter; Next.js 14, React 18, TypeScript, Vitest, pnpm 10.

**Spec:** `docs/superpowers/specs/2026-09-08-auditoria-motor-ia-sdd-program-design.md`

## Global Constraints

- A branch principal e suas alterações locais permanecem intocadas.
- Nenhum teste destrutivo aponta para banco existente, pooler ou produção.
- Nenhum subagente pode fazer push, merge, deploy ou migration remota.
- Nunca há dois implementadores escrevendo no mesmo worktree ao mesmo tempo.
- Toda lógica não trivial recebe ao menos um teste de regressão executável.
- Decisões de produto antecedem implementação.
- O menor diff responsável vence; código especulativo não será criado.
- Critical ou Important bloqueia a tarefa e a onda.
- Falha preexistente não será ocultada nem convertida em skip.
- item 92 aberto até existir janela real de pelo menos oito dias.
- Worktree exclusiva: `.worktrees/sync-remote-ai-2026-09-08`; branch `integration/sync-remote-ai-2026-09-08`.
- Artefatos não contêm segredos, URLs privadas ou DSNs reais. Não executar `mirror.ps1`, perfil `piloto`, `--linked` ou limpeza Docker global.

---

## Execução SDD

Controlador: `gpt-6-astra`, high. Cada tarefa usa implementador fresco, `fork_turns: "none"`, modelo/esforço explícitos e sem filhos. Revisor é outra instância; exige `Spec PASS/FAIL` e `Quality APPROVED/CHANGES_REQUIRED`. Implementação e revisão são sequenciais. O verificador de onda é `gpt-5.6-terra`, high; guardião Docker/DB é `gpt-6-astra`, high e trabalha sozinho enquanto o banco está ativo. Revisor final: `gpt-6-astra`, xhigh.

O controlador resolve o workspace pelo script `scripts/sdd-workspace PLAN_FILE` da skill SDD; guarda nele `progress.md`, briefs, relatórios, review packages e `external-evidence.md`. Registra BASE antes de cada tarefa, comandos, saída, commits e rulings. Reviews usam BASE..HEAD completo. Rodadas 1–3 retomam o implementador; 4–5 usam agente fresco superior. Critical/Important remanescente mantém bloqueio segundo a especificação, mesmo no limite de rodadas.

Cada checkbox é uma ação de 2–5 minutos; comandos longos são iniciados em um passo e têm a saída coletada em outro. Uma espera externa não é checkbox de execução contínua. Commits listados são instruções para a execução futura, não foram executados durante este planejamento. Rollback de tarefa usa `git revert` do hash registrado no ledger, nunca reset/checkout destrutivo.

## Entrada, estrutura e interfaces entre ondas

Consumir W2-T4 antes da criação GraphQL: unicidade de cupom/reconciliação de colisões deve estar provada. Consumir decisões W4 sobre vocabulário e ferramentas, evitando restaurar estado anterior do preview. A assinatura pública `shopify.create_discount` permanece compatível com `runtime/src/agents_runtime/tools/coupon.py`. Não alterar políticas de autorização nas rotas de presença.

Mapa: conector e seu teste em `runtime/src/agents_runtime/connectors/shopify.py` / `runtime/tests/unit/test_shopify_connector.py`; UI em `Header.tsx` e `MissionEditorModal.tsx`; remoções em `src/lib/route-permissions.ts`, `src/hooks/useHeartbeat.ts` e duas funções de `src/lib/webhooks/safe-fetch.ts`; scripts manuais em `scripts/test-ai-system.sh` e `scripts/test-commands.sh`; documentação em `runtime/FORK.md`, `runtime/DEPLOY.md` e citações enumeradas na Task 5. Novos testes são especificados abaixo. Nenhum pacote novo.

### Task 1: W5-T1 — migrar cupom para GraphQL sem perder recuperação idempotente

**Files:**
- Modify: `runtime/src/agents_runtime/connectors/shopify.py` — `create_discount`, `_send`, `_find_price_rule_id`, `_price_rule_payload`, `_diverging_fields`.
- Test: `runtime/tests/unit/test_shopify_connector.py`.
- Modify/Test: `runtime/tests/db/test_create_coupon_tool.py` — `_shopify_transport`, `TestTheHappyPath`.
- Modify/Test: `runtime/tests/db/test_toucher.py` — os dois `shopify_ok` locais em `TestTheMoneyPath`.
- Read: `runtime/src/agents_runtime/tools/coupon.py`, `runtime/src/agents_runtime/commerce/offer_engine.py`, `runtime/src/agents_runtime/queueing/failures.py`.

**Interfaces:**
- Consumes: `ShopifyStore(shop_domain: str, access_token: str, currency: str = "BRL")`; `Clock.now() -> datetime`, `Clock.sleep(seconds: float)`; W2-T4 prova de unicidade.
- Produces: mesma `async create_discount(store, *, code: str, kind: str, value: Decimal, validity_until: datetime, max_uses: int = 1, transport=None, clock=None) -> str`; erros continuam `ShopifyError`.
- Internas novas no mesmo arquivo: `_discount_input(*, code: str, kind: str, value: Decimal, validity_until: datetime, max_uses: int) -> dict` e `_graphql_rule(discount: dict) -> dict`. O segundo normaliza GraphQL para os quatro campos de `_diverging_fields`, sem transformar ausência em igualdade.
- Consumes DB gate W0, dentro de PowerShell 7: `& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $runPath -TestTargets @('tests/db/test_create_coupon_tool.py','tests/db/test_toucher.py')`; Test encerra o projeto no finally, portanto cada RED/GREEN exige Prepare/Replay com nonce novo.
- Preserves: retry da tool reutiliza grant/código e não chama provedor novamente; concessão negada não faz HTTP; benefício autorizado só aparece no prompt depois de materializado.
- Implementador `gpt-5.6-sol`, high; revisor `gpt-6-astra`, high; verificador Terra high.

- [ ] **Step 1: registrar prova inicial e contrato do provedor (3 min).**

Executar `rg -n "create_discount|_find_price_rule_id|_diverging_fields" runtime/src runtime/tests/unit/test_shopify_connector.py`. Registrar todos os chamadores e assinatura. Ler os documentos oficiais da versão fixa 2026-04 e salvar URLs, data UTC de consulta e campos confirmados em `external-evidence.md`: [basic create](https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/discountCodeBasicCreate), [free shipping create](https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/discountCodeFreeShippingCreate), [lookup pelo código](https://shopify.dev/docs/api/admin-graphql/2026-04/queries/codediscountnodebycode). Não trocar `API_VERSION = "2026-04"`. Sem schema confirmado, manter Task 1 não concluída; mocks não provam schema do provedor. Escopos `read_discounts`/`write_discounts` entram como evidência operacional W6, sem reinstalar app ou criar cupom real.

Executar também `rg -n "price_rules|discount_codes" runtime/tests`. A inspeção desta revisão encontrou exatamente `runtime/tests/unit/test_shopify_connector.py`, `runtime/tests/db/test_create_coupon_tool.py::_shopify_transport` e dois `shopify_ok` em `runtime/tests/db/test_toucher.py`. Esses três arquivos pertencem à mesma Task 1; qualquer fixture adicional encontrada na execução entra no inventário e no patch antes do GREEN.

- [ ] **Step 2: escrever RED do transporte e conversão percentual (4 min).**

Acrescentar no teste existente, reutilizando `STORE`, `UNTIL`, `_transport`, `FakeClock`, imports `json/httpx/Decimal/pytest`:

```python
async def test_percent_uses_graphql_and_preserves_grant_code():
    def handler(request):
        assert request.url.path == "/admin/api/2026-04/graphql.json"
        payload = json.loads(request.content)
        if "codeDiscountNodeByCode" in payload["query"]:
            return httpx.Response(200, json={"data": {"codeDiscountNodeByCode": None}})
        assert "discountCodeBasicCreate" in payload["query"]
        requested = payload["variables"]["input"]
        assert requested["code"] == "WD-GQL"
        assert requested["customerGets"]["value"] == {"percentage": 0.1}
        assert requested["usageLimit"] == 1
        return httpx.Response(200, json={"data": {"discountCodeBasicCreate": {
            "codeDiscountNode": {"id": "gid://shopify/DiscountCodeNode/42"},
            "userErrors": [],
        }}})
    transport, seen = _transport(handler)
    assert await shopify.create_discount(
        STORE, code="WD-GQL", kind="percent", value=Decimal("10"),
        validity_until=UNTIL, transport=transport,
    ) == "WD-GQL"
    assert all(r.method == "POST" for r in seen)
```

- [ ] **Step 3: executar RED (2 min).**

`uv run --directory runtime pytest tests/unit/test_shopify_connector.py -k percent_uses_graphql -q`. Esperado: FAIL, URL termina em `price_rules.json`. Registrar falha de comportamento, não erro de importação.

- [ ] **Step 3a: escrever RED nos consumidores DB antes da troca do conector (4 min).**

Adicionar `import json` nos dois arquivos DB. Em `TestTheHappyPath.test_issue_then_provider_then_code`, substituir a assert de quantidade comentada “price rule + discount code” por:

```python
assert [request.url.path for request in seen] == [
    "/admin/api/2026-04/graphql.json",
    "/admin/api/2026-04/graphql.json",
]
assert "codeDiscountNodeByCode" in json.loads(seen[0].content)["query"]
assert "discountCodeBasicCreate" in json.loads(seen[1].content)["query"]
```

Nos DOIS testes de `TestTheMoneyPath` que definem `shopify_ok`, criar `seen: list[httpx.Request] = []` antes da função e acrescentar `seen.append(request)` no começo dela. Em `test_an_authorized_concession_lands_as_coupon_in_the_prompt`, acrescentar as mesmas três asserts de paths/operações acima depois das asserts do cupom armazenado. Em `test_the_coupon_is_a_fact_in_the_prompt_before_generation`, acrescentar `assert seen == []`: esse caso nega o benefício e deve continuar sem provedor.

- [ ] **Step 3b: executar RED DB isolado (2 min para iniciar).**

Somente o guardião Astra executa a sequência; interromper imediatamente se Prepare ou Replay falhar:

```powershell
$redRun = Join-Path (Get-Location).Path ('.superpowers/sdd/auditoria-ia-disposable/' + [guid]::NewGuid().ToString('N'))
pwsh -File scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $redRun
pwsh -File scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $redRun
& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $redRun -TestTargets @('tests/db/test_create_coupon_tool.py::TestTheHappyPath','tests/db/test_toucher.py::TestTheMoneyPath')
```

Esperado: FAIL nos dois casos autorizados por paths REST, com retry da tool e negativa ainda preservados. Capturar saída antes do patch. Test fecha o stack no finally; não reutilizar `$redRun` no GREEN. Falta de ambiente seguro bloqueia esta prova, sem conexão a banco existente.

- [ ] **Step 4: implementar input mínimo (4 min).**

No mesmo conector:

```python
def _discount_input(*, code, kind, value, validity_until, max_uses):
    result = {
        "title": code, "code": code, "startsAt": "1970-01-01T00:00:00Z",
        "endsAt": validity_until.isoformat(), "usageLimit": max_uses,
        "appliesOncePerCustomer": True, "customerSelection": {"all": True},
    }
    if kind == "free_shipping":
        result["destination"] = {"all": True}
    elif kind in ("percent", "fixed"):
        discount = (
            {"percentage": float(value / Decimal("100"))}
            if kind == "percent" else
            {"discountAmount": {"amount": str(value), "appliesOnEachItem": False}}
        )
        result["customerGets"] = {"items": {"all": True}, "value": discount}
    else:
        raise ShopifyError("tipo de desconto inválido")
    return result
```

Os tipos explicitados em Interfaces devem constar na implementação. `customerSelection` é um campo de compatibilidade documentado; confirmar sua disponibilidade na versão fixa no Step 1. Não converter fixed para float.

- [ ] **Step 5: definir consulta e normalização idempotentes (5 min).**

Substituir busca de price rules por query com variável `$code: String!`, nunca interpolação:

```graphql
query FindDiscount($code: String!) {
  codeDiscountNodeByCode(code: $code) {
    id
    codeDiscount {
      __typename
      ... on DiscountCodeBasic {
        title endsAt usageLimit appliesOncePerCustomer
        customerGets {
          value {
            __typename
            ... on DiscountPercentage { percentage }
            ... on DiscountAmount { amount { amount currencyCode } appliesOnEachItem }
          }
        }
      }
      ... on DiscountCodeFreeShipping {
        title endsAt usageLimit appliesOncePerCustomer
      }
    }
  }
}
```

Normalização em `_graphql_rule`: `DiscountCodeFreeShipping` produz `target_type=shipping_line,value_type=percentage,value=-100`; `DiscountCodeBasic/DiscountPercentage` produz `line_item,percentage,-Decimal(str(percentage))*100`; `DiscountAmount` produz `line_item,fixed_amount,-Decimal(amount.amount)`. `usage_limit` só existe se `usageLimit` estiver presente. Tipo desconhecido, valor não numérico/ausente e `null` não são sucesso. Preservar `_diverging_fields` e comparar também título/código sem distinção de caixa, fim de validade e `appliesOncePerCustomer`; moeda e `appliesOnEachItem=False` no fixed. Não inventar valores para respostas incompletas.

- [ ] **Step 6: trocar transporte sem duplicar cliente (5 min).**

`create_discount` cria um único `httpx.AsyncClient`, conserva header `X-Shopify-Access-Token`, timeout, `Clock` e saldo único `[_RETRY_BUDGET_SECONDS]`. Faz lookup; existente só retorna após comparação. Ausente usa uma mutation, com `variables={"input": _discount_input(...)}`; nomes/argumentos:

```graphql
mutation CreateBasic($input: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $input) {
    codeDiscountNode { id }
    userErrors { code field message }
  }
}
mutation CreateShipping($input: DiscountCodeFreeShippingInput!) {
  discountCodeFreeShippingCreate(freeShippingCodeDiscount: $input) {
    codeDiscountNode { id }
    userErrors { code field message }
  }
}
```

HTTP não 200/201, `errors` de GraphQL, `userErrors` não vazio, `data`/nó ausente: `ShopifyError`; HTTP 200 não é prova de sucesso. Corrida de código duplicado (`TAKEN`) exige novo lookup e comparação antes de retornar. Reusar `_send` para HTTP 429; GraphQL `THROTTLED` deve subir como falha de throttle classificável pela fila, sem loop novo e sem gastar orçamento adicional. Mensagens de erro sem token, corpo arbitrário ou número de desconto que o classificador confundiria com HTTP. Retirar os caminhos REST quando a suíte abaixo estiver verde.

- [ ] **Step 7: preservar regressões de dinheiro e retry (5 min).**

Converter fixtures REST do arquivo para respostas GraphQL mantendo as intenções dos testes existentes. Em casos parametrizados com `kind/value/expected`, provar percent `10.00 -> 0.1`, fixed `10.00 -> "10.00"`, free_shipping via mutation própria. Adicionar `pytest.raises(ShopifyError)` para cada campo normalizado ausente, frete contra 100% de itens, limite divergente, lookup nulo depois de TAKEN, erro GraphQL em 200 e mutation sem id. A corrida usa sequência lookup nulo → TAKEN → lookup compatível e espera mesmo código; resposta com outros termos espera exceção. Manter a prova FakeClock de três tentativas, Retry-After, teto total de 6s e isolamento entre tokens de duas lojas.

- [ ] **Step 7a: converter os três mocks DB encontrados (5 min).**

Em `test_create_coupon_tool.py::_shopify_transport.handler`, manter `seen.append(request)` e substituir apenas as respostas REST pelo bloco abaixo. Nos DOIS `shopify_ok` de `test_toucher.py::TestTheMoneyPath`, manter o `seen.append(request)` introduzido no RED e substituir as respostas pelo mesmo bloco integral:

```python
assert request.method == "POST"
assert request.url.path == "/admin/api/2026-04/graphql.json"
payload = json.loads(request.content)
if "codeDiscountNodeByCode" in payload["query"]:
    assert payload["variables"]["code"].startswith("WD-")
    return httpx.Response(200, json={"data": {"codeDiscountNodeByCode": None}})
assert "discountCodeBasicCreate" in payload["query"]
assert payload["variables"]["input"]["code"].startswith("WD-")
return httpx.Response(200, json={"data": {"discountCodeBasicCreate": {
    "codeDiscountNode": {"id": "gid://shopify/DiscountCodeNode/7"},
    "userErrors": [],
}}})
```

Os cenários DB atuais autorizam percentual; o mock deve recusar operação inesperada, sem resposta genérica de sucesso para qualquer URL. Não importar helper de outro módulo de teste nem acrescentar transporte global. Manter `_shopify_transport() -> tuple[httpx.MockTransport, list[httpx.Request]]` e os transportes injetados em `_tool/_toucher`.

- [ ] **Step 7b: preservar idempotência de negócio e ausência de emissão na negativa (3 min).**

Em `TestTheHappyPath.test_asking_again_reuses_grant_and_skips_the_provider`, manter as três asserts existentes (`decision == "reused"`, mesmo código, nenhuma requisição adicional), acrescentando:

```python
assert first.success is True
assert second.success is True
assert calls_after_first == 2  # lookup GraphQL e uma mutation de criação
(grant_count,) = admin.execute(
    "select count(*) from public.incentive_grants where organization_id = %s",
    (org,),
).fetchone()
assert grant_count == 1
```

Preservar `test_provider_failure_leaves_the_grant_issued_for_the_retry` com estado `("issued", None)`, validação de grant de outro contato/expirado/valor divergente, negativa sem HTTP e cupom no prompt do toucher somente após autorização. As fixtures não substituem essas assertions por mero `success=True`.

- [ ] **Step 8: GREEN focal e gates (2 min para iniciar).**

`uv run --directory runtime pytest tests/unit/test_shopify_connector.py -q`. Executar `uv run --directory runtime ruff check .` e `uv run --directory runtime lint-imports`. Esperado exit 0, nenhum cenário de colisão removido. `rg -n "price_rules|discount_codes" runtime/tests` deve retornar nenhuma fixture/assert de endpoint REST; comentários históricos só podem permanecer identificados como tal no relatório.

- [ ] **Step 8a: GREEN dos consumidores DB em projeto novo (2 min para iniciar).**

O guardião cria nonce novo e interrompe a sequência em qualquer falha de Prepare/Replay:

```powershell
$greenRun = Join-Path (Get-Location).Path ('.superpowers/sdd/auditoria-ia-disposable/' + [guid]::NewGuid().ToString('N'))
pwsh -File scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $greenRun
pwsh -File scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $greenRun
& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $greenRun -TestTargets @('tests/db/test_create_coupon_tool.py','tests/db/test_toucher.py')
```

Esperado ambos arquivos completos PASS, inclusive retry sem segundo provedor, negativa sem HTTP, cupom antes do prompt e redelivery do toque sem segunda geração. `TestTargets` é array estruturado, não string de flags pytest. Coletar JUnit/saída, identidade e exit do gate; Test encerra esse projeto no finally. A verificação DB pós-commit repete esse ciclo com outro nonce.

- [ ] **Step 9: registrar resultado, revisar e commit (3 min).**

`git add runtime/src/agents_runtime/connectors/shopify.py runtime/tests/unit/test_shopify_connector.py runtime/tests/db/test_create_coupon_tool.py runtime/tests/db/test_toucher.py`; `git commit -m "fix: migrate runtime Shopify coupons to GraphQL"`. Revisor Astra compara riscos de dinheiro e compatibilidade; Terra repete unit focal no commit e guardião Astra repete os dois consumidores DB em nonce novo. Rollback: revert deste commit repõe conector REST e suas fixtures juntos, sem apagar cupons/grants; migrations W2 permanecem. Promoção bloqueada sem escopos GraphQL comprovados.

### Task 2: W5-T2 — corrigir clientes de presença e ajuda da missão

**Files:**
- Modify: `src/components/layout/Header.tsx` — `UserMenuDropdown.fetchAgents`.
- Modify: `src/components/flow-builder/panels/MissionEditorModal.tsx` — campo `enabled_tools`.
- Delete: `src/hooks/useHeartbeat.ts`, somente após a busca comprovar nenhum importador.
- Create: `src/lib/agent-presence.ts`, `src/lib/agent-presence.test.ts`.
- Test: `src/app/api/agents/status/route.test.ts`, `src/app/api/queue/agents/route.test.ts`, `src/lib/ai/__tests__/hub-runtime-parity.test.ts`.

**Interfaces:**
- Consumes: GET `/api/agents/status -> {status}` para o próprio usuário; PUT com `status/status_message/max_conversations/on_break/break_reason/skills`; GET `/api/queue/agents -> {agents,metrics}` para lista autenticada.
- Produces: `loadAgentPresence(): Promise<Array<{id: string; name: string; avatar_url?: string; status: 'online'|'offline'|'away'|'busy'; last_seen_at?: string}>>`, consumida somente por Header. A função isola fetch+mapeamento testável sem instalar DOM de teste.
- `useAgentStatus` continua sendo consumidor vivo para presença individual. Sem novo POST, sem uso de `agent_id` da metadata para autorização.
- Implementador Terra high; revisor Sol high; verificador Terra high.

- [ ] **Step 1: fixar decisão e consumidores (3 min).**

`rg -n "useHeartbeat|useAgentStatus|/api/agents/status|/api/queue/agents" src`. O estado lido mostra `useHeartbeat` sem importador e Header esperando lista de uma rota individual. Registrar decisão do contrato no ledger e obter decisão de produto exigida pela spec antes de mudar a UI. Proposta concreta para aprovação: lista vem da rota de fila, presença individual mantém PUT, hook órfão é removido; texto de missão só promete `create_coupon` e tools HTTP cadastradas. Se a decisão divergir, atualizar esta tarefa antes de escrever.

- [ ] **Step 2: escrever RED de lista com nome/perfil (3 min).**

```typescript
import { afterEach, expect, it, vi } from 'vitest'
import { loadAgentPresence } from './agent-presence'
afterEach(() => vi.unstubAllGlobals())
it('carrega a lista autenticada e traduz o perfil do agente', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ agents: [{
    id: 'presence-a', status: 'online', last_activity_at: '2026-09-08T12:00:00Z',
    profile: { full_name: 'Ana', avatar_url: '/ana.png' },
  }] }))
  vi.stubGlobal('fetch', fetcher)
  expect(await loadAgentPresence()).toEqual([{
    id: 'presence-a', status: 'online', name: 'Ana', avatar_url: '/ana.png',
    last_seen_at: '2026-09-08T12:00:00Z',
  }])
  expect(fetcher).toHaveBeenCalledWith('/api/queue/agents')
})
it('não apresenta falha HTTP como lista vazia', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
  await expect(loadAgentPresence()).rejects.toThrow('Falha ao carregar agentes')
})
```

- [ ] **Step 3: executar RED (2 min).**

`pnpm exec vitest run src/lib/agent-presence.test.ts`. Falha inicial por módulo inexistente; criar export com `throw new Error('Falha ao carregar agentes')` e repetir para observar a primeira expectativa funcional falhar.

- [ ] **Step 4: implementar lista e substituir chamada do Header (4 min).**

```typescript
export async function loadAgentPresence() {
  const response = await fetch('/api/queue/agents')
  if (!response.ok) throw new Error('Falha ao carregar agentes')
  const data = await response.json()
  return (data.agents ?? []).map((agent: {
    id: string; status: 'online' | 'offline' | 'away' | 'busy';
    last_activity_at?: string;
    profile: { full_name?: string; avatar_url?: string } | null;
  }) => ({
    id: agent.id, status: agent.status,
    name: agent.profile?.full_name || 'Atendente',
    avatar_url: agent.profile?.avatar_url,
    last_seen_at: agent.last_activity_at,
  }))
}
```

Importar a função em Header e substituir fetch/parse/setAgents por `setAgents(await loadAgentPresence())`, preservando try/finally existente.

- [ ] **Step 5: remover promessa incorreta da missão (3 min).**

No teste existente de paridade, acrescentar:

```typescript
it('a ajuda da missão oferece cupom e não nomes sem executor', () => {
  const mission = read('src/components/flow-builder/panels/MissionEditorModal.tsx')
  expect(mission).toContain('placeholder="create_coupon"')
  expect(mission).not.toContain('get_customer_context')
  expect(mission).not.toContain('placeholder="search_knowledge')
})
```

Executar `pnpm exec vitest run src/lib/ai/__tests__/hub-runtime-parity.test.ts` e observar RED da ajuda; depois usar `placeholder="create_coupon"` e ajuda visível “Adicione create_coupon ou o nome de uma ferramenta HTTP cadastrada.” Não rejeitar/purgar valores de missões salvas; preservar mudanças de W4.

- [ ] **Step 6: remover hook órfão e provar compatibilidade (3 min).**

Busca sem importadores permite delete via apply_patch de `src/hooks/useHeartbeat.ts`. Executar `pnpm exec vitest run src/lib/agent-presence.test.ts src/app/api/agents/status/route.test.ts src/app/api/queue/agents/route.test.ts src/lib/ai/__tests__/hub-runtime-parity.test.ts`; iniciar `pnpm typecheck` e `pnpm build`. Esperado todos exit 0; duas orgs e ausência de sessão preservadas.

- [ ] **Step 7: coletar GREEN, commit e rollback (3 min).**

Adicionar somente os seis arquivos alterados/criados/deletados desta tarefa e o teste de paridade via `git add` com caminhos explícitos; `git commit -m "fix: align presence clients and mission tool hints"`. Rollback reverte o commit; não toca dados de presença. Se aparecer consumidor do hook, bloquear sua deleção e adaptar o briefing ao PUT autenticado antes da implementação.

### Task 3: W5-T3 — eliminar órfãos comprovados

**Files:**
- Delete: `src/lib/route-permissions.ts`.
- Modify: `src/lib/webhooks/safe-fetch.ts`.
- Test: `src/app/api/workers/webhook-delivery/__tests__/route.test.ts`.
- Read: `src/middleware.ts`, `src/lib/ai/ssrf-guard.ts` e importadores de `validateUrl/isPrivateIP`.

**Interfaces:**
- Consumes/preserves: `validateUrl(rawUrl: string): URL`, `isPrivateIP(ip: string): boolean`.
- Removes: `createSafeAgent`, `safeFetch`, `SafeFetchResult` somente do arquivo `src/lib/webhooks/safe-fetch.ts`; `src/lib/ai/ssrf-guard.ts::safeFetch` é vivo.
- Implementador Luna medium; revisor Terra high; verificador Terra high.

- [ ] **Step 1: prova inicial de alcance (3 min).**

`rg -n "route-permissions|webhooks/safe-fetch|createSafeAgent|SafeFetchResult" src worker`. Separar declaração de importador; registrar importadores de `validateUrl/isPrivateIP`. Resultado esperado: route-permissions sem consumidor, transporte antigo sem consumidor, validadores vivos. Qualquer novo consumidor impede delete daquele símbolo.

- [ ] **Step 2: medir baseline focal (2 min).**

`pnpm exec vitest run src/app/api/workers/webhook-delivery/__tests__/route.test.ts src/lib/ai/__tests__/ssrf-guard.test.ts`. Guardar contagens/exit; não forjar RED para remoção sem mudança de comportamento.

- [ ] **Step 3: menor remoção (3 min).**

Via apply_patch remover arquivo de permissões morto e, de safe-fetch, imports `Agent/undiciFetch/lookup`, export `SafeFetchResult` e funções de transporte completas. Manter `net`, `BLOCKED_HOSTNAMES`, `isPrivateIP/isPrivateIPv4/isPrivateIPv6/validateUrl` literalmente. Não mexer em listas de autorização do middleware.

- [ ] **Step 4: GREEN estrutural e funcional (2 min para iniciar).**

Repetir busca: nenhum import órfão; repetir focal Step 2 e iniciar `pnpm typecheck`, `pnpm build`. Esperado exit 0. Sem novo teste espelhando ausência textual; typecheck/build são a prova de exclusão.

- [ ] **Step 5: coletar saída e commit (3 min).**

`git add src/lib/route-permissions.ts src/lib/webhooks/safe-fetch.ts`; `git commit -m "refactor: remove unused permission and webhook transport code"`. Revisor Terra valida remoção; rollback por revert repõe apenas os símbolos excluídos.

### Task 4: W5-T3 — corrigir scripts manuais sem executar efeitos externos

**Files:**
- Modify: `scripts/test-ai-system.sh` — TESTE 9.
- Modify: `scripts/test-commands.sh` — TESTE 12.

**Interfaces:**
- Consumes: GET `/api/whatsapp/cloud/webhook` sem `hub.mode` retorna HTTP 403 e corpo `Invalid mode`.
- Produces: smoke de rejeição de request incompleto, sem afirmar que IA está habilitada ou que versão é 2.0.
- Implementador Luna medium; revisor Terra high; verificador Terra high.

- [ ] **Step 1: prova inicial (2 min).**

Ler `src/app/api/whatsapp/cloud/webhook/route.ts::GET` e os dois blocos: falta `hub.mode=subscribe`; documentar que as expectativas JSON atuais são impossíveis. Não executar os scripts inteiros: contêm operações que enviam mensagens ou mudam estado.

- [ ] **Step 2: menor substituição (3 min).**

No TESTE 9, usar:

```bash
print_header "TESTE 9: REJEICAO DE CHALLENGE INCOMPLETO"
RESPONSE=$(curl -sS -w '\n%{http_code}' "$BASE_URL/api/whatsapp/cloud/webhook")
HTTP_STATUS=${RESPONSE##*$'\n'}
HTTP_BODY=${RESPONSE%$'\n'*}
check_response "$HTTP_BODY" '^Invalid mode$' "Challenge incompleto rejeitado"
check_response "$HTTP_STATUS" '^403$' "HTTP 403"
```

`check_response` usa `grep -q`, portanto as âncoras verificam o corpo e o status isolados integralmente. No TESTE 12, trocar a linha por `curl -sS -i "$BASE_URL/api/whatsapp/cloud/webhook"` e comentar “Esperado 403 Invalid mode; isso não comprova envio nem IA habilitada.” Não repontar POSTs para webhooks reais.

- [ ] **Step 3: validar apenas sintaxe e contrato local (3 min).**

`bash -n scripts/test-ai-system.sh scripts/test-commands.sh`, exit 0. Em shell descartável, executar só o bloco editado com função `curl() { printf 'Invalid mode\n403'; }` e `check_response() { printf '%s\n' "$1" | grep -q "$2"; }`; esperar êxito, trocar stub para `Invalid mode\n500` e exigir falha do assert HTTP. Registrar saída dos dois casos; nenhum servidor/chave/URL real.

- [ ] **Step 4: commit (2 min).**

`git add scripts/test-ai-system.sh scripts/test-commands.sh`; `git commit -m "fix: correct manual WhatsApp challenge checks"`. Rollback: revert. A ausência de execução integral é limite intencional e vai no relatório.

### Task 5: W5-T4 — tornar documentação executável e remover AGENTS_WORKERS fictícia

**Files:**
- Modify: `runtime/DEPLOY.md` — lista de tuning; `runtime/FORK.md` — contratos atuais e proveniência.
- Modify: citações em `runtime/src/agents_runtime/__init__.py`, `runtime/src/agents_runtime/agent_core/llm.py`, `runtime/src/agents_runtime/agent_core/think_gate.py`, `runtime/src/agents_runtime/config.py`, `runtime/src/agents_runtime/queueing/backoff.py`, `runtime/src/agents_runtime/queueing/polling.py`, `runtime/src/agents_runtime/queueing/__init__.py`.
- Modify: `runtime/pyproject.toml` (comentários), `runtime/tests/unit/test_backoff.py`, `runtime/tests/unit/test_no_sql_outside_repository.py`, `runtime/tests/unit/test_think_gate.py` (docstrings), `runtime/docs/observabilidade-e-monitoramento.md`.
- Read: `runtime/src/agents_runtime/app.py::run`, `runtime/src/agents_runtime/__main__.py::_serve`, `runtime/src/agents_runtime/config.py::config_from_env`.

**Interfaces:**
- Consumes/preserves: `app.run(..., workers: int = 2)`; `config_from_env(environ: dict[str,str]) -> QueueingConfig`; nenhum novo knob.
- Produces: documento atual em `runtime/FORK.md#contratos-verificaveis-do-fork`, substituto explícito das referências indisponíveis, sem fingir recuperar ADRs históricos.
- Implementador Luna medium; revisor Sol high; verificador Terra high.

- [ ] **Step 1: inventário/prova inicial (3 min).**

`rg -n "AGENTS_WORKERS|arquitetura|ADR-[45]" runtime/src runtime/pyproject.toml runtime/tests/unit runtime/docs runtime/DEPLOY.md`; ler `run` e `_serve`: default 2, nenhum env pass-through. Confirmar ausência do documento original usando `rg --files core runtime/docs`. Consultar dono documental para decisão exigida pelo item 88; proposta é substituir citações por contratos verificáveis locais, sem fabricar doc histórico. Falta da decisão mantém item 88 aberto.

- [ ] **Step 2: menor correção da promessa de workers (2 min).**

Retirar `AGENTS_WORKERS` da lista de tuning e escrever: “O entrypoint usa dois workers (`app.run`, default `workers=2`). Não há variável de ambiente para alterar essa quantidade.” Não adicionar parser/validação de env que ninguém consome.

- [ ] **Step 3: adicionar referência verificável ao FORK (4 min).**

Adicionar seção `## Contratos verificáveis do fork`: SQL é do repository com exceções nomeadas em pyproject; canais e conectores independentes; agent_core/judges não chamam canais; retry mora em `queueing/backoff.py` e seu teste; polling/temporização em `config.py` e `queueing/polling.py`; think-gate em `agent_core/think_gate.py` e seu teste. Explicitar “Documento upstream de arquitetura não está no fork; esta seção registra contratos atuais, não os ADRs históricos.” Usar links relativos reais para cada fonte.

- [ ] **Step 4: substituir citações órfãs (4 min).**

Nos arquivos enumerados, trocar referências a `core/arquitetura-plataforma-agentes-whatsapp.md` e seções/ADRs sem fonte pelos caminhos vivos da seção acima; preservar texto normativo, funções e assertions. Anotar `core/` como proveniência histórica apenas quando não houver promessa de link acessível. Nenhuma refatoração executável neste pacote.

- [ ] **Step 5: GREEN e gate da onda (2 min para iniciar).**

`uv run --directory runtime ruff check .`; `uv run --directory runtime lint-imports`; `uv run --directory runtime pytest -m unit`. `pnpm test`, `pnpm typecheck`, `pnpm build`. Capturar resultados completos em passos de coleta separados; exit 0 em todos, sem importadores órfãos e sem reduzir testes para o gate passar.

- [ ] **Step 6: coletar resultados, revisar e commit (3 min).**

`git diff --name-only` deve conter apenas os arquivos enumerados nesta tarefa. `git add` com essa lista explícita; `git commit -m "docs: align runtime tuning and architecture references"`. Rollback por revert é documental; nenhum ajuste de número de workers ou configuração remota.

## Saída e autorrevisão

Task 1 cobre 64; Task 2 cobre 87 e dois clientes incompatíveis; Task 3 cobre 91/safeFetch; Task 4 cobre 93; Task 5 cobre 88/AGENTS_WORKERS. Decisão de status ou documentação pendente significa pacote aguardando decisão, nunca item encerrado. Finalizar o relatório da onda com commits, antes/depois e gates; não marcar 92 nesta onda.

Autorrevisão obrigatória: matriz arquivo/produtor/consumidor; nenhum arquivo com dois implementadores; assinatura de create_discount preservada; não apagar validadores vivos; capacidade da missão não ampliada; documentação não depende de arquivo ausente; limites 3 tentativas/6s e isolamento não enfraquecidos. Publicação permanece fora do plano.
