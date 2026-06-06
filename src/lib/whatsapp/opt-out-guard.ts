// =============================================
// Onda 10 — Fast Lane Compliance
//
// Guard unico reusado por todos os senders WhatsApp do app:
//   - rotas Cloud (/api/whatsapp/cloud/messages)
//   - 3 rotas Inbox (messages / send-template / media)
//   - worker de campanha
//   - campaign-processor (loop processBatch)
//   - automation node-executors (action_whatsapp)
//   - auto-reply fora de horario no webhook
//
// Regra:
//   - Row ausente em whatsapp_opt_status → allowed=true (decisao do produto;
//     nao quebra phonebooks legados).
//   - status='opted_out' + categoria UTILITY/AUTHENTICATION → allowed=true
//     (bypass transacional permitido pela politica Meta).
//   - status='opted_out' + MARKETING ou indefinida → allowed=false.
//   - Override (apenas senders humano-iniciados via UI) → allowed=true,
//     mas registra log de auditoria.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { normalizePhone } from '@/lib/whatsapp/cloud-api'
import { wlog } from '@/lib/observability/whatsapp-logger'

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'

export interface OptOutRecord {
  status: string
  opted_out_at: string | null
  opt_out_reason: string | null
  opt_in_source: string | null
}

export interface OptInCheckResult {
  allowed: boolean
  reason?: 'OPTED_OUT'
  record?: OptOutRecord
}

export interface RequireOptInOpts {
  /** Atendente confirmou via UI que quer enviar mesmo assim. */
  override?: boolean
  /** Justificativa do atendente — obrigatorio quando override=true. */
  overrideReason?: string
  /** Identificacao do agente (user_id) para auditoria do override. */
  agentUserId?: string
  /** Nome da rota/sender pra log estruturado. */
  sender?: string
}

export async function requireOptIn(
  organizationId: string,
  phone: string,
  templateCategory?: TemplateCategory,
  opts: RequireOptInOpts = {},
): Promise<OptInCheckResult> {
  const normalized = normalizePhone(phone)

  const { data: record } = await supabaseAdmin
    .from('whatsapp_opt_status')
    .select('status, opted_out_at, opt_out_reason, opt_in_source')
    .eq('organization_id', organizationId)
    .eq('phone', normalized)
    .maybeSingle()

  // Ausencia = permite (decisao 3 do plano)
  if (!record) return { allowed: true }

  // Nao esta opted_out → passa
  if (record.status !== 'opted_out') return { allowed: true }

  // Bypass transacional: UTILITY e AUTHENTICATION sempre passam
  if (templateCategory === 'UTILITY' || templateCategory === 'AUTHENTICATION') {
    wlog.info('whatsapp.optout.bypass_utility', {
      organization_id: organizationId,
      phone: normalized,
      template_category: templateCategory,
      sender: opts.sender,
    })
    return { allowed: true, record }
  }

  // Override do atendente: permitido APENAS para texto livre (categoria indefinida).
  // Marketing nunca pode ser overrideado — politica de produto.
  if (opts.override && templateCategory !== 'MARKETING') {
    wlog.info('whatsapp.optout.override', {
      organization_id: organizationId,
      phone: normalized,
      template_category: templateCategory ?? null,
      sender: opts.sender,
      agent_user_id: opts.agentUserId,
      override_reason: opts.overrideReason,
    })
    return { allowed: true, record }
  }

  // Bloqueado
  wlog.info('whatsapp.optout.blocked', {
    organization_id: organizationId,
    phone: normalized,
    template_category: templateCategory ?? null,
    sender: opts.sender,
    opted_out_at: record.opted_out_at,
  })
  return { allowed: false, reason: 'OPTED_OUT', record }
}

// =============================================
// Helper de keyword matching pro handler STOP do webhook.
// Match exato APOS strip de pontuacao final — pega "PARAR", "PARAR.",
// "Stop!", mas NAO "cancelar pedido" (evita falso positivo).
// =============================================

/**
 * Le ?override=true&override_reason=... da request e retorna o objeto
 * de override pra passar pro requireOptIn. Para uso nos senders humanos.
 */
export function readOverrideFromRequest(request: Request, agentUserId?: string): RequireOptInOpts | undefined {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('override') !== 'true') return undefined
  return {
    override: true,
    overrideReason: searchParams.get('override_reason') || undefined,
    agentUserId,
  }
}

/**
 * Resposta JSON padronizada quando o guard nega envio.
 * 409 OPTED_OUT_OVERRIDABLE indica que o frontend pode re-tentar com
 * ?override=true (apenas em senders humano-iniciados e fora de marketing).
 */
export interface OptOutBlockedResponse {
  error: string
  code: 'OPTED_OUT' | 'OPTED_OUT_OVERRIDABLE'
  contact_opted_out_at?: string | null
  opt_out_reason?: string | null
}

export function buildOptOutBlockedResponse(
  check: OptInCheckResult,
  templateCategory?: TemplateCategory,
): OptOutBlockedResponse {
  // Marketing nunca permite override; tudo mais (texto livre, UTILITY, AUTH)
  // permite override pelo atendente.
  const overridable = templateCategory !== 'MARKETING'
  return {
    error: overridable
      ? 'Contato optou por sair. Atendente pode forcar envio confirmando.'
      : 'Contato optou por sair. Marketing nao pode ser enviado.',
    code: overridable ? 'OPTED_OUT_OVERRIDABLE' : 'OPTED_OUT',
    contact_opted_out_at: check.record?.opted_out_at ?? null,
    opt_out_reason: check.record?.opt_out_reason ?? null,
  }
}

export const STOP_KEYWORDS = [
  'PARAR',
  'SAIR',
  'CANCELAR',
  'STOP',
  'UNSUBSCRIBE',
  'SAIR DA LISTA',
] as const

export function isStopKeyword(text: string | null | undefined): boolean {
  if (!text) return false
  const normalized = text.trim().toUpperCase().replace(/[.,!?;:]+$/, '')
  return (STOP_KEYWORDS as readonly string[]).includes(normalized)
}
