# Patches

## worder1-idempotency.patch
- Torna o salvamento de mensagens WhatsApp idempotente usando UPSERT em `(instance_id, message_id)`.
- Evita erros 23505 (unique violation) quando webhooks/requests são reentregues (retry) ou chegam em paralelo.

Arquivos alterados:
- `src/app/api/whatsapp/evolution/webhook/route.ts`
- `src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts`
- `src/app/api/whatsapp/webhook/route.ts`
