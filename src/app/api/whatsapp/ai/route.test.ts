/**
 * O histórico que vai para o provedor de LLM passa a ser só o da própria loja.
 *
 * `handleGenerate` e `handleSuggest` escopavam a CONFIG pela org do token e
 * depois liam o histórico por `conversation_id` cru, com service_role. O
 * cabeçalho do arquivo afirma "org SEMPRE derivada do token" — valia para a
 * config, nunca para as mensagens.
 *
 * `whatsapp_messages` não tem `organization_id`: a tenancy mora no pai,
 * `whatsapp_conversations`. Por isso a correção é uma checagem de posse da
 * conversa antes de ler, e não um `.eq()` a mais.
 *
 * Conversa de outra loja é tratada exatamente como conversa inexistente —
 * histórico vazio, sem 403. Um erro distinto viraria oráculo de "esse UUID
 * existe e não é seu".
 *
 * Nenhuma tela chama estas ações hoje, mas os endpoints estão vivos: qualquer
 * usuário autenticado podia mandar o `conversation_id` de outra org e receber
 * as 20 últimas mensagens dela processadas pelo modelo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/lib/auth/require-org', () => ({
  requireOrgFromAuth: (...args: any[]) => mockAuth(...args),
}))

vi.mock('@/lib/ai/api-key-codec', () => ({
  decodeApiKey: () => ({ apiKey: 'chave-de-teste', legacyBase64: false }),
  encryptApiKey: (k: string) => k,
}))

const mockGenerate = vi.fn().mockResolvedValue('resposta')
const mockSuggest = vi.fn().mockResolvedValue(['sugestao'])
vi.mock('@/lib/whatsapp/ai-providers', () => ({
  callAI: vi.fn(),
  generateWhatsAppResponse: (...args: any[]) => mockGenerate(...args),
  suggestResponse: (...args: any[]) => mockSuggest(...args),
  AI_MODELS: {},
}))

// O fluxo faz três consultas em tabelas diferentes; o resultado é por tabela.
const results: Record<string, any> = {}
const tablesQueried: string[] = []
let current = ''
const chain: any = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'then') {
        const r = results[current] ?? { data: null, error: null }
        return (resolve: any) => resolve(r)
      }
      return () => chain
    },
  },
)
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      current = table
      tablesQueried.push(table)
      return chain
    },
  },
}))

import { POST } from './route'

const SESSION = { orgId: 'org-da-sessao', userId: 'u1' }
const CONFIG = {
  id: 'cfg-1',
  api_key_encrypted: 'enc',
  provider: 'openai',
  model: 'gpt-4o-mini',
  system_prompt: 'seja util',
  temperature: 0.5,
  max_tokens: 100,
}
const SEGREDO = 'saldo do cliente da outra loja'

function req(body: any): any {
  return { json: async () => body, headers: new Headers() }
}

function arrange({ conversaEhMinha }: { conversaEhMinha: boolean }) {
  results['whatsapp_ai_configs'] = { data: CONFIG, error: null }
  results['whatsapp_conversations'] = conversaEhMinha
    ? { data: { id: 'conv-1' }, error: null }
    : { data: null, error: null }
  results['whatsapp_messages'] = {
    data: [{ direction: 'inbound', content: SEGREDO }],
    error: null,
  }
}

describe('/api/whatsapp/ai — o histórico é o da própria loja', () => {
  beforeEach(() => {
    for (const k of Object.keys(results)) delete results[k]
    tablesQueried.length = 0
    mockAuth.mockReset()
    mockGenerate.mockClear()
    mockSuggest.mockClear()
    mockAuth.mockResolvedValue(SESSION)
  })

  it('generate: conversa de outra loja não é lida nem chega ao provedor', async () => {
    arrange({ conversaEhMinha: false })

    await POST(req({ action: 'generate', conversation_id: 'conv-alheia', user_message: 'oi' }))

    expect(tablesQueried).not.toContain('whatsapp_messages')
    expect(mockGenerate.mock.calls[0][0].conversationHistory).toEqual([])
    expect(JSON.stringify(mockGenerate.mock.calls[0][0])).not.toContain(SEGREDO)
  })

  it('generate: conversa da própria loja continua carregando o histórico', async () => {
    arrange({ conversaEhMinha: true })

    await POST(req({ action: 'generate', conversation_id: 'conv-1', user_message: 'oi' }))

    expect(tablesQueried).toContain('whatsapp_messages')
    expect(mockGenerate.mock.calls[0][0].conversationHistory).toHaveLength(1)
  })

  it('suggest: conversa de outra loja não é lida nem chega ao provedor', async () => {
    arrange({ conversaEhMinha: false })

    await POST(req({ action: 'suggest', conversation_id: 'conv-alheia', user_message: 'oi' }))

    expect(tablesQueried).not.toContain('whatsapp_messages')
    expect(mockSuggest.mock.calls[0][0].conversationHistory).toEqual([])
  })

  it('suggest: conversa da própria loja continua carregando o histórico', async () => {
    arrange({ conversaEhMinha: true })

    await POST(req({ action: 'suggest', conversation_id: 'conv-1', user_message: 'oi' }))

    expect(tablesQueried).toContain('whatsapp_messages')
    expect(mockSuggest.mock.calls[0][0].conversationHistory).toHaveLength(1)
  })

  it('sem conversation_id o histórico é vazio e a posse nem é consultada', async () => {
    arrange({ conversaEhMinha: true })

    await POST(req({ action: 'generate', user_message: 'oi' }))

    expect(tablesQueried).not.toContain('whatsapp_conversations')
    expect(tablesQueried).not.toContain('whatsapp_messages')
    expect(mockGenerate.mock.calls[0][0].conversationHistory).toEqual([])
  })
})
