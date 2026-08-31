import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Fix (review Finding 1 — CRITICAL): cobre o guard do worker
// (src/app/api/workers/whatsapp-ai-respond/route.ts) que ANTES silenciava
// pra sempre uma mensagem de áudio/imagem cujos ponteiros de mídia ainda não
// chegaram (media_url/media_storage_path nulos — download assíncrono ainda
// rodando ou já falhou). O claim de ai_pending é consumido e NENHUM job
// posterior reprocessa, então o cliente nunca recebia resposta.
//
// Estas suítes mockam supabaseAdmin (chain por tabela) e o runner
// (maybeRunAgentForCloudConversation) pra verificar, na fronteira do guard,
// que:
//   1. Áudio/imagem sem ponteiros passa pro runner (nunca cai no early-return
//      'no_inbound_text') com um InboundMediaInput "vazio" (ponteiros null).
//   2. O caso legítimo de skip (sem inbound nenhum) continua funcionando.
// ---------------------------------------------------------------------------

// ---- Mocks (hoisted) ----
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/whatsapp/alerts', () => ({
  sendAlert: vi.fn().mockResolvedValue(undefined),
}))

const mockRunner = vi.fn()
// Fix (item 14 da auditoria): o claim atômico foi extraído pra cloud-runner.ts
// pra ser o MESMO guard do fallback síncrono do webhook. Mockado aqui como
// sempre bem-sucedido — o comportamento do claim em si (already_consumed)
// não é o que esta suíte cobre; ver __tests__/webhook-ai-sync-claim.test.ts.
const mockClaim = vi.fn(async (..._a: any[]) => true)
vi.mock('@/lib/ai/cloud-runner', () => ({
  maybeRunAgentForCloudConversation: (...args: any[]) => mockRunner(...args),
  claimAiPendingResponse: (...args: any[]) => mockClaim(...args),
}))

// Chain thenable por TABELA: cada `.from(table)` seleciona o resultado
// configurado pra aquela tabela; os métodos encadeados (select/eq/update/...)
// só registram a chamada e devolvem o mesmo chain (comportamento suficiente
// pra testar as branches do route, sem simular o SQL real).
const tableResults: Record<string, any> = {}
let currentTable = ''
const calls: Record<string, any[][]> = {}
function resetMocks() {
  for (const k of Object.keys(tableResults)) delete tableResults[k]
  for (const k of Object.keys(calls)) delete calls[k]
  currentTable = ''
  mockRunner.mockReset()
  mockRunner.mockResolvedValue({ replied: true })
  mockClaim.mockReset()
  mockClaim.mockResolvedValue(true)
}
function track(name: string, args: any[]) {
  calls[name] = calls[name] || []
  calls[name].push(args)
}
const chain: any = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: any) => resolve(tableResults[currentTable] ?? {})
      }
      return (...args: any[]) => {
        track(`${currentTable}.${prop}`, args)
        return chain
      }
    },
  },
)
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      currentTable = table
      track('from', [table])
      return chain
    },
  },
}))

import { POST } from './route'

function fakeReq(body: any): any {
  return {
    text: async () => JSON.stringify(body),
    headers: new Headers({ 'x-internal-request': 'true' }),
  }
}

const BASE_CONVERSATION = {
  id: 'conv-1',
  organization_id: 'org-1',
  ai_enabled: true,
  ai_debounce_until: null,
  ai_pending: true,
  ai_retry_count: 0,
  contact_id: null,
  contact_phone: '+5511999999999',
  wa_id: '5511999999999',
}

const BASE_ACCOUNT = {
  id: 'acc-1',
  organization_id: 'org-1',
  phone_number: '5511000000000',
}

describe('POST /api/workers/whatsapp-ai-respond — guard de mídia sem ponteiros (Finding 1)', () => {
  beforeEach(() => {
    resetMocks()
    tableResults['whatsapp_cloud_conversations'] = { data: BASE_CONVERSATION, error: null }
    tableResults['whatsapp_business_accounts'] = { data: BASE_ACCOUNT, error: null }
  })

  it('audio SEM ponteiros (download ainda pendente) NAO silencia: chama o runner com inboundMedia vazio', async () => {
    tableResults['whatsapp_cloud_messages'] = {
      data: {
        message_id: 'msg-audio-1',
        text_body: '',
        message_type: 'audio',
        caption: null,
        media_url: null,
        media_storage_path: null,
        media_mime_type: 'audio/ogg',
      },
      error: null,
    }

    const res = await POST(
      fakeReq({ conversationId: 'conv-1', accountId: 'acc-1', organizationId: 'org-1' }),
    )
    const data = await res.json()

    expect(data.skipped).not.toBe('no_inbound_text')
    expect(mockRunner).toHaveBeenCalledTimes(1)
    const arg = mockRunner.mock.calls[0][0]
    expect(arg.messageType).toBe('audio')
    expect(arg.text).toBe('')
    expect(arg.inboundMedia).toEqual({
      type: 'audio',
      mediaUrl: null,
      storagePath: null,
      mimeType: 'audio/ogg',
      caption: null,
    })
  })

  it('imagem SEM ponteiros (download falhou/pendente) NAO silencia: chama o runner com inboundMedia vazio', async () => {
    tableResults['whatsapp_cloud_messages'] = {
      data: {
        message_id: 'msg-image-1',
        text_body: '',
        message_type: 'image',
        caption: 'olha isso',
        media_url: null,
        media_storage_path: null,
        media_mime_type: null,
      },
      error: null,
    }

    const res = await POST(
      fakeReq({ conversationId: 'conv-1', accountId: 'acc-1', organizationId: 'org-1' }),
    )
    const data = await res.json()

    expect(data.skipped).not.toBe('no_inbound_text')
    expect(mockRunner).toHaveBeenCalledTimes(1)
    const arg = mockRunner.mock.calls[0][0]
    expect(arg.messageType).toBe('image')
    expect(arg.inboundMedia).toEqual({
      type: 'image',
      mediaUrl: null,
      storagePath: null,
      mimeType: null,
      caption: 'olha isso',
    })
  })

  it('imagem COM ponteiros usa buildRunnerMediaInput normal (nao a branch de fallback)', async () => {
    tableResults['whatsapp_cloud_messages'] = {
      data: {
        message_id: 'msg-image-2',
        text_body: 'minha duvida',
        message_type: 'image',
        caption: 'minha duvida',
        media_url: 'https://x.supabase.co/storage/v1/object/public/whatsapp-media/a.jpg',
        media_storage_path: null,
        media_mime_type: 'image/jpeg',
      },
      error: null,
    }

    await POST(fakeReq({ conversationId: 'conv-1', accountId: 'acc-1', organizationId: 'org-1' }))

    expect(mockRunner).toHaveBeenCalledTimes(1)
    const arg = mockRunner.mock.calls[0][0]
    expect(arg.inboundMedia).toEqual({
      type: 'image',
      mediaUrl: 'https://x.supabase.co/storage/v1/object/public/whatsapp-media/a.jpg',
      storagePath: null,
      mimeType: 'image/jpeg',
      caption: 'minha duvida',
    })
  })

  it('sem inbound nenhum (nenhuma linha) continua legitimamente pulando — regressao do skip antigo', async () => {
    tableResults['whatsapp_cloud_messages'] = { data: null, error: null }

    const res = await POST(
      fakeReq({ conversationId: 'conv-1', accountId: 'acc-1', organizationId: 'org-1' }),
    )
    const data = await res.json()

    expect(data.skipped).toBe('no_inbound_text')
    expect(mockRunner).not.toHaveBeenCalled()
  })
})
