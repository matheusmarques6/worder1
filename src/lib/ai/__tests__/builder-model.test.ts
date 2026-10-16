import { describe, expect, it } from 'vitest'
import { agentToHub } from '../agent-hub'
import {
  ACC2, W2, buildPalette, deriveModel, issueNode, layout2, runPath, setAdapt, setReview, setTopics, setVoice, toggleTool,
} from '../builder-model'

const hub = agentToHub({
  id: 'a1', name: 'Duda', model: 'openai/gpt-4.1-mini', provider: 'openrouter', monthly_cap_usd: 80,
  presentation_mode: 'nome_funcao', client_adaptation: { mirror_tone: true, emoji_if_client: true },
  persona: { tone: 'friendly', response_length: 'short', guidelines: ['Não promete prazo fora da tabela'] },
  settings: {
    tools: { enabled: ['product_lookup', 'create_coupon'] },
    safety: { blocked_topics: ['Uso medicinal'], handoff_keywords: ['falar com atendente', 'procon'] },
    judges: { custom: [{ id: 'j1', name: 'Tom', criterion: 'Mantém o tom da marca', active: true }] },
    delivery: { debounce_seconds: 8, split_bubbles: true, typing_rhythm: true },
  },
})

const input = {
  hub,
  agentId: 'a1',
  entries: [
    { id: 'e1', kind: 'whatsapp_account', label: 'Loja · +55 11 4000-1234' },
    { id: 'e2', kind: 'flow_touch', label: 'Carrinho abandonado · toque 2', ref_id: 'flow-1', families: ['cart.abandoned'], touches: 2 },
  ],
  missions: [
    { id: 'm1', event_type: 'whatsapp.received', display_name: 'Atendimento direto', status: 'active', version: 6 },
    { id: 'm2', event_type: 'cart.abandoned', display_name: 'Carrinho abandonado', status: 'active', concession: { kind: 'percent', max: 10 } },
  ],
  notes: [
    { id: 's1', name: 'Política de troca', status: 'ready', source_type: 'note', readers: ['a1', 'a2'] },
    { id: 's2', name: 'Catálogo Shopify', status: 'processing', source_type: 'shopify', chunks_count: 214, readers: ['a1'] },
    { id: 's3', name: 'De outro agente', status: 'ready', readers: ['a2'] },
  ],
  agents: [{ id: 'a1', name: 'Duda', role: 'Vendas' }, { id: 'a2', name: 'Leo', role: 'Pós-compra' }],
  metrics: {
    entries: [{ id: 'e1', conversations: 312, first_response_ms: 8200, purchase_rate: null }],
    knowledge: [{ id: 's1', uses: 28 }],
    tools: [{ name: 'product_lookup', calls: 186, success_rate: 1 }, { name: 'create_coupon', calls: 16, issued: 14, denied: 2 }],
    agent: { conversations: 412, revenue: 18420, cost_per_conversation_brl: 0.04, eval_score: 92 },
    review: { approved_rate: 0.978, rejected: 9 }, limits: { blocked: 3 }, needs_person: { transferred: 48 },
    send: { replies: 1284, resolved_rate: 0.71 }, adaptation: { adjusted_rate: null }, transfer: { avg_wait_ms: null },
  },
  usdBrl: 5,
  spentBrl: 212.4,
  handoffDest: 'team',
}

describe('deriveModel', () => {
  const f = deriveModel(input)
  it('entradas no texto do protótipo', () => {
    expect(f.entries[0]).toMatchObject({ id: 'e:e1', t: 'WhatsApp (11) 4000-1234', s: 'Cliente chamou a loja', mis: 'Atendimento direto · v6' })
    expect(f.entries[0].m).toEqual([['312', 'conversas'], ['8s', '1ª resposta']])
    // ref_id do toque é o FLUXO; a missão vem pela família que os nós chamam.
    expect(f.entries[1]).toMatchObject({ t: 'Carrinho abandonado · toque 2', s: 'Autoriza cupom de até 10%', when: 'Quando o fluxo chamar', mis: 'Carrinho abandonado', flowId: 'flow-1' })
    expect(f.entries[1].m).toEqual([['2', 'toques no fluxo'], ['ativa', 'missão']])
  })
  it('conhecimento só com o que o agente lê', () => {
    expect(f.kb.map((k) => k.t)).toEqual(['Política de troca', 'Catálogo Shopify'])
    expect(f.kb[0]).toMatchObject({ st: 'ok', others: 'Leo', m: [['28', 'usos']] })
    expect(f.kb[1]).toMatchObject({ st: 'sync', s: '214 produtos' })
  })
  it('ferramentas, cupom com trava', () => {
    expect(f.tools[0].m).toEqual([['186', 'chamadas'], ['100%', 'sucesso']])
    expect(f.tools[1]).toMatchObject({ t: 'Criar cupom', lock: true, m: [['14', 'emitidos'], ['2', 'recusados']] })
  })
  it('blocos fixos e agente em R$', () => {
    expect(f.adapt).toEqual(['Espelhar formalidade', 'Emoji só se o cliente usar', 'Resposta curta por padrão'])
    expect(f.limits).toEqual([['topic', 'Uso medicinal'], ['rule', 'Não promete prazo fora da tabela']])
    expect(f.review).toEqual(['Mantém o tom da marca'])
    expect(f.agent).toMatchObject({ voice: 'Amigável', pres: 'Nome e função', model: 'GPT-4.1 mini', cap: 400, used: 212.4 })
    expect(f.fixed.agent).toEqual([['412', 'conversas'], ['R$ 18.420', 'receita'], ['R$ 0,04', 'por conversa'], ['92', 'avaliação']])
    expect(f.fixed.review).toEqual([['97,8%', 'aprovadas'], ['9', 'reprovadas']])
    // Nada mede respostas ajustadas: o bloco mostra os ajustes ligados.
    expect(f.fixed.adapt).toEqual([['3 de 5', 'ajustes ligados']])
    expect(f.fixed.transfer[1]).toEqual(['Equipe', 'destino'])
  })
})

