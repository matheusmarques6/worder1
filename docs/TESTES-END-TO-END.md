# 🧪 TESTES END-TO-END - Sistema de Agentes de IA

## 📋 PRÉ-REQUISITOS

Antes de testar, confirme que:

- [ ] Variáveis de ambiente configuradas no Vercel:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
  - `OPENAI_API_KEY`
  - `EVOLUTION_API_URL`
  - `EVOLUTION_API_KEY`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

- [ ] SQL executado no Supabase (Etapa 7)

- [ ] Deploy feito no Vercel

- [ ] Pelo menos 1 agente de IA criado e **ativo** no sistema

---

## 🔗 URLs BASE

Substitua `SEU_DOMINIO` pelo seu domínio real:

```
BASE_URL=https://SEU_DOMINIO.vercel.app
```

Ou para testes locais:
```
BASE_URL=http://localhost:3000
```

---

## 📝 DADOS NECESSÁRIOS

Antes de começar, obtenha:

1. **Organization ID**: UUID da sua organização no Supabase
2. **Agent ID**: UUID de um agente ativo
3. **Instance ID**: UUID de uma instância WhatsApp conectada

Para encontrar esses IDs, acesse o Supabase:
- `organizations` → copie o `id`
- `ai_agents` → copie o `id` de um agente com `is_active = true`
- `whatsapp_instances` → copie o `id`

---

## 🧪 TESTE 1: Verificar API de Teste

### 1.1 Status Geral
```bash
curl -s https://SEU_DOMINIO.vercel.app/api/ai/test | jq
```

**Resposta esperada:**
```json
{
  "status": "API de Teste do Motor de IA",
  "redis": {
    "configured": true,
    "connected": true,
    "latencyMs": 45
  },
  "environment": {
    "UPSTASH_REDIS_REST_URL": "✅ Configurado",
    "OPENAI_API_KEY": "✅ Configurado"
  }
}
```

**✅ Passou se:** `redis.connected = true`

---

## 🧪 TESTE 2: Conexão Redis

```bash
curl -s -X POST https://SEU_DOMINIO.vercel.app/api/ai/test \
  -H "Content-Type: application/json" \
  -d '{"action": "test_redis"}' | jq
```

**Resposta esperada:**
```json
{
  "success": true,
  "message": "✅ Redis conectado com sucesso!",
  "latencyMs": 42
}
```

**✅ Passou se:** `success = true`

**❌ Se falhou:** Verifique as variáveis `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`

---

## 🧪 TESTE 3: Listar Agentes

```bash
curl -s -X POST https://SEU_DOMINIO.vercel.app/api/ai/test \
  -H "Content-Type: application/json" \
  -d '{
    "action": "list_agents",
    "organizationId": "SEU_ORGANIZATION_ID"
  }' | jq
```

**Resposta esperada:**
```json
{
  "success": true,
  "count": 1,
  "agents": [
    {
      "id": "uuid-do-agente",
      "name": "Assistente de Vendas",
      "is_active": true,
      "provider": "openai",
      "model": "gpt-4o-mini"
    }
  ]
}
```

**✅ Passou se:** Retorna pelo menos 1 agente com `is_active = true`

**❌ Se falhou:** Crie um agente no sistema ou ative um existente

---

## 🧪 TESTE 4: Testar RAG (Conhecimento)

```bash
curl -s -X POST https://SEU_DOMINIO.vercel.app/api/ai/test \
  -H "Content-Type: application/json" \
  -d '{
    "action": "test_rag",
    "agentId": "SEU_AGENT_ID",
    "query": "preço produto"
  }' | jq
```

**Resposta esperada:**
```json
{
  "success": true,
  "query": "preço produto",
  "results_count": 3,
  "results": [
    {
      "source_name": "Tabela de Preços",
      "content_preview": "Nossos produtos custam...",
      "similarity": 0.8542
    }
  ],
  "search_time_ms": 234
}
```

**✅ Passou se:** `success = true` (mesmo com 0 resultados, se não houver conhecimento cadastrado)

