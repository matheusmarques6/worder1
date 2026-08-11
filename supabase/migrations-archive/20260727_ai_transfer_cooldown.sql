-- Cooldown pós-transferência (settings.behavior.cooldown_after_transfer):
-- carimbo da última transferência IA->humano na conversa. NÃO é limpo quando
-- a IA é religada manualmente (bot/route.ts e conversations/[id]/ai/route.ts
-- limpam apenas ai_disabled_at/ai_disabled_reason) — é isso que faz o
-- cooldown valer mesmo após reativação (guard transfer_cooldown no
-- cloud-runner.ts).
ALTER TABLE whatsapp_cloud_conversations
  ADD COLUMN IF NOT EXISTS ai_transferred_at TIMESTAMPTZ;

COMMENT ON COLUMN whatsapp_cloud_conversations.ai_transferred_at IS
  'Ultima transferencia IA->humano (action transfer, handoff keyword ou blocked topic). Lido pelo guard transfer_cooldown do cloud-runner.';
