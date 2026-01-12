#!/bin/bash

# =====================================================
# SCRIPT DE TESTES AUTOMATIZADOS
# Sistema de Agentes de IA - Worder
# =====================================================

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Contadores
PASSED=0
FAILED=0
SKIPPED=0

# =====================================================
# CONFIGURAÇÃO - EDITE AQUI
# =====================================================

BASE_URL="${BASE_URL:-https://SEU_DOMINIO.vercel.app}"
ORGANIZATION_ID="${ORGANIZATION_ID:-SEU_ORG_ID}"
AGENT_ID="${AGENT_ID:-SEU_AGENT_ID}"
TEST_PHONE="${TEST_PHONE:-5511999999999}"

# =====================================================
# FUNÇÕES AUXILIARES
# =====================================================

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_test() {
    echo -e "\n${YELLOW}🧪 TESTE: $1${NC}"
}

print_pass() {
    echo -e "${GREEN}✅ PASSOU: $1${NC}"
    ((PASSED++))
}

print_fail() {
    echo -e "${RED}❌ FALHOU: $1${NC}"
    ((FAILED++))
}

print_skip() {
    echo -e "${YELLOW}⏭️ PULADO: $1${NC}"
    ((SKIPPED++))
}

check_response() {
    local response="$1"
    local expected="$2"
    local test_name="$3"
    
    if echo "$response" | grep -q "$expected"; then
        print_pass "$test_name"
        return 0
    else
        print_fail "$test_name"
        echo "Resposta: $response"
        return 1
    fi
}

# =====================================================
# VERIFICAR CONFIGURAÇÃO
# =====================================================

print_header "VERIFICANDO CONFIGURAÇÃO"

if [[ "$BASE_URL" == *"SEU_DOMINIO"* ]]; then
    echo -e "${RED}❌ Configure BASE_URL antes de executar${NC}"
    echo "Execute: export BASE_URL=https://seu-dominio.vercel.app"
    exit 1
fi

if [[ "$ORGANIZATION_ID" == *"SEU_ORG"* ]]; then
    echo -e "${YELLOW}⚠️ ORGANIZATION_ID não configurado - alguns testes serão pulados${NC}"
fi

echo "BASE_URL: $BASE_URL"
echo "ORGANIZATION_ID: $ORGANIZATION_ID"
echo "AGENT_ID: $AGENT_ID"
echo "TEST_PHONE: $TEST_PHONE"

# =====================================================
# TESTE 1: STATUS DA API
# =====================================================

print_header "TESTE 1: STATUS DA API"

print_test "Verificando se API está online"
RESPONSE=$(curl -s "$BASE_URL/api/ai/test" 2>/dev/null)

if [ -z "$RESPONSE" ]; then
    print_fail "API não respondeu - verifique a URL"
    exit 1
fi

check_response "$RESPONSE" '"status"' "API respondendo"

# =====================================================
# TESTE 2: CONEXÃO REDIS
# =====================================================

print_header "TESTE 2: CONEXÃO REDIS"

print_test "Testando conexão com Redis"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/ai/test" \
    -H "Content-Type: application/json" \
    -d '{"action": "test_redis"}' 2>/dev/null)

check_response "$RESPONSE" '"success":true' "Redis conectado"

if echo "$RESPONSE" | grep -q '"connected":true'; then
    LATENCY=$(echo "$RESPONSE" | grep -o '"latencyMs":[0-9]*' | grep -o '[0-9]*')
    echo "Latência Redis: ${LATENCY}ms"
fi

# =====================================================
# TESTE 3: LISTAR AGENTES
# =====================================================

print_header "TESTE 3: LISTAR AGENTES"

if [[ "$ORGANIZATION_ID" == *"SEU_ORG"* ]]; then
    print_skip "ORGANIZATION_ID não configurado"
