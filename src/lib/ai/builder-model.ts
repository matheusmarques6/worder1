// O Construtor do protótipo (IA Construtor do Agente v2), parte pura:
//   - o modelo de blocos (entradas, conhecimento, ferramentas, adaptação,
//     limites, revisão, precisa de uma pessoa, transferir, enviar) derivado
//     dos dados reais do agente;
//   - o desenho de posições `layout2` portado sem mudança de números;
//   - a paleta de blocos e o caminho que uma resposta de teste percorre.
// O estado editável continua sendo o HubState (agent-hub.ts): as edições do
// inspector passam pelas funções `set*` daqui e voltam como HubState.

import type { HubState, Presentation, Voice } from './agent-hub'
import { TOOL_CATALOG } from './tools/catalog'
import { brl, num, pct } from './brl'

export type Tone = 'green' | 'blue' | 'teal' | 'purple' | 'sky' | 'amber' | 'red' | 'violet' | 'pink' | 'slate'
export type Mets = Array<[string, string]>

export interface EntryView {
  id: string
  entryId: string
  kind: 'whatsapp_account' | 'flow_touch'
  /** Toque de fluxo: o fluxo de onde vem ("Abrir fluxo" leva até ele). */
  flowId?: string
  ic: string
  tone: Tone
  t: string
  s: string
  m: Mets
  when: string
  mis: string
  incentive: string | null
}
export interface KbView { id: string; sourceId: string; t: string; s: string; st: 'ok' | 'sync' | 'proc' | 'error'; m: Mets; prev: string | null; others: string }
export interface ToolView { id: string; name: string; t: string; s: string; lock: boolean; m: Mets }

export interface BuilderModel {
  entries: EntryView[]
  kb: KbView[]
  tools: ToolView[]
  adapt: string[]
  limits: Array<['topic' | 'rule', string]>
  review: string[]
  handoff: { phrases: string[]; dest: string; destName: string | null }
  send: { debounce: number; split: boolean; typing: boolean }
  agent: { voice: string; pres: string; model: string; cap: number | null; used: number | null }
  /** Números dos blocos fixos (sem dado vira "—"). */
  fixed: Record<'agent' | 'adapt' | 'limits' | 'review' | 'split' | 'transfer' | 'send', Mets>
}

// ---------------------------------------------------------------------------
// Rótulos do protótipo ↔ valores do hub
// ---------------------------------------------------------------------------

export const VOICES: Array<[Voice, string]> = [
  ['casual', 'Casual'], ['friendly', 'Amigável'], ['professional', 'Profissional'], ['luxury', 'Sofisticada'],
]
/** O que cada voz muda, com uma frase de exemplo. O texto da descrição é o
 *  mesmo que o runtime põe no prompt (prompt_compiler._TONE, 2026-10-15-17). */
export const VOICE_INFO: Record<string, { d: string; ex: string }> = {
  Casual: { d: 'Leve e próximo, frases curtas, pode usar gírias leves e emoji.', ex: 'Opa! Tem sim, e tá saindo muito essa semana 😄 Quer que eu separe?' },
  'Amigável': { d: 'Caloroso e simples, trata o cliente pelo nome, sem formalidade.', ex: 'Oi, Ana! Tem sim, e combina muito com o que você levou da última vez. Quer o link?' },
  Profissional: { d: 'Cordial e objetivo, sem gírias nem emoji, explica com clareza.', ex: 'Olá, Ana. O produto está disponível em estoque. Posso enviar o link para finalizar a compra?' },
  Sofisticada: { d: 'Vocabulário cuidado e frases completas, sem gírias, abreviações ou emoji.', ex: 'Boa tarde, Ana. Temos a peça disponível e posso reservá-la para a senhora. Deseja que eu envie o link?' },
}
/** Como o agente se apresenta em cada modo (prompt_compiler._PRESENTATION). */
export function presentationExample(label: string, name: string, role: string | null): string {
  if (label === 'Só o nome') return 'Não se apresenta sozinho; responde direto. Se perguntarem, diz o nome.'
  if (label === 'Assistente virtual da loja') return '“Oi! Sou a assistente virtual da loja. Como posso ajudar?”'
  return `“Oi! Aqui é ${name}, do time de ${(role || 'atendimento').toLowerCase()} da loja.”`
}

