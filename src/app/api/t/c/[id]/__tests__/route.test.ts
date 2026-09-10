// O redirecionador de clique com o link REAL que chegou quebrado.
//
// O relato veio com HTTP 400 numa URL de feed de produtos servida por
// click.worder.email. A rota só responde 400 quando falta o `url`, então
// este teste passa exatamente aquele link e prova o que ela faz — para
// separar "o código recusa" de "a borda nem chegou no código".
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const send = {
  id: '98cabcc0-4e3e-4c1d-b464-a178f8e542d8',
  campaign_id: null,
  contact_id: 'c73f378a-b0d8-4d5a-927f-e0fe3d2c202d',
  organization_id: 'org-1',
  ab_variant: null,
  automation_id: 'f808eef5-85be-4c03-a31e-c529dd985187',
  flow_id: null,
  metadata: { node_id: 'node-1788629590630' },
  store_id: null,
}

const admin = {
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: send, error: null }) }),
      is: () => ({ then: undefined }),
    }),
    update: () => ({ eq: () => ({ is: async () => ({ error: null }) }) }),
    insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
  }),
  rpc: async () => ({ data: null, error: null }),
}

vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() { return admin },
  getSupabaseAdmin: () => admin,
  isSupabaseConfigured: () => true,
}))

const DESTINO =
  'https%3A%2F%2Fmedicubeseoul.com%2Fproducts%2Fpdrn-pink-peptide-cream%3Futm_source%3Dconvertfy' +
  '%26utm_medium%3Demail%26utm_campaign%3Dautomation%253A%2BConvertfy%2B%257C%2BUpsell%2B%257C%2BMedicube' +
  '%2B%2528f808eef5-85be-4c03-a31e-c529dd985187%2529%26utm_content%3DEmail%2B1%2B%257C%2BUpsell' +
  '%2B%2528node-1788629590630%2529%26utm_term%3D2026-09-10%26utm_id%3Df808eef5-85be-4c03-a31e-c529dd985187' +
  '%26worderContactID%3Dc73f378a-b0d8-4d5a-927f-e0fe3d2c202d' +
  '%26worderSendID%3D98cabcc0-4e3e-4c1d-b464-a178f8e542d8' +
  '%26worderAutomationID%3Df808eef5-85be-4c03-a31e-c529dd985187' +
  '%26worderMessageID%3Dnode-1788629590630'

async function clicar(url: string, host = 'click.worder.email') {
  const { GET } = await import('../route')
  return GET(new NextRequest(`https://${host}/api/t/c/${send.id}?url=${url}`), {
    params: { id: send.id },
  } as any)
}

beforeEach(() => { vi.resetModules() })

describe('clique no link do feed de produtos', () => {
  it('o link relatado redireciona — não é a rota que responde 400', async () => {
    const res = await clicar(DESTINO)
    expect(res.status).toBe(302)
    const destino = new URL(res.headers.get('location') || '')
    expect(destino.host).toBe('medicubeseoul.com')
    expect(destino.pathname).toBe('/products/pdrn-pink-peptide-cream')
  })

  it('a UTM composta atravessa o redirecionamento sem virar outra coisa', async () => {
    const res = await clicar(DESTINO)
    const destino = new URL(res.headers.get('location') || '')
    expect(destino.searchParams.get('utm_campaign'))
      .toBe('automation: Convertfy | Upsell | Medicube (f808eef5-85be-4c03-a31e-c529dd985187)')
    expect(destino.searchParams.get('worderContactID')).toBe(send.contact_id)
    expect(destino.searchParams.get('worderMessageID')).toBe('node-1788629590630')
  })

  it('serve em qualquer host — é o mesmo app atrás do domínio de clique', async () => {
    const res = await clicar(DESTINO, 'app.worder.com.br')
    expect(res.status).toBe(302)
  })

  it('sem url é 400 com corpo explicando (o 400 vazio do relato não é este)', async () => {
    const { GET } = await import('../route')
    const res = await GET(new NextRequest(`https://click.worder.email/api/t/c/${send.id}`), {
      params: { id: send.id },
    } as any)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Missing url' })
  })
})
