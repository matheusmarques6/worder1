# Worder Webhooks — Guia do integrador (v1)

Eventos normalizados emitidos pela sua loja Worder para endpoints externos. Payloads são JSON assinados com **HMAC SHA-256**.

- **Base URL de origem**: o seu endpoint recebe POST do Worder
- **Content-Type**: `application/json`
- **Versão do schema**: `1` (campo `version` em cada envelope)
- **Tamanho máximo do payload**: 256 KB
- **Retenção de logs de entrega**: 30 dias

---

## 1. Fluxo geral

1. Você cria um webhook em **Settings → Webhooks de saída**, informando URL e eventos.
2. Ao criar, o Worder mostra o **secret** (prefixado `whsec_`) uma única vez. Guarde-o — ele não será mostrado novamente.
3. Cada evento dispara um `POST` para sua URL com o envelope JSON e a assinatura no header `X-Worder-Signature`.
4. Você responde com **2xx** (qualquer) para confirmar recebimento. Outros códigos disparam retry.

---

## 2. Eventos disponíveis (catálogo v1)

| Event type                      | Quando dispara                                        |
| ------------------------------- | ----------------------------------------------------- |
| `order.created`                 | Pedido criado na Shopify                              |
| `order.paid`                    | Pagamento confirmado                                  |
| `order.fulfilled`               | Pedido marcado como enviado                           |
| `order.cancelled`               | Pedido cancelado                                      |
| `checkout.abandoned`            | Checkout iniciado e não concluído em ≥15min           |
| `payment.pix.abandoned`         | Checkout abandonado com método PIX                    |
| `payment.boleto.abandoned`      | Checkout abandonado com método boleto                 |
| `customer.created`              | Primeiro contato registrado (via customer ou pedido)  |
| `shipment.tracking_created`     | Fulfillment ganhou `tracking_number`                  |
| `browse.abandoned`              | `viewed_product` sem `added_to_cart` nem `placed_order` na janela de 30min–4h |

---

## 3. Envelope do payload

Todos os eventos compartilham a mesma envoltória:

```json
{
  "id": "evt_a1b2c3d4e5f6789012345678ab",
  "event": "order.created",
  "version": "1",
  "created_at": "2026-04-19T12:34:56.789Z",
  "organization_id": "org_uuid",
  "store_id": "store_uuid",
  "store": {
    "id": "store_uuid",
    "shop_domain": "minhaloja.myshopify.com",
    "name": "Minha Loja"
  },
  "data": {
    "order_id": "5678901234",
    "order_number": 1042,
    "total_price": 299.90,
    "currency": "BRL",
    "...": "specific to the event"
  }
}
```

- `id` é **determinístico** e **idempotente**: derivado de `sha256(source:source_event_id:event_type)` prefixado com `evt_`. Mesma tupla sempre gera o mesmo ID — use pra dedup no seu lado.
- `data` varia por evento; campos principais sempre presentes. Arrays longos (>100 items) são truncados com marker `_truncated: { items: true, original_count: N }`. Payloads gigantes sem items (>256KB) caem pra slim payload `{ _truncated: true, order_id, customer_id, … }`.

### Exemplos de `data` por evento

- **`order.created/paid/fulfilled/cancelled`**: `order_id`, `order_number`, `total_price`, `currency`, `financial_status`, `line_items`, e (fulfilled) `tracking_number/url/company`, (cancelled) `cancel_reason`.
- **`checkout.abandoned`** e variantes **pix/boleto**: `checkout_id`, `email`, `phone`, `total_price`, `currency`, `items`, `payment_method`.
- **`customer.created`**: `customer_id`, `shopify_customer_id`, `email`, `first_name`, `last_name`, `phone`.
- **`shipment.tracking_created`**: `order_id`, `fulfillment_id`, `tracking_number`, `tracking_url`, `tracking_company`, `status`.
- **`browse.abandoned`**: `contact_id`, `product_id`, `view_event_id`, `viewed_at`.

---

## 4. Headers enviados

```
Content-Type: application/json
User-Agent: Worder-Webhooks/1.0
X-Worder-Event: order.created
X-Worder-Event-Id: evt_a1b2c3d4e5f6789012345678ab
X-Worder-Delivery-Id: <uuid>
X-Worder-Timestamp: 1745086425
X-Worder-Signature: sha256=<hex>
```

- `X-Worder-Timestamp`: Unix seconds no momento do envio.
- `X-Worder-Signature`: uma ou duas assinaturas separadas por vírgula. Dois valores aparecem durante uma rotação de secret (secret antigo válido por 24h).

---

## 5. Validação de assinatura (obrigatório)

**Regra**: `expected = HMAC_SHA256(secret, "{timestamp}.{rawBody}")`. Compare em tempo constante com **cada** assinatura no header (remova o prefixo `sha256=`).

**CRÍTICO**: use o **body cru** exatamente como recebido (antes de qualquer parse). Reserializar o JSON pode mudar bytes e quebrar a validação.