export const PRESENTATIONS: Array<[Presentation, string]> = [
  ['nome_funcao', 'Nome e função'], ['discreta', 'Só o nome'], ['transparente', 'Assistente virtual da loja'],
]
export const MODELS: Array<[string, string]> = [
  ['openai/gpt-4.1-mini', 'GPT-4.1 mini'], ['openai/gpt-4.1', 'GPT-4.1'],
  ['anthropic/claude-haiku-4.5', 'Claude Haiku'], ['anthropic/claude-sonnet-4.5', 'Claude Sonnet'],
]
export function modelLabel(slug: string): string {
  const hit = MODELS.find(([s]) => s === slug || s.split('/')[1] === slug)
  return hit ? hit[1] : slug
}

/** Os ajustes do bloco Adaptação, na ordem do protótipo. */
export const ADAPT_OPTIONS: Array<[string, (h: HubState) => boolean, (h: HubState, on: boolean) => HubState]> = [
  ['Espelhar formalidade', (h) => h.adapt.mirror_tone, (h, on) => ({ ...h, adapt: { ...h.adapt, mirror_tone: on } })],
  ['Emoji só se o cliente usar', (h) => h.adapt.emoji_if_client, (h, on) => ({ ...h, adapt: { ...h.adapt, emoji_if_client: on } })],
  ['Resposta curta por padrão', (h) => h.adapt.base_length === 'short', (h, on) => ({ ...h, adapt: { ...h.adapt, base_length: on ? 'short' : 'medium' } })],
  ['Insistir menos depois de reclamação', (h) => h.adapt.insist_less_after_complaint, (h, on) => ({ ...h, adapt: { ...h.adapt, insist_less_after_complaint: on } })],
  ['Saudação diferente para quem já comprou', (h) => h.adapt.distinct_greeting_repeat_buyer, (h, on) => ({ ...h, adapt: { ...h.adapt, distinct_greeting_repeat_buyer: on } })],
]

/** Integração mostrada no subtítulo de cada ferramenta (paleta e bloco). */
export const TOOL_INTEGRATION: Record<string, string> = {
  transfer_to_human: 'Inbox da equipe',
  search_knowledge: 'Conhecimento da loja',
  save_customer: 'Contatos',
  save_interests: 'Contatos',
  timeline: 'Contatos',
  product_lookup: 'Shopify',
  order_status: 'Shopify',
  create_coupon: 'Só com autorização do fluxo',
}
const TOOL_ICON: Record<string, string> = {
  transfer_to_human: 'users', search_knowledge: 'bookOpen', save_customer: 'users', save_interests: 'tag',
  timeline: 'clock', product_lookup: 'box', order_status: 'cart', create_coupon: 'tag',
}

// ---------------------------------------------------------------------------
// Derivação do modelo
// ---------------------------------------------------------------------------

export interface DeriveInput {
  hub: HubState
  entries: Array<{ id: string; kind: string; label: string; ref_id?: string; families?: string[]; touches?: number }>
  missions: Array<{ id: string; event_type: string; display_name?: string | null; status: string; concession?: any; version?: number | null }>
  notes: Array<{ id: string; name: string; status?: string | null; source_type?: string | null; kind?: string | null; chunks_count?: number | null; readers?: string[]; preview?: string | null }>
  agentId: string
  agents: Array<{ id: string; name: string | null; role?: string | null }>
  metrics: any | null
  usdBrl: number
  spentBrl: number | null
  handoffDest: string
}

const dash = '—'
const n0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? num(v) : dash)
const secs = (ms: unknown) => (typeof ms === 'number' && Number.isFinite(ms) ? `${Math.round(ms / 1000)}s` : dash)

/** "+55 11 4000-1234" → "(11) 4000-1234", como o protótipo escreve. */
export function phoneBR(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits.length >= 10 ? digits : ''
  if (!local) return raw
  const ddd = local.slice(0, 2)
  const rest = local.slice(2)
  return `(${ddd}) ${rest.slice(0, -4)}-${rest.slice(-4)}`
}

function phoneOf(label: string): string {
  return phoneBR(label.split(' · ').pop() || label)
}

