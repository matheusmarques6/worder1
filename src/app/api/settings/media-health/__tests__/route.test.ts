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

describe('a sonda que imita o proxy do Gmail', () => {
  it('pede a imagem em uso como o proxy do Gmail: robô e SEM Referer', async () => {
    listas['org-1'] = [{ name: 'foto.png', id: 'x' }]
    await get()
    const chamadas = (globalThis.fetch as any).mock.calls
    const comoProxy = chamadas.filter((c: any[]) =>
      String(c[1]?.headers?.['User-Agent'] || '').includes('GoogleImageProxy'))
    expect(comoProxy).toHaveLength(1)
    // O Gmail não manda Referer — mandar aqui esconderia o hotlink.
    expect(comoProxy[0][1].headers.Referer).toBeUndefined()
    // É a MESMA URL que o e-mail usa — a do /render, não outra.
    expect(comoProxy[0][0]).toContain('/render/image/public/')
  })

  it('pede a mesma imagem como outra página pediria: com Referer', async () => {
    listas['org-1'] = [{ name: 'foto.png', id: 'x' }]
    await get()
    const chamadas = (globalThis.fetch as any).mock.calls
    const comoPagina = chamadas.filter((c: any[]) => c[1]?.headers?.Referer)
    expect(comoPagina).toHaveLength(1)
    expect(comoPagina[0][0]).toContain('/render/image/public/')
  })

  it('recusada para o proxy do Gmail: o e-mail chegou vazio', async () => {
    listas['org-1'] = [{ name: 'foto.png', id: 'x' }]
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      const ehRobo = String(init?.headers?.['User-Agent'] || '').includes('GoogleImageProxy')
      return new Response(null, { status: ehRobo ? 403 : 200 })
    }))
    const { body } = await get()
    expect(body.diagnostico).toBe('hotlink_bloqueado')
    expect(body.ok).toBe(false)
    expect(body.embutido.proxy.status).toBe(403)
  })

  it('recusada só para quem manda Referer: o e-mail está bom, a tela é que quebra', async () => {
    listas['org-1'] = [{ name: 'foto.png', id: 'x' }]
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      const temReferer = Boolean(init?.headers?.Referer)
      return new Response(null, { status: temReferer ? 403 : 200 })
    }))
    const { body } = await get()
    expect(body.diagnostico).toBe('hotlink_so_no_painel')
    expect(body.embutido.proxy.ok).toBe(true)
    expect(body.embutido.pagina.status).toBe(403)
  })
})
