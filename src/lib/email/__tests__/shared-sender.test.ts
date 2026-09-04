// =============================================================
// nome-da-loja@worder.email: único em toda a Worder, alocado ao nascer.
// =============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createFakeSupabase } from '@/tests/fake-supabase'
import {
  slugifyLocalPart, isValidLocalPart, isSharedDomainEmail, localPartOf,
  checkLocalPartAvailability, reserveLocalPart, allocateLocalPart, ensureStoreSharedSender, releaseOtherLocalParts,
} from '../shared-sender'

const ORG_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const ORG_B = 'bbbbbbbb-0000-4000-8000-000000000002'
const BASED_A = '11111111-1111-4111-8111-111111111111'
const BASED_B = '22222222-2222-4222-8222-222222222222'
const BASED_C = '33333333-3333-4333-8333-333333333333'

const fake = createFakeSupabase()

beforeEach(() => {
  fake.reset()
  fake.unique('shared_sender_addresses', ['domain', 'local_part'])
  fake.seed('shared_sender_addresses', [])
  fake.seed('shopify_stores', [
    { id: BASED_A, organization_id: ORG_A, shop_name: 'Based', shop_email: 'oi@based.com', settings: {} },
    { id: BASED_B, organization_id: ORG_B, shop_name: 'Based', shop_email: null, settings: {} },
    { id: BASED_C, organization_id: ORG_B, shop_name: 'Based', shop_email: null, settings: { email_settings: { default_sender_name: 'Based SP' } } },
  ])
  delete process.env.SHARED_SENDER_DOMAIN
})
afterEach(() => { delete process.env.SHARED_SENDER_DOMAIN })

describe('slugifyLocalPart', () => {
  it('reduz o nome da loja a um local part válido', () => {
    expect(slugifyLocalPart('Dr. Groot')).toBe('dr-groot')
    expect(slugifyLocalPart('Based')).toBe('based')
    expect(slugifyLocalPart('Loja da Ana ❤️ São Paulo')).toBe('loja-da-ana-sao-paulo')
    expect(slugifyLocalPart('   ')).toBe('loja')
    expect(slugifyLocalPart(null)).toBe('loja')
  })
  it('valida o formato', () => {
    expect(isValidLocalPart('based')).toBe(true)
    expect(isValidLocalPart('supportdrgroot.store')).toBe(true)
    expect(isValidLocalPart('Based')).toBe(false)
    expect(isValidLocalPart('-based')).toBe(false)
    expect(isValidLocalPart('')).toBe(false)
  })
  it('reconhece o domínio compartilhado', () => {
    expect(isSharedDomainEmail('based@worder.email')).toBe(true)
    expect(isSharedDomainEmail('oi@based.com')).toBe(false)
    expect(localPartOf('Based@Worder.email')).toBe('based')
  })
})

describe('reserva e alocação', () => {
  it('duas lojas "Based" em organizações diferentes: based e based-2', async () => {
    expect(await allocateLocalPart(BASED_A, ORG_A, 'Based', fake)).toBe('based')
    expect(await allocateLocalPart(BASED_B, ORG_B, 'Based', fake)).toBe('based-2')
    expect(await allocateLocalPart(BASED_C, ORG_B, 'Based', fake)).toBe('based-3')
  })

  it('a chave única decide: reservar um nome de outra loja falha, o próprio é idempotente', async () => {
    expect(await reserveLocalPart('based', BASED_A, ORG_A, fake)).toBe(true)
    expect(await reserveLocalPart('based', BASED_B, ORG_B, fake)).toBe(false)
    expect(await reserveLocalPart('based', BASED_A, ORG_A, fake)).toBe(true)
  })

  it('disponibilidade com sugestão da primeira variação livre', async () => {
    await reserveLocalPart('based', BASED_A, ORG_A, fake)
    await reserveLocalPart('based-2', BASED_C, ORG_B, fake)
    const r = await checkLocalPartAvailability('based', BASED_B, fake)
    expect(r.available).toBe(false)
    expect(r.ownerStoreId).toBe(BASED_A)
    expect(r.suggestion).toBe('based-3')
    // Para a própria dona, o nome está "disponível".
    expect((await checkLocalPartAvailability('based', BASED_A, fake)).available).toBe(true)
    // Formato inválido nunca está disponível, e a sugestão é o slug.
    expect(await checkLocalPartAvailability('Based Loja', BASED_B, fake)).toMatchObject({ available: false, suggestion: 'based-loja' })
  })

  it('liberar as reservas antigas mantém só a atual', async () => {
    await reserveLocalPart('based', BASED_A, ORG_A, fake)
    await reserveLocalPart('based-loja', BASED_A, ORG_A, fake)
    await releaseOtherLocalParts(BASED_A, 'based-loja', fake)
    expect(fake.tables.shared_sender_addresses.map((r) => r.local_part)).toEqual(['based-loja'])
  })
})

describe('ensureStoreSharedSender — toda loja nasce com remetente', () => {
  it('loja sem remetente ganha <slug>@worder.email, nome da loja e reply-to no e-mail da loja', async () => {
    const r = await ensureStoreSharedSender(BASED_A, fake)
    expect(r?.allocated).toBe(true)
    expect(r?.settings).toMatchObject({
      default_sender_name: 'Based', default_sender_email: 'based@worder.email', default_reply_to: 'oi@based.com',
    })
    const saved = fake.tables.shopify_stores.find((s) => s.id === BASED_A)!
    expect(saved.settings.email_settings.default_sender_email).toBe('based@worder.email')
  })

  it('a segunda "Based" nasce como based-2, sem reply-to próprio usa o próprio endereço', async () => {
    await ensureStoreSharedSender(BASED_A, fake)
    const r = await ensureStoreSharedSender(BASED_B, fake)
    expect(r?.settings.default_sender_email).toBe('based-2@worder.email')
    expect(r?.settings.default_reply_to).toBe('based-2@worder.email')
  })

  it('preserva o nome de remetente já escolhido e é idempotente', async () => {
    const first = await ensureStoreSharedSender(BASED_C, fake)
    expect(first?.settings.default_sender_name).toBe('Based SP')
    const again = await ensureStoreSharedSender(BASED_C, fake)
    expect(again?.allocated).toBe(false)
    expect(again?.settings.default_sender_email).toBe(first?.settings.default_sender_email)
  })

  it('loja com remetente no domínio compartilhado criado antes da tabela ganha a reserva', async () => {
    fake.seed('shopify_stores', [
      { id: BASED_A, organization_id: ORG_A, shop_name: 'Dr. Groot', shop_email: null, settings: { email_settings: { default_sender_email: 'supportdrgroot.store@worder.email' } } },
    ])
    const r = await ensureStoreSharedSender(BASED_A, fake)
    expect(r?.allocated).toBe(false)
    expect(fake.tables.shared_sender_addresses).toEqual([expect.objectContaining({ local_part: 'supportdrgroot.store', store_id: BASED_A })])
  })

  it('loja inexistente devolve null', async () => {
    expect(await ensureStoreSharedSender('99999999-9999-4999-8999-999999999999', fake)).toBeNull()
  })

  it('domínio compartilhado configurável por ambiente', async () => {
    process.env.SHARED_SENDER_DOMAIN = 'mail.worder.io'
    const r = await ensureStoreSharedSender(BASED_A, fake)
    expect(r?.settings.default_sender_email).toBe('based@mail.worder.io')
  })
})
