/**
 * Item 11 da auditoria de 28/08: a fase 2 do cron (varredura de ai_pending
 * órfão) reenfileirava toda linha no QStash, sem olhar para
 * public.ai_runtime_rollout. Uma org migrada para 'runtime' não tem quem
 * consuma esse job no caminho TS — sua resposta é agendada por
 * pending_response_at e coalescida pelo runtime Python — então as linhas
 * sobreviventes do cutover eram reenfileiradas a cada minuto, para sempre.
 *
 * Mocka supabaseAdmin (rpc por nome + from('ai_runtime_rollout') por org) e
 * getRuntimeMode roda de verdade, para provar a integração real: erro de
 * leitura do rollout precisa mesmo cair para legacy, não só o mock dizer que
 * cai.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEnqueueWebhook = vi.fn().mockResolvedValue(undefined)
const mockEnqueueAi = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/queue', () => ({
  enqueueWhatsAppWebhook: (...args: any[]) => mockEnqueueWebhook(...args),
  enqueueWhatsAppAiRespond: (...args: any[]) => mockEnqueueAi(...args),
}))

const mockQuarantine = vi.fn().mockResolvedValue(0)
vi.mock('@/lib/whatsapp/recipient-claim', () => ({
  quarantineStuckSending: (...args: any[]) => mockQuarantine(...args),
}))

// rpc: resultado por nome de função. from('ai_runtime_rollout'): resultado
// por organization_id, lido via .eq('organization_id', id) — o mesmo shape
// que getRuntimeMode (src/lib/ai/runtime-rollout.ts) espera.
const rpcResults: Record<string, any> = {}
const orgRolloutResults: Record<string, any> = {}
let lastOrgId: string | undefined
const fromChain: any = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'eq') {
        return (_col: string, val: string) => {
          lastOrgId = val
          return fromChain
        }
      }
      if (prop === 'maybeSingle') {
        return () =>
          Promise.resolve(orgRolloutResults[lastOrgId!] ?? { data: null, error: null })
      }
      return () => fromChain
    },
  },
)
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (_table: string) => fromChain,
    rpc: (name: string) => Promise.resolve(rpcResults[name] ?? { data: [], error: null }),
  },
}))

import { GET } from './route'
import { clearRuntimeModeCache } from '@/lib/ai/runtime-rollout'

function fakeReq(): any {
  return { headers: new Headers({ 'x-vercel-cron': '1' }) }
}

const EVENTS_RPC = 'pending_whatsapp_webhook_events_for_reprocess'
const AI_RPC = 'pending_whatsapp_ai_responses_for_reprocess'

function aiRow(organizationId: string, conversationId = 'conv-1') {
  return { conversation_id: conversationId, account_id: 'acc-1', organization_id: organizationId }
}

describe('GET /api/cron/reprocess-whatsapp-pending — fase 2 respeita o rollout', () => {
  beforeEach(() => {
    for (const k of Object.keys(rpcResults)) delete rpcResults[k]
    for (const k of Object.keys(orgRolloutResults)) delete orgRolloutResults[k]
    lastOrgId = undefined
    mockEnqueueWebhook.mockClear()
    mockEnqueueAi.mockClear()
    mockQuarantine.mockClear()
    clearRuntimeModeCache()
    rpcResults[EVENTS_RPC] = { data: [], error: null }
  })

  it('org legacy: linha órfã de ai_pending é reenfileirada', async () => {
    rpcResults[AI_RPC] = { data: [aiRow('org-legacy')], error: null }
    orgRolloutResults['org-legacy'] = { data: { mode: 'legacy' }, error: null }

    const res = await GET(fakeReq())
    const body = await res.json()

    expect(mockEnqueueAi).toHaveBeenCalledTimes(1)
    expect(body.ai_enqueued).toBe(1)
  })

  it('org runtime: linha órfã NÃO é reenfileirada (runtime Python já cuida dela)', async () => {
    rpcResults[AI_RPC] = { data: [aiRow('org-runtime')], error: null }
    orgRolloutResults['org-runtime'] = { data: { mode: 'runtime' }, error: null }

    const res = await GET(fakeReq())
    const body = await res.json()

    expect(mockEnqueueAi).not.toHaveBeenCalled()
    expect(body.ai_scanned).toBe(1)
    expect(body.ai_enqueued).toBe(0)
  })

  it('erro na leitura do rollout cai para legacy: reenfileira (fail-closed)', async () => {
    rpcResults[AI_RPC] = { data: [aiRow('org-erro')], error: null }
    orgRolloutResults['org-erro'] = { data: null, error: { message: 'timeout' } }

    const res = await GET(fakeReq())
    const body = await res.json()

    expect(mockEnqueueAi).toHaveBeenCalledTimes(1)
    expect(body.ai_enqueued).toBe(1)
  })

  it('fase 1 (eventos) segue chamando enqueueWhatsAppWebhook, intocada pelo filtro de rollout', async () => {
    rpcResults[EVENTS_RPC] = { data: [{ id: 'evt-1' }, { id: 'evt-2' }], error: null }
    rpcResults[AI_RPC] = { data: [], error: null }

    const res = await GET(fakeReq())
    const body = await res.json()

    expect(mockEnqueueWebhook).toHaveBeenCalledTimes(2)
    expect(mockEnqueueWebhook).toHaveBeenCalledWith('evt-1')
    expect(mockEnqueueWebhook).toHaveBeenCalledWith('evt-2')
    expect(body.enqueued).toBe(2)
  })
})
