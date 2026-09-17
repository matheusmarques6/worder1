import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Conversation } from '@/lib/services/whatsapp/types'

const mocks = vi.hoisted(() => ({
  trackAiUsage: vi.fn(),
  checkAiBudget: vi.fn(),
  from: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('@/lib/ai/cost-tracker', () => ({
  trackAiUsage: (...args: unknown[]) => mocks.trackAiUsage(...args),
}))

vi.mock('@/lib/ai/budget', () => ({
  checkAiBudget: (...args: unknown[]) => mocks.checkAiBudget(...args),
}))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mocks.from(...args),
  },
}))

vi.mock('@/lib/services/whatsapp/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: (...args: unknown[]) => mocks.loggerError(...args),
  },
}))

import {
  getCopilotSuggestion,
  processWithAI,
} from '@/lib/services/whatsapp/ai-chatbot-service'
import { generateSegmentRule } from '@/lib/segments/ai-generator'

type QueryResult = { data: unknown; error: unknown }

const tableResults = new Map<string, QueryResult[]>()

function queueResult(table: string, result: QueryResult) {
  const queue = tableResults.get(table) ?? []
  queue.push(result)
  tableResults.set(table, queue)
}

function nextResult(table: string): QueryResult {
  return tableResults.get(table)?.shift() ?? { data: null, error: null }
}

function queryBuilder(table: string) {
  const builder: Record<string, unknown> = {}

  for (const method of ['select', 'eq', 'neq', 'order', 'update']) {
    builder[method] = vi.fn(() => builder)
  }

  builder.single = vi.fn(async () => nextResult(table))
  builder.limit = vi.fn(async () => nextResult(table))
  builder.then = (resolve: (result: QueryResult) => unknown) =>
    Promise.resolve(nextResult(table)).then(resolve)

  return builder
}

function queueCopilotContext() {
  queueResult('whatsapp_conversations', {
    data: { id: 'conv-a', ai_agent_id: null },
    error: null,
  })
  queueResult('whatsapp_messages', { data: [], error: null })
}

function openAiResponse(options?: {
  ok?: boolean
  status?: number
  usage?: { prompt_tokens: number; completion_tokens: number }
  error?: string
}) {
  return {
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    json: vi.fn().mockResolvedValue(
      options?.ok === false
        ? { error: { message: options.error ?? 'request refused' } }
        : {
            choices: [{ message: { content: '  Olá  ' } }],
            ...(options?.usage ? { usage: options.usage } : {}),
          }
    ),
  }
}

const conversation: Conversation = {
  id: 'conv-a',
  organization_id: 'org-a',
  contact_phone: '5511999999999',
  status: 'open',
  priority: 'medium',
  bot_active: true,
  unread_count: 0,
  is_contact_initiated: true,
  origin: 'organic',
  tags: [],
  custom_fields: {},
  metadata: {},
  ai_agent_id: 'agent-a',
  created_at: '2026-09-15T00:00:00.000Z',
  updated_at: '2026-09-15T00:00:00.000Z',
}

const agent = {
  id: 'agent-a',
  name: 'Agente',
  system_prompt: 'Responda objetivamente',
  model: 'gpt-4o-mini',
  temperature: 0.2,
  max_tokens: 100,
  max_interactions: null,
  handoff_keywords: [],
  handoff_after_messages: null,
  total_messages: 0,
}

