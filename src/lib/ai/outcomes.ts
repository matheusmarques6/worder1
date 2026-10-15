// Desfechos das conversas de IA (plano IA M5 passo 27). A atribuição de
// pedido: um pedido pago do contato credita a conversa mais recente que um
// agente atendeu dentro da janela (RPC attribute_ai_conversation, idempotente).

import { supabaseAdmin } from '@/lib/supabase-admin'

export async function attributeAiConversation(input: {
  organizationId: string
  contactId: string
  orderId: string
  orderValue: number
  windowDays: number
}): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc('attribute_ai_conversation', {
    p_organization_id: input.organizationId,
    p_contact_id: input.contactId,
    p_order_id: input.orderId,
    p_value: input.orderValue,
    p_window_days: input.windowDays,
  })
  if (error) throw new Error(error.message)
  return (data as string | null) ?? null
}
