// A rota de saúde do envio rodando de verdade. O que importa aqui não é o
// texto dos avisos (isso é o teste da regra pura) e sim o ESCOPO: nenhuma
// consulta pode escapar da organização da sessão, e com uma loja escolhida
// o painel não pode mostrar o domínio ou o número da loja irmã.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeSupabase, hasFilter, allScopedToOrg, type FakeSupabase } from '@/test/supabase-fake'

let db: FakeSupabase

vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() { return db },
  getSupabaseAdmin: () => db,
  isSupabaseConfigured: () => true,
}))
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: async () => ({ user: { id: 'u-1', organization_id: 'org-1' } }),
  authError: () => new Response('unauthorized', { status: 401 }),
}))

const HOURS = 3600000
const ago = (h: number) => new Date(Date.now() - h * HOURS).toISOString()
const ahead = (h: number) => new Date(Date.now() + h * HOURS).toISOString()

async function get(query = '') {
  const { GET } = await import('../route')
  const res = await GET(new NextRequest(`https://app.test/api/sending/health${query}`))
  return { res, body: await res.json() }
}

beforeEach(() => {
  vi.resetModules()
  db = fakeSupabase({ rows: {} })
})

describe('saúde do envio · rota', () => {
  it('responde sem nada configurado, sem estourar', async () => {
    const { res, body } = await get()
    expect(res.status).toBe(200)
    expect(body.counts).toEqual({ error: 0, warn: expect.any(Number) })
    expect(Array.isArray(body.issues)).toBe(true)
  })

  it('toda consulta fica presa à organização da sessão', async () => {
    await get('?storeId=store-a')
    expect(allScopedToOrg(db.queries, 'org-1', [
      'email_domains', 'email_campaigns', 'whatsapp_business_accounts', 'email_sends', 'shopify_stores',
    ])).toBe(true)
    // A própria organização se identifica pela chave primária.
    for (const q of db.on('organizations')) expect(hasFilter(q, 'id', 'org-1')).toBe(true)
  })

  it('o domínio quebrado da organização vira erro no painel', async () => {
    db = fakeSupabase({
      rows: {
        organizations: [{ sender_email: 'loja@minhaloja.com.br' }],
        email_domains: [{ domain: 'minhaloja.com.br', status: 'failed', verified_at: ago(500), is_system: false, store_id: null }],
      },
    })
    const { body } = await get()
    expect(body.issues.map((i: any) => i.kind)).toContain('domain_broke')
    expect(body.counts.error).toBeGreaterThan(0)
  })

  it('com uma loja escolhida, o domínio da loja irmã não aparece', async () => {
    db = fakeSupabase({
      rows: {
        organizations: [{ sender_email: 'loja@minhaloja.com.br' }],
        email_domains: [
          { domain: 'irma.com.br', status: 'failed', verified_at: ago(500), is_system: false, store_id: 'store-b' },
        ],
      },
    })
    const { body } = await get('?storeId=store-a')
    expect(body.issues.map((i: any) => i.subject)).not.toContain('irma.com.br')
  })

  it('o número de WhatsApp da loja irmã também fica de fora', async () => {
    db = fakeSupabase({
      rows: {
        organizations: [{ sender_email: 'loja@minhaloja.com.br' }],
        whatsapp_business_accounts: [
          { id: 'w-b', verified_name: 'Loja irmã', status: 'active', webhook_configured: false, store_id: 'store-b' },
        ],
      },
    })
    const { body } = await get('?storeId=store-a')
    expect(body.issues.map((i: any) => i.kind)).not.toContain('wa_webhook_off')
  })

  it('lê o remetente da loja quando ela tem um próprio', async () => {
    db = fakeSupabase({
      rows: {
        shopify_stores: [{ settings: { email_settings: { default_sender_email: 'contato@minhaloja.com.br' } } }],
        organizations: [{ sender_email: 'outro@worder.email' }],
      },
    })
    const { body } = await get('?storeId=store-a')
    expect(body.sender.email).toBe('contato@minhaloja.com.br')
    // Com domínio próprio não há conversa de franquia.
    expect(body.sender.on_shared_domain).toBe(false)
    expect(body.issues.map((i: any) => i.kind)).not.toContain('sender_shared')
  })

  it('só considera campanha agendada que ainda vai sair', async () => {
    db = fakeSupabase({ rows: { organizations: [{ sender_email: 'loja@worder.email' }] } })
    await get()
    const q = db.on('email_campaigns')[0]
    expect(hasFilter(q, 'status', 'scheduled')).toBe(true)
    expect(q.filters.some((f) => f.column === 'scheduled_at' && f.op === 'gte')).toBe(true)
  })

  it('a campanha agendada no endereço temporário sem franquia vira erro', async () => {
    db = fakeSupabase({
      rows: {
        organizations: [{ sender_email: 'loja@worder.email' }],
        email_campaigns: [{ id: 'c1', name: 'Black Friday', scheduled_at: ahead(48), from_email: 'loja@worder.email', total_recipients: 50000, store_id: null }],
        // A franquia conta os envios já feitos: nenhum aqui, mas 50 mil
        // destinatários passam de qualquer franquia razoável.
      },
    })
    const { body } = await get()
    const blocked = body.issues.find((i: any) => i.kind === 'scheduled_blocked')
    expect(blocked, 'a campanha grande no endereço temporário tem de ser sinalizada').toBeTruthy()
    expect(blocked.detail).toContain('Black Friday')
  })

  it('não guarda cache: o painel tem de refletir o estado de agora', async () => {
    const { res } = await get()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