function concessionText(c: any): string | null {
  if (!c || !c.kind || c.kind === 'none') return null
  const max = c.max ?? c.max_percent ?? c.value
  if (c.kind === 'percent' || c.kind === 'coupon') return max ? `Autoriza cupom de até ${max}%` : 'Autoriza cupom'
  if (c.kind === 'free_shipping') return 'Autoriza frete grátis'
  return 'Autoriza incentivo'
}

function sourceSubtitle(note: DeriveInput['notes'][number]): string {
  const t = note.source_type || note.kind || 'note'
  if (t === 'shopify' || t === 'shopify_catalog') return `${note.chunks_count ?? 0} produtos`
  if (t === 'site_page' || t === 'url') return 'Página da loja'
  if (t === 'pdf' || t === 'file' || t === 'document') return 'Documento'
  if (t === 'qa' || t === 'csv') return 'Perguntas e respostas'
  return 'Texto'
}

function sourceState(status: string | null | undefined, type: string | null | undefined): KbView['st'] {
  if (status === 'error') return 'error'
  if (status === 'ready' || !status) return 'ok'
  return type === 'shopify' ? 'sync' : 'proc'
}

export function deriveModel(input: DeriveInput): BuilderModel {
  const { hub, metrics: M } = input
  const mEntry = new Map<string, any>((M?.entries ?? []).map((e: any) => [e.id, e]))
  const mKb = new Map<string, any>((M?.knowledge ?? []).map((k: any) => [k.id, k]))
  const mTool = new Map<string, any>((M?.tools ?? []).map((t: any) => [t.name, t]))
  const agentName = new Map(input.agents.map((a) => [a.id, a.name || 'Agente']))
  const direct = input.missions.find((m) => m.event_type === 'whatsapp.received' && m.status === 'active')
  const misLabel = (m: DeriveInput['missions'][number] | undefined) =>
    m ? `${m.display_name || m.event_type}${m.version ? ` · v${m.version}` : ''}` : dash

  const entries: EntryView[] = input.entries.map((e) => {
    const met = mEntry.get(e.id)
    if (e.kind === 'flow_touch') {
      // ref_id é o FLUXO; a missão é a ativa de uma das famílias que os nós
      // de IA dele chamam. As conversas de toque não guardam a entrada, então
      // o bloco mostra o que existe de verdade: quantos toques e qual missão.
      const families = e.families ?? []
      const mission = input.missions.find((m) => m.status === 'active' && families.includes(m.event_type))
      const incentive = concessionText(mission?.concession)
      const touches = e.touches ?? 1
      return {
        id: `e:${e.id}`, entryId: e.id, kind: 'flow_touch', ic: 'zap', tone: 'amber', t: e.label, flowId: e.ref_id,
        s: incentive ?? 'Toque de fluxo', m: [[String(touches), touches === 1 ? 'toque no fluxo' : 'toques no fluxo'], [mission ? 'ativa' : dash, 'missão']],
        when: 'Quando o fluxo chamar', mis: mission ? misLabel(mission) : dash, incentive,
      }
    }
    return {
      id: `e:${e.id}`, entryId: e.id, kind: 'whatsapp_account', ic: 'message', tone: 'green', t: `WhatsApp ${phoneOf(e.label)}`,
      s: 'Cliente chamou a loja', m: [[n0(met?.conversations), 'conversas'], [secs(met?.first_response_ms), '1ª resposta']],
      when: 'Sempre', mis: misLabel(direct), incentive: null,
    }
  })

  const kb: KbView[] = input.notes
    .filter((n) => (n.readers ?? []).includes(input.agentId))
    .map((n) => ({
      id: `k:${n.id}`, sourceId: n.id, t: n.name, s: sourceSubtitle(n), st: sourceState(n.status, n.source_type),
      m: [[n0(mKb.get(n.id)?.uses ?? 0), 'usos']], prev: n.preview === undefined ? null : n.preview ?? '',
      others: (n.readers ?? []).filter((r) => r !== input.agentId).map((r) => agentName.get(r) ?? 'Agente').join(', ') || 'Nenhum',
    }))

  const label = new Map<string, string>([['create_coupon', 'Criar cupom'], ...TOOL_CATALOG.map((t) => [t.name, t.label] as [string, string])])
  const tools: ToolView[] = hub.tools.enabled.map((name) => {
    const t = mTool.get(name)
    const m: Mets = name === 'create_coupon'
      ? [[n0(t?.issued ?? 0), 'emitidos'], [n0(t?.denied ?? 0), 'recusados']]
      : [[n0(t?.calls ?? 0), 'chamadas'], [t?.success_rate == null ? dash : pct(t.success_rate), 'sucesso']]
    return { id: `t:${name}`, name, t: label.get(name) ?? name, s: TOOL_INTEGRATION[name] ?? 'Ferramenta', lock: name === 'create_coupon', m }
  })

  const ag = M?.agent ?? {}
  const destName = input.handoffDest !== 'team' ? agentName.get(input.handoffDest) ?? null : null
  return {
    entries, kb, tools,
    adapt: ADAPT_OPTIONS.filter(([, get]) => get(hub)).map(([l]) => l),
    limits: [...hub.limits.blocked.map((t) => ['topic', t] as ['topic', string]), ...hub.limits.invariants.map((t) => ['rule', t] as ['rule', string])],
    review: hub.judges.custom.filter((j) => j.active).map((j) => j.criterion),
    handoff: { phrases: hub.handoff.keywords, dest: destName ? input.handoffDest : 'team', destName },
    send: { debounce: hub.delivery.debounce_seconds, split: hub.delivery.split_bubbles, typing: hub.delivery.typing_rhythm },
    agent: {
      voice: VOICES.find(([v]) => v === hub.identity.voice)?.[1] ?? 'Amigável',
      pres: PRESENTATIONS.find(([p]) => p === hub.identity.presentation)?.[1] ?? 'Nome e função',
      model: modelLabel(hub.budget.model),
      cap: hub.budget.cap_usd == null ? null : Math.round(hub.budget.cap_usd * input.usdBrl * 100) / 100,
      used: input.spentBrl,
    },
    fixed: {
      agent: [
        [n0(ag.conversations), 'conversas'], [ag.revenue == null ? dash : brl(ag.revenue, 0), 'receita'],
        [ag.cost_per_conversation_brl == null ? dash : brl(ag.cost_per_conversation_brl), 'por conversa'],
        [ag.eval_score == null ? dash : String(Math.round(ag.eval_score)), 'avaliação'],
      ],
      // Nenhum dado diz quantas respostas a adaptação mudou: o bloco mostra
      // quantos ajustes estão ligados, que é o que existe.
      adapt: [[`${ADAPT_OPTIONS.filter(([, get]) => get(hub)).length} de ${ADAPT_OPTIONS.length}`, 'ajustes ligados']],
      limits: [[n0(M?.limits?.blocked), 'bloqueios em 7 dias']],
      review: [[M?.review?.approved_rate == null ? dash : pct(M.review.approved_rate, 1), 'aprovadas'], [n0(M?.review?.rejected), 'reprovadas']],
      split: [[n0(M?.needs_person?.transferred), 'transferidas']],
      // Espera da equipe não é medida; mostra quantas foram e para onde vão.
      transfer: [[n0(M?.needs_person?.transferred), 'transferidas 7d'], [input.handoffDest && input.handoffDest !== 'team' ? (agentName.get(input.handoffDest) ?? 'Agente') : 'Equipe', 'destino']],
      send: [[n0(M?.send?.replies), 'respostas'], [M?.send?.resolved_rate == null ? dash : pct(M.send.resolved_rate), 'resolvidas']],
    },
  }
}

