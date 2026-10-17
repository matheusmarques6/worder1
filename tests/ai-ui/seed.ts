import summary from '../../scripts/ui-compare/fixtures/summary.json'
import blockMetrics from '../../scripts/ui-compare/fixtures/block-metrics.json'
import diagnostics from '../../scripts/ui-compare/fixtures/diagnostics.json'

// The comparison fixture's recognizable agents/sources and generated aggregates
// are starting data only. Request dispatch and all mutations live in fixture.ts.
const now = new Date().toISOString()
const agent = (id: string, name: string, role: string, status = 'active') => ({ id, name, role, status, is_active: status === 'active', provider: 'openrouter', model: 'openai/gpt-4.1-mini', monthly_cap_usd: 80, created_at: now, presentation_mode: 'nome_funcao', client_adaptation: { mirror_tone: true, emoji_if_client: true }, persona: { tone: 'friendly', response_length: 'short', guidelines: ['Nunca prometer data exata de entrega'] }, settings: { tools: { enabled: ['transfer_to_human', 'search_knowledge', 'product_lookup', 'create_coupon'] }, safety: { blocked_topics: ['Uso medicinal dos produtos'], handoff_keywords: ['falar com atendente'], handoff_confirmation_message: 'Vou chamar alguém da equipe.' }, judges: { custom: [{ id: 'j1', name: 'Preço', criterion: 'Não inventa preço nem estoque', active: true }] }, delivery: { debounce_seconds: 8, split_bubbles: true, typing_rhythm: true } } })
const agents = [agent('a-duda', 'Duda', 'Vendas'), agent('a-leo', 'Leo', 'Pós-compra'), agent('a-bia', 'Bia', 'Recuperação por e-mail', 'paused')]
const entries: Record<string, any[]> = {
  'a-duda': [{ id: 'e1', agent_id: 'a-duda', kind: 'whatsapp_account', ref_id: 'w1', active: true, label: '+55 11 4000-1234', created_at: now }, { id: 'e2', agent_id: 'a-duda', kind: 'flow_touch', ref_id: 'm2', active: true, label: 'Carrinho abandonado · toque 2', families: ['flow.cart_abandoned'], created_at: now }],
  'a-leo': [{ id: 'e3', agent_id: 'a-leo', kind: 'whatsapp_account', ref_id: 'w2', active: true, label: '+55 11 4000-5678', created_at: now }], 'a-bia': [],
}
const note = (id: string, name: string, folder: string, readers: string[], extra = {}) => ({ id, name, folder, readers, kind: 'note', status: 'ready', read_only: false, tags: [], links: [] as string[], source_type: 'note', updated_at: now, chunks_count: 4, uses_7d: 7, ...extra })
const notes = [note('s3', 'Política de troca', 'Políticas', ['a-duda', 'a-leo'], { links: ['Prazos de entrega'] }), note('s4', 'Garantia e assistência', 'Políticas', ['a-leo'], { links: ['Política de troca'] }), note('s2', 'Prazos de entrega', 'Frete e entrega', ['a-duda', 'a-leo']), note('s5', 'Frete grátis', 'Frete e entrega', ['a-duda'], { links: ['Prazos de entrega'] }), note('s6', 'Formas de pagamento', 'Pagamento', ['a-duda']), note('s1', 'Catálogo Shopify', 'Sincronizadas', ['a-duda', 'a-leo'], { read_only: true, source_type: 'shopify', status: 'processing' })]
const body = 'O cliente tem **30 dias** para pedir troca.\n\n## Como funciona\nPrimeira troca gratuita.\n\n## Passo a passo para o cliente\nChame no WhatsApp. Consulte [[Prazos de entrega]].'
export function seed(path: string): Record<string, any> {
  let data: unknown
  if (path === '/api/auth') data = { user: { id: 'u1', email: 'test@example.test', name: 'Teste', organization_id: 'org1', role: 'owner' }, organization: { id: 'org1', name: 'Loja Demo' } }
  else if (path === '/api/ai/agents') data = { agents: agents.map((a, i) => ({ ...a, entries: entries[a.id], missions_count: 2, conversations_7d: i ? 188 : 412, revenue_7d: i ? 3210 : 18420 })) }
  else if (path === '/api/ai/knowledge') data = { folders: [...new Set(notes.map(n => n.folder))].map(folder => ({ folder, notes: notes.filter(n => n.folder === folder) })) }
  else if (path === '/api/ai/knowledge/gaps') data = { gaps: [{ id: 'g1', question: 'O kit presente vem com embalagem e cartão?', count: 9, safe: true, agent_ids: ['a-duda'], suggested_source: null }, { id: 'g2', question: 'Aceitam PIX parcelado?', count: 4, safe: true, agent_ids: ['a-duda'], suggested_source: { id: 's6', name: 'Formas de pagamento', folder: 'Pagamento' } }, { id: 'g3', question: 'O sérum pode ser usado durante a gravidez?', count: 5, safe: false, agent_ids: ['a-duda', 'a-leo'], suggested_source: null }] }
  else if (/^\/api\/ai\/knowledge\/[^/]+\/usage$/.test(path)) data = { series: [1, 2, 3, 4, 5, 6, 7], total: 28, questions: [{ question: 'Posso trocar se não servir?', agent_name: 'Duda', at: now, transferred: false }, { question: 'Comprei há 40 dias, ainda dá?', agent_name: 'Leo', at: now, transferred: true }] }
  else if (/^\/api\/ai\/knowledge\/[^/]+$/.test(path)) data = { note: { ...notes.find(n => n.id === path.split('/').at(-1)), body_markdown: body } }
  else if (path === '/api/ai/activity/summary') data = summary
  else if (path === '/api/ai/activity/events') data = { events: [{ id: 'ev1', kind: 'sale', agent_id: 'a-duda', contact_name: 'Lívia Rocha', contact_id: 'c1', text: 'Venda concluída', amount: 143.8, created_at: new Date(Date.now() - 600000).toISOString() }, { id: 'ev2', kind: 'handoff', agent_id: 'a-duda', contact_name: 'Paulo Henrique', contact_id: 'c2', text: 'Passou para a equipe', created_at: now }, { id: 'ev3', kind: 'solved', agent_id: 'a-leo', contact_name: 'Juliana Prado', text: 'Explicou a troca', created_at: now }, { id: 'ev4', kind: 'blocked', agent_id: 'a-duda', text: 'Resposta retida pela revisão', created_at: now }] }
  else if (path.endsWith('/block-metrics')) data = blockMetrics
  else if (path.endsWith('/diagnostics')) data = diagnostics
  else if (path.endsWith('/spend')) data = { spent_usd: 42.1, cap_usd: 80, calls: 900 }
  else if (path.endsWith('/readiness')) data = { ready: true, items: [{ id: 'provider_key', ok: true, blocking: true, label: 'Chave de IA conectada' }, { id: 'mission', ok: true, blocking: true, label: 'Uma missão ativa' }, { id: 'entry', ok: true, blocking: false, label: 'Número de WhatsApp' }] }
  else if (path.endsWith('/versions')) data = { versions: [14, 13, 12].map(n => ({ id: `v${n}`, tag: `v${n}`, label: 'Identidade', author: 'Teste', date: now, status: n === 14 ? 'produção' : 'arquivada', current: n === 14, summary: ['Voz alterada'], restored_from: null, eval_score: 92, eval_grave: 0 })) }
  else if (path.endsWith('/simulate')) data = { reply: 'Consulte a política de troca.', blocked: false, knowledge: [{ source: 'Política de troca', source_id: 's3' }], tools: [], attempts: [{ attempt: 0, outcome: 'pass' }], cost_usd: 0.004 }
  else if (path.endsWith('/scenarios')) data = { scenarios: [] }
  else if (path === '/api/ai/missions') data = { missions: [{ id: 'm1', event_type: 'whatsapp.received', display_name: 'Atendimento direto', status: 'active', agent_id: 'a-duda' }, { id: 'm2', event_type: 'flow.cart_abandoned', display_name: 'Carrinho abandonado · toque 2', status: 'active', agent_id: 'a-duda', concession: { kind: 'percent', max: 10 } }] }
  else if (path === '/api/api-keys') data = { keys: [{ provider: 'openrouter', api_key_hint: 'sk-or-v1-a91f', is_active: true }] }
  else if (path === '/api/whatsapp/business-accounts') data = { accounts: [1, 2, 3].map((n, i) => ({ id: `w${n}`, verified_name: 'Loja Demo', display_phone_number: ['+55 11 4000-1234', '+55 11 4000-5678', '+55 11 4000-9012'][i] })) }
  else if (path === '/api/ai/openrouter-models') data = { models: [{ id: 'openai/gpt-4.1-mini', name: 'OpenAI GPT-4.1 Mini', prompt_per_m: 0.4, completion_per_m: 1.6 }, { id: 'anthropic/claude-haiku-4.5', name: 'Anthropic Claude Haiku 4.5', prompt_per_m: 1, completion_per_m: 5 }] }
  else if (path === '/api/ai/runtime-mode') data = { mode: 'runtime' }
  else if (path === '/api/notifications') data = { notifications: [], unreadCount: 0 }
  else if (path === '/api/stores' || path === '/api/shopify/stores') data = { success: true, stores: [{ id: 'st1', shop_name: 'Loja Demo', shop_domain: 'demo.myshopify.com', name: 'Loja Demo', domain: 'demo.myshopify.com', is_active: true }] }
  else throw new Error(`No immutable seed for ${path}`)
  return structuredClone(data) as Record<string, any>
}
