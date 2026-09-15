import { readFileSync } from 'node:fs'
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

const mockResolveSttConfig = vi.fn()
const mockTranscribeAudio = vi.fn()
const mockFetchInboundMedia = vi.fn()
vi.mock('../media/transcription', () => ({
  resolveSttConfig: (...args: any[]) => mockResolveSttConfig(...args),
  transcribeAudio: (...args: any[]) => mockTranscribeAudio(...args),
}))
vi.mock('../media/fetch-media', () => ({
  fetchInboundMedia: (...args: any[]) => mockFetchInboundMedia(...args),
}))

vi.mock('@/lib/whatsapp/alerts', () => ({
  sendAlert: vi.fn(async () => {}),
}))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  claimAiPendingResponse,
  maybeRunAgentForCloudConversation,
  releaseAiPendingClaim,
} from '../cloud-runner'
import { AiBudgetExceededError, AiBudgetUnavailableError } from '../budget'

const account = {
  id: 'waba-1',
  organization_id: 'org-1',
  phone_number: '5511999990000',
}

const { state_cases: stateCases } = JSON.parse(readFileSync('fixtures/ai-guard-contract.json', 'utf8')) as {
  state_cases: Array<{ id: string; now: string; settings: any; state: any; expected: string | null }>
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
  mockResolveSttConfig.mockReset()
  mockTranscribeAudio.mockReset()
  mockFetchInboundMedia.mockReset()
  mockRpc.mockResolvedValue({ data: [{ agent_id: 'agent-1' }], error: null })
})

describe('cloud-runner — orçamento da transcrição', () => {
  function prepare(mode: 'handoff' | 'ask_text') {
    queueResult('ai_agents', { data: agentRow({ settings: { media_fallback: { mode } } }) })
    queueResult('whatsapp_cloud_messages', { data: null }) // última resposta do bot
    queueResult('whatsapp_cloud_messages', { data: null }) // resposta humana
    queueResult('organization_api_keys', { data: { api_key: 'sk-test', is_active: true } })
    mockResolveSttConfig.mockResolvedValue({ provider: 'openai', model: 'whisper-1', apiKey: 'sk-test' })
    mockFetchInboundMedia.mockResolvedValue({ buffer: Buffer.from('audio'), mimeType: 'audio/ogg' })
    mockSendHumanizedReply.mockResolvedValue({ sent: true })
    return {
      account, conversation: conv(), text: '', messageType: 'audio',
      inboundMedia: { type: 'audio' as const, storagePath: 'org-1/audio.ogg', mediaUrl: null, mimeType: 'audio/ogg', caption: null },
    }
  }

  it.each(['handoff', 'ask_text'] as const)('503 é transitório sem fallback %s ou desativação', async (mode) => {
    const params = prepare(mode)
    const error = new AiBudgetUnavailableError('lookup_error')
    mockTranscribeAudio.mockRejectedValue(error)

    const result = await maybeRunAgentForCloudConversation(params)

    expect(mockTranscribeAudio).toHaveBeenCalledOnce()
    expect(result).toEqual({ replied: false, transferred: false, agentId: 'agent-1', failure: 'transient', error: error.message })
    expect(findUpdate('whatsapp_cloud_conversations')).toBeUndefined()
    expect(calls.some((c) => c.table === 'notifications' && c.method === 'insert')).toBe(false)
    expect(mockSendHumanizedReply).not.toHaveBeenCalled()
    expect(mockCreateAgentEngine).not.toHaveBeenCalled()
  })

  it.each(['handoff', 'ask_text'] as const)('402 é budget_exceeded, não fallback %s', async (mode) => {
    const params = prepare(mode)
    mockTranscribeAudio.mockRejectedValue(new AiBudgetExceededError(50, 50))

    const result = await maybeRunAgentForCloudConversation(params)

    expect(mockTranscribeAudio).toHaveBeenCalledOnce()
    expect(result).toEqual({ replied: false, transferred: false, agentId: 'agent-1', skipped: 'budget_exceeded' })
    expect(findUpdate('whatsapp_cloud_conversations')?.args[0]).toEqual({
      ai_enabled: false, ai_disabled_at: expect.any(String), ai_disabled_reason: 'budget_exceeded',
    })
    expect(calls.some((c) => c.table === 'notifications' && c.method === 'insert')).toBe(false)
    expect(mockSendHumanizedReply).not.toHaveBeenCalled()
    expect(mockCreateAgentEngine).not.toHaveBeenCalled()
  })

  it.each(['handoff', 'ask_text'] as const)('erro comum de transcrição preserva fallback %s', async (mode) => {
    const params = prepare(mode)
    mockTranscribeAudio.mockRejectedValue(new Error('invalid audio'))

    const result = await maybeRunAgentForCloudConversation(params)

    expect(result.transferred).toBe(mode === 'handoff')
    expect(result.replied).toBe(mode === 'ask_text')
    expect(result.failure).toBeUndefined()
    if (mode === 'handoff') {
      expect(findUpdate('whatsapp_cloud_conversations')?.args[0].ai_disabled_reason).toBe('media_handoff')
    } else {
      expect(mockSendHumanizedReply).toHaveBeenCalledOnce()
      expect(findUpdate('whatsapp_cloud_conversations')).toBeUndefined()
    }
  })

  it('preserva budget_exceeded lançado pelo engine', async () => {
    const params = prepare('handoff')
    queueResult('whatsapp_cloud_messages', { data: [] })
    mockCreateAgentEngine.mockResolvedValue({
      processMessage: vi.fn().mockRejectedValue(new AiBudgetExceededError(50, 50)),
    })

    const result = await maybeRunAgentForCloudConversation({ ...params, text: 'Olá', messageType: 'text' })

    expect(result).toEqual({ replied: false, transferred: false, agentId: 'agent-1', skipped: 'budget_exceeded' })
    expect(findUpdate('whatsapp_cloud_conversations')?.args[0]).toEqual({
      ai_enabled: false, ai_disabled_at: expect.any(String), ai_disabled_reason: 'budget_exceeded',
    })
    expect(mockTranscribeAudio).not.toHaveBeenCalled()
    expect(mockSendHumanizedReply).not.toHaveBeenCalled()
  })
})

