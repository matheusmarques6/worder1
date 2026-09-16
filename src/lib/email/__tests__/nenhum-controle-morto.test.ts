// ═══════════════════════════════════════════════════════════════════
// A varredura vira teste.
//
// O padrão que apareceu vez após vez nesta auditoria: o painel oferece
// um controle, o editor até o desenha, e o HTML enviado o ignora. O
// lojista mexe, vê mudar na tela, e o cliente recebe outra coisa.
//
// Este teste cruza toda prop que o painel escreve com toda prop que os
// renderizadores leem. Controle novo que nascer morto quebra aqui, na
// hora — em vez de aparecer meses depois numa caixa de entrada.
//
// A lista de dispensas embaixo é curta de propósito, e cada linha diz
// por quê. Crescer essa lista é a forma de burlar o teste; se precisar
// crescer, é sinal de que o controle deveria funcionar.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const raiz = process.cwd()
const ler = (p: string) => fs.readFileSync(path.join(raiz, p), 'utf8')

/** Props que o painel grava mas que, por natureza, não viram HTML. */
const DISPENSADAS = new Map<string, string>([
  ['gap', 'pertence ao bloco "columns", tipo antigo sem entrada na paleta e sem nenhum salvo'],
  ['feedName', 'rótulo do feed, mostrado só no painel — quem resolve é o feedId'],
  ['_condition_enabled', 'lógica condicional: vira o marcador WORDER_CONDITION que envolve o bloco, não um estilo dele'],
  ['_condition_field', 'campo avaliado pela condição — lido de dentro do marcador, no envio, não do bloco'],
  ['_condition_op', 'operador da condição — lido de dentro do marcador, no envio, não do bloco'],
  ['_condition_value', 'valor comparado pela condição — lido de dentro do marcador, no envio, não do bloco'],
])

describe('nenhum controle do painel nasce morto', () => {
  it('toda prop que o painel escreve é lida por algum renderizador', () => {
    const painel = ler('src/components/email-builder/panels/BlockProperties.tsx')
    const escritas = new Set<string>()
    for (const m of painel.matchAll(/onChange\(\s*['"]([A-Za-z0-9_]+)['"]/g)) escritas.add(m[1])
    for (const m of painel.matchAll(/\bupdate\(\s*['"]([A-Za-z0-9_]+)['"]/g)) escritas.add(m[1])

    const lidas = new Set<string>()
    for (const arquivo of [
      'src/lib/email/render-html.ts',
      'src/lib/email/render.ts',
      'src/lib/email/product-grid.ts',
    ]) {
      const s = ler(arquivo)
      // Leitura direta: p.chave / cfg.chave / props.chave
      for (const m of s.matchAll(/\b(?:p|cfg|props)\.([A-Za-z0-9_]+)/g)) lidas.add(m[1])
      // E as chaves montadas nos objetos de configuração que viajam no
      // marcador (`showName: p.showName !== false`).
      for (const m of s.matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)) lidas.add(m[1])
    }

    const mortas = [...escritas]
      .filter((k) => !lidas.has(k) && !DISPENSADAS.has(k))
      .sort()

    expect(
      mortas,
      mortas.length
        ? `Estes controles o painel grava e nenhum renderizador lê — ` +
          `o lojista mexe, vê mudar na tela e o cliente recebe outra coisa:\n` +
          mortas.map((k) => `  • ${k}`).join('\n')
        : ''
    ).toEqual([])
  })

  it('a lista de dispensas continua curta e explicada', () => {
    // Uma dispensa sem motivo escrito é uma dispensa que ninguém vai
    // conseguir revisar depois.
    for (const [chave, motivo] of DISPENSADAS) {
      expect(motivo.length, `dispensa "${chave}" sem motivo`).toBeGreaterThan(20)
    }
    expect(DISPENSADAS.size).toBeLessThanOrEqual(10)
  })
})
