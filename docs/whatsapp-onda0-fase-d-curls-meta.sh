#!/usr/bin/env bash
# =============================================================================
# Worder WhatsApp — Onda 0 Fase D: curls Meta (passos 3.1 / 3.2 / 3.3)
# =============================================================================
#
# COMO USAR:
#   1. Substitui <COLAR_ACCESS_TOKEN> pelo token real
#   2. Roda este script no terminal local (Mac/Linux/WSL):
#        bash docs/whatsapp-onda0-fase-d-curls-meta.sh
#      OU copia/cola cada bloco individual no terminal
#
# Não modifica nada no Supabase. Só fala com a Meta Graph API.
# =============================================================================

ACCESS_TOKEN="<COLAR_ACCESS_TOKEN>"
WABA_ID="1596316152501451"
PHONE_NUMBER_ID="1163643483491728"
META_VERSION="v22.0"

echo "==> 3.1 Inscrever app no WABA"
curl -sS -X POST "https://graph.facebook.com/${META_VERSION}/${WABA_ID}/subscribed_apps" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
echo

echo "==> 3.2 Confirmar subscription (deve listar app 1348143317160374)"
curl -sS -G "https://graph.facebook.com/${META_VERSION}/${WABA_ID}/subscribed_apps" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
echo

echo "==> 3.3 Registrar phone number"
curl -sS -X POST "https://graph.facebook.com/${META_VERSION}/${PHONE_NUMBER_ID}/register" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","pin":"123456"}'
echo

echo
echo "==> Pronto. Resultados esperados:"
echo "    3.1 → {\"success\": true}"
echo "    3.2 → data[].whatsapp_business_api_data.id contém '1348143317160374'"
echo "    3.3 → {\"success\": true}  (ou erro 133006 = ja registrado, ok)"