// ---------------------------------------------------------------------------
// Edições do inspector (voltam como HubState)
// ---------------------------------------------------------------------------

export function setVoice(h: HubState, label: string): HubState {
  const v = VOICES.find(([, l]) => l === label)?.[0]
  return v ? { ...h, identity: { ...h.identity, voice: v } } : h
}
export function setPresentation(h: HubState, label: string): HubState {
  const p = PRESENTATIONS.find(([, l]) => l === label)?.[0]
  return p ? { ...h, identity: { ...h.identity, presentation: p } } : h
}
export function setModel(h: HubState, slug: string): HubState {
  return { ...h, budget: { ...h.budget, model: slug } }
}
export function setAdapt(h: HubState, label: string, on: boolean): HubState {
  const opt = ADAPT_OPTIONS.find(([l]) => l === label)
  return opt ? opt[2](h, on) : h
}
export function setTopics(h: HubState, list: string[]): HubState {
  return { ...h, limits: { ...h.limits, blocked: list } }
}
export function setRules(h: HubState, list: string[]): HubState {
  return { ...h, limits: { ...h.limits, invariants: list } }
}
/** Critérios da loja: cada chip é um juiz ativo (settings.judges.custom). */
export function setReview(h: HubState, list: string[]): HubState {
  const inactive = h.judges.custom.filter((j) => !j.active)
  const byCriterion = new Map(h.judges.custom.filter((j) => j.active).map((j) => [j.criterion, j]))
  const active = list.map((criterion, i) => byCriterion.get(criterion) ?? {
    id: `judge-${Date.now().toString(36)}-${i}`, name: criterion.slice(0, 40), criterion, active: true,
  })
  return { ...h, judges: { custom: [...active, ...inactive] } }
}
export function setPhrases(h: HubState, list: string[]): HubState {
  return { ...h, handoff: { ...h.handoff, keywords: list } }
}
export function setDelivery(h: HubState, p: Partial<{ debounce: number; split: boolean; typing: boolean }>): HubState {
  return {
    ...h,
    delivery: {
      debounce_seconds: p.debounce ?? h.delivery.debounce_seconds,
      split_bubbles: p.split ?? h.delivery.split_bubbles,
      typing_rhythm: p.typing ?? h.delivery.typing_rhythm,
    },
  }
}
export function toggleTool(h: HubState, name: string, on: boolean): HubState {
  const enabled = on ? Array.from(new Set([...h.tools.enabled, name])) : h.tools.enabled.filter((t) => t !== name)
  return { ...h, tools: { enabled } }
}

