// =============================================
// Qual endereço vence: o guardado na campanha ou o da loja?
//
// O endereço fica congelado na campanha (email_campaigns.from_email) e
// nos nós de automação, gravado no dia em que a peça foi criada. Isso é
// certo quando o lojista escolheu aquele endereço de propósito.
//
// Só que TODA loja nasce com um endereço no domínio compartilhado, e é
// esse que fica congelado antes de o lojista verificar o domínio dele.
// Depois de verificar, a identidade da loja muda e a campanha continua
// saindo pelo endereço antigo — o lojista faz tudo certo e os e-mails
// seguem chegando como worder.email.
//
// A régua: o endereço do domínio compartilhado é um marcador de lugar,
// nunca uma escolha. Se a loja já tem domínio próprio, ele perde. Um
// endereço no domínio do lojista, esse sim, é escolha dele e vence.
// =============================================

import { isSharedDomainEmail } from '@/lib/email/shared-sender'

export interface StoredSender {
  /** O que está gravado na campanha ou no nó. */
  email?: string | null
  name?: string | null
}

export interface LiveSender {
  /** O que a identidade da loja resolve agora. */
  email?: string | null
  name?: string | null
}

export interface ChosenSender {
  email: string | null
  name: string | null
  /** 'stored' quando o endereço guardado valeu; 'live' quando a loja venceu. */
  source: 'stored' | 'live' | 'none'
}

/**
 * O endereço guardado vence, EXCETO quando ele é do domínio compartilhado
 * e a loja já tem um endereço próprio — aí vale o da loja.
 */
export function chooseSender(stored: StoredSender, live: LiveSender): ChosenSender {
  const storedEmail = String(stored.email || '').trim()
  const liveEmail = String(live.email || '').trim()

  const storedIsPlaceholder = !storedEmail || isSharedDomainEmail(storedEmail)
  const liveIsOwn = !!liveEmail && !isSharedDomainEmail(liveEmail)

  if (storedEmail && !(storedIsPlaceholder && liveIsOwn)) {
    return { email: storedEmail, name: stored.name?.trim() || live.name?.trim() || null, source: 'stored' }
  }
  if (liveEmail) {
    return { email: liveEmail, name: live.name?.trim() || stored.name?.trim() || null, source: 'live' }
  }
  return { email: storedEmail || null, name: stored.name?.trim() || null, source: storedEmail ? 'stored' : 'none' }
}

/** "Nome <email>" ou só o e-mail. */
export function formatSender(s: { email: string | null; name: string | null }): string | null {
  if (!s.email) return null
  return s.name ? `${s.name} <${s.email}>` : s.email
}