describe('cloud-runner — claim legado', () => {
  it('usa as RPCs de claim e release e propaga falhas do banco', async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null })
    await expect(claimAiPendingResponse('conv-1')).resolves.toBe(true)
    expect(mockRpc).toHaveBeenLastCalledWith('claim_legacy_ai_pending', {
      p_conversation_id: 'conv-1',
    })

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'release failed' } })
    await expect(releaseAiPendingClaim('conv-1')).rejects.toMatchObject({
      message: 'release failed',
    })
    expect(mockRpc).toHaveBeenLastCalledWith('release_legacy_ai_pending', {
      p_conversation_id: 'conv-1',
    })
  })
})

describe('cloud-runner guards — resolução do agente', () => {
  it('erro da RPC antes do engine/envio é transient', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '08006', message: 'connection temporarily unavailable' },
    })

    const result = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'oi',
    })

    expect(result).toMatchObject({
      replied: false,
      transferred: false,
      failure: 'transient',
      error: 'connection temporarily unavailable',
    })
    expect(mockCreateAgentEngine).not.toHaveBeenCalled()
    expect(mockSendHumanizedReply).not.toHaveBeenCalled()
  })

  it('ausência real de agente não é transient', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    const result = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'oi',
    })

    expect(result).toMatchObject({
      replied: false,
      transferred: false,
      skipped: 'no_active_agent',
    })
    expect(result.failure).toBeUndefined()
    expect(mockCreateAgentEngine).not.toHaveBeenCalled()
    expect(mockSendHumanizedReply).not.toHaveBeenCalled()
  })
})

