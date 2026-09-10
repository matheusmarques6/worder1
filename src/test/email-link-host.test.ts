// =============================================
// Nenhum construtor de link de e-mail usa o host do painel.
//
// Os links que vão dentro do e-mail — clique, pixel de abertura,
// descadastro, central de preferências, confirmação de opt-in — têm de
// sair do domínio de RASTREAMENTO (getTrackingBaseUrl: loja →
// organização → padrão da plataforma). O host do painel
// (app.worder.com.br) dentro de um e-mail cujo remetente é o domínio da
// loja é o padrão que os filtros leem como intermediário.
//
// Isto aconteceu de novo depois de estar resolvido no caminho principal:
// o e-mail das automações, o link de confirmação do popup, o envio de
// teste e a prévia cada um montava o seu com getAppBaseUrl() ou
// NEXT_PUBLIC_APP_URL. Este teste é o guarda.
// =============================================
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = process.cwd()

/** Arquivos que montam conteúdo de e-mail. */
const CONSTRUTORES = [
  'src/lib/email/render.ts',
  'src/lib/email/render-html.ts',
  'src/lib/email/send-campaign-email.ts',
  'src/lib/automation/node-executors.ts',
  'src/app/api/email/campaigns/send-batch/route.ts',
  'src/app/api/email/campaigns/test/route.ts',
  'src/app/api/email/inbox-preview/route.ts',
  'src/app/api/public/forms/[id]/submit/route.ts',
]

/** Onde o host do painel ainda é legítimo, com o motivo. */
const PERMITIDO: Record<string, RegExp[]> = {
  // A reescrita de UTM precisa saber quais hosts NÃO carimbar: os do app
  // e do rastreamento. É leitura de host, não construção de link.
  'src/lib/email/render.ts': [/skipHosts\.push/],
}

describe('host dos links do e-mail', () => {
  for (const rel of CONSTRUTORES) {
    it(`${rel} não monta link com o host do painel`, () => {
      const caminho = join(RAIZ, rel)
      if (!existsSync(caminho)) return   // arquivo pode ter sido renomeado
      const fonte = readFileSync(caminho, 'utf-8')
      const permitido = PERMITIDO[rel] || []

      const suspeitas: string[] = []
      fonte.split('\n').forEach((linha, i) => {
        if (linha.trimStart().startsWith('//') || linha.trimStart().startsWith('*')) return
        const usaAppUrl = /getAppBaseUrl\(\)|NEXT_PUBLIC_APP_URL/.test(linha)
        if (!usaAppUrl) return
        if (permitido.some((re) => re.test(linha))) return
        suspeitas.push(`${rel}:${i + 1}  ${linha.trim().slice(0, 100)}`)
      })

      expect(
        suspeitas,
        'Use getTrackingBaseUrl(organizationId, storeId) — o host dos links do ' +
        'e-mail é o de rastreamento, não o do painel:\n' + suspeitas.join('\n'),
      ).toEqual([])
    })
  }

  it('o caminho principal continua recebendo o host de fora, não o inventando', () => {
    const render = readFileSync(join(RAIZ, 'src/lib/email/render.ts'), 'utf-8')
    // prepareEmailHtml recebe baseUrl por parâmetro; quem chama resolve.
    expect(render).toMatch(/baseUrl/)
    const batch = readFileSync(join(RAIZ, 'src/app/api/email/campaigns/send-batch/route.ts'), 'utf-8')
    expect(batch).toContain('getTrackingBaseUrl')
  })
})
