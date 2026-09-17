// =============================================
// WORDER: Resolve sender for email sending
// /src/lib/email/sender.ts
//
// getStoreSender — remetente DA LOJA (o que todo envio com loja usa).
// getOrgSender   — remetente da organização, só para envios sem loja.
//
// A regra de quem vence (loja → organização só com uma loja → neutro)
// mora em getEmailProviderForOrg; aqui só se dá a forma "Nome <email>".
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { getEmailProviderForOrg, platformFallbackFrom, type SenderSource } from '@/lib/email/providers'

export interface SenderInfo {
  from: string      // "Nome <email@dominio>"
  fromEmail: string // "email@dominio"
  senderName: string
  replyTo?: string
  /** De onde veio: 'store' (própria), 'org' (organização com uma loja) ou 'platform' (neutro). */
  source?: SenderSource
}

function formatFrom(senderName: string, fromEmail: string): string {
  return senderName ? `${senderName} <${fromEmail}>` : fromEmail
}

/**
 * Remetente da loja. Sem storeId, cai no da organização — que numa
 * organização com várias lojas é a identidade de UMA delas; por isso
 * todo caminho de envio deve passar a loja.
 */
export async function getStoreSender(orgId: string, storeId?: string | null): Promise<SenderInfo> {
  if (!storeId) return getOrgSender(orgId)
  try {
    const { config } = await getEmailProviderForOrg(orgId, storeId)
    const fromEmail = config.defaultFrom || platformFallbackFrom()
    const senderName = config.defaultSenderName || 'Worder'
    return {
      from: formatFrom(senderName, fromEmail),
      fromEmail,
      senderName,
      replyTo: config.defaultReplyTo || undefined,
      source: ((config as any).senderSource as SenderSource) || 'platform',
    }
  } catch {
    const fallback = platformFallbackFrom()
    return { from: `Worder <${fallback}>`, fromEmail: fallback, senderName: 'Worder', source: 'platform' }
  }
}

/**
 * Resolve o remetente da org. Busca email_settings da organização.
 * Se não configurado, usa RESEND_FROM_EMAIL env var ou onboarding@resend.dev.
 */
export async function getOrgSender(orgId: string): Promise<SenderInfo> {
  try {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name, email_settings')
      .eq('id', orgId)
      .maybeSingle()

    const settings = org?.email_settings || {}
    const senderName = settings.default_sender_name || org?.name || 'Worder'
    const senderEmail = settings.default_sender_email || null
    const replyTo = settings.default_reply_to || undefined

    if (senderEmail) {
      return {
        from: formatFrom(senderName, senderEmail),
        fromEmail: senderEmail,
        senderName,
        replyTo,
        source: 'org',
      }
    }
  } catch { /* fallback */ }

  // Fallback
  const fallback = platformFallbackFrom()
  return {
    from: `Worder <${fallback}>`,
    fromEmail: fallback,
    senderName: 'Worder',
    source: 'platform',
  }
}
