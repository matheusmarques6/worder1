// ═══════════════════════════════════════════════════════════════════
// As regras de isolamento, ditas em teste para não voltarem a cair.
//
// A auditoria achou dois padrões que se repetiam por descuido, não por
// decisão. Estes testes lêem o código-fonte e reprovam se qualquer um
// voltar:
//
// 1. Rota que aceita a organização pelo pedido — `?organization_id=` ou
//    no corpo — sem exigir sessão. Informar o id alheio bastava para
//    ler e escrever na organização de outra empresa.
//
// 2. Tela que consulta o banco direto do browser. O app guarda o token
//    num cookie httpOnly, que o JavaScript não lê, então essas
//    consultas vão como anônimas: funcionavam só porque a RLS estava
//    desligada, e uma delas listava os modelos de e-mail de todas as
//    organizações.
//
// Se um caso novo for mesmo legítimo, a correção é anotá-lo na lista de
// exceções aqui, com o motivo — não apagar o teste.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function arquivos(raiz: string, filtro: (p: string) => boolean): string[] {
  const saida: string[] = []
  const ande = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      if (nome === 'node_modules' || nome === '__tests__') continue
      const p = join(dir, nome)
      if (statSync(p).isDirectory()) ande(p)
      else if (filtro(p)) saida.push(p)
    }
  }
  ande(raiz)
  return saida
}

// Tudo que estabelece quem está pedindo. Uma rota que use qualquer um
// destes já não confia no id que veio no pedido.
const TEM_IDENTIDADE =
  /requireOrgFromAuth|getAuthClient|requireStore|createServerComponentClient|verifyApiKey|CRON_SECRET|assertCron|X-Internal|verifyShopifyWebhook|assertDebugAllowed|createRouteHandlerClient/

// Exceções conscientes: a organização aqui é conferida contra os
// vínculos de quem pediu, logo depois de ler o parâmetro.
const CONFEREM_VINCULO = new Set([
  'src/app/api/lead-scoring/route.ts',
  'src/app/api/reports/route.ts',
])

