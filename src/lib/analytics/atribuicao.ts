// =============================================================
// A quebra da receita atribuída: campanha, automação, canal.
//
// Mora aqui, e não dentro da rota do painel, porque os cartões e o
// gráfico precisam da MESMA conta. Quando eram duas, a tela se
// contradizia: o cartão dizia "Campanhas US$ 162,72 / Automações US$ 0"
// e a dica do gráfico, na mesma tela, dizia "Campanhas US$ 0 /
// Automações US$ 33" — para os mesmos três pedidos, numa conta que
// nunca enviou campanha nenhuma.
//
// A fonte é sempre o razão `order_attribution`: uma linha por pedido,
// com a origem (`campaign_id` ou `automation_id`), o canal e a data em
// que o pedido aconteceu. Ele já nasce cercado por organização e loja.
// =============================================================

export interface LinhaAtribuicao {
  channel?: string | null
  classification?: string | null
  campaign_id?: string | null
  automation_id?: string | null
  net_revenue?: number | string | null
  order_at?: string | null
  store_id?: string | null
}

const valor = (r: LinhaAtribuicao): number => {
  const n = typeof r.net_revenue === 'number' ? r.net_revenue : parseFloat(String(r.net_revenue ?? '0'))
  return Number.isFinite(n) ? n : 0
}

/** Creditada a uma campanha. */
export const ehCampanha = (r: LinhaAtribuicao): boolean => !!r.campaign_id

/**
 * Creditada a uma automação.
 *
 * `campaign_id` tem precedência de propósito: se um dia uma linha vier
 * com os dois, ela conta UMA vez, do lado da campanha — e não duas.
 */
export const ehAutomacao = (r: LinhaAtribuicao): boolean => !r.campaign_id && !!r.automation_id

/**
 * As colunas que `resumirAtribuicao` precisa ler.
 *
 * Existe para ser usada NO `select` da consulta, e não só conferida
 * depois: o resumo já mostrou zero nos dois cartões porque o `select`
 * trazia `channel` e `net_revenue` mas esquecia `campaign_id` e
 * `automation_id`. Sem os ids, toda linha vira "sem origem" — e o razão
 * estava cheio. Quem monta a consulta pede estas colunas, ponto.
 */
export const COLUNAS_ATRIBUICAO =
  'channel, classification, net_revenue, order_at, store_id, campaign_id, automation_id'

/**
 * O recorte mínimo para quem só precisa do TOTAL do período — a
 * comparação com a janela anterior, por exemplo. Nomeado para que não
 * sobre nenhum `select` do razão escrito à mão: é escrevendo à mão que
 * se esquece uma coluna.
 */
export const COLUNAS_ATRIBUICAO_TOTAL = 'net_revenue, classification'

export interface ResumoAtribuicao {
  /** Só o que veio de campanha de e-mail. */
  campanhasReceita: number
  campanhasPedidos: number
  /** Só o que veio de automação de e-mail. */
  automacoesReceita: number
  automacoesPedidos: number
  /** O canal de e-mail inteiro — campanha mais automação. */
  emailReceita: number
  /** Todo crédito da Worder, em todos os canais. */
  worderReceita: number
  worderPedidos: number
}

export function resumirAtribuicao(linhas: LinhaAtribuicao[]): ResumoAtribuicao {
  const atribuidas = (linhas || []).filter((r) => r.classification === 'attributed')
  const email = atribuidas.filter((r) => r.channel === 'email')
  const campanhas = email.filter(ehCampanha)
  const automacoes = email.filter(ehAutomacao)
  const soma = (rs: LinhaAtribuicao[]) => rs.reduce((s, r) => s + valor(r), 0)
  return {
    campanhasReceita: soma(campanhas),
    campanhasPedidos: campanhas.length,
    automacoesReceita: soma(automacoes),
    automacoesPedidos: automacoes.length,
    emailReceita: soma(email),
    worderReceita: soma(atribuidas),
    worderPedidos: atribuidas.length,
  }
}
