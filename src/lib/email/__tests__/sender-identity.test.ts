// =============================================================
// Quem assina o e-mail: a LOJA, nunca a loja irmã.
//
// O defeito: getEmailProviderForOrg pedia a coluna `name` de
// shopify_stores (é shop_name); a leitura falhava e todo envio de loja
// saía com a identidade da organização — "Based" — mesmo a Medicube
// tendo remetente próprio configurado.
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeSupabase } from '@/tests/fake-supabase'

const fake = createFakeSupabase()
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => fake.from(t) },
  getSupabaseAdmin: () => ({ from: (t: string) => fake.from(t) }),
}))
vi.mock('@/lib/email/providers/resend', () => ({ createResendProvider: (config: any) => ({ name: 'resend', config, send: async () => ({ id: 'x' }) }) }))
vi.mock('@/lib/email/providers/smtp', () => ({ createSmtpProvider: (config: any) => ({ name: 'smtp', config, send: async () => ({ id: 'x' }) }) }))

import { getEmailProviderForOrg, __resetEmailProviderCache } from '../providers'
import { getStoreSender, getOrgSender } from '../sender'

const ORG = '425db1ba-99c0-4dbb-9434-27fe9cc03ec6'
const BASED = '21a3c8f7-1aea-4391-ac38-85de5da23d8e'
const GROOT = 'd5dfd5dd-1d77-425e-a099-850338078999'
const MEDICUBE = 'd04a4411-abc2-4135-bb88-e1f3c31d3b1b'
const OUTRA_ORG = '99999999-9999-4999-8999-999999999999'
const ALHEIA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function seedMultiLoja() {
  fake.seed('organizations', [{
    id: ORG, name: '',
    email_settings: { default_sender_name: 'Based', default_sender_email: 'based@worder.email', default_reply_to: 'based@worder.email' },
    email_provider: 'resend', email_provider_config: null,
  }])
  fake.seed('shopify_stores', [
    { id: BASED, organization_id: ORG, shop_name: 'Based', shop_email: 'contato@sourosa.com', shop_domain: 'lojalaclode.myshopify.com', is_active: true, settings: {} },
    { id: GROOT, organization_id: ORG, shop_name: 'Dr. Groot', shop_email: 'carter@outlook.com', shop_domain: '0p7tsk-i5.myshopify.com', is_active: true, settings: {} },
    { id: MEDICUBE, organization_id: ORG, shop_name: 'Medicube', shop_email: 'support@medicubeweare.com', shop_domain: '32frja-mb.myshopify.com', is_active: true,
      settings: { email_settings: { default_sender_name: 'Medicube', default_sender_email: 'supportmedicubeweare@worder.email', default_reply_to: 'support@medicubeweare.com' } } },
    { id: ALHEIA, organization_id: OUTRA_ORG, shop_name: 'Alheia', shop_email: null, shop_domain: 'alheia.myshopify.com', is_active: true,
      settings: { email_settings: { default_sender_email: 'alheia@alheia.com', default_sender_name: 'Alheia' } } },
  ])
}

beforeEach(() => {
  fake.reset()
  __resetEmailProviderCache()
  process.env.RESEND_FROM_EMAIL = 'noreply@worder.email'
  seedMultiLoja()
})

describe('getEmailProviderForOrg — identidade por loja', () => {
  it('o caso do bug: a Medicube manda como Medicube, não como Based', async () => {
    const { config } = await getEmailProviderForOrg(ORG, MEDICUBE)
    expect(config.defaultFrom).toBe('supportmedicubeweare@worder.email')
    expect(config.defaultSenderName).toBe('Medicube')
    expect(config.defaultReplyTo).toBe('support@medicubeweare.com')
    expect((config as any).senderSource).toBe('store')
  })

  it('loja sem remetente numa organização com várias lojas: neutro com o NOME da loja, nunca o e-mail da irmã', async () => {
    const { config } = await getEmailProviderForOrg(ORG, GROOT)
    expect(config.defaultFrom).toBe('noreply@worder.email')
    expect(config.defaultFrom).not.toBe('based@worder.email')
    expect(config.defaultSenderName).toBe('Dr. Groot')
    expect(config.defaultReplyTo).toBe('carter@outlook.com')
    expect((config as any).senderSource).toBe('platform')
  })

  it('organização com UMA loja: o padrão da organização é dessa loja e vale', async () => {
    fake.seed('shopify_stores', [
      { id: BASED, organization_id: ORG, shop_name: 'Based', shop_email: 'contato@sourosa.com', shop_domain: 'lojalaclode.myshopify.com', is_active: true, settings: {} },
      // Loja sem integração não conta.
      { id: GROOT, organization_id: ORG, shop_name: 'Nova', shop_email: null, shop_domain: 'manual-nova-1.worder.local', is_active: true, settings: {} },
    ])
    const { config } = await getEmailProviderForOrg(ORG, BASED)
    expect(config.defaultFrom).toBe('based@worder.email')
    expect(config.defaultSenderName).toBe('Based')
    expect((config as any).senderSource).toBe('org')
  })

  it('loja de OUTRA organização não é lida, mesmo com remetente próprio', async () => {
    const { config } = await getEmailProviderForOrg(ORG, ALHEIA)
    expect(config.defaultFrom).not.toBe('alheia@alheia.com')
    expect(config.defaultSenderName).not.toBe('Alheia')
  })

  it('sem loja (envio da organização inteira) usa o padrão da organização', async () => {
    const { config } = await getEmailProviderForOrg(ORG, null)
    expect(config.defaultFrom).toBe('based@worder.email')
    expect((config as any).senderSource).toBe('org')
  })

  it('lê shop_name (a coluna que existe) — a consulta não pede `name`', async () => {
    await getEmailProviderForOrg(ORG, MEDICUBE)
    const selects = fake.calls.filter((c) => c[0] === 'shopify_stores' && c[1] === 'select').map((c) => String(c[2][0]))
    expect(selects.some((s) => /\bshop_name\b/.test(s))).toBe(true)
    expect(selects.some((s) => /(^|[,\s])name\b/.test(s.replace(/shop_name/g, '')))).toBe(false)
  })
})

describe('getStoreSender / getOrgSender', () => {
  it('formata "Nome <email>" com a identidade da loja e devolve a origem', async () => {
    const s = await getStoreSender(ORG, MEDICUBE)
    expect(s.from).toBe('Medicube <supportmedicubeweare@worder.email>')
    expect(s.replyTo).toBe('support@medicubeweare.com')
    expect(s.source).toBe('store')
  })

  it('loja sem remetente: nome da loja + e-mail neutro, marcado como "platform" para a tela avisar', async () => {
    const s = await getStoreSender(ORG, GROOT)
    expect(s.from).toBe('Dr. Groot <noreply@worder.email>')
    expect(s.source).toBe('platform')
  })

  it('sem loja cai no remetente da organização', async () => {
    const s = await getStoreSender(ORG, null)
    expect(s.from).toBe('Based <based@worder.email>')
    expect((await getOrgSender(ORG)).fromEmail).toBe('based@worder.email')
  })
})