### Node.js

```js
const crypto = require('crypto');

function verifyWorderSignature(rawBody, header, timestamp, secret) {
  const msg = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(msg).digest('hex');
  return header
    .split(',')
    .map((s) => s.trim().replace(/^sha256=/, ''))
    .some((sig) => {
      if (sig.length !== expected.length) return false;
      return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    });
}
```

### Python

```python
import hmac, hashlib

def verify_worder_signature(raw_body: bytes, header: str, timestamp: str, secret: str) -> bool:
    msg = f"{timestamp}.{raw_body.decode('utf-8')}".encode()
    expected = hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()
    for sig in header.split(','):
        candidate = sig.strip().removeprefix('sha256=')
        if hmac.compare_digest(candidate, expected):
            return True
    return False
```

### PHP

```php
function verify_worder_signature($rawBody, $header, $timestamp, $secret) {
    $expected = hash_hmac('sha256', $timestamp . '.' . $rawBody, $secret);
    foreach (explode(',', $header) as $part) {
        $sig = preg_replace('/^sha256=/', '', trim($part));
        if (hash_equals($expected, $sig)) return true;
    }
    return false;
}
```

### Proteção contra replay (recomendada)

Rejeite requests com `X-Worder-Timestamp` mais velho que 5 minutos:

```js
if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
```

---

## 6. Política de retry

O worker tenta até **5 vezes** com backoff exponencial antes de marcar como `failed`:

| Tentativa | Delay após a anterior |
| --------- | --------------------- |
| 2         | 1 min                 |
| 3         | 5 min                 |
| 4         | 30 min                |
| 5         | 2 h                   |
| (último)  | 6 h                   |

**Retryable**: HTTP `5xx`, `408`, `429`, erros de rede/DNS/timeout.
**Terminal (não tenta de novo)**: demais `4xx` (ex: `400`, `403`, `404`) — seu endpoint deve responder `2xx` rápido e processar assincronamente se necessário.

- **Timeout**: o Worder encerra se você não responder em **10s**.
- **Redirects**: não são seguidos (`redirect: manual`). Configure sua URL final diretamente.
- **Destinos**: apenas HTTPS pública. IPs privados (RFC 1918, loopback, metadata cloud) são bloqueados no lado do Worder.

---

## 7. Idempotência

- `X-Worder-Event-Id` é único e estável pra mesma ação upstream. Use-o como chave de dedup.
- Em replay (botão manual na UI do Worder), o `event_id` ganha sufixo `_replay_<timestamp>` mas o `payload` é o original. Você pode tratar como nova entrega ou ignorar se já processou o ID base.

---

## 8. Rotação de secret

Na UI: **Settings → Webhooks → Editar → Rotacionar secret**.

- Novo secret é mostrado uma vez; o antigo fica válido por **24 horas**.
- Durante a janela, o header `X-Worder-Signature` carrega **duas** assinaturas (nova e antiga) separadas por vírgula. Aceite se **qualquer uma** validar.
- Passadas as 24h, apenas a nova é usada.

---

## 9. Códigos HTTP esperados do integrador

| Seu código | Ação do Worder                  |
| ---------- | ------------------------------- |
| 2xx        | Marca como `delivered`          |
| 408, 429   | Retry (backoff)                 |
| 5xx        | Retry (backoff)                 |
| 400, 403, 404 e demais 4xx | Marca como `failed` imediatamente |

Evite responder `5xx` por erros de validação — isso gera retries desnecessários. Use `400` pra erros do payload e loge do seu lado.

---

## 10. Como testar

1. Crie um endpoint de captura (ex: [webhook.site](https://webhook.site)).
2. Registre o URL em **Settings → Webhooks de saída → Novo webhook**.
3. Selecione `order.created` (ou outro evento disponível).
4. Abra o webhook criado e clique em **Testar entrega** — um payload sintético é enviado. Rate-limit: 10 testes/hora por webhook.
5. Verifique no webhook.site: headers, corpo JSON, assinatura.
6. Dispare um evento real (criar pedido na sua dev store) e acompanhe em **Logs de entregas**.

---

## 11. Limitações v1

- Payload máximo **256 KB**. Truncagem automática acima disso.
- Retenção de logs: **30 dias** (entregas concluídas/falhadas são purgadas depois).
- Apenas HTTPS. HTTP só é aceito no ambiente de dev local do Worder.
- Sem filtros por condições customizadas (todas as entregas de um evento assinado chegam).
- Sem batching: 1 delivery = 1 request.
- Dados pessoais (emails, telefones, nomes, IDs) trafegam no payload. Você é responsável por base legal e confidencialidade no seu lado (LGPD).

---

## 12. Suporte

Logs de cada entrega ficam em **Settings → Webhooks → [webhook] → Logs**. Há botão pra reenviar uma entrega falha sob demanda.

Qualquer dúvida ou bug: abra um ticket informando `X-Worder-Delivery-Id`.