describe('metering do copiloto e da caixa compartilhada', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    tableResults.clear()
    mocks.trackAiUsage.mockResolvedValue(undefined)
    mocks.from.mockImplementation((table: string) => queryBuilder(table))
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('registra uma chamada do copiloto como uso da plataforma', async () => {
    queueCopilotContext()
    fetchMock.mockResolvedValue(
      openAiResponse({ usage: { prompt_tokens: 11, completion_tokens: 4 } })
    )

    const result = await getCopilotSuggestion(
      'conv-a',
      'org-a',
      'oi'
    )

    expect(result).toEqual({ data: { suggestion: 'Olá' } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mocks.trackAiUsage).toHaveBeenCalledTimes(1)
    expect(mocks.trackAiUsage).toHaveBeenCalledWith({
      organizationId: 'org-a',
      provider: 'openai',
      model: 'gpt-4o-mini',
      feature: 'copilot',
      promptTokens: 11,
      completionTokens: 4,
      success: true,
      metadata: { billable: false },
    })
    expect(mocks.checkAiBudget).not.toHaveBeenCalled()

    const trackerPayload = JSON.stringify(mocks.trackAiUsage.mock.calls)
    expect(trackerPayload).not.toContain('sk-test')
    expect(trackerPayload).not.toContain('oi')
    expect(trackerPayload).not.toContain('Olá')
    expect(trackerPayload).not.toContain('Bearer')
    expect(trackerPayload).not.toContain('assistente')
  })

  it('registra uma chamada da automação sem duplicação no caller', async () => {
    queueResult('ai_agents', { data: agent, error: null })
    queueResult('whatsapp_messages', { data: [], error: null })
    fetchMock.mockResolvedValue(
      openAiResponse({ usage: { prompt_tokens: 11, completion_tokens: 4 } })
    )

    const result = await processWithAI(
      conversation,
      'oi',
      'org-a'
    )

    expect(result).toEqual({
      data: { response: 'Olá', shouldHandoff: false },
    })
    expect(mocks.trackAiUsage).toHaveBeenCalledTimes(1)
    expect(mocks.trackAiUsage).toHaveBeenCalledWith({
      organizationId: 'org-a',
      provider: 'openai',
      model: 'gpt-4o-mini',
      feature: 'copilot',
      promptTokens: 11,
      completionTokens: 4,
      success: true,
      metadata: { billable: false },
    })
    expect(mocks.checkAiBudget).not.toHaveBeenCalled()
  })

  it('registra custo desconhecido quando a resposta não informa usage', async () => {
    queueCopilotContext()
    fetchMock.mockResolvedValue(openAiResponse())

    const result = await getCopilotSuggestion(
      'conv-a',
      'org-a',
      'oi'
    )

    expect(result).toEqual({ data: { suggestion: 'Olá' } })
    expect(mocks.trackAiUsage).toHaveBeenCalledTimes(1)
    expect(mocks.trackAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        success: true,
        costUsdOverride: null,
        metadata: { billable: false },
      })
    )
  })

  it('registra uma falha quando fetch rejeita e preserva o retorno público', async () => {
    queueCopilotContext()
    fetchMock.mockRejectedValue(new Error('network down'))

    const result = await getCopilotSuggestion(
      'conv-a',
      'org-a',
      'oi'
    )

    expect(result).toEqual({ error: 'network down' })
    expect(mocks.trackAiUsage).toHaveBeenCalledTimes(1)
    expect(mocks.trackAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        success: false,
        costUsdOverride: null,
        metadata: { billable: false },
      })
    )
  })

  it('registra uma falha HTTP uma única vez e preserva a mensagem pública', async () => {
    queueCopilotContext()
    fetchMock.mockResolvedValue(
      openAiResponse({ ok: false, status: 429, error: 'quota' })
    )

    const result = await getCopilotSuggestion(
      'conv-a',
      'org-a',
      'oi'
    )

    expect(result).toEqual({ error: 'OpenAI API error: 429 - quota' })
    expect(mocks.trackAiUsage).toHaveBeenCalledTimes(1)
    expect(mocks.trackAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        success: false,
        costUsdOverride: null,
        metadata: { billable: false },
      })
    )
  })

  it('bloqueia organização vazia antes do fetch sem registrar ou consultar budget', async () => {
    queueCopilotContext()

    const result = await getCopilotSuggestion(
      'conv-a',
      '',
      'oi'
    )

    expect(result).toEqual({ error: 'organizationId não informado' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.trackAiUsage).not.toHaveBeenCalled()
    expect(mocks.checkAiBudget).not.toHaveBeenCalled()
  })
})

