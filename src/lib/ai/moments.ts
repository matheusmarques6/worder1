// Momentos comerciais (core/agentes-por-evento.md §1.5/§3.3.4) — o que a UI
// e as rotas compartilham. "Ativo" NUNCA é gravado: é computado por relógio
// (approved + agora dentro da janela + não morto) — inclusive aqui na UI.

export interface CommercialMoment {
  id: string
  organization_id: string
  store_id: string | null
  name: string
  starts_at: string
  ends_at: string
  public_claim: string | null
  offer: { kind: 'none' | 'percent' | 'fixed' | 'free_shipping'; value?: number; coupon_code?: string; auto_apply?: boolean }
  exclusions: Record<string, unknown>
  temp_facts: string[]
  forbidden: string[]
  priority: number
  template_readiness: Record<string, { template_name?: string; language?: string; status?: string }>
  status: 'draft' | 'approved' | 'killed'
  killed_at: string | null
  created_at: string
  updated_at: string
}

const EDITABLE_FIELDS = [
  'name',
  'starts_at',
  'ends_at',
  'public_claim',
  'offer',
  'exclusions',
  'temp_facts',
  'forbidden',
  'priority',
  'template_readiness',
] as const

export function pickEditableMomentFields(body: Record<string, any>) {
  const row: Record<string, any> = {}
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) row[field] = body[field]
  }
  return row
}

export type ComputedState = 'vigente' | 'agendado' | 'encerrado' | 'morto' | 'rascunho'

export function computedState(moment: CommercialMoment, now = new Date()): ComputedState {
  if (moment.killed_at) return 'morto'
  if (moment.status !== 'approved') return 'rascunho'
  if (now < new Date(moment.starts_at)) return 'agendado'
  if (now > new Date(moment.ends_at)) return 'encerrado'
  return 'vigente'
}