**⚠️ Se 0 resultados:** Adicione fontes de conhecimento ao agente

---

## 🧪 TESTE 5: Estatísticas do Cache

```bash
curl -s -X POST https://SEU_DOMINIO.vercel.app/api/ai/test \
  -H "Content-Type: application/json" \
  -d '{"action": "cache_stats"}' | jq
```

**Resposta esperada:**
```json
{
  "success": true,
  "cache": {
    "embeddings": {
      "totalKeys": 15,
      "estimatedMemoryMB": 0.09,
      "sessionStats": {
        "hits": 5,
        "misses": 2,
        "hitRate": 71
      }
    }
  }
}
```

**✅ Passou se:** `success = true`

---

## 🧪 TESTE 6: Processar Mensagem (Direto)

Este teste chama o motor de IA diretamente, sem passar pelo webhook.

```bash
curl -s -X POST https://SEU_DOMINIO.vercel.app/api/ai/test \
  -H "Content-Type: application/json" \
  -d '{
    "action": "process",
    "agentId": "SEU_AGENT_ID",
    "organizationId": "SEU_ORGANIZATION_ID",
    "message": "Olá, qual o preço do produto?"
  }' | jq
```

**Resposta esperada:**
```json
{
  "success": true,
  "result": {
    "response": "Olá! Nossos produtos variam de R$50 a R$500...",
    "sources_used": ["Tabela de Preços"],
    "actions_triggered": [],
    "tokens_used": 245,
    "response_time_ms": 1234
  }
}
```

**✅ Passou se:** `success = true` e `result.response` contém texto

**❌ Se falhou:** 
- Verifique se `OPENAI_API_KEY` está configurada
- Verifique se o agente está ativo
- Verifique os logs no Vercel

---

## 🧪 TESTE 7: Simular Webhook (SEM WhatsApp)

Este é o teste mais importante - simula o fluxo completo sem enviar mensagem real.

```bash
curl -s -X POST https://SEU_DOMINIO.vercel.app/api/ai/test/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "SEU_ORGANIZATION_ID",
    "phoneNumber": "5511999999999",
    "message": "Olá, preciso de ajuda com meu pedido"
  }' | jq
```

**Resposta esperada:**
```json
{
  "success": true,
  "simulation": true,
  "whatsapp_sent": false,
  "input": {
    "phoneNumber": "5511999999999",
    "message": "Olá, preciso de ajuda com meu pedido"
  },
  "result": {
    "processed": true,
    "replied": true,
    "transferred": false,
    "response": "Olá! Claro, posso te ajudar...",
    "agentName": "Assistente de Vendas"
  },
  "context": {
    "conversationId": "uuid-da-conversa",
    "contactId": "uuid-do-contato"
  }
}
```

**✅ Passou se:**
- `success = true`
- `result.processed = true`
- `result.replied = true`
- `result.response` contém a resposta da IA

**❌ Se `result.processed = false`:**
- Verifique se existe agente ativo
- Verifique se a conversa tem `ai_enabled = true`

---

## 🧪 TESTE 8: Status da Conversa

Após o Teste 7, verifique o status:

```bash
curl -s -X POST https://SEU_DOMINIO.vercel.app/api/ai/test \
  -H "Content-Type: application/json" \
  -d '{
    "action": "conversation_status",
    "phoneNumber": "5511999999999",
    "organizationId": "SEU_ORGANIZATION_ID"
  }' | jq
```

**Resposta esperada:**
```json
{
  "success": true,
  "conversation": {
    "id": "uuid",
    "phone_number": "5511999999999",
    "ai_enabled": true,
    "activeAgent": {
      "id": "uuid-do-agente",
      "name": "Assistente de Vendas"
    }
  },
  "stats": {
    "totalMessages": 2,
    "aiMessages": 1
  },
  "ai_status": "✅ IA ativa"
}
```

---

## 🧪 TESTE 9: Habilitar/Desabilitar IA

