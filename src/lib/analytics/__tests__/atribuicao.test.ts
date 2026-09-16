// ═══════════════════════════════════════════════════════════════════
// O painel dizia que a receita veio de campanha numa conta que nunca
// enviou campanha nenhuma.
//
// Na tela: "Receita via Worder US$ 162,72 — 3 pedidos", cartão
// "Campanhas US$ 162,72 / 3 pedidos" e cartão "Automações US$ 0,00 / 0
// pedidos". Mas a dica do gráfico, na MESMA tela, dizia "Campanhas
// US$ 0,00 / Automações US$ 33,00".
//
// Os três pedidos abaixo são os reais do razão. Todos com
// `automation_id`, nenhum com `campaign_id`: vieram de "Checkout
// Abandonado", "Pedido confirmado + Separação" e "Upsell".
//
// A causa eram duas contas diferentes para a mesma pergunta:
//   o cartão fazia `campanhas = TODA a receita de e-mail` e
//   `automações = 0` cravado no código;
//   o gráfico pegava o contador VITALÍCIO de cada automação e dividia
//   igualmente por todos os períodos — daí os US$ 33 numa semana em que
//   não houve pedido.
//
// Agora existe uma conta só, e ela sai do razão.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { resumirAtribuicao, ehCampanha, ehAutomacao } from '../atribuicao'

const ORG = '425db1ba-99c0-4dbb-9434-27fe9cc03ec6'
const MEDICUBE = 'd04a4411-abc2-4135-bb88-e1f3c31d3b1b'

// As três linhas reais do razão, na conta do print.
const RAZAO_REAL = [
  {
    channel: 'email', classification: 'attributed', net_revenue: '111.81',
    campaign_id: null, automation_id: 'eb17edf9-5195-4b44-9c16-91db54c21119',
    order_at: '2026-09-14T13:09:57Z', store_id: MEDICUBE,
  },
  {
    channel: 'email', classification: 'attributed', net_revenue: '25.99',
    campaign_id: null, automation_id: '0d64778d-8896-43b4-a572-ecad327531fc',
    order_at: '2026-09-12T11:25:26Z', store_id: MEDICUBE,
  },
  {
    channel: 'email', classification: 'attributed', net_revenue: '24.92',
    campaign_id: null, automation_id: 'f808eef5-85be-4c03-a31e-c529dd985187',
    order_at: '2026-09-11T13:29:06Z', store_id: MEDICUBE,
  },
  // As linhas de "destinatário" existem no razão e NÃO são crédito.
  { channel: null, classification: 'recipient', net_revenue: '213.32', campaign_id: null, automation_id: null, order_at: '2026-09-14T00:00:00Z', store_id: MEDICUBE },
]

describe('a conta do print', () => {
  const r = resumirAtribuicao(RAZAO_REAL)

  it('os 162,72 aparecem como automação, não como campanha', () => {
    expect(r.automacoesReceita).toBeCloseTo(162.72, 2)
    expect(r.automacoesPedidos).toBe(3)
    expect(r.campanhasReceita).toBe(0)
    expect(r.campanhasPedidos).toBe(0)
  })

  it('o canal de e-mail continua mostrando o total dos dois', () => {
    expect(r.emailReceita).toBeCloseTo(162.72, 2)
  })

  it('"Receita via Worder" bate com a soma dos cartões', () => {
    expect(r.worderReceita).toBeCloseTo(162.72, 2)
    expect(r.worderPedidos).toBe(3)
    expect(r.campanhasReceita + r.automacoesReceita).toBeCloseTo(r.worderReceita, 2)
  })

  it('linha de destinatário não vira crédito', () => {
    // 213,32 é a receita de quem RECEBEU, não a atribuída. Contá-la
    // faria a Worder parecer responsável por venda que não trouxe.
    expect(r.worderReceita).not.toBeCloseTo(213.32, 2)
  })
})

describe('a separação por origem', () => {
  it('campanha é campanha', () => {
    expect(ehCampanha({ campaign_id: 'c1' })).toBe(true)
    expect(ehAutomacao({ campaign_id: 'c1' })).toBe(false)
  })

  it('automação é automação', () => {
    expect(ehAutomacao({ automation_id: 'a1' })).toBe(true)
    expect(ehCampanha({ automation_id: 'a1' })).toBe(false)
  })

  it('linha com os dois ids conta UMA vez, do lado da campanha', () => {
    const r = resumirAtribuicao([
      { channel: 'email', classification: 'attributed', net_revenue: 50, campaign_id: 'c1', automation_id: 'a1' },
    ])
    expect(r.campanhasPedidos).toBe(1)
    expect(r.automacoesPedidos).toBe(0)
    expect(r.campanhasReceita + r.automacoesReceita).toBe(r.emailReceita)
  })

  it('sem origem nenhuma, não inventa origem — mas segue no total', () => {
    const r = resumirAtribuicao([
      { channel: 'email', classification: 'attributed', net_revenue: 40, campaign_id: null, automation_id: null },
    ])
    expect(r.campanhasPedidos).toBe(0)
    expect(r.automacoesPedidos).toBe(0)
    expect(r.worderReceita).toBe(40)
  })
})

describe('os outros canais', () => {
  const misto = [
    { channel: 'email', classification: 'attributed', net_revenue: 100, automation_id: 'a1' },
    { channel: 'whatsapp', classification: 'attributed', net_revenue: 70, campaign_id: 'w1' },
    { channel: 'sms', classification: 'attributed', net_revenue: 30, campaign_id: 's1' },
  ]

  it('WhatsApp e SMS entram no total da Worder, não nos cartões de e-mail', () => {
    const r = resumirAtribuicao(misto)
    expect(r.emailReceita).toBe(100)
    expect(r.campanhasReceita).toBe(0)
    expect(r.automacoesReceita).toBe(100)
    expect(r.worderReceita).toBe(200)
    expect(r.worderPedidos).toBe(3)
  })
})

describe('casos de borda', () => {
  it('razão vazio devolve zeros, não NaN', () => {
    const r = resumirAtribuicao([])
    for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true)
    expect(r.worderReceita).toBe(0)
  })

  it('valor ilegível conta como zero em vez de contaminar a soma', () => {
    const r = resumirAtribuicao([
      { channel: 'email', classification: 'attributed', net_revenue: 'abc' as any, automation_id: 'a1' },
      { channel: 'email', classification: 'attributed', net_revenue: 10, automation_id: 'a2' },
    ])
    expect(r.automacoesReceita).toBe(10)
  })

  it('crédito revogado já vem de fora da consulta, mas o não-atribuído não passa', () => {
    const r = resumirAtribuicao([
      { channel: 'email', classification: 'recipient', net_revenue: 999, automation_id: 'a1' },
    ])
    expect(r.worderReceita).toBe(0)
  })
})
