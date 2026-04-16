// =============================================
// WORDER: Resolve sender for email sending
// /src/lib/email/sender.ts
//
// Busca o remetente configurado da organização.
// Fallback: onboarding@resend.dev (sempre funciona no Resend).
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'

export interface SenderInfo {
  from: string      // "Nome <email@dominio>"
  fromEmail: string // "email@dominio"
  senderName: string
  replyTo?: string
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
        from: `${senderName} <${senderEmail}>`,
        fromEmail: senderEmail,
        senderName,
        replyTo,
      }
    }
  } catch { /* fallback */ }

  // Fallback
  const fallback = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
  return {
    from: `Worder <${fallback}>`,
    fromEmail: fallback,
    senderName: 'Worder',
  }
}