### Desabilitar:
```bash
curl -s -X POST https://SEU_DOMINIO.vercel.app/api/ai/test \
  -H "Content-Type: application/json" \
  -d '{
    "action": "disable_ai",
    "phoneNumber": "5511999999999",
    "organizationId": "SEU_ORGANIZATION_ID",
    "reason": "teste_manual"
  }' | jq
```

### Habilitar:
```bash
curl -s -X POST https://SEU_DOMINIO.vercel.app/api/ai/test \
  -H "Content-Type: application/json" \
  -d '{
    "action": "enable_ai",
    "phoneNumber": "5511999999999",
    "organizationId": "SEU_ORGANIZATION_ID"
  }' | jq
```

---

## 🧪 TESTE 10: Webhook Real (COM WhatsApp)

⚠️ **ATENÇÃO:** Este teste ENVIA mensagem real no WhatsApp!

```bash
curl -s -X POST https://SEU_DOMINIO.vercel.app/api/ai/test/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "SEU_ORGANIZATION_ID",
    "phoneNumber": "SEU_NUMERO_REAL",
    "message": "Teste de integração",
    "skipWhatsAppSend": false
  }' | jq
```

**✅ Passou se:** Você recebeu a resposta no WhatsApp!

---

## 🧪 TESTE 11: Verificar Webhook do WhatsApp

```bash
curl -s https://SEU_DOMINIO.vercel.app/api/whatsapp/webhook | jq
```

**Resposta esperada:**
```json
{
  "status": "Webhook WhatsApp ativo",
  "ai_enabled": true,
  "version": "2.0",
  "features": ["message_processing", "ai_agent_response", "typing_indicator"]
}
```

---

## 📊 CHECKLIST FINAL

Execute todos os testes e marque:

| # | Teste | Status | Notas |
|---|-------|--------|-------|
| 1 | Status API | ⬜ | |
| 2 | Conexão Redis | ⬜ | |
| 3 | Listar Agentes | ⬜ | |
| 4 | Testar RAG | ⬜ | |
| 5 | Cache Stats | ⬜ | |
| 6 | Processar Mensagem | ⬜ | |
| 7 | Simular Webhook | ⬜ | |
| 8 | Status Conversa | ⬜ | |
| 9 | Enable/Disable IA | ⬜ | |
| 10 | Webhook Real | ⬜ | |
| 11 | Webhook Status | ⬜ | |

---

## 🐛 TROUBLESHOOTING

### Erro: "Redis não configurado"
- Verifique `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` no Vercel
- Faça redeploy após adicionar variáveis

### Erro: "Nenhum agente ativo"
- Acesse o sistema e crie/ative um agente
- Verifique se `is_active = true` na tabela `ai_agents`

### Erro: "OpenAI API error"
- Verifique `OPENAI_API_KEY`
- Verifique se tem créditos na conta OpenAI

### Erro: "Evolution API não configurada"
- Verifique `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`
- Verifique se a instância está conectada

### IA não responde no WhatsApp
1. Verifique se conversa tem `ai_enabled = true`
2. Verifique se existe agente ativo
3. Verifique logs no Vercel
4. Use o endpoint `/api/ai/test/webhook` para debug

### Resposta demora muito
- Normal: 2-5 segundos (inclui typing indicator)
- Se > 10s: Verifique logs, pode ser timeout da OpenAI

---

## 📱 TESTE FINAL NO WHATSAPP

1. Envie uma mensagem para o número conectado
2. Aguarde 2-5 segundos (typing indicator)
3. Receba a resposta da IA

Se funcionar, **PARABÉNS!** 🎉 O sistema está operacional!

---

## 📈 MONITORAMENTO

Após os testes, monitore:

1. **Vercel Logs**: https://vercel.com/[projeto]/logs
2. **Supabase Logs**: Dashboard → Logs
3. **Upstash Redis**: Console → Metrics
4. **Cache Hit Rate**: `/api/ai/test` → `cache_stats`

---

**Bom teste! 🚀**
