import { describe, it, expect } from 'vitest'
import { blameForSendFailure, shouldSuppressContact } from '../send-error'

describe('de quem é a culpa quando o envio falha', () => {
  it('erro de configuração do remetente NUNCA descadastra o contato', () => {
    const senderErrors = [
      'The sualoja.com.br domain is not verified. Please verify your domain on the Resend dashboard.',
      'Invalid `from` field. The email address needs to follow the `email@example.com` format.',
      'API key is invalid',
      'Unauthorized',
      'You have reached your daily rate limit',
      'Quota exceeded for this month',
      'You can only send testing emails to your own email address',
    ]
    for (const e of senderErrors) {
      expect(blameForSendFailure(e), e).toBe('sender')
      expect(shouldSuppressContact(e), e).toBe(false)
    }
  })

  it('erro do destinatário autoriza marcar o contato', () => {
    const recipientErrors = [
      'Email is on the suppression list',
      'Recipient does not exist',
      'No such user here',
      'Mailbox unavailable',
      'Invalid recipient address',
      'User unknown in virtual mailbox table',
    ]
    for (const e of recipientErrors) {
      expect(blameForSendFailure(e), e).toBe('recipient')
      expect(shouldSuppressContact(e), e).toBe(true)
    }
  })

  it('"invalid" sozinho não é motivo: na dúvida, não mexe no contato', () => {
    expect(blameForSendFailure('Something invalid happened')).toBe('unknown')
    expect(shouldSuppressContact('Something invalid happened')).toBe(false)
    expect(blameForSendFailure('')).toBe('unknown')
    expect(shouldSuppressContact(null)).toBe(false)
    expect(shouldSuppressContact(undefined)).toBe(false)
  })

  it('o erro do remetente vence quando a mensagem tem as duas palavras', () => {
    // "domain is not verified" costuma vir com "invalid"; sem a ordem
    // certa, o antigo classificador chamava isso de erro do destinatário.
    expect(blameForSendFailure('Invalid request: the domain is not verified')).toBe('sender')
  })
})
