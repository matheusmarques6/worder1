// A rota que responde "as imagens do meu e-mail estão carregando?".
import { describe, it, expect, vi, beforeEach } from 'vitest'

const listas: Record<string, any[]> = {}
let respostas: Record<string, number> = {}

const admin = {
  storage: {
    from: () => ({
      list: async (prefixo: string) => ({ data: listas[prefixo] || [], error: null }),
    }),
  },
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

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.resetModules()
  for (const k of Object.keys(listas)) delete listas[k]
  process.env = { ...ORIGINAL_ENV, CDN_IMAGES_DOMAIN: 'cdn.teste.email', NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co' }
  respostas = {}
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const status = respostas[url as string] ?? 200
    return new Response(null, { status })
  }))
})

async function get() {
  const { GET } = await import('../route')
  const res = await GET()
  return { res, body: await res.json() }
}

describe('diagnóstico das imagens de e-mail', () => {
  it('sem imagem nenhuma, não inventa problema', async () => {
    const { body } = await get()
    expect(body.diagnostico).toBe('sem_imagens')
    expect(body.ok).toBe(true)
  })

  it('desce um nível para achar a imagem da loja', async () => {
    listas['org-1'] = [{ name: 'store_abc', id: null }]
    listas['org-1/store_abc'] = [{ name: 'foto.png', id: 'x' }]
    const { body } = await get()
    expect(body.amostra).toBe('org-1/store_abc/foto.png')
    expect(body.diagnostico).toBe('ok')
  })

  it('render recusado e caminho direto servindo: acusa o transformador', async () => {
    listas['org-1'] = [{ name: 'foto.png', id: 'x' }]
    respostas['https://cdn.teste.email/storage/v1/render/image/public/email-images/org-1/foto.png?width=600&quality=80'] = 400
    respostas['https://proj.supabase.co/storage/v1/render/image/public/email-images/org-1/foto.png?width=600&quality=80'] = 400
    const { body } = await get()
    expect(body.diagnostico).toBe('transformacao_desligada')
    expect(body.ok).toBe(false)
    expect(body.sondas.cdn_object.ok).toBe(true)
  })

  it('a sonda pede só o primeiro byte, para não baixar a imagem inteira', async () => {
    listas['org-1'] = [{ name: 'foto.png', id: 'x' }]
    await get()
    const chamada = (globalThis.fetch as any).mock.calls[0]
    expect(chamada[1].headers.Range).toBe('bytes=0-0')
  })
})
