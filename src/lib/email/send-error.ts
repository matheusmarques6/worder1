// =============================================
// De quem é a culpa quando o provedor recusa o envio?
//
// Um erro permanente do DESTINATÁRIO (endereço inexistente, caixa na
// lista de supressão) justifica marcar o contato como inválido: insistir
// só queima reputação.
//
// Um erro do REMETENTE (domínio não verificado, campo "from" inválido,
// chave de API errada, cota estourada) não diz nada sobre o contato — e
// era exatamente o que acontecia: o lojista trocava o domínio, o Resend
// recusava o "from", e a plataforma descadastrava a lista inteira, um
// contato por vez, sem ninguém perceber. Consentimento apagado por engano
// não se recupera: a pessoa teria de se inscrever de novo.
//
// Na dúvida, não mexe no contato. O envio falha e fica registrado.
// =============================================

export type SendFailureBlame = 'recipient' | 'sender' | 'unknown'

/** Erros que são claramente da configuração de quem envia. */
const SENDER_PATTERNS: RegExp[] = [
  /domain is not verified/i,
  /not a verified domain/i,
  /domínio não (está )?verificad/i,
  /invalid `?from`?/i,
  /from address/i,
  /sender/i,
  /api[_ -]?key/i,
  /unauthorized/i,
  /forbidden/i,
  /rate limit/i,
  /quota/i,
  /too many requests/i,
  /payload too large/i,
  /testing emails/i,
]

/** Erros que são claramente do endereço de destino. */
const RECIPIENT_PATTERNS: RegExp[] = [
  /suppress/i,
  /suppres/i,
  /recipient .*(does not exist|not found|invalid)/i,
  /does not exist/i,
  /no such user/i,
  /mailbox (unavailable|not found|full)/i,
  /invalid (recipient|to|e-?mail address)/i,
  /user unknown/i,
  /address rejected/i,
]

/**
 * Classifica a mensagem de erro do provedor. A ordem importa: um erro do
 * remetente pode conter a palavra "invalid", que sozinha não diz nada.
 */
export function blameForSendFailure(message: unknown): SendFailureBlame {
  const m = String(message || '')
  if (!m.trim()) return 'unknown'
  if (SENDER_PATTERNS.some((p) => p.test(m))) return 'sender'
  if (RECIPIENT_PATTERNS.some((p) => p.test(m))) return 'recipient'
  return 'unknown'
}

/** Só um erro do destinatário autoriza mexer no consentimento dele. */
export function shouldSuppressContact(message: unknown): boolean {
  return blameForSendFailure(message) === 'recipient'
}
