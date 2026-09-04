// =============================================================
// pickStore: a loja pedida, ou a ÚNICA — nunca "a mais nova".
// =============================================================

import { describe, it, expect, beforeEach } from 'vitest'
import { createFakeSupabase } from '@/tests/fake-supabase'
import { pickStore, pickStoreError } from '../pick-store'

const ORG = '425db1ba-99c0-4dbb-9434-27fe9cc03ec6'
const OUTRA = '99999999-9999-4999-8999-999999999999'
const A = 'd5dfd5dd-1d77-425e-a099-850338078999'
const B = 'd04a4411-abc2-4135-bb88-e1f3c31d3b1b'
const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const fake = createFakeSupabase()

beforeEach(() => {
  fake.reset()
  fake.seed('shopify_stores', [
    { id: A, organization_id: ORG, shop_domain: 'a.myshopify.com', is_active: true, installed_at: '2026-01-01' },
    { id: B, organization_id: ORG, shop_domain: 'b.myshopify.com', is_active: true, installed_at: '2026-09-04' },
    { id: C, organization_id: OUTRA, shop_domain: 'c.myshopify.com', is_active: true, installed_at: '2026-09-04' },
  ])
})

describe('pickStore', () => {
  it('devolve a loja pedida quando é de uma organização do usuário', async () => {
    const r = await pickStore(fake, { orgIds: [ORG], storeId: A })
    expect(r.reason).toBe('requested')
    expect(r.store?.id).toBe(A)
  })

  it('recusa uma loja de outra organização, mesmo existindo', async () => {
    const r = await pickStore(fake, { orgIds: [ORG], storeId: C })
    expect(r.reason).toBe('not_found')
    expect(r.store).toBeNull()
  })

  it('recusa um id que não é uuid sem consultar o banco', async () => {
    const r = await pickStore(fake, { orgIds: [ORG], storeId: 'x' })
    expect(r.reason).toBe('not_found')
    expect(fake.calls.length).toBe(0)
  })

  it('com duas lojas ativas e sem pedido, NÃO escolhe a mais nova', async () => {
    const r = await pickStore(fake, { orgIds: [ORG] })
    expect(r.reason).toBe('ambiguous')
    expect(r.store).toBeNull()
  })

  it('com uma única loja ativa, é ela', async () => {
    fake.seed('shopify_stores', [
      { id: A, organization_id: ORG, shop_domain: 'a.myshopify.com', is_active: true },
      { id: B, organization_id: ORG, shop_domain: 'b.myshopify.com', is_active: false },
    ])
    const r = await pickStore(fake, { orgIds: [ORG] })
    expect(r.reason).toBe('single')
    expect(r.store?.id).toBe(A)
  })

  it('loja "sem integração" (domínio sintético) não conta como candidata', async () => {
    fake.seed('shopify_stores', [
      { id: A, organization_id: ORG, shop_domain: 'a.myshopify.com', is_active: true },
      { id: B, organization_id: ORG, shop_domain: 'manual-nova-1.worder.local', is_active: true },
    ])
    const r = await pickStore(fake, { orgIds: [ORG] })
    expect(r.reason).toBe('single')
    expect(r.store?.id).toBe(A)
  })

  it('sem loja nenhuma', async () => {
    const r = await pickStore(fake, { orgIds: [OUTRA + '0'] })
    expect(r.reason).toBe('none')
  })

  it('as mensagens de erro têm status coerente', () => {
    expect(pickStoreError('ambiguous').status).toBe(400)
    expect(pickStoreError('not_found').status).toBe(404)
    expect(pickStoreError('none').status).toBe(404)
  })
})