// ---------------------------------------------------------------------------
// Desenho (layout2 do protótipo, mesmos números)
// ---------------------------------------------------------------------------

export const W2 = 1180
export const C2 = 590
export type NodeType = 'entry' | 'kb' | 'tool' | 'agent' | 'adapt' | 'limits' | 'review' | 'split' | 'transfer' | 'send'
export interface LNode { id: string; type: NodeType; x: number; y: number; w: number; h: number; d?: any }
export interface LEdge { a: string; b: string; p: [number, number, number, number]; k: 'main' | 'attach' | 'branch'; label?: string }
export interface LSlot { id: string; x: number; y: number; w: number; h: number; label: string }

export function layout2(f: Pick<BuilderModel, 'entries' | 'kb' | 'tools'>, mets = true): { N: LNode[]; E: LEdge[]; S: LSlot[]; H: number } {
  const mh = (h: number) => (mets ? h + 38 : h)
  const N: LNode[] = []
  const E: LEdge[] = []
  const S: LSlot[] = []
  const ew = 300, eh = mets ? 126 : 88, eg = 24, cnt = f.entries.length + 1, tot = cnt * ew + (cnt - 1) * eg
  let x = C2 - tot / 2
  const y0 = 40
  const aw = 380, ah = 194, ax = C2 - aw / 2, ay = y0 + eh + 110
  f.entries.forEach((e) => {
    N.push({ id: e.id, type: 'entry', x, y: y0, w: ew, h: eh, d: e })
    E.push({ a: e.id, b: 'agent', p: [x + ew / 2, y0 + eh, C2, ay], k: 'main' })
    x += ew + eg
  })
  S.push({ id: 'slot-entry', x, y: y0, w: ew, h: eh, label: 'Arraste uma entrada' })
  N.push({ id: 'agent', type: 'agent', x: ax, y: ay, w: aw, h: ah })
  const cw = 260, ch = 64, cg = 12
  const col = (list: Array<{ id: string }>, type: 'kb' | 'tool', cx: number, slot: string, label: string) => {
    let y = ay - 28
    list.forEach((it) => {
      N.push({ id: it.id, type, x: cx, y, w: cw, h: ch, d: it })
      E.push({ a: it.id, b: 'agent', p: [type === 'kb' ? cx + cw : cx, y + ch / 2, type === 'kb' ? ax : ax + aw, ay + ah / 2], k: 'attach' })
      y += ch + cg
    })
    S.push({ id: slot, x: cx, y, w: cw, h: 52, label })
  }
  col(f.kb, 'kb', 20, 'slot-kb', 'Arraste uma fonte')
  col(f.tools, 'tool', W2 - 20 - cw, 'slot-tool', 'Arraste uma ferramenta')
  const mw = 346, mx = C2 - mw / 2, gap = 84
  let y = ay + ah + gap
  let prev = 'agent'
  let py = ay + ah
  ;([['adapt', mh(88)], ['limits', mets ? 126 : 120], ['review', mh(88)]] as Array<[NodeType, number]>).forEach(([id, h]) => {
    N.push({ id: 'n-' + id, type: id, x: mx, y, w: mw, h })
    E.push({ a: prev, b: 'n-' + id, p: [C2, py, C2, y], k: 'main' })
    prev = 'n-' + id
    py = y + h
    y += h + gap
  })
  const sw = 320, sh = mh(88)
  N.push({ id: 'n-split', type: 'split', x: C2 - sw / 2, y, w: sw, h: sh })
  E.push({ a: prev, b: 'n-split', p: [C2, py, C2, y], k: 'main' })
  const by = y + sh + 100, bw = 320, bh = mh(88), lx = C2 - 200, rx = C2 + 200
  N.push({ id: 'n-transfer', type: 'transfer', x: lx - bw / 2, y: by, w: bw, h: bh })
  N.push({ id: 'n-send', type: 'send', x: rx - bw / 2, y: by, w: bw, h: bh })
  E.push({ a: 'n-split', b: 'n-transfer', p: [C2, y + sh, lx, by], k: 'branch', label: 'Precisa de uma pessoa' })
  E.push({ a: 'n-split', b: 'n-send', p: [C2, y + sh, rx, by], k: 'branch', label: 'Responder o cliente' })
  return { N, E, S, H: by + bh + 90 }
}