describe('edições voltam como HubState', () => {
  it('voz, adaptação, limites, critérios, ferramentas', () => {
    expect(setVoice(hub, 'Sofisticada').identity.voice).toBe('luxury')
    expect(setAdapt(hub, 'Resposta curta por padrão', false).adapt.base_length).toBe('medium')
    expect(setTopics(hub, ['a', 'b']).limits.blocked).toEqual(['a', 'b'])
    const r = setReview(hub, ['Mantém o tom da marca', 'Não inventa preço'])
    expect(r.judges.custom.map((j) => j.criterion)).toEqual(['Mantém o tom da marca', 'Não inventa preço'])
    expect(r.judges.custom[0].id).toBe('j1')
    expect(toggleTool(hub, 'order_status', true).tools.enabled).toContain('order_status')
  })
})

describe('layout2 (números do protótipo)', () => {
  const f = deriveModel(input)
  const L = layout2(f)
  it('agente centralizado, colunas laterais e ramos finais', () => {
    const agent = L.N.find((n) => n.id === 'agent')!
    expect(agent.x + agent.w / 2).toBe(W2 / 2)
    expect(L.N.filter((n) => n.type === 'kb').every((n) => n.x === 20)).toBe(true)
    expect(L.N.filter((n) => n.type === 'tool').every((n) => n.x === W2 - 20 - 260)).toBe(true)
    expect(L.E.filter((e) => e.k === 'branch').map((e) => e.label)).toEqual(['Precisa de uma pessoa', 'Responder o cliente'])
    expect(L.S.map((s) => s.id)).toEqual(['slot-entry', 'slot-kb', 'slot-tool'])
  })
  it('nenhum bloco da coluna central se sobrepõe', () => {
    const mid = L.N.filter((n) => ['agent', 'adapt', 'limits', 'review', 'split'].includes(n.type)).sort((a, b) => a.y - b.y)
    for (let i = 1; i < mid.length; i++) expect(mid[i].y).toBeGreaterThan(mid[i - 1].y + mid[i - 1].h)
  })
  it('alvos de soltura existem no desenho', () => {
    const ids = new Set([...L.N.map((n) => n.id), ...L.S.map((s) => s.id)])
    for (const t of Object.values(ACC2)) expect(ids.has(t)).toBe(true)
  })
})

describe('paleta, caminho e diagnóstico', () => {
  const f = deriveModel(input)
  it('paleta marca o que já está no agente', () => {
    const pal = buildPalette({
      accounts: [{ id: 'w1', label: 'Loja · +55 11 4000-1234', agentName: 'Duda' }, { id: 'w3', label: 'Loja · +55 11 4000-9012', agentName: null }],
      linkedAccountIds: new Set(['w1']), enabledTools: hub.tools.enabled, agents: input.agents, agentId: 'a1', dest: 'team',
    })
    const entradas = pal.find((g) => g.g === 'Entradas')!.items
    expect(entradas[0]).toMatchObject({ used: true })
    expect(entradas[1].s).toBe('(11) 4000-9012 · sem agente')
    expect(pal.find((g) => g.g === 'Transferência')!.items.map((i) => i.t)).toEqual(['Transferir p/ Equipe', 'Transferir p/ Leo'])
  })
  it('caminho da resposta e bloqueio na revisão', () => {
    const ok = runPath({ knowledge: [{ source_id: 's1' }], tools: [{ name: 'product_lookup' }] }, f, false)
    expect(ok.path).toEqual(['e:e1', 'agent', 'k:s1', 't:product_lookup', 'n-adapt', 'n-limits', 'n-review', 'n-split', 'n-send'])
    const blocked = runPath({ blocked: true }, f, true)
    expect(blocked.path[0]).toBe('e:e2')
    expect(blocked.fail).toBe('n-review')
    expect(blocked.path).not.toContain('n-send')
  })
  it('diagnóstico aponta o bloco', () => {
    expect(issueNode('knowledge:s2', f)).toBe('k:s2')
    expect(issueNode('tool:create_coupon', f)).toBe('t:create_coupon')
    expect(issueNode('entries', f)).toBe('e:e1')
  })
})
