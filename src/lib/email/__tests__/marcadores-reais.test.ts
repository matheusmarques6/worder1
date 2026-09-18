// Os sete marcadores que existem de verdade nos 111 templates salvos.
import { describe, it, expect } from 'vitest'
import { parseProductBlockMarker } from '@/lib/email/render'

const REAIS = [
  'bestsellers:1:1:true:true:true:Buy%20now',
  'bestsellers:1:1:true:true:true:Comprar',
  'bestsellers:2:2:true:true:true:Comprar',
  'bestsellers:4:2:true:true:true:Buy%20now',
  'bestsellers:4:2:true:true:true:Comprar',
  'recently_viewed:4:2:true:true:true:Buy%20now',
  'recently_viewed:4:2:true:true:true:Comprar',
]

describe('os marcadores que estão no banco hoje', () => {
  it.each(REAIS)('continua sendo lido: %s', (marcador) => {
    const cfg = parseProductBlockMarker(marcador)
    expect(cfg).not.toBeNull()
    expect(cfg!.feedType).toMatch(/^(bestsellers|recently_viewed)$/)
    expect(cfg!.cols).toBeGreaterThan(0)
    expect(cfg!.maxProducts).toBeGreaterThan(0)
    expect(cfg!.buttonText).toMatch(/^(Buy now|Comprar)$/)
  })
})
