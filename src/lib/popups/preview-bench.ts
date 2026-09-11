// =============================================================
// A BANCADA: o que o servidor responderia.
//
// A pré-visualização do editor roda o popup de verdade (o mesmo script
// que a loja carrega) dentro de um iframe, com a rede encenada. Este
// módulo é a única parte dessa encenação que tem regra — o resto é
// devolver 200 e calar a boca.
//
// A regra importa porque um teste que sempre ganha não é teste: se a
// roleta do lojista tem um setor "não foi dessa vez" com 20% de peso,
// uma em cada cinco visualizações precisa cair nele, SEM cupom, para ele
// ver o que o cliente vai ver. Daí o sorteio ser o mesmo do servidor
// (pickSegment, pelos pesos) e o cupom sumir quando o prêmio é "none".
// =============================================================

import { readGameBlock, playGame } from './games'

export interface CupomDePreview {
  code: string
  kind: string
  value: number
  ends_at: null
  auto_apply: boolean
  show_code: boolean
}

/**
 * O bloco de cupom do design vira um código de teste. Cupom por inscrito
 * ("unique"/"dynamic") mostra um código sorteado na hora, como na loja;
 * cupom fixo mostra o que está escrito lá.
 */
export function cupomDePreview(design: any, rand = Math.random()): CupomDePreview | null {
  const passos = [...(Array.isArray(design?.steps) ? design.steps : []), design?.successStep].filter(Boolean)
  for (const st of passos) {
    for (const b of Array.isArray(st?.blocks) ? st.blocks : []) {
      if (b?.type !== 'coupon') continue
      const p = b.props || {}
      const unico = p.mode === 'unique' || p.mode === 'dynamic'
      const prefixo = String(p.codePrefix || 'POPUP').toUpperCase().slice(0, 12)
      const n = Math.floor(Math.min(0.999999, Math.max(0, rand)) * 9000) + 1000
      return {
        code: unico ? `${prefixo}-TESTE${n}` : String(p.code || 'CODIGO'),
        kind: 'percentage',
        value: Math.round(Number(p.discountValue) || 10),
        ends_at: null,
        auto_apply: false,
        show_code: true,
      }
    }
  }
  return null
}

/**
 * A resposta do /submit na bancada: o mesmo formato do servidor, para o
 * runtime não saber que está sendo testado.
 */
export function respostaDeEnvioDePreview(design: any, rand = Math.random()): Record<string, any> {
  const jogo = readGameBlock(design)
  const resultado = jogo ? playGame(jogo, rand) : null
  // "Não foi dessa vez" não emite cupom. Esconder isso aqui faria o
  // lojista publicar um popup que promete prêmio para todo mundo.
  const cupom = resultado && resultado.prize === 'none' ? null : cupomDePreview(design, rand)
  return {
    success: true,
    submission_id: 'preview',
    contact_id: 'preview',
    consent: {},
    ...(resultado
      ? { game: { type: resultado.type, segment: resultado.segment, segment_id: resultado.segmentId, label: resultado.label, prize: resultado.prize } }
      : {}),
    ...(cupom ? { coupon: cupom } : {}),
  }
}
