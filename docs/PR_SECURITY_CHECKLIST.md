# ✅ CHECKLIST DE PR — SEGURANÇA & MULTI-TENANCY

> ❗ **Nenhum PR pode ser aprovado se algum item obrigatório estiver como ❌**

---

## 🔐 1. Autenticação (OBRIGATÓRIO)

### Para APIs de usuário (`/api/**` não-webhook)

- [ ] A rota usa `getAuthClient()` (ou equivalente)
- [ ] Retorna 401 se não houver usuário autenticado
- [ ] NÃO usa `getSupabaseAdmin()` ou `SERVICE_ROLE`
- [ ] NÃO confia em `organizationId` vindo do client (query/body)

> ❌ **Bloqueia PR se falhar**

### Para Webhooks / Callbacks externos

- [ ] NÃO usa `getAuthClient()`
- [ ] Usa `SERVICE_ROLE` apenas após autenticação externa válida
- [ ] Possui HMAC OU Bearer Token secreto
- [ ] Valida assinatura antes de qualquer acesso ao banco
- [ ] Rejeita requests sem assinatura (401)

> ❌ **Bloqueia PR se falhar**

---

## 🔒 2. HMAC / Tokens (OBRIGATÓRIO)

- [ ] Usa `createHmac()` (NUNCA `createHash`)
- [ ] O `secret` participa do cálculo
- [ ] Usa `timingSafeEqual`
- [ ] Buffer criado com encoding correto (`hex`, não `utf-8`)
- [ ] Token/secret não está hardcoded

> ❌ **Bloqueia PR se falhar**

---

## ⏱️ 3. Proteção contra Replay / Abuso (OBRIGATÓRIO em Webhooks)

- [ ] Timestamp presente no header ou payload
- [ ] Janela máxima validada (ex: ±5 minutos)
- [ ] Request fora da janela retorna 401
- [ ] Rate limit aplicado (in-memory, Redis ou edge)

> ❌ **Bloqueia PR se falhar**

---

## 🛡️ 4. SERVICE_ROLE (CRÍTICO)

- [ ] Uso de SERVICE_ROLE é justificado no PR
- [ ] SERVICE_ROLE NÃO é usado em APIs de usuário
- [ ] Toda query com SERVICE_ROLE tem filtro explícito por `organization_id`
- [ ] SERVICE_ROLE NÃO aparece em código client-side
- [ ] Preferencialmente usa wrapper (`getScopedAdminClient`)

> ❌ **Bloqueia PR se falhar**

---

## 🧠 5. RLS / Multi-Tenant

- [ ] Para APIs autenticadas, RLS é a principal proteção
- [ ] Não há `organizationId` vindo do client quando RLS já cobre
- [ ] Nenhuma query permite acesso cross-tenant
- [ ] SELECT / UPDATE / DELETE respeitam escopo da organização

> ⚠️ **Falha aqui exige correção antes do merge**

---

## 👥 6. Permissões (Admin / Owner)

Para rotas que:
- criam usuários
- gerenciam integrações
- alteram WhatsApp / números / templates
- usam `auth.admin.*`

- [ ] Existe check explícito de role (`admin` / `owner`)
- [ ] Usuário comum recebe 403
- [ ] Permissão não depende só do frontend

> ❌ **Bloqueia PR se falhar**

---

## 🔑 7. OAuth (Shopify / Meta / TikTok / etc.)

- [ ] `state` é validado com `consumeOAuthState()`
- [ ] `state` tem expiração (10 minutos)
- [ ] `state` é invalidado após uso (uso único)
- [ ] Callback não funciona sem `state`
- [ ] Callback não aceita replay

> ❌ **Bloqueia PR se falhar**

---

## 📦 8. Validação de Payload

- [ ] Inputs de `POST / PUT / PATCH` são validados
- [ ] Campos inesperados são rejeitados
- [ ] Não confia em payload externo sem validação
- [ ] Payload não é salvo "cru" sem inspeção

> ⚠️ **Altamente recomendado (bloqueia se for rota crítica)**

---

## 📊 9. Logging & Observabilidade

- [ ] Webhooks logam sucesso/falha
- [ ] Logs incluem: source, org, status
- [ ] Não loga secrets, tokens ou payloads sensíveis
- [ ] Erros críticos não são silenciosos

---

## 🧪 10. Testes de Segurança (quando aplicável)

- [ ] Teste manual ou automatizado: usuário A não acessa dados de B
- [ ] Teste de webhook com assinatura inválida
- [ ] Teste de replay (timestamp antigo)

---

## 📝 11. Documentação do PR

- [ ] PR descreve por que SERVICE_ROLE foi usado (se usado)
- [ ] PR descreve impacto em segurança / multi-tenant
- [ ] PR menciona se a rota é:
  - [ ] API de usuário
  - [ ] Webhook
  - [ ] Worker
  - [ ] OAuth callback

> ❌ **PR sem descrição técnica NÃO deve ser aprovado**

---

## 🚨 REGRA FINAL DE APROVAÇÃO

🔴 **Se envolver Webhook, SERVICE_ROLE, OAuth, Auth ou WhatsApp:**

- Mínimo **2 reviews**
- Checklist **100% preenchido**

---

## 📋 Template de Descrição de PR

```markdown
## Tipo de Rota
- [ ] API de usuário
- [ ] Webhook externo
- [ ] Worker/Job interno
- [ ] OAuth callback

## Autenticação
- Método: [getAuthClient / SERVICE_ROLE + HMAC / QStash]
- Justificativa: [por que esse método foi escolhido]

## Multi-Tenancy
- RLS ativo: [Sim/Não]
- Filtro de organization_id: [Via RLS / Explícito / N/A]

## Impacto em Segurança
- [ ] Nenhum
- [ ] Baixo - [descrever]
- [ ] Médio - [descrever]
- [ ] Alto - [descrever + justificar]

## Checklist Completo
- [ ] Todos os itens obrigatórios marcados acima
```

---

## 🏁 Resultado Esperado

Com esse checklist:

- ❌ bugs "invisíveis" não passam
- ❌ novos devs não quebram segurança sem perceber
- ✅ auditoria fica simples
- ✅ o projeto escala sem virar bomba-relógio
