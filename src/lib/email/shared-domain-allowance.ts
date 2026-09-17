// =============================================
// Franquia do domínio compartilhado.
//
// Toda loja nasce enviando por um endereço nosso (…@worder.email). Isso é
// bom para experimentar no primeiro dia e ruim para sempre: desde 2024,
// Gmail e Yahoo tratam remetente de volume sem autenticação própria como
// suspeito, e a reputação do domínio compartilhado é a MESMA para todos
// os lojistas. Um que dispare mal derruba a entrega de todos os outros.
//
// A régua é a mesma que Omnisend e Klaviyo adotaram: dá para começar sem
// DNS, mas campanha em massa exige o domínio do próprio lojista. A
// franquia é o espaço para experimentar antes de decidir.
//
// O que a franquia NÃO bloqueia: automações, fluxos e transacionais. Um
// e-mail de boas-vindas que para de sair quebra a loja de quem confiou na
// gente; o custo de reputação disso é pequeno perto de uma campanha para
// a base inteira. Esses casos aparecem como aviso, não como bloqueio.
// =============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { isSharedDomainEmail } from '@/lib/email/shared-sender'

/** E-mails de campanha permitidos no domínio compartilhado, por loja, em 30 dias. */
export function sharedDomainAllowance(): number {
  const raw = Number(process.env.SHARED_DOMAIN_CAMPAIGN_ALLOWANCE)
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 1000
}

export const ALLOWANCE_WINDOW_DAYS = 30

export interface AllowanceInput {
  /** O endereço de onde a campanha vai sair. */
  fromEmail: string | null | undefined
  /** Quantos e-mails a loja já enviou na janela. */
  sentInWindow: number
  /** Quantos destinatários esta campanha tem. */
  aboutToSend: number
  allowance?: number
}

export interface AllowanceVerdict {
  /** Envio liberado? */
  allowed: boolean
  /** Está no domínio compartilhado? Fora dele a franquia não se aplica. */
  onSharedDomain: boolean
  used: number
  allowance: number
  remaining: number
  /** Mensagem pronta para o lojista, quando bloqueado. */
  reason: string | null
}

/**
 * A franquia só vale no domínio compartilhado. Com domínio próprio
 * verificado não há limite nosso — a reputação passa a ser do lojista.
 */
export function evaluateSharedAllowance(input: AllowanceInput): AllowanceVerdict {
  const allowance = input.allowance ?? sharedDomainAllowance()
  const onSharedDomain = isSharedDomainEmail(input.fromEmail)
  const used = Math.max(0, Math.floor(Number(input.sentInWindow) || 0))
  const remaining = Math.max(0, allowance - used)

  if (!onSharedDomain) {
    return { allowed: true, onSharedDomain: false, used, allowance, remaining: Infinity, reason: null }
  }

  const wanted = Math.max(0, Math.floor(Number(input.aboutToSend) || 0))
  if (used + wanted <= allowance) {
    return { allowed: true, onSharedDomain: true, used, allowance, remaining, reason: null }
  }

  const reason = remaining > 0
    ? `Esta campanha tem ${wanted.toLocaleString('pt-BR')} destinatários e restam ${remaining.toLocaleString('pt-BR')} envios no endereço temporário. Verifique o domínio da sua loja para enviar sem limite.`
    : `Você já usou os ${allowance.toLocaleString('pt-BR')} envios de campanha do endereço temporário nos últimos ${ALLOWANCE_WINDOW_DAYS} dias. Verifique o domínio da sua loja para continuar.`

  return { allowed: false, onSharedDomain: true, used, allowance, remaining, reason }
}

/** Quantos e-mails esta loja enviou na janela. */
export async function sentInAllowanceWindow(
  admin: SupabaseClient,
  orgId: string,
  storeId: string | null | undefined,
): Promise<number> {
  const since = new Date(Date.now() - ALLOWANCE_WINDOW_DAYS * 86400000).toISOString()
  let q = admin
    .from('email_sends')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .gte('created_at', since)
    // Só o que saiu de verdade: fila e falha não gastam franquia.
    .in('status', ['sent', 'delivered', 'opened', 'clicked'])
  q = storeId ? q.eq('store_id', storeId) : q.is('store_id', null)
  const { count, error } = await q
  if (error) {
    console.warn('[shared-domain-allowance] não foi possível contar os envios:', error.message)
    // Falha de leitura não pode virar bloqueio: erra para o lado de deixar enviar.
    return 0
  }
  return count || 0
}

/** Estado da franquia para mostrar na tela (sem campanha em vista). */
export async function allowanceStatus(
  admin: SupabaseClient,
  orgId: string,
  storeId: string | null | undefined,
  fromEmail: string | null | undefined,
): Promise<AllowanceVerdict> {
  const sentInWindow = await sentInAllowanceWindow(admin, orgId, storeId)
  return evaluateSharedAllowance({ fromEmail, sentInWindow, aboutToSend: 0 })
}
