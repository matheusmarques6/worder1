import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Mock supabaseAdmin: resultados enfileirados POR TABELA ----
const mockRpc = vi.fn()
type Call = { table: string; method: string; args: any[] }
const calls: Call[] = []
const tableResults: Record<string, any[]> = {}

function queueResult(table: string, result: any) {
  tableResults[table] = tableResults[table] || []
  tableResults[table].push(result)
}
function nextResult(table: string) {
  const q = tableResults[table]
  return q && q.length > 0 ? q.shift() : { data: null, error: null }
}
function makeBuilder(table: string) {
  const builder: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve: any) => resolve(nextResult(table))
        }
        return (...args: any[]) => {
          calls.push({ table, method: prop, args })
          if (prop === 'maybeSingle' || prop === 'single') {
            return Promise.resolve(nextResult(table))
          }
          return builder
        }
      },
    },
  )
  return builder
}

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: (table: string) => {
      calls.push({ table, method: 'from', args: [table] })
      return makeBuilder(table)
    },
  },
}))

const mockCreateAgentEngine = vi.fn()
vi.mock('../engine', () => ({
  createAgentEngine: (...args: any[]) => mockCreateAgentEngine(...args),
}))

const mockSendHumanizedReply = vi.fn()
vi.mock('../cloud-sender', () => ({
  sendHumanizedReply: (...args: any[]) => mockSendHumanizedReply(...args),
}))

vi.mock('@/lib/whatsapp/alerts', () => ({
  sendAlert: vi.fn(async () => {}),
}))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { maybeRunAgentForCloudConversation } from '../cloud-runner'

const account = {
  id: 'waba-1',
  organization_id: 'org-1',
  phone_number: '5511999990000',
}

function conv(overrides: Record<string, any> = {}) {
  return {
    id: 'conv-1',
    organization_id: 'org-1',
    contact_phone: '5511888880000',
    wa_id: '5511888880000',
    ai_enabled: true,
    ai_agent_id: null,
    ai_transferred_at: null,
    ...overrides,
  }
}

function agentRow(overrides: Record<string, any> = {}) {
  const { settings, ...rest } = overrides
  return {
    id: 'agent-1',
    organization_id: 'org-1',
    provider: 'openai',
    model: 'gpt-4o-mini',
    is_active: true,
    settings: {
      behavior: {
        activate_on: 'new_message',
        stop_on_human_reply: true,
        cooldown_after_transfer: 300,
        max_messages_per_conversation: 0,
      },
      safety: { handoff_keywords: [], handoff_confirmation_message: '', blocked_topics: [] },
      ...(settings || {}),
    },
    ...rest,
  }
}

function findUpdate(table: string) {
  return calls.find((c) => c.table === table && c.method === 'update')
}

beforeEach(() => {
  calls.length = 0
  for (const k of Object.keys(tableResults)) delete tableResults[k]
  mockRpc.mockReset()
  mockCreateAgentEngine.mockReset()
  mockSendHumanizedReply.mockReset()
  mockRpc.mockResolvedValue({ data: [{ agent_id: 'agent-1' }], error: null })
})

describe('cloud-runner guards — activate_on manual', () => {
  it('agente manual NAO dispara sem atribuicao explicita na conversa', async () => {
    queueResult('ai_agents', {
      data: agentRow({
        settings: {
          behavior: {
            activate_on: 'manual',
            stop_on_human_reply: true,
            cooldown_after_transfer: 300,
            max_messages_per_conversation: 0,
          },
        },
      }),
    })

    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'oi',
    })

    expect(r.skipped).toBe('manual_activation_required')
    expect(r.transferred).toBe(false)
    expect(mockCreateAgentEngine).not.toHaveBeenCalled()
  })

  it('agente manual RODA quando conversation.ai_agent_id === agentId', async () => {
    queueResult('ai_agents', {
      data: agentRow({
        settings: {
          behavior: {
            activate_on: 'manual',
            stop_on_human_reply: true,
            cooldown_after_transfer: 300,
            max_messages_per_conversation: 0,
          },
        },
      }),
    })
    // Sem chave de provider na org => segue ate o gate BYO-key, provando que
    // o guard de activate_on deixou passar.
    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv({ ai_agent_id: 'agent-1' }),
      text: 'oi',
    })

    expect(r.skipped).not.toBe('manual_activation_required')
    expect(r.error).toBe('no_valid_api_key')
  })
})

describe('cloud-runner guards — cooldown pos-transferencia', () => {
  it('IA silencia dentro do cooldown configurado', async () => {
    queueResult('ai_agents', { data: agentRow() })

    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv({
        ai_transferred_at: new Date(Date.now() - 100_000).toISOString(), // 100s atras
      }),
      text: 'oi',
    })

    expect(r.skipped).toBe('transfer_cooldown')
    expect(mockCreateAgentEngine).not.toHaveBeenCalled()
  })

  it('IA volta a responder depois do cooldown (300s default)', async () => {
    queueResult('ai_agents', { data: agentRow() })

    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv({
        ai_transferred_at: new Date(Date.now() - 400_000).toISOString(), // 400s atras
      }),
      text: 'oi',
    })

    expect(r.skipped).not.toBe('transfer_cooldown')
    expect(r.error).toBe('no_valid_api_key') // seguiu ate o gate BYO-key
  })
})

