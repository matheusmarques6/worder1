# =====================================================
# COMANDOS DE TESTE - COPIE E COLE
# =====================================================
# 
# ANTES DE USAR:
# 1. Substitua SEU_DOMINIO pelo seu domínio real
# 2. Substitua SEU_ORG_ID pelo ID da sua organização
# 3. Substitua SEU_AGENT_ID pelo ID de um agente ativo
#
# =====================================================

# =====================================================
# VARIÁVEIS - EDITE AQUI
# =====================================================

BASE_URL="https://SEU_DOMINIO.vercel.app"
ORG_ID="SEU_ORG_ID"
AGENT_ID="SEU_AGENT_ID"
PHONE="5511999999999"

# =====================================================
# TESTE 1: Status da API
# =====================================================

curl -s "$BASE_URL/api/ai/test" | jq

# =====================================================
# TESTE 2: Conexão Redis
# =====================================================

curl -s -X POST "$BASE_URL/api/ai/test" \
  -H "Content-Type: application/json" \
  -d '{"action": "test_redis"}' | jq

# =====================================================
# TESTE 3: Listar Agentes
# =====================================================

curl -s -X POST "$BASE_URL/api/ai/test" \
  -H "Content-Type: application/json" \
  -d "{\"action\": \"list_agents\", \"organizationId\": \"$ORG_ID\"}" | jq

# =====================================================
# TESTE 4: Estatísticas do Cache
# =====================================================

curl -s -X POST "$BASE_URL/api/ai/test" \
  -H "Content-Type: application/json" \
  -d '{"action": "cache_stats"}' | jq

# =====================================================
# TESTE 5: Testar RAG/Conhecimento
# =====================================================

curl -s -X POST "$BASE_URL/api/ai/test" \
  -H "Content-Type: application/json" \
  -d "{\"action\": \"test_rag\", \"agentId\": \"$AGENT_ID\", \"query\": \"preço\"}" | jq

# =====================================================
# TESTE 6: Processar Mensagem com IA
# =====================================================

curl -s -X POST "$BASE_URL/api/ai/test" \
  -H "Content-Type: application/json" \
  -d "{
    \"action\": \"process\",
    \"agentId\": \"$AGENT_ID\",
    \"organizationId\": \"$ORG_ID\",
    \"message\": \"Olá, preciso de ajuda\"
  }" | jq

# =====================================================
# TESTE 7: Simular Webhook (SEM enviar WhatsApp)
# =====================================================

curl -s -X POST "$BASE_URL/api/ai/test/webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"organizationId\": \"$ORG_ID\",
    \"phoneNumber\": \"$PHONE\",
    \"message\": \"Olá, preciso de ajuda com meu pedido\"
  }" | jq

# =====================================================
# TESTE 8: Status da Conversa
# =====================================================

curl -s -X POST "$BASE_URL/api/ai/test" \
  -H "Content-Type: application/json" \
  -d "{
    \"action\": \"conversation_status\",
    \"phoneNumber\": \"$PHONE\",
    \"organizationId\": \"$ORG_ID\"
  }" | jq

# =====================================================
# TESTE 9: Habilitar IA para Conversa
# =====================================================

curl -s -X POST "$BASE_URL/api/ai/test" \
  -H "Content-Type: application/json" \
  -d "{
    \"action\": \"enable_ai\",
    \"phoneNumber\": \"$PHONE\",
    \"organizationId\": \"$ORG_ID\"
  }" | jq

# =====================================================
# TESTE 10: Desabilitar IA para Conversa
# =====================================================

curl -s -X POST "$BASE_URL/api/ai/test" \
  -H "Content-Type: application/json" \
  -d "{
    \"action\": \"disable_ai\",
    \"phoneNumber\": \"$PHONE\",
    \"organizationId\": \"$ORG_ID\",
    \"reason\": \"teste_manual\"
  }" | jq

# =====================================================
# TESTE 11: Webhook Real (ENVIA WhatsApp!)
# ⚠️ CUIDADO: Este teste envia mensagem real!
# =====================================================

curl -s -X POST "$BASE_URL/api/ai/test/webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"organizationId\": \"$ORG_ID\",
    \"phoneNumber\": \"$PHONE\",
    \"message\": \"Teste de integração\",
    \"skipWhatsAppSend\": false
  }" | jq

# =====================================================
# TESTE 12: Status do Webhook
# =====================================================

curl -s "$BASE_URL/api/whatsapp/webhook" | jq

# =====================================================
# COMANDOS ÚTEIS
# =====================================================

# Ver logs do Vercel em tempo real:
# vercel logs --follow

# Verificar variáveis de ambiente:
# vercel env ls

# Redeployar:
# vercel --prod