describe('cloud-runner guards — falhas de leitura pré-envio', () => {
  it.each([
    { guard: 'count', maxMessages: 1, error: 'bot message count failed' },
    { guard: 'human', maxMessages: 0, error: 'human reply lookup failed' },
  ])('$guard indisponível retorna transient sem engine ou sender', async ({ maxMessages, error }) => {
    queueResult('ai_agents', {
      data: agentRow({ settings: { behavior: { max_messages_per_conversation: maxMessages } } }),
      error: null,
    })
    queueResult('whatsapp_cloud_messages', { data: null, error: null }) // cooldown
    queueResult('whatsapp_cloud_messages', {
      data: null,
      count: null,
      error: { code: '08006', message: 'temporary read failure' },
    })

    await expect(maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'oi',
    })).resolves.toMatchObject({
      replied: false,
      transferred: false,
      failure: 'transient',
      error,
    })
    expect(mockCreateAgentEngine).not.toHaveBeenCalled()
    expect(mockSendHumanizedReply).not.toHaveBeenCalled()
  })
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

describe('contrato comum de estado — cloud-runner', () => {
  it.each(stateCases)('$id', async (testCase) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(testCase.now))
    try {
      const state = testCase.state
      if (state.ai_enabled !== false) queueResult('ai_agents', { data: agentRow({ settings: testCase.settings }) })
      if (state.last_bot_message_at || state.bot_message_count !== undefined || state.has_human_reply !== undefined) {
        queueResult('whatsapp_cloud_messages', {
          data: state.last_bot_message_at ? { timestamp: state.last_bot_message_at } : null,
        })
      }
      if (state.bot_message_count !== undefined) {
        queueResult('whatsapp_cloud_messages', { data: null, count: state.bot_message_count, error: null })
      } else if (state.has_human_reply !== undefined) {
        queueResult('whatsapp_cloud_messages', { data: state.has_human_reply ? { id: 'human-1' } : null })
      }

      const r = await maybeRunAgentForCloudConversation({
        account,
        conversation: conv({
          ai_enabled: state.ai_enabled ?? true,
          ai_agent_id: state.assignment === 'self' ? 'agent-1' : state.assignment === 'other' ? 'other-agent' : null,
          ai_transferred_at: state.transferred_at ?? null,
        }),
        text: 'oi',
      })

      expect(r.skipped ?? null).toBe(testCase.expected)
    } finally {
      vi.useRealTimers()
    }
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
            blocked_topics: ['humano'],
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
    expect(mockSendHumanizedReply.mock.calls[0][0].handoffConfirmation).toBe(true)
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

  it('flip para runtime durante o LLM impede o envio legado', async () => {
    let engineStarted!: () => void
    let finishEngine!: (value: { response: string }) => void
    const started = new Promise<void>((resolve) => { engineStarted = resolve })
    const response = new Promise<{ response: string }>((resolve) => { finishEngine = resolve })
    mockCreateAgentEngine.mockResolvedValue({
      processMessage: vi.fn(async () => {
        engineStarted()
        return response
      }),
    })
    mockSendHumanizedReply.mockResolvedValue({ sent: true, messageId: 'wamid.stale' })
    queueResult('ai_runtime_rollout', { data: { mode: 'runtime' }, error: null })

    const run = maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'qual o preco do produto?',
    })
    await started
    finishEngine({ response: 'rascunho legado' })

    await expect(run).resolves.toMatchObject({
      replied: false,
      transferred: false,
      skipped: 'runtime_cutover',
    })
    expect(mockSendHumanizedReply).not.toHaveBeenCalled()
  })

  it('falha ao revalidar rollout vira transient sem chamar o sender', async () => {
    queueResult('ai_runtime_rollout', {
      data: null,
      error: { message: 'rollout read failed' },
    })

    const result = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'qual o preco do produto?',
    })

    expect(result).toMatchObject({
      replied: false,
      failure: 'transient',
      error: 'rollout read failed',
    })
    expect(mockSendHumanizedReply).not.toHaveBeenCalled()
  })

  it('falha de token pre-envio vira transient e preserva o erro do sender', async () => {
    mockSendHumanizedReply.mockResolvedValue({
      sent: false,
      error: 'No access token for account waba-1',
    })

    const result = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'oi',
    })

    expect(result).toMatchObject({
      replied: false,
      transferred: false,
      failure: 'transient',
      error: 'No access token for account waba-1',
    })
  })
})