describe('metering de segmento por tentativa', () => {
  const fetchMock = vi.fn()
  const validRule = {
    version: 2,
    root: {
      type: 'group',
      logic: 'AND',
      children: [
        {
          type: 'profile',
          field: 'predicted_clv',
          operator: 'gte',
          value: 500,
        },
      ],
    },
  }

  function anthropicResponse(
    body: Record<string, unknown>,
    options?: { ok?: boolean; status?: number; text?: string }
  ) {
    return {
      ok: options?.ok ?? true,
      status: options?.status ?? 200,
      json: vi.fn().mockResolvedValue(body),
      text: vi.fn().mockResolvedValue(options?.text ?? ''),
    }
  }

  function validResponse(usage?: {
    input_tokens: number
    output_tokens: number
  }) {
    return anthropicResponse({
      content: [
        {
          type: 'tool_use',
          name: 'create_segment',
          input: validRule,
        },
      ],
      ...(usage ? { usage } : {}),
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    mocks.trackAiUsage.mockResolvedValue(undefined)
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test')
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('registra a resposta sem tool_use e o retry válido como duas tentativas', async () => {
    fetchMock
      .mockResolvedValueOnce(
        anthropicResponse({
          content: [{ type: 'text', text: 'malformed-output' }],
          usage: { input_tokens: 10, output_tokens: 2 },
        })
      )
      .mockResolvedValueOnce(
        validResponse({ input_tokens: 12, output_tokens: 3 })
      )

    const result = await generateSegmentRule('clientes com CLV alto', {
      orgId: 'org-a',
    })

    expect(result.ok).toBe(true)
    expect(result.attempts).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mocks.trackAiUsage).toHaveBeenCalledTimes(2)
    expect(mocks.trackAiUsage.mock.calls.map(([input]) => input)).toEqual([
      {
        organizationId: 'org-a',
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        feature: 'segment_generation',
        promptTokens: 10,
        completionTokens: 2,
        success: true,
        metadata: { billable: false, attempt: 1 },
      },
      {
        organizationId: 'org-a',
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        feature: 'segment_generation',
        promptTokens: 12,
        completionTokens: 3,
        success: true,
        metadata: { billable: false, attempt: 2 },
      },
    ])
    expect(mocks.checkAiBudget).not.toHaveBeenCalled()

    const trackerPayload = JSON.stringify(mocks.trackAiUsage.mock.calls)
    expect(trackerPayload).not.toContain('sk-ant-test')
    expect(trackerPayload).not.toContain('clientes com CLV alto')
    expect(trackerPayload).not.toContain('malformed-output')
    expect(trackerPayload).not.toContain('create_segment')
    expect(trackerPayload).not.toContain('x-api-key')
  })

  it('mantém o registro quando a regra falha na validação e não duplica no catch', async () => {
    fetchMock
      .mockResolvedValueOnce(
        anthropicResponse({
          content: [
            {
              type: 'tool_use',
              name: 'create_segment',
              input: {
                version: 1,
                root: {
                  type: 'group',
                  logic: 'AND',
                  children: [
                    {
                      type: 'profile',
                      field: 'campo_inventado',
                      operator: 'equals',
                      value: true,
                    },
                  ],
                },
              },
            },
          ],
          usage: { input_tokens: 7, output_tokens: 1 },
        })
      )
      .mockResolvedValueOnce(
        validResponse({ input_tokens: 8, output_tokens: 2 })
      )

    const result = await generateSegmentRule('clientes válidos', {
      orgId: 'org-a',
    })

    expect(result.ok).toBe(true)
    expect(result.attempts).toBe(2)
    expect(mocks.trackAiUsage).toHaveBeenCalledTimes(2)
    expect(
      mocks.trackAiUsage.mock.calls.map(([input]) => input.metadata.attempt)
    ).toEqual([1, 2])
  })

  it('registra falha HTTP e registra separadamente o retry bem-sucedido', async () => {
    fetchMock
      .mockResolvedValueOnce(
        anthropicResponse(
          {},
          { ok: false, status: 429, text: 'request refused' }
        )
      )
      .mockResolvedValueOnce(
        validResponse({ input_tokens: 12, output_tokens: 3 })
      )

    const result = await generateSegmentRule('clientes com CLV alto', {
      orgId: 'org-a',
    })

    expect(result.ok).toBe(true)
    expect(result.attempts).toBe(2)
    expect(mocks.trackAiUsage).toHaveBeenCalledTimes(2)
    expect(mocks.trackAiUsage.mock.calls[0][0]).toEqual({
      organizationId: 'org-a',
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      feature: 'segment_generation',
      success: false,
      costUsdOverride: null,
      metadata: { billable: false, attempt: 1 },
    })
    expect(mocks.trackAiUsage.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        success: true,
        metadata: { billable: false, attempt: 2 },
      })
    )
  })

  it('registra fetch rejeitado e registra separadamente o retry bem-sucedido', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(
        validResponse({ input_tokens: 12, output_tokens: 3 })
      )

    const result = await generateSegmentRule('clientes com CLV alto', {
      orgId: 'org-a',
    })

    expect(result.ok).toBe(true)
    expect(result.attempts).toBe(2)
    expect(mocks.trackAiUsage).toHaveBeenCalledTimes(2)
    expect(mocks.trackAiUsage.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        success: false,
        costUsdOverride: null,
        metadata: { billable: false, attempt: 1 },
      })
    )
    expect(mocks.trackAiUsage.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        success: true,
        metadata: { billable: false, attempt: 2 },
      })
    )
  })

  it('registra custo desconhecido quando a resposta não informa usage', async () => {
    fetchMock.mockResolvedValue(validResponse())

    const result = await generateSegmentRule('clientes com CLV alto', {
      orgId: 'org-a',
    })

    expect(result.ok).toBe(true)
    expect(result.attempts).toBe(1)
    expect(mocks.trackAiUsage).toHaveBeenCalledTimes(1)
    expect(mocks.trackAiUsage).toHaveBeenCalledWith({
      organizationId: 'org-a',
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      feature: 'segment_generation',
      success: true,
      costUsdOverride: null,
      metadata: { billable: false, attempt: 1 },
    })
  })

  it.each([
    ['ausente', {} as { orgId: string }],
    ['vazia', { orgId: '' }],
  ])(
    'bloqueia organização %s antes de fetch, metering ou budget',
    async (_label, opts) => {
      const result = await generateSegmentRule(
        'clientes com CLV alto',
        opts
      )

      expect(result).toEqual({
        ok: false,
        error: 'organizationId não informado',
        attempts: 0,
      })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(mocks.trackAiUsage).not.toHaveBeenCalled()
      expect(mocks.checkAiBudget).not.toHaveBeenCalled()
    }
  )
})
