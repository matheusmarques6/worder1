// Ligar o subdomínio de links do lojista.
//
// É o host que o destinatário vê: o provedor reescreve o link no envio,
// depois do nosso render. Alinhar esse host com o domínio de envio é o
// que a entregabilidade pede — e custa um CNAME, no mesmo DNS onde ele
// já publicou SPF e DKIM.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const DOM = {
  id: 'dom-1',
  domain: 'sualoja.com.br',
  organization_id: 'org-1',
  is_system: false,
  resend_domain_id: 'rs-1',
  dns_records: [{ record: 'DKIM', type: 'TXT', name: 'resend._domainkey', value: 'p=...' }],
  tracking_config: {},
}

let linha: any = { ...DOM }
let salvo: any = null
const chamadas: any[] = []

const admin = {
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: linha, error: null }) }),
        or: () => ({ maybeSingle: async () => ({ data: linha, error: null }) }),
        maybeSingle: async () => ({ data: linha, error: null }),
      }),
    }),
    update: (patch: any) => ({
      eq: () => ({
        select: () => ({ single: async () => { salvo = { ...linha, ...patch }; return { data: salvo, error: null } } }),
      }),
    }),
  }),
}

vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() { return admin },
  getSupabaseAdmin: () => admin,
  isSupabaseConfigured: () => true,
}))
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: async () => ({ supabase: admin, user: { id: 'u-1', organization_id: 'org-1' } }),
  authError: () => new Response('unauthorized', { status: 401 }),
}))
vi.mock('@/lib/email/resend', () => ({
  setDomainTracking: async (id: string, opts: any) => { chamadas.push({ id, opts }); return {} },
  getDomain: async () => ({
    records: [
      { record: 'DKIM', type: 'TXT', name: 'resend._domainkey', value: 'p=...' },
      { type: 'CNAME', name: 'click', value: 'tracking.resend.com', status: 'not_started' },
    ],
  }),
}))

async function patch(body: any) {
  const { PATCH } = await import('../route')
  const res = await PATCH(
    new NextRequest('https://app.test/api/email/domains/dom-1', { method: 'PATCH', body: JSON.stringify(body) }),
    { params: { id: 'dom-1' } },
  )
  return { res, body: await res.json() }
}

beforeEach(() => {
  vi.resetModules()
  linha = { ...DOM }
  salvo = null
  chamadas.length = 0
})

describe('PATCH do subdomínio de links', () => {
  it('manda para o provedor com o rastreamento ligado e guarda o que voltou', async () => {
    const { res, body } = await patch({ tracking_subdomain: 'click.sualoja.com.br' })
    expect(res.status).toBe(200)
    expect(chamadas[0].opts).toMatchObject({
      clickTracking: true,
      openTracking: true,
      trackingSubdomain: 'click.sualoja.com.br',
    })
    expect(body.tracking_subdomain).toBe('click.sualoja.com.br')
    // O CNAME novo, que o lojista precisa publicar, vem junto.
    expect(salvo.dns_records.some((r: any) => r.type === 'CNAME' && r.name === 'click')).toBe(true)
    expect(salvo.tracking_config.tracking_subdomain).toBe('click.sualoja.com.br')
  })

  it('vazio volta ao padrão click.<domínio>', async () => {
    const { body } = await patch({ tracking_subdomain: '' })
    expect(body.tracking_subdomain).toBe('click.sualoja.com.br')
  })

  it('recusa subdomínio de outro domínio antes de tocar no provedor', async () => {
    const { res, body } = await patch({ tracking_subdomain: 'click.outraloja.com.br' })
    expect(res.status).toBe(400)
    expect(body.error).toContain('sualoja.com.br')
    expect(chamadas).toHaveLength(0)
  })

  it('não deixa mexer no domínio do sistema', async () => {
    linha = { ...DOM, is_system: true }
    const { res } = await patch({ tracking_subdomain: 'click.sualoja.com.br' })
    expect(res.status).toBe(400)
    expect(chamadas).toHaveLength(0)
  })

  it('domínio de outra organização não é encontrado', async () => {
    linha = null
    const { res } = await patch({ tracking_subdomain: 'click.sualoja.com.br' })
    expect(res.status).toBe(404)
  })
})
