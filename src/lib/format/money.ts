// =============================================================
// Dinheiro na tela, na moeda da loja.
//
// Existia um formatador por página, e mais de um com `R$` cravado no
// texto. Numa loja em dólar, a tela de automações anunciava "R$ 111,81"
// para uma venda de US$ 111,81 — o mesmo número, a moeda errada, ao
// lado de um painel que já mostrava "US$" certo. O lojista fica sem
// saber qual das duas telas acreditar.
//
// A moeda vem da loja escolhida (`shopify_stores.currency`). Sem loja
// escolhida, o padrão continua BRL, que é o que sempre foi.
// =============================================================

/**
 * A moeda da loja escolhida, fora de um componente.
 *
 * As telas de CRM formatavam dinheiro em funções de módulo, longe de
 * qualquer hook, e por isso tinham `BRL` cravado. Ler o estado por
 * `getState()` resolve sem transformar cada formatador em componente.
 * Sem loja escolhida — ou fora do navegador — fica BRL, que é o que
 * sempre foi.
 */
export function moedaDaLoja(): string {
  try {
    // Importado aqui dentro para a store de UI não entrar no grafo de
    // quem só quer formatar um número no servidor.
    const { useStoreStore } = require('@/stores')
    return (useStoreStore.getState()?.currentStore?.currency || 'BRL').toUpperCase()
  } catch {
    return 'BRL'
  }
}

/** Dinheiro por extenso, com os centavos. */
export function formatarDinheiro(valor: number, moeda = 'BRL'): string {
  const n = Number.isFinite(valor) ? valor : 0
  const cur = (moeda || 'BRL').toUpperCase()
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)
  } catch {
    // Código de moeda que o navegador não conhece: mostra o código em
    // vez de estourar ou, pior, mentir o símbolo.
    return `${cur} ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
}

/**
 * Dinheiro encurtado, para cartão apertado: "US$ 25 mil", "R$ 1,2 mi".
 *
 * O símbolo sai do próprio `Intl` — era ele que vinha cravado como
 * `R$` nas versões antigas.
 */
export function formatarDinheiroCurto(valor: number, moeda = 'BRL'): string {
  const n = Number.isFinite(valor) ? valor : 0
  const abs = Math.abs(n)
  if (abs < 1000) return formatarDinheiro(n, moeda)
  const divisor = abs >= 1_000_000 ? 1_000_000 : 1000
  const sufixo = abs >= 1_000_000 ? 'mi' : 'mil'
  const reduzido = n / divisor
  const casas = abs >= 1_000_000 ? 1 : 0
  // Formata o valor reduzido com a moeda certa e depois costura o
  // sufixo: assim o símbolo é sempre o que o `Intl` decidiu.
  const comMoeda = formatarDinheiro(reduzido, moeda)
  const semCentavos = comMoeda.replace(
    /([\d.,]+)$/,
    reduzido.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
  )
  return `${semCentavos} ${sufixo}`
}
