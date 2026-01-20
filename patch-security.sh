#!/bin/bash
# =============================================
# Sprint 2 - Remove chaves hardcoded
# Execute na raiz do projeto: bash patch-security.sh
# =============================================

echo "🔒 Sprint 2 - Removendo chaves hardcoded..."
echo ""

# Arquivos para patch
FILES=(
  "src/app/api/whatsapp/instances/route.ts"
  "src/app/api/whatsapp/evolution/webhook/route.ts"
  "src/app/api/whatsapp/media/route.ts"
  "src/app/api/whatsapp/inbox/contacts/[id]/profile-picture/route.ts"
  "src/app/api/whatsapp/webhook/route.ts"
  "src/app/api/whatsapp/fix-webhook/route.ts"
  "src/app/api/whatsapp/debug/route.ts"
)

PATCHED=0
SKIPPED=0

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    # Verificar se tem a chave
    if grep -q "429683C4C977415CAAFCCE10F7D57E11" "$file"; then
      echo "📝 Patching: $file"
      
      # Remover fallback da chave
      sed -i "s/ || '429683C4C977415CAAFCCE10F7D57E11'//g" "$file"
      
      # Remover fallback da URL
      sed -i "s/ || 'https:\/\/n8n-evolution-api.1fpac5.easypanel.host'//g" "$file"
      
      ((PATCHED++))
      echo "   ✅ Done"
    else
      echo "⏭️  Skipped (already clean): $file"
      ((SKIPPED++))
    fi
  else
    echo "⚠️  Not found: $file"
  fi
done

echo ""
echo "📊 Summary: $PATCHED patched, $SKIPPED skipped"
echo ""

# Verificar se ainda existem chaves
echo "🔍 Verificando se ainda existem chaves hardcoded..."
echo ""

FOUND=$(grep -rn "429683C4C977415CAAFCCE10F7D57E11" src/ 2>/dev/null)

if [ -n "$FOUND" ]; then
  echo "❌ Ainda existem ocorrências da chave:"
  echo "$FOUND"
  echo ""
  echo "⚠️  Por favor, remova manualmente."
  exit 1
else
  echo "✅ Nenhuma chave hardcoded encontrada!"
fi

echo ""
echo "📋 Próximos passos:"
echo "1. Verificar as variáveis de ambiente no Vercel"
echo "2. git add ."
echo "3. git commit -m 'security: remove hardcoded API keys'"
echo "4. git push"
