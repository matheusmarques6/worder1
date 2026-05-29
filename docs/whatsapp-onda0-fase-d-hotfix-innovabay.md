# Worder WhatsApp — Onda 0 Fase D: Hotfix InnovaBay

**Cliente:** InnovaBay
**Phone Number ID:** `1163643483491728`
**WABA ID:** `1596316152501451`
**Organization ID:** `425db1ba-99c0-4dbb-9434-27fe9cc03ec6`
**Store ID:** `d5dfd5dd-1d77-425e-a099-850338078999`
**Verify token:** `worder_zd6m8410yxwujq0v9fka`

Tempo estimado: **5 min pra executar + 1 min pra mensagem aparecer.**

---

## 1️⃣ Backup defensivo (Fase B)

Roda no **SQL Editor do Supabase**:

```sql
-- Backup só do que vamos tocar
CREATE TABLE IF NOT EXISTS _backup_innovabay_instance_20260529 AS
  SELECT * FROM whatsapp_instances
  WHERE phone_number_id = '1163643483491728';

-- Confirma que o backup pegou
SELECT count(*) FROM _backup_innovabay_instance_20260529;
-- esperado: 1
```

---

## 2️⃣ INSERT do InnovaBay em `whatsapp_business_accounts` (Fase D.1)

⚠️ **Substitua `<COLAR_ACCESS_TOKEN>`** pelo token que apareceu em A.4.2 (começa com `EAATKIRO...`).

```sql
INSERT INTO whatsapp_business_accounts (
  organization_id,
  store_id,
  phone_number_id,
  waba_id,
  app_id,
  phone_number,
  display_phone_number,
  verified_name,
  access_token,
  webhook_verify_token,
  webhook_configured,
  quality_rating,
  status,
  created_at,
  updated_at
) VALUES (
  '425db1ba-99c0-4dbb-9434-27fe9cc03ec6',
  'd5dfd5dd-1d77-425e-a099-850338078999',
  '1163643483491728',
  '1596316152501451',
  '1348143317160374',
  '+55 38 9825-8018',
  '+55 38 9825-8018',
  'InnovaBay',
  '<COLAR_ACCESS_TOKEN>',
  'worder_zd6m8410yxwujq0v9fka',
  false,
  'GREEN',
  'active',
  now(),
  now()
)
ON CONFLICT (phone_number_id) DO UPDATE SET
  organization_id      = EXCLUDED.organization_id,
  store_id             = EXCLUDED.store_id,
  waba_id              = EXCLUDED.waba_id,
  app_id               = EXCLUDED.app_id,
  access_token         = EXCLUDED.access_token,
  webhook_verify_token = EXCLUDED.webhook_verify_token,
  status               = 'active',
  updated_at           = now();
```

**Se der erro `column "store_id" does not exist`** → comenta a linha `store_id,` na lista de colunas E a linha `'d5dfd5dd-...',` nos valores. Roda de novo.

**Se der erro `column "app_id" does not exist`** → idem pra `app_id` e `'1348143317160374'`.

### Confirma que entrou

```sql
SELECT id, organization_id, store_id, phone_number_id, waba_id, status,
       (access_token IS NOT NULL) AS has_token,
       webhook_configured, webhook_verify_token
FROM whatsapp_business_accounts
WHERE phone_number_id = '1163643483491728';
```

Esperado: **1 linha** com `status=active`, `has_token=true`, `waba_id=1596316152501451`.

---

## 3️⃣ Curls Meta (Fase D.3)

Roda no **terminal local** (qualquer Mac/Linux/WSL). Substitua `<COLAR_ACCESS_TOKEN>` em cada comando.

### 3.1 — Inscrever o app no WABA

```bash
curl -X POST "https://graph.facebook.com/v22.0/1596316152501451/subscribed_apps" \
  -H "Authorization: Bearer <COLAR_ACCESS_TOKEN>"
```

Esperado: `{"success": true}`

Se der `Permissions error` → o token não tem `whatsapp_business_management`. Gera um System User Token no Meta Business Manager com as DUAS permissões: `whatsapp_business_messaging` E `whatsapp_business_management`.

### 3.2 — Confirmar subscription

```bash
curl -G "https://graph.facebook.com/v22.0/1596316152501451/subscribed_apps" \
  -H "Authorization: Bearer <COLAR_ACCESS_TOKEN>"
```

Esperado: array com pelo menos uma entrada onde `whatsapp_business_api_data.id` é `1348143317160374` (Convertfy Provider).

### 3.3 — Registrar phone number

```bash
curl -X POST "https://graph.facebook.com/v22.0/1163643483491728/register" \
  -H "Authorization: Bearer <COLAR_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","pin":"123456"}'
```

