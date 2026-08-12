// Missões por evento (core/agentes-por-evento.md §3.3.3) — o que a UI e as
// rotas compartilham sobre o catálogo.

// Catálogo v0 — aberto: um event_type fora desta lista é permitido; a lista
// existe para a UI sugerir, não para fechar.
export const EVENT_FAMILIES = [
  'whatsapp.received',
  'cart.abandoned',
  'checkout.abandoned',
  'order.fulfilled',
  'payment.pix.abandoned',
  'payment.boleto.abandoned',
] as const

export const FAMILY_LABELS: Record<string, string> = {
  'whatsapp.received': 'Descoberta (mensagem recebida)',
  'cart.abandoned': 'Carrinho abandonado',
  'checkout.abandoned': 'Checkout abandonado',
  'order.fulfilled': 'Pedido enviado',
  'payment.pix.abandoned': 'Pix não pago',
  'payment.boleto.abandoned': 'Boleto não pago',
}

export interface Mission {
  id: string
  organization_id: string
  event_type: string
  /** Nome livre do lojista; null = UI mostra o rótulo da família. */
  display_name?: string | null
  parent_version_id: string | null
  status: 'draft' | 'active' | 'archived'
  origin: 'worder_default' | 'lojista' | 'flywheel'
  situation: string | null
  objective: string
  success_criteria: string | null
  failure_criteria: string | null
  context_fields: string[]
  enabled_tools: string[]
  forbidden: string[]
  max_turns: number
  topic_change_policy: 'cede' | 'insiste' | 'transfere'
  promote_moment: boolean
  concession: { kind: 'none' | 'percent' | 'fixed' | 'free_shipping'; max_value?: number; validity_hours?: number; max_uses?: number }
  tone_delta: string | null
  change_summary: string | null
  created_at: string
  activated_at: string | null
}

// 10.3 — o consolidado de concessão fala uma língua só (LimitsTab e
// MissionsTab leem daqui; editar é sempre dentro da missão).
export function describeConcession(concession: Mission['concession'] | null | undefined): string {
  const kind = concession?.kind ?? 'none'
  if (kind === 'none') return 'Sem concessão automática'
  const uses = concession?.max_uses ? ` · ${concession.max_uses} uso(s)` : ''
  const validity = concession?.validity_hours ? ` · válido ${concession.validity_hours}h` : ''
  if (kind === 'percent') return `Cupom de até ${concession?.max_value ?? 0}%${uses}${validity}`
  if (kind === 'fixed') return `Desconto de até R$ ${concession?.max_value ?? 0}${uses}${validity}`
  return `Frete grátis${uses}${validity}`
}

const EDITABLE_FIELDS = [
  'display_name',
  'situation',
  'objective',
  'success_criteria',
  'failure_criteria',
  'context_fields',
  'enabled_tools',
  'forbidden',
  'max_turns',
  'topic_change_policy',
  'promote_moment',
  'concession',
  'tone_delta',
  'change_summary',
] as const

export function pickEditableMissionFields(body: Record<string, any>) {
  const row: Record<string, any> = {}
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) row[field] = body[field]
  }
  return row
}
