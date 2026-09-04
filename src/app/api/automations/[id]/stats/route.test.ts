// Métricas por nó do funil (card "Sent / Opened / Clicked / Sales" no canvas).
//
// Bug reportado: dentro do funil o Email 1 mostrava Sent 0 enquanto o
// Email 2 mostrava 23 — mesmo com 256 envios do Email 1 no banco. A rota
// lia automation_runs.metadata.result.nodeResults, que só guarda o ÚLTIMO
// segmento executado da run; assim que a run avançava pro Email 2 o Email 1
// sumia do snapshot. Agora a rota conta direto nas tabelas de envio pelo
// nó carimbado em cada linha (email_sends.metadata.node_id,
// whatsapp_sends.node_id, sms_sends.node_id).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeSupabase } from '@/tests/fake-supabase'

const mockAuth = vi.fn()
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: (...args: any[]) => mockAuth(...args),
  authError: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}))

import { GET } from './route'

const ORG = 'org-1'
const OTHER_ORG = 'org-2'
const FLOW = '4684f86a-7417-4dc2-9f56-406df3dbda53'
const OTHER_FLOW = '11111111-2222-4333-8444-555555555555'
const EMAIL1 = '250a848e-0fd2-4925-b56e-924c19b1195c'
const EMAIL2 = '7c77eae6-0a70-49f2-bb17-d43b549521ca'
const WA1 = 'node-whatsapp-1'
const SMS1 = 'node-sms-1'

const db = createFakeSupabase()

const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString()

function emailSend(i: number, nodeId: string | null, opts: Partial<Record<string, any>> = {}) {
  const when = opts.created_at ?? daysAgo(2)
  return {
    id: `email-${nodeId ?? 'none'}-${i}`,
    organization_id: ORG,
    automation_id: FLOW,
    flow_id: FLOW,
    created_at: when,
    sent_at: when,
    opened_at: null,
    clicked_at: null,
    conversion_value: null,
    metadata: nodeId ? { node_id: nodeId, node_type: 'action_email' } : {},
    ...opts,
  }
}

function req(timeframe?: string): any {
  const url = `http://localhost/api/automations/${FLOW}/stats${timeframe ? `?timeframe=${timeframe}` : ''}`
  return { url }
}

async function call(timeframe?: string) {
  const res = await GET(req(timeframe), { params: Promise.resolve({ id: FLOW }) } as any)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  db.reset()
  mockAuth.mockReset()
  mockAuth.mockResolvedValue({ supabase: db, user: { id: 'u1', organization_id: ORG } })
  db.seed('automations', [
    { id: FLOW, organization_id: ORG },
    { id: OTHER_FLOW, organization_id: ORG },
  ])
  db.seed('automation_runs', [])
  db.seed('whatsapp_sends', [])
  db.seed('sms_sends', [])
})