Esperado: `{"success": true}`

- **Erro 133006** ("Phone number already registered") → ✅ Já tava registrado, ignora e segue
- **Erro 133005** ("Two-step verification PIN mismatch") → a conta tem 2FA. Pede o PIN real de 6 dígitos pro cliente e troca `"123456"` por ele.

---

## 4️⃣ Apontar Meta Dashboard pra `/cloud/webhook` (Fase D.4)

No **Meta Business Suite → WhatsApp → Configuração → Webhooks**:

| Campo | Valor |
|---|---|
| **Callback URL** | `https://app.worder.com.br/api/whatsapp/cloud/webhook` |
| **Verify token** | `worder_zd6m8410yxwujq0v9fka` |
| **Subscribed fields** | Marca `messages` e `message_template_status_update` |

Clica **Verificar e salvar**. Deve passar verde.

> Nota: se você já tinha a URL antiga (`/api/whatsapp/webhook` ou `/api/whatsapp/meta/webhook`), o forward que entrou no commit `a65d6b2` mantém ambas funcionando — mas a canônica agora é `/cloud/webhook`. Vale trocar pra ficar tudo no caminho moderno.

---

## 5️⃣ Validação end-to-end (Fase D.5)

1. Manda **1 mensagem do seu celular pessoal** pro número `+55 38 9825-8018`.
2. Espera ~3 segundos.
3. Roda no SQL Editor:

```sql
SELECT id, message_id, direction, text_body, from_number, created_at
FROM whatsapp_cloud_messages
WHERE organization_id = '425db1ba-99c0-4dbb-9434-27fe9cc03ec6'
ORDER BY created_at DESC
LIMIT 5;
```

Esperado: linha com `direction='inbound'`, `text_body='<sua mensagem>'`, `from_number='<seu número>'`, `created_at` agora.

### Se NÃO apareceu

Roda essas queries pra diagnosticar onde caiu:

```sql
-- Será que caiu em whatsapp_messages legacy? (improvável após Onda 3 forward)
SELECT id, wamid, direction, content, created_at
FROM whatsapp_messages
WHERE organization_id = '425db1ba-99c0-4dbb-9434-27fe9cc03ec6'
ORDER BY created_at DESC
LIMIT 5;

-- Webhook events processados?
SELECT id, status, attempts, error_message, created_at
FROM whatsapp_webhook_events
ORDER BY created_at DESC
LIMIT 10;
```

Manda o output dos 2 e eu identifico onde tá travando.

---

## ✅ Checklist final

- [ ] Backup criado (`_backup_innovabay_instance_20260529` tem 1 linha)
- [ ] InnovaBay aparece em `whatsapp_business_accounts` com `status=active`
- [ ] `curl subscribed_apps` retornou `{success: true}` ou já tinha
- [ ] `curl register` retornou `{success: true}` ou erro 133006
- [ ] Meta Dashboard apontando pra `/api/whatsapp/cloud/webhook` com verify OK
- [ ] Mensagem de teste aparece em `whatsapp_cloud_messages` com `direction=inbound`

Quando todos os checkboxes ficarem ✅, **InnovaBay está enviando e recebendo via Cloud API** — independente de o código novo da Onda 1-4 estar ou não em prod.

---

## O que muda na aplicação agora

- ✅ **Envio**: a UI do Inbox já consegue enviar (porque após Onda 2, `/api/whatsapp/messages` lê de `whatsapp_business_accounts`). Mas isso só vale **após o deploy do código** — em prod hoje ainda tá a versão antiga.
- ✅ **Recebimento**: a Meta vai enviar mensagens pra `/api/whatsapp/cloud/webhook` (rota canônica antiga, já existia antes do Onda 1-4). Ou seja, **mesmo SEM o deploy do código novo, o InnovaBay vai receber mensagem** depois desse hotfix.
- ⚠️ **Tela de "Conectar WhatsApp" antiga**: continua bugada até o deploy do Onda 1-4. Não recomendo reconectar pela UI até lá.

---

## Próximo passo depois deste hotfix

1. **Validar que InnovaBay recebe** (5 acima)
2. **Confirmar env vars na Vercel** antes do próximo deploy:
   - `META_APP_SECRET` setado
   - `WHATSAPP_WEBHOOK_VERIFY_TOKEN` setado (renomeia se tinha `META_WEBHOOK_VERIFY_TOKEN` ou `WHATSAPP_VERIFY_TOKEN`)
3. **Deploy do branch `claude/debug-console-error-FWrLE`** — todo o Onda 1-4 entra em prod
4. **Re-teste InnovaBay no Inbox** (envio + recebimento via UI nova)
