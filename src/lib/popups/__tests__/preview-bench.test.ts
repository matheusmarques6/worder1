// A bancada da pré-visualização tem de responder como o servidor — e
// errar como ele. Um teste que sempre ganha faz o lojista publicar um
// popup que promete prêmio para todo mundo.
import { describe, it, expect } from 'vitest'
import { cupomDePreview, respostaDeEnvioDePreview } from '../preview-bench'

function design(over: any = {}) {
  return {
    steps: [{ blocks: [
      { id: 'e1', type: 'email', props: {} },
      { id: 'w1', type: 'wheel', props: { segments: [
        { id: 's1', label: '10% OFF', prize: 'base', weight: 50, color: '#F97316' },
        { id: 's2', label: 'Não foi dessa vez', prize: 'none', weight: 50, color: '#111827' },
      ] } },
    ] }],
    successStep: { blocks: [{ id: 'k1', type: 'coupon', props: { code: 'FIXO10', mode: 'static' } }] },
    ...over,
  }
}

describe('bancada da pré-visualização', () => {
  it('sorteia pelo peso, como o servidor, e devolve o segmento ganho', () => {
    const r = respostaDeEnvioDePreview(design(), 0.1)
    expect(r.success).toBe(true)
    expect(r.game).toMatchObject({ type: 'wheel', segment: 0, segment_id: 's1', label: '10% OFF', prize: 'base' })
    expect(r.coupon).toMatchObject({ code: 'FIXO10' })
  })

  it('quando o sorteio cai em "não ganhou", NÃO vem cupom', () => {
    const r = respostaDeEnvioDePreview(design(), 0.9)
    expect(r.game).toMatchObject({ segment: 1, prize: 'none' })
    expect(r.coupon).toBeUndefined()
  })

  it('popup sem jogo responde sem game, com o cupom do design', () => {
    const d = design({ steps: [{ blocks: [{ id: 'e1', type: 'email', props: {} }] }] })
    const r = respostaDeEnvioDePreview(d, 0.5)
    expect(r.game).toBeUndefined()
    expect(r.coupon).toMatchObject({ code: 'FIXO10' })
  })

  it('cupom por inscrito mostra um código sorteado, com o prefixo do design', () => {
    const d = design({ successStep: { blocks: [{ id: 'k1', type: 'coupon', props: { mode: 'unique', codePrefix: 'roleta' } }] } })
    const c = cupomDePreview(d, 0.5)
    expect(c!.code).toMatch(/^ROLETA-TESTE\d{4}$/)
  })

  it('cartas também são jogo: a bancada sorteia e devolve o tipo certo', () => {
    const d = design({ steps: [{ blocks: [
      { id: 'e1', type: 'email', props: {} },
      { id: 'k1', type: 'cards', props: { count: 3, segments: [
        { id: 'c1', label: '10% OFF', prize: 'base', weight: 50, color: '#F97316' },
        { id: 'c2', label: 'Frete grátis', prize: 'base', weight: 50, color: '#111827' },
      ] } },
    ] }] })
    expect(respostaDeEnvioDePreview(d, 0.9).game).toMatchObject({ type: 'cards', segment: 1, label: 'Frete grátis' })
  })

  it('design sem bloco de cupom não inventa código', () => {
    const d = design({ successStep: { blocks: [{ id: 't1', type: 'text', props: { content: 'Obrigado' } }] } })
    expect(cupomDePreview(d, 0.5)).toBeNull()
    expect(respostaDeEnvioDePreview(d, 0.1).coupon).toBeUndefined()
  })
})
