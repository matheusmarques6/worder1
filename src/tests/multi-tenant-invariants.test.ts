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
