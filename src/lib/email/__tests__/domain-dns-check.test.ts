import { describe, it, expect } from 'vitest'
import { absoluteHost, recordMatches } from '../domain-dns-check'

describe('verificação de domínio — casamento de registros DNS', () => {
  it('monta o host absoluto a partir do nome relativo do Resend', () => {
    expect(absoluteHost('resend._domainkey', 'loja.com.br')).toBe('resend._domainkey.loja.com.br')
    expect(absoluteHost('send', 'loja.com.br')).toBe('send.loja.com.br')
    expect(absoluteHost('@', 'loja.com.br')).toBe('loja.com.br')
    expect(absoluteHost('send.loja.com.br.', 'loja.com.br')).toBe('send.loja.com.br')
  })
  it('TXT: aceita valor com aspas, dividido em pedaços e com espaços', () => {
    const rec = { name: 'resend._domainkey', type: 'TXT', value: 'p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDZ' }
    expect(recordMatches(rec, ['"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDZ"'])).toBe(true)
    expect(recordMatches(rec, ['"p=MIGfMA0GCSqGSIb3DQEBAQ" "UAA4GNADCBiQKBgQDZ"'])).toBe(true)
    expect(recordMatches(rec, ['"p=OUTRACHAVE"'])).toBe(false)
    expect(recordMatches({ name: 'send', type: 'TXT', value: 'v=spf1 include:amazonses.com ~all' }, ['"v=spf1 include:amazonses.com ~all"'])).toBe(true)
  })
  it('MX: compara host e prioridade', () => {
    const rec = { name: 'send', type: 'MX', value: 'feedback-smtp.us-east-1.amazonses.com', priority: 10 }
    expect(recordMatches(rec, ['10 feedback-smtp.us-east-1.amazonses.com.'])).toBe(true)
    expect(recordMatches(rec, ['20 feedback-smtp.us-east-1.amazonses.com.'])).toBe(false)
    expect(recordMatches(rec, ['10 mail.outro.com.'])).toBe(false)
  })
})
