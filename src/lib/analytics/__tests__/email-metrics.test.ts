// ═══════════════════════════════════════════════════════════════════
// Os números do painel de e-mail: da loja certa, e inteiros.
//
// Dois defeitos reais que estes testes seguram:
//
// 1. O teto de mil linhas do PostgREST. A lista de fluxos puxava cada
//    envio e contava em JavaScript; com 1488 envios a soma parava em
//    mil e o corte caía no maior fluxo. A tela mostrava 803 para uma
//    série que tinha 1103 — e os oito fluxos somavam exatos 1000, a
//    assinatura do teto. Nada avisava.
//
// 2. A loja. A tela de análise mandava a loja selecionada e a rota
//    jogava fora: quem olhava a Dr. Groot via a Medicube somada junto.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest'
import { createFakeSupabase } from '@/tests/fake-supabase'
import {
  getEmailDashboardMetrics,
  getEmailsOverTime,
  getEmailConversionMetrics,
  getTopEmailCampaigns,
} from '../email-metrics'

const fake = createFakeSupabase()
const ORG = '425db1ba-99c0-4dbb-9434-27fe9cc03ec6'
const OUTRA_ORG = '99999999-9999-4999-8999-999999999999'
const GROOT = 'd5dfd5dd-1d77-425e-a099-850338078999'
const MEDICUBE = 'd04a4411-abc2-4135-bb88-e1f3c31d3b1b'

const hoje = new Date().toISOString()

function envio(over: Record<string, any> = {}) {
  return {
    organization_id: ORG,
    store_id: GROOT,
    created_at: hoje,
    sent_at: hoje,
    delivered_at: hoje,
    opened_at: null,
    clicked_at: null,
    bounced_at: null,
    conversion_value: 0,
    ...over,
  }
}

beforeEach(() => fake.reset())

describe('o teto de mil linhas', () => {
  it('conta os 1488 envios, não os primeiros mil', async () => {
    // O número real da base quando o defeito apareceu.
    fake.seed('email_sends', Array.from({ length: 1488 }, () => envio()))
    const m = await getEmailDashboardMetrics(fake as any, ORG, 30)
    expect(m.emailsSent).toBe(1488)
    expect(m.delivered).toBe(1488)
  })

  it('a série por dia também soma tudo', async () => {
    fake.seed('email_sends', Array.from({ length: 1200 }, () => envio({ opened_at: hoje })))
    const dias = await getEmailsOverTime(fake as any, ORG, 30)
    const enviados = dias.reduce((s, d) => s + d.sent, 0)
    const abertos = dias.reduce((s, d) => s + d.opened, 0)
    expect(enviados).toBe(1200)
    expect(abertos).toBe(1200)
  })

  it('a receita soma todas as conversões, não as primeiras mil', async () => {
    fake.seed('email_campaigns', [])
    fake.seed('email_sends', Array.from({ length: 1500 }, () => envio({ conversion_value: 10 })))
    const c = await getEmailConversionMetrics(fake as any, ORG, 30)
    expect(c.totalConversions).toBe(1500)
    expect(c.totalRevenue).toBe(15000)
  })
})

describe('a loja selecionada', () => {
  beforeEach(() => {
    fake.seed('email_sends', [
      ...Array.from({ length: 3 }, () => envio({ store_id: GROOT, opened_at: hoje })),
      ...Array.from({ length: 7 }, () => envio({ store_id: MEDICUBE })),
      // Outra organização nunca entra, com ou sem loja.
      envio({ organization_id: OUTRA_ORG, store_id: GROOT }),
    ])
  })

  it('com loja, conta só a dela', async () => {
    const m = await getEmailDashboardMetrics(fake as any, ORG, 30, GROOT)
    expect(m.emailsSent).toBe(3)
    expect(m.opened).toBe(3)
  })

  it('a loja vizinha tem os seus próprios números', async () => {
    const m = await getEmailDashboardMetrics(fake as any, ORG, 30, MEDICUBE)
    expect(m.emailsSent).toBe(7)
    expect(m.opened).toBe(0)
  })

  it('sem loja, a organização inteira — mas nunca outra organização', async () => {
    const m = await getEmailDashboardMetrics(fake as any, ORG, 30)
    expect(m.emailsSent).toBe(10)
  })

  it('a série por dia respeita a loja', async () => {
    const dias = await getEmailsOverTime(fake as any, ORG, 30, MEDICUBE)
    expect(dias.reduce((s, d) => s + d.sent, 0)).toBe(7)
  })

  it('a receita respeita a loja', async () => {
    fake.seed('email_campaigns', [])
    fake.seed('email_sends', [
      envio({ store_id: GROOT, conversion_value: 100 }),
      envio({ store_id: MEDICUBE, conversion_value: 900 }),
    ])
    const c = await getEmailConversionMetrics(fake as any, ORG, 30, GROOT)
    expect(c.totalRevenue).toBe(100)
    expect(c.totalConversions).toBe(1)
  })

  it('as campanhas do topo são as da loja', async () => {
    fake.seed('email_campaigns', [
      { id: 'c1', organization_id: ORG, store_id: GROOT, name: 'Da Groot', created_at: hoje },
      { id: 'c2', organization_id: ORG, store_id: MEDICUBE, name: 'Da Medicube', created_at: hoje },
    ])
    const lista = await getTopEmailCampaigns(fake as any, ORG, 5, GROOT)
    expect(lista.map((c: any) => c.name)).toEqual(['Da Groot'])
  })
})