/** Onde cada tipo de item da paleta pode ser solto (ACC2 do protótipo). */
export const ACC2: Record<PaletteKind, string> = {
  entry: 'slot-entry', kb: 'slot-kb', tool: 'slot-tool', limit: 'n-limits', crit: 'n-review', dest: 'n-transfer',
}

// ---------------------------------------------------------------------------
// Paleta
// ---------------------------------------------------------------------------

export type PaletteKind = 'entry' | 'kb' | 'tool' | 'limit' | 'crit' | 'dest'
export interface PaletteItem {
  k: PaletteKind
  id: string
  t: string
  s: string
  ic: string
  tone: Tone
  /** Já está no agente (cinza, "Já está no agente"). */
  used?: boolean
  /** Ainda não disponível ("Em breve"). */
  soon?: boolean
  accountId?: string
  sourceKind?: 'site' | 'text' | 'doc' | 'qa'
  toolName?: string
  limitKind?: 'topic' | 'rule'
  dest?: string
  href?: string
}

export function buildPalette(input: {
  accounts: Array<{ id: string; label: string; agentName: string | null }>
  linkedAccountIds: Set<string>
  enabledTools: string[]
  agents: Array<{ id: string; name: string | null; role?: string | null }>
  agentId: string
  dest: string
}): Array<{ g: string; items: PaletteItem[] }> {
  return [
    {
      g: 'Entradas', items: [
        ...input.accounts.map((a): PaletteItem => ({
          k: 'entry', id: `acc:${a.id}`, accountId: a.id, t: 'WhatsApp', ic: 'message', tone: 'green',
          s: `${phoneOf(a.label)} · ${a.agentName ? `hoje com ${a.agentName}` : 'sem agente'}`,
          used: input.linkedAccountIds.has(a.id),
        })),
        { k: 'entry', id: 'e-ig', t: 'Instagram Direct', s: 'Em breve', ic: 'instagram', tone: 'pink', soon: true },
        { k: 'entry', id: 'e-flow', t: 'Toque de fluxo', s: 'Criado no nó de IA do Flow Builder', ic: 'zap', tone: 'amber', soon: true, href: '/automations' },
        { k: 'entry', id: 'e-site', t: 'Chat do site', s: 'Em breve', ic: 'globe', tone: 'blue', soon: true },
      ],
    },
    {
      g: 'Conhecimento', items: [
        { k: 'kb', id: 'k-site', sourceKind: 'site', t: 'Página da loja', s: 'Endereço de uma página do site', ic: 'globe', tone: 'purple' },
        { k: 'kb', id: 'k-text', sourceKind: 'text', t: 'Texto', s: 'Nota escrita aqui', ic: 'file', tone: 'purple' },
        { k: 'kb', id: 'k-doc', sourceKind: 'doc', t: 'Documento', s: 'PDF, DOCX ou TXT', ic: 'bookOpen', tone: 'purple' },
        { k: 'kb', id: 'k-qa', sourceKind: 'qa', t: 'Perguntas e respostas', s: 'Pares de P e R', ic: 'faqHelp', tone: 'purple' },
      ],
    },
    {
      g: 'Ferramentas',
      items: TOOL_CATALOG.map((t): PaletteItem => ({
        k: 'tool', id: `t:${t.name}`, toolName: t.name, t: t.label, s: TOOL_INTEGRATION[t.name] ?? 'Ferramenta',
        ic: TOOL_ICON[t.name] ?? 'wand', tone: 'sky', used: input.enabledTools.includes(t.name),
      })),
    },
    {
      g: 'Regras', items: [
        { k: 'limit', id: 'l-topic', limitKind: 'topic', t: 'Assunto que não aborda', s: 'Vai para Limites', ic: 'shield', tone: 'red' },
        { k: 'limit', id: 'l-rule', limitKind: 'rule', t: 'Regra que nunca quebra', s: 'Vai para Limites', ic: 'lock', tone: 'red' },
        { k: 'crit', id: 'c-new', t: 'Critério de revisão', s: 'Vai para Revisão', ic: 'star', tone: 'blue' },
      ],
    },
    {
      g: 'Transferência', items: [
        { k: 'dest', id: 'd-team', dest: 'team', t: 'Transferir p/ Equipe', s: 'Inbox da equipe', ic: 'users', tone: 'violet', used: input.dest === 'team' },
        ...input.agents.filter((a) => a.id !== input.agentId).map((a): PaletteItem => ({
          k: 'dest', id: `d-${a.id}`, dest: a.id, t: `Transferir p/ ${a.name || 'Agente'}`, s: a.role ? `Agente de ${a.role.toLowerCase()}` : 'Outro agente',
          ic: 'bot', tone: 'violet', used: input.dest === a.id,
        })),
      ],
    },
  ]
}