describe('GET /api/automations/[id]/stats — contagem por nó vem dos envios carimbados', () => {
  it('conta o Email 1 mesmo quando o snapshot da run só guarda o Email 2', async () => {
    // Runs já avançaram: o snapshot só tem o Email 2 (como no banco de produção).
    db.seed('automation_runs', [
      {
        id: 'run-1',
        automation_id: FLOW,
        started_at: daysAgo(3),
        metadata: {
          result: {
            nodeResults: {
              [EMAIL2]: { status: 'success', output: { sent: true, emailSendId: `email-${EMAIL2}-0` } },
            },
          },
        },
      },
    ])
    db.seed('email_sends', [
      emailSend(0, EMAIL1, { opened_at: daysAgo(1), clicked_at: daysAgo(1), conversion_value: '120.50' }),
      emailSend(1, EMAIL1, { opened_at: daysAgo(1) }),
      emailSend(2, EMAIL1),
      emailSend(0, EMAIL2, { opened_at: daysAgo(1) }),
    ])

    const { status, body } = await call('30d')
    expect(status).toBe(200)
    expect(body.nodeStats[EMAIL1]).toEqual({ sent: 3, opened: 2, clicked: 1, revenue: 120.5 })
    expect(body.nodeStats[EMAIL2]).toEqual({ sent: 1, opened: 1, clicked: 0, revenue: 0 })
    expect(body.totalRuns).toBe(1)
    expect(body.timeframe).toBe('30d')
  })

  it('respeita a janela: envios fora do período não entram, e "all" traz tudo', async () => {
    db.seed('email_sends', [
      emailSend(0, EMAIL1, { created_at: daysAgo(2), sent_at: daysAgo(2) }),
      emailSend(1, EMAIL1, { created_at: daysAgo(20), sent_at: daysAgo(20) }),
      emailSend(2, EMAIL1, { created_at: daysAgo(60), sent_at: daysAgo(60) }),
    ])

    expect((await call('7d')).body.nodeStats[EMAIL1].sent).toBe(1)
    expect((await call('30d')).body.nodeStats[EMAIL1].sent).toBe(2)
    expect((await call('90d')).body.nodeStats[EMAIL1].sent).toBe(3)
    expect((await call('all')).body.nodeStats[EMAIL1].sent).toBe(3)
    // Sem parâmetro a rota assume 30d, como o canvas.
    expect((await call()).body.timeframe).toBe('30d')
  })

  it('isola por organização e por fluxo (multi-tenant)', async () => {
    db.seed('email_sends', [
      emailSend(0, EMAIL1),
      // Mesmo nó, outra organização: jamais pode vazar pra este funil.
      emailSend(1, EMAIL1, { organization_id: OTHER_ORG }),
      // Mesma org, outro fluxo.
      emailSend(2, EMAIL1, { automation_id: OTHER_FLOW, flow_id: OTHER_FLOW }),
      // Linha antiga só com flow_id preenchido ainda pertence a este funil.
      emailSend(3, EMAIL1, { automation_id: null, flow_id: FLOW }),
    ])

    const { body } = await call('30d')
    expect(body.nodeStats[EMAIL1].sent).toBe(2)
  })

  it('devolve 404 para automação de outra organização', async () => {
    mockAuth.mockResolvedValue({ supabase: db, user: { id: 'u1', organization_id: OTHER_ORG } })
    const { status } = await call('30d')
    expect(status).toBe(404)
  })

  it('cai no snapshot da run só para envios legados sem carimbo de nó', async () => {
    db.seed('automation_runs', [
      {
        id: 'run-1',
        automation_id: FLOW,
        started_at: daysAgo(3),
        metadata: {
          result: {
            nodeResults: {
              [EMAIL1]: { status: 'success', output: { sent: true, emailSendId: 'email-none-0' } },
            },
          },
        },
      },
    ])
    db.seed('email_sends', [
      emailSend(0, null), // legado: sem metadata.node_id → atribuído pelo snapshot
      emailSend(1, null), // legado sem snapshot → não tem como atribuir, fica de fora
    ])

    const { body } = await call('30d')
    expect(body.nodeStats[EMAIL1].sent).toBe(1)
  })

  it('não conta como enviado uma linha ainda sem sent_at (fila/falha)', async () => {
    db.seed('email_sends', [
      emailSend(0, EMAIL1, { sent_at: null }),
      emailSend(1, EMAIL1),
    ])
    const { body } = await call('30d')
    expect(body.nodeStats[EMAIL1].sent).toBe(1)
  })

  it('WhatsApp e SMS entram pelo node_id da própria tabela', async () => {
    db.seed('email_sends', [])
    db.seed('whatsapp_sends', [
      {
        id: 'wa-1', organization_id: ORG, automation_id: FLOW, flow_id: FLOW, node_id: WA1,
        created_at: daysAgo(1), sent_at: daysAgo(1), delivered_at: daysAgo(1), read_at: daysAgo(1),
        replied_at: null, conversion_value: 80, metadata: null,
      },
      {
        id: 'wa-2', organization_id: ORG, automation_id: FLOW, flow_id: FLOW, node_id: WA1,
        created_at: daysAgo(1), sent_at: daysAgo(1), delivered_at: null, read_at: null,
        replied_at: daysAgo(1), conversion_value: null, metadata: null,
      },
    ])
    db.seed('sms_sends', [
      {
        id: 'sms-1', organization_id: ORG, automation_id: FLOW, flow_id: FLOW, node_id: SMS1,
        created_at: daysAgo(1), sent_at: daysAgo(1), delivered_at: daysAgo(1), clicked_at: daysAgo(1),
        conversion_value: '10', metadata: null,
      },
    ])

    const { body } = await call('30d')
    expect(body.nodeStats[WA1]).toEqual({ sent: 2, opened: 2, clicked: 1, revenue: 80 })
    expect(body.nodeStats[SMS1]).toEqual({ sent: 1, opened: 1, clicked: 1, revenue: 10 })
  })

  it('exige autenticação', async () => {
    mockAuth.mockResolvedValue(null)
    const { status } = await call('30d')
    expect(status).toBe(401)
  })
})