describe('cloud-runner guards — handoff keywords', () => {
  it('keyword desativa a IA, marca transferencia e NAO chama o engine', async () => {
    queueResult('ai_agents', {
      data: agentRow({
        settings: { safety: { handoff_keywords: ['atendente'], handoff_confirmation_message: '', blocked_topics: [] } },
      }),
    })

    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'Quero falar com um ATENDENTE agora',
    })

    expect(r.transferred).toBe(true)
    expect(r.skipped).toBe('handoff_keyword')
    expect(mockCreateAgentEngine).not.toHaveBeenCalled()
    expect(mockSendHumanizedReply).not.toHaveBeenCalled() // sem confirmation configurada

    const upd = findUpdate('whatsapp_cloud_conversations')
    expect(upd).toBeDefined()
    expect(upd!.args[0].ai_enabled).toBe(false)
    expect(upd!.args[0].ai_disabled_reason).toBe('handoff_keyword')
    expect(upd!.args[0].ai_transferred_at).toBeDefined()
  })

  it('match acento-insensitive (keyword com acento, inbound sem)', async () => {
    queueResult('ai_agents', {
      data: agentRow({
        settings: { safety: { handoff_keywords: ['transferência'], handoff_confirmation_message: '', blocked_topics: [] } },
      }),
    })

    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'preciso de transferencia',
    })

    expect(r.skipped).toBe('handoff_keyword')
  })

  it('envia a mensagem de confirmacao configurada', async () => {
    queueResult('ai_agents', {
      data: agentRow({
        settings: {
          safety: {
            handoff_keywords: ['humano'],
            handoff_confirmation_message: 'Certo! Vou te passar para um atendente humano.',
            blocked_topics: [],
          },
        },
      }),
    })
    mockSendHumanizedReply.mockResolvedValue({ sent: true, messageId: 'wamid.1' })

    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'quero um humano',
    })

    expect(r.transferred).toBe(true)
    expect(mockSendHumanizedReply).toHaveBeenCalledTimes(1)
    expect(mockSendHumanizedReply.mock.calls[0][0].text).toBe(
      'Certo! Vou te passar para um atendente humano.',
    )
  })

  it('sem match segue o fluxo normal', async () => {
    queueResult('ai_agents', {
      data: agentRow({
        settings: { safety: { handoff_keywords: ['atendente'], handoff_confirmation_message: '', blocked_topics: [] } },
      }),
    })

    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'qual o preco do produto?',
    })

    expect(r.skipped).not.toBe('handoff_keyword')
    expect(r.error).toBe('no_valid_api_key') // seguiu ate o gate BYO-key
  })
})

describe('cloud-runner — bloqueio do send guard e terminal (sem retry)', () => {
  // Percorre o fluxo completo ate o sender: agente ativo, chave BYO valida,
  // engine mockado devolvendo resposta pronta, e sendHumanizedReply (mockado)
  // simulando bloqueio do send-guard (rate limiter/circuit breaker por tier).
  beforeEach(() => {
    queueResult('ai_agents', { data: agentRow() })
    // lastBot (cooldown) -> sem mensagem recente do bot
    queueResult('whatsapp_cloud_messages', { data: null })
    // stop_on_human -> sem resposta humana
    queueResult('whatsapp_cloud_messages', { data: null })
    // organization_api_keys -> chave BYO valida (passa o gate)
    queueResult('organization_api_keys', {
      data: { api_key: 'sk-test', base_url: null, is_active: true },
    })
    // historico (~20 ultimas)
    queueResult('whatsapp_cloud_messages', { data: [] })
    // agent_traces insert().select('id').maybeSingle()
    queueResult('agent_traces', { data: { id: 'trace-1' } })

    mockCreateAgentEngine.mockResolvedValue({
      processMessage: vi.fn().mockResolvedValue({ response: 'Claro, posso ajudar!' }),
    })
  })

  it('send_guard_* nao marca failure (terminal, mesmo tratamento de opted_out)', async () => {
    mockSendHumanizedReply.mockResolvedValue({ sent: false, reason: 'send_guard_daily_quota' })

    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'qual o preco do produto?',
    })

    expect(mockSendHumanizedReply).toHaveBeenCalledTimes(1)
    expect(r.replied).toBe(false)
    expect(r.transferred).toBe(false)
    expect(r.skipped).toBe('send_guard_daily_quota')
    expect(r.failure).toBeUndefined() // worker NAO reagenda retry
  })

  it('envio normal (sem bloqueio do guard) permanece com replied=true', async () => {
    mockSendHumanizedReply.mockResolvedValue({ sent: true, messageId: 'wamid.1' })

    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'qual o preco do produto?',
    })

    expect(r.replied).toBe(true)
    expect(r.failure).toBeUndefined()
  })
})