else
    print_test "Listando agentes da organização"
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/ai/test" \
        -H "Content-Type: application/json" \
        -d "{\"action\": \"list_agents\", \"organizationId\": \"$ORGANIZATION_ID\"}" 2>/dev/null)

    check_response "$RESPONSE" '"success":true' "Listagem de agentes"
    
    COUNT=$(echo "$RESPONSE" | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
    echo "Agentes encontrados: $COUNT"
    
    if [ "$COUNT" == "0" ]; then
        echo -e "${YELLOW}⚠️ Nenhum agente encontrado - crie um agente antes de continuar${NC}"
    fi
fi

# =====================================================
# TESTE 4: ESTATÍSTICAS DO CACHE
# =====================================================

print_header "TESTE 4: ESTATÍSTICAS DO CACHE"

print_test "Verificando cache de embeddings"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/ai/test" \
    -H "Content-Type: application/json" \
    -d '{"action": "cache_stats"}' 2>/dev/null)

check_response "$RESPONSE" '"success":true' "Cache stats"

if echo "$RESPONSE" | grep -q '"hitRate"'; then
    HIT_RATE=$(echo "$RESPONSE" | grep -o '"hitRate":[0-9]*' | grep -o '[0-9]*')
    echo "Taxa de cache hit: ${HIT_RATE}%"
fi

# =====================================================
# TESTE 5: TESTAR RAG
# =====================================================

print_header "TESTE 5: TESTAR RAG (CONHECIMENTO)"

if [[ "$AGENT_ID" == *"SEU_AGENT"* ]]; then
    print_skip "AGENT_ID não configurado"
else
    print_test "Buscando no conhecimento do agente"
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/ai/test" \
        -H "Content-Type: application/json" \
        -d "{\"action\": \"test_rag\", \"agentId\": \"$AGENT_ID\", \"query\": \"preço produto\"}" 2>/dev/null)

    check_response "$RESPONSE" '"success":true' "Busca RAG"
    
    RESULTS=$(echo "$RESPONSE" | grep -o '"results_count":[0-9]*' | grep -o '[0-9]*')
    echo "Resultados encontrados: $RESULTS"
fi

# =====================================================
# TESTE 6: PROCESSAR MENSAGEM
# =====================================================

print_header "TESTE 6: PROCESSAR MENSAGEM COM IA"

if [[ "$AGENT_ID" == *"SEU_AGENT"* ]] || [[ "$ORGANIZATION_ID" == *"SEU_ORG"* ]]; then
    print_skip "AGENT_ID ou ORGANIZATION_ID não configurado"
else
    print_test "Processando mensagem com agente"
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/ai/test" \
        -H "Content-Type: application/json" \
        -d "{
            \"action\": \"process\",
            \"agentId\": \"$AGENT_ID\",
            \"organizationId\": \"$ORGANIZATION_ID\",
            \"message\": \"Olá, preciso de ajuda\"
        }" 2>/dev/null)

    check_response "$RESPONSE" '"success":true' "Processamento IA"
    
    if echo "$RESPONSE" | grep -q '"response"'; then
        echo "✅ IA gerou resposta"
        TOKENS=$(echo "$RESPONSE" | grep -o '"tokens_used":[0-9]*' | grep -o '[0-9]*')
        TIME=$(echo "$RESPONSE" | grep -o '"response_time_ms":[0-9]*' | grep -o '[0-9]*')
        echo "Tokens usados: $TOKENS | Tempo: ${TIME}ms"
    fi
fi

# =====================================================
# TESTE 7: SIMULAR WEBHOOK
# =====================================================

print_header "TESTE 7: SIMULAR WEBHOOK (SEM WHATSAPP)"

if [[ "$ORGANIZATION_ID" == *"SEU_ORG"* ]]; then
    print_skip "ORGANIZATION_ID não configurado"
else
    print_test "Simulando mensagem recebida"
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/ai/test/webhook" \
        -H "Content-Type: application/json" \
        -d "{
            \"organizationId\": \"$ORGANIZATION_ID\",
            \"phoneNumber\": \"$TEST_PHONE\",
            \"message\": \"Teste automatizado $(date +%H:%M:%S)\"
        }" 2>/dev/null)

    check_response "$RESPONSE" '"success":true' "Simulação webhook"
    
    if echo "$RESPONSE" | grep -q '"replied":true'; then
        echo "✅ IA respondeu à simulação"
        AGENT=$(echo "$RESPONSE" | grep -o '"agentName":"[^"]*"' | cut -d'"' -f4)
        echo "Agente: $AGENT"
    elif echo "$RESPONSE" | grep -q '"processed":false'; then
        echo -e "${YELLOW}⚠️ Mensagem não processada - verifique se existe agente ativo${NC}"
    fi
fi

# =====================================================
# TESTE 8: STATUS CONVERSA
# =====================================================

print_header "TESTE 8: STATUS DA CONVERSA"

if [[ "$ORGANIZATION_ID" == *"SEU_ORG"* ]]; then
    print_skip "ORGANIZATION_ID não configurado"
else
    print_test "Verificando status da conversa"
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/ai/test" \
        -H "Content-Type: application/json" \
        -d "{
            \"action\": \"conversation_status\",
            \"phoneNumber\": \"$TEST_PHONE\",
            \"organizationId\": \"$ORGANIZATION_ID\"
        }" 2>/dev/null)

    check_response "$RESPONSE" '"success":true' "Status conversa"
    
    if echo "$RESPONSE" | grep -q '"ai_enabled":true'; then
        echo "✅ IA habilitada para esta conversa"
    elif echo "$RESPONSE" | grep -q '"ai_enabled":false'; then
        echo -e "${YELLOW}⚠️ IA desabilitada para esta conversa${NC}"
    fi
fi

# =====================================================
# TESTE 9: WEBHOOK STATUS
# =====================================================

print_header "TESTE 9: STATUS DO WEBHOOK"

print_test "Verificando webhook WhatsApp"
RESPONSE=$(curl -s "$BASE_URL/api/whatsapp/webhook" 2>/dev/null)

check_response "$RESPONSE" '"ai_enabled":true' "Webhook com IA habilitada"
check_response "$RESPONSE" '"version":"2.0"' "Webhook versão 2.0"

# =====================================================
# RESUMO FINAL
# =====================================================

print_header "RESUMO DOS TESTES"

echo ""
echo -e "${GREEN}✅ Passou: $PASSED${NC}"
echo -e "${RED}❌ Falhou: $FAILED${NC}"
echo -e "${YELLOW}⏭️ Pulado: $SKIPPED${NC}"
echo ""

TOTAL=$((PASSED + FAILED))
if [ $TOTAL -gt 0 ]; then
    PERCENT=$((PASSED * 100 / TOTAL))
    echo "Taxa de sucesso: ${PERCENT}%"
fi

if [ $FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 TODOS OS TESTES PASSARAM!${NC}"
    echo -e "${GREEN}O sistema está pronto para uso.${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}⚠️ Alguns testes falharam.${NC}"
    echo -e "${RED}Verifique a configuração e tente novamente.${NC}"
    exit 1
fi
