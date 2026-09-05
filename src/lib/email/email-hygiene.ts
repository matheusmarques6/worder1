// Higiene de e-mails na entrada (Configurações → Entregabilidade → "Validar
// e-mails na entrada"): rejeita endereços malformados e domínios
// descartáveis em formulários, importações e cadastro manual.

const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org', 'temp-mail.io',
  'yopmail.com', 'yopmail.fr', 'trashmail.com', 'trashmail.me', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'mailnesia.com',
  'throwawaymail.com', 'fakeinbox.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'tempail.com', 'tempr.email', 'discard.email', 'spamgourmet.com',
  'mailcatch.com', 'mytemp.email', 'burnermail.io', 'inboxbear.com', 'tmpmail.org', 'tmpmail.net', 'moakt.com', 'nada.email', 'tempinbox.com', 'mailsac.com',
  'mail-temp.com', 'anonaddy.me', 'emailfake.com', 'crazymailing.com', 'luxusmail.org', 'tempmailo.com', 'mailpoof.com', 'guerrillamailblock.com', 'grr.la',
  'spam4.me', 'pokemail.net', 'dropmail.me', 'harakirimail.com', 'mailtemp.net', 'bupmail.com', 'zetmail.com', 'mailexpire.com', 'example.com', 'test.com',
])

const TYPO_FIXES: Record<string, string> = {
  'gmail.co': 'gmail.com', 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com',
  'hotmail.co': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'outlook.co': 'outlook.com', 'yahoo.co': 'yahoo.com', 'yaho.com': 'yahoo.com',
}

export interface EmailCheck {
  ok: boolean
  normalized: string
  reason?: 'invalid_format' | 'disposable' | 'role_account'
  suggestion?: string
}

const RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i

/** Validação sintática + domínio descartável + sugestão de erro de digitação. */
export function checkEmail(raw: string | null | undefined, opts: { rejectDisposable?: boolean } = {}): EmailCheck {
  const normalized = String(raw || '').trim().toLowerCase()
  if (!normalized || normalized.length > 254 || !RE.test(normalized)) return { ok: false, normalized, reason: 'invalid_format' }
  const domain = normalized.split('@')[1]
  const fix = TYPO_FIXES[domain]
  const suggestion = fix ? normalized.replace(/@.*$/, `@${fix}`) : undefined
  if ((opts.rejectDisposable ?? true) && (DISPOSABLE.has(domain) || /^(tmp|temp|trash|fake|spam)[a-z0-9-]*mail/.test(domain))) {
    return { ok: false, normalized, reason: 'disposable', suggestion }
  }
  return { ok: true, normalized, suggestion }
}

export function emailCheckMessage(c: EmailCheck): string {
  if (c.ok) return ''
  if (c.reason === 'disposable') return 'E-mail descartável/temporário não é aceito.'
  return c.suggestion ? `E-mail inválido. Você quis dizer ${c.suggestion}?` : 'E-mail inválido.'
}

/** Lê a regra da organização (Entregabilidade → Higiene). Falha aberta: sem regra, aceita. */
export async function shouldValidateOnEntry(organizationId: string | null | undefined): Promise<boolean> {
  if (!organizationId) return false
  try {
    const { getOrgSendingRules } = await import('@/lib/email/sending-rules')
    return (await getOrgSendingRules(organizationId)).validateOnEntry
  } catch {
    return false
  }
}
