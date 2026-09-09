import { describe, it, expect } from 'vitest'
import { normalizePatch, generateTargeting } from '../ai-targeting'

const SEG = '11111111-1111-4111-8111-111111111111'
const LIST = '22222222-2222-4222-8222-222222222222'
const ctx = { segments: [{ id: SEG, name: 'VIP' }], lists: [{ id: LIST, name: 'Newsletter' }] }

describe('normalizePatch', () => {
  it('só deixa passar chaves, enums e faixas válidas — e liga o que o modelo esqueceu', () => {
    const p = normalizePatch({
      display: { delay: 900, scrollPercent: 40 },
      visibility: { devices: 'tablet', visitorType: 'new' },
      traffic: { types: ['paid', 'nao_existe'] },
      page: { templates: ['product', 'x'] },
      nonsense: { a: 1 },
      experiment: { holdoutPercent: 99 },
    }, ctx)
    expect(p.display).toEqual({ delay: 300, scrollPercent: 40, timeEnabled: true, scrollEnabled: true })
    expect(p.visibility).toEqual({ visitorType: 'new' })
    expect(p.traffic).toEqual({ types: ['paid'], enabled: true })
    expect(p.page).toEqual({ templates: ['product'], enabled: true })
    expect((p as any).nonsense).toBeUndefined()
    expect(p.experiment).toEqual({ holdoutPercent: 50 })
  })

  it('ids de segmento e lista só os da org; audiência sem ids some', () => {
    const other = '33333333-3333-4333-8333-333333333333'
    const p = normalizePatch({ audienceTargeting: { segmentIds: [SEG, other], listIds: ['abc', LIST] } }, ctx)
    expect(p.audienceTargeting).toEqual({ segmentIds: [SEG], listIds: [LIST], mode: 'include' })
    expect(normalizePatch({ audienceTargeting: { mode: 'exclude', segmentIds: [other] } }, ctx).audienceTargeting).toBeUndefined()
  })

  it('carrinho e países: normaliza ISO-2 e liga os gates com valor', () => {
    const p = normalizePatch({ cart: { minTotal: 150, contains: { handles: ['kit-verao'] } }, location: { includeCountries: ['br', 'usa', 'PT'] } }, ctx)
    expect(p.cart).toEqual({ minTotal: 150, enabled: true, contains: { handles: ['kit-verao'], enabled: true } })
    expect(p.location).toEqual({ includeCountries: ['BR', 'PT'], includeEnabled: true })
  })
})

describe('generateTargeting', () => {
  it('sem chave da API devolve erro claro, sem chamar a rede', async () => {
    let called = false
    const r = await generateTargeting('só no celular', ctx, { apiKey: '', fetchImpl: (async () => { called = true; return new Response('{}') }) as any })
    expect(r.ok).toBe(false)
    expect(called).toBe(false)
  })

  it('lê o tool use e normaliza o patch; resumo e não-suportados passam', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({
      content: [{ type: 'tool_use', name: 'set_popup_rules', input: { visibility: { devices: 'mobile' }, traffic: { types: ['paid'] }, summary: ['Só no celular', 'Só tráfego pago'], unsupported: ['Só para quem tem cachorro'] } }],
    }), { status: 200 })
    const r = await generateTargeting('celular, anúncio de rede social, quem tem cachorro', ctx, { apiKey: 'k', fetchImpl: fetchImpl as any })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.suggestion.patch).toEqual({ visibility: { devices: 'mobile' }, traffic: { types: ['paid'], enabled: true } })
    expect(r.suggestion.summary).toHaveLength(2)
    expect(r.suggestion.unsupported).toEqual(['Só para quem tem cachorro'])
  })
})