// ---------------------------------------------------------------------------
// Caminho de uma resposta de teste (onRun do protótipo)
// ---------------------------------------------------------------------------

export function runPath(trace: {
  blocked?: boolean
  knowledge?: Array<{ source_id?: string | null }>
  tools?: Array<{ name: string }>
} | null, f: Pick<BuilderModel, 'entries' | 'kb' | 'tools'>, missionFlow: boolean): { path: string[]; fail: string | null } {
  if (!trace) return { path: [], fail: null }
  const ids = new Set([...f.entries, ...f.kb, ...f.tools].map((x) => x.id))
  const entry = f.entries.find((e) => (missionFlow ? e.kind === 'flow_touch' : e.kind === 'whatsapp_account')) ?? f.entries[0]
  const p: string[] = []
  if (entry) p.push(entry.id)
  p.push('agent')
  for (const k of trace.knowledge ?? []) if (k.source_id) p.push(`k:${k.source_id}`)
  for (const t of trace.tools ?? []) p.push(`t:${t.name}`)
  p.push('n-adapt', 'n-limits', 'n-review')
  const transferred = (trace.tools ?? []).some((t) => t.name === 'transfer_to_human')
  if (!trace.blocked) p.push('n-split', transferred ? 'n-transfer' : 'n-send')
  const path = Array.from(new Set(p)).filter((x) => ids.has(x) || !/^[ekt]:/.test(x))
  return { path, fail: trace.blocked ? 'n-review' : null }
}

/** O nó do canvas que um item do diagnóstico acende. */
export function issueNode(node: string, f: Pick<BuilderModel, 'entries' | 'kb' | 'tools'>): string {
  if (node === 'entries') return f.entries[0]?.id ?? 'slot-entry'
  if (node === 'tools') return f.tools[0]?.id ?? 'slot-tool'
  if (node === 'knowledge') return f.kb[0]?.id ?? 'slot-kb'
  if (node.startsWith('knowledge:')) return `k:${node.slice(10)}`
  if (node.startsWith('tool:')) return `t:${node.slice(5)}`
  if (node === 'review') return 'n-review'
  if (node === 'split') return 'n-split'
  if (node === 'transfer') return 'n-transfer'
  return 'agent'
}