describe('a organização não vem no pedido', () => {
  const rotas = arquivos('src/app/api', (p) => p.endsWith('route.ts'))

  it('há rotas para auditar', () => {
    expect(rotas.length).toBeGreaterThan(400)
  })

  it('nenhuma rota lê a organização da URL sem exigir sessão', () => {
    const culpadas = rotas.filter((p) => {
      if (CONFEREM_VINCULO.has(p)) return false
      const src = readFileSync(p, 'utf8')
      if (TEM_IDENTIDADE.test(src)) return false
      return /searchParams\.get\(\s*['"](organization_id|organizationId|orgId)['"]/.test(src)
    })
    expect(culpadas).toEqual([])
  })

  it('nenhuma rota tira a organização do corpo sem exigir sessão', () => {
    const culpadas = rotas.filter((p) => {
      if (CONFEREM_VINCULO.has(p)) return false
      const src = readFileSync(p, 'utf8')
      if (TEM_IDENTIDADE.test(src)) return false
      const desestruturacoes = src.matchAll(
        /const\s*\{([^}]*)\}\s*=\s*(?:await\s+)?(?:request|req)\.json\(\)/g
      )
      for (const m of desestruturacoes) {
        if (/\borganization_?[Ii]d\b/.test(m[1])) return true
      }
      return false
    })
    expect(culpadas).toEqual([])
  })
})

describe('as telas não falam com o banco direto', () => {
  // O cliente de browser não carrega a sessão deste app, então toda
  // consulta feita daqui é anônima. Dado de inquilino sai pela API.
  const telas = arquivos('src/app/(dashboard)', (p) => p.endsWith('.tsx'))

  it('há telas para auditar', () => {
    expect(telas.length).toBeGreaterThan(30)
  })

  it('nenhuma tela do painel consulta uma tabela pelo cliente de browser', () => {
    const culpadas = telas.filter((p) => {
      const src = readFileSync(p, 'utf8')
      if (!/createBrowserClient|supabaseClient|createClientComponentClient/.test(src)) return false
      // `.from('tabela')` — e não Array.from, Date.from e afins.
      return /\.from\(\s*['"][a-z_][a-z0-9_]*['"]\s*\)/.test(src)
    })
    expect(culpadas).toEqual([])
  })
})

describe('segredos Shopify ficam atrás da autorização do servidor', () => {
  const rotas = [
    'src/app/api/integrations/connected/route.ts',
    'src/app/api/shopify/check-connection/route.ts',
    'src/app/api/shopify/import-customers/route.ts',
    'src/app/api/shopify/import-jobs/route.ts',
    'src/app/api/shopify/pixel/route.ts',
    'src/app/api/shopify/sync/route.ts',
    'src/app/api/shopify/verificar/route.ts',
  ]
  const validacoesPorLoja = new Map([
    ['src/app/api/shopify/check-connection/route.ts', 1],
    ['src/app/api/shopify/import-customers/route.ts', 2],
    ['src/app/api/shopify/import-jobs/route.ts', 1],
    ['src/app/api/shopify/pixel/route.ts', 1],
    ['src/app/api/shopify/sync/route.ts', 1],
  ])
  const consumidoresJwt = [
    'src/app/api/meta/accounts/route.ts',
    'src/app/api/meta/campaigns/route.ts',
    'src/app/api/meta/sync/route.ts',
  ]
  const colunasJwtPermitidas = new Set([
    'id', 'organization_id', 'shop_name', 'shop_domain', 'is_active', 'created_at',
    'default_pipeline_id', 'default_stage_id', 'status', 'connection_status',
    'status_message', 'health_checked_at', 'consecutive_failures', 'last_sync_at',
    'contact_type', 'sync_orders', 'sync_customers', 'sync_checkouts', 'sync_refunds',
    'auto_tags', 'stage_mapping', 'is_configured', 'total_orders', 'total_revenue',
  ])

  it('cada leitura secreta e escrita admin é autorizada e escopada pela organização', () => {
    for (const rota of rotas) {
      const src = readFileSync(rota, 'utf8')
      expect(src, rota).toContain('getSupabaseAdmin')

      const validacoes = src.match(/validateStoreAccess\([^;]*auth\.user\.id\s*,?\s*\)/g) ?? []
      expect(validacoes.length, `${rota}: validações`).toBeGreaterThanOrEqual(
        validacoesPorLoja.get(rota) ?? 0,
      )

      const consultas = src.matchAll(
        /await\s+(\w+)\s*\n?\s*\.from\('shopify_stores'\)([\s\S]*?);/g,
      )
      for (const [, cliente, cadeia] of consultas) {
        const leSegredo = cadeia.includes('access_token') ||
          /\.select\(\s*['"]\*['"]\s*\)/.test(cadeia)
        const escreve = cadeia.includes('.update(')
        if (!leSegredo && !escreve) continue

        expect(cliente, `${rota}: cliente privilegiado`).toBe('supabaseAdmin')
        expect(cadeia, `${rota}: escopo da organização`).toContain(".eq('organization_id',")
      }
    }
  })

  it('consumidores JWT conhecidos pedem apenas colunas canônicas permitidas', () => {
    for (const rota of consumidoresJwt) {
      const src = readFileSync(rota, 'utf8')
      const consultas = [...src.matchAll(
        /\.from\('shopify_stores'\)\s*\.select\(\s*['"]([^'"]+)['"]\s*\)/g,
      )]
      expect(consultas.length, rota).toBeGreaterThan(0)

      for (const [, selecao] of consultas) {
        const colunas = selecao.split(',').map((coluna) => coluna.trim())
        expect(
          colunas.every((coluna) => colunasJwtPermitidas.has(coluna)),
          `${rota}: ${selecao}`,
        ).toBe(true)
      }
    }
  })
})
